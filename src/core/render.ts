import * as client from './client.js';
import * as ui from '../ui.js';
import { getOutputDir } from '../config.js';
import type { FrontendState, RenderSubmitResponse, RenderStatusResponse } from './types.js';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const INITIAL_POLL_MS = 2_000; // start at 2s
const MAX_POLL_MS = 15_000; // cap at 15s
const POLL_BACKOFF = 1.5; // multiply by 1.5 each time
const RENDER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function getProjectDraft(projectId: string): Promise<Record<string, unknown>> {
  const state = await client.get<FrontendState>(`/api/v1/state/frontend/${projectId}`);
  const draft = state.project?.['timeline_draft'] as Record<string, unknown> | undefined;
  if (!draft || !draft.t) {
    throw new Error('Project has no draft to render. Create or edit content first.');
  }

  const files = collectFiles(state.project ?? {});
  return rewriteDraftPaths(draft, files);
}

function collectFiles(project: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(project)) {
    if (!key.startsWith('files:') || !Array.isArray(value)) continue;
    for (const file of value) {
      const cdnUrl = file?.cdn_url as string | undefined;
      const s3Key = file?.s3_key as string | undefined;
      if (!cdnUrl || !s3Key) continue;
      const mountPath = `/mnt/userdata/${s3Key}`;
      map.set(mountPath, cdnUrl);
    }
  }
  return map;
}

function rewriteDraftPaths(
  obj: Record<string, unknown>,
  files: Map<string, string>,
): Record<string, unknown> {
  const json = JSON.stringify(obj);
  let result = json;
  for (const [mountPath, cdnUrl] of files) {
    result = result.replaceAll(JSON.stringify(mountPath).slice(1, -1), cdnUrl);
  }
  return JSON.parse(result) as Record<string, unknown>;
}

export async function submitRender(
  projectId: string,
  sessionId: string,
  draft: Record<string, unknown>,
): Promise<string> {
  const renderId = `render_${Date.now()}`;
  await client.post<Record<string, unknown>>(
    '/services/v1/render-proxy/lambda',
    {
      id: renderId,
      sessionId,
      projectId,
      draft,
      output: { format: 'mp4', quality: 'high' },
    },
  );
  return renderId;
}

export async function pollRenderStatus(
  renderId: string,
  onProgress?: (text: string) => void,
): Promise<RenderStatusResponse> {
  const startTime = Date.now();
  let pollInterval = INITIAL_POLL_MS;
  let attempt = 0;

  while (Date.now() - startTime < RENDER_TIMEOUT_MS) {
    const resp = await client.get<Record<string, unknown>>(
      `/services/v1/render-proxy/lambda/${renderId}`,
    );

    const status = resp.status as string ?? '';
    const outputUrl = resp.outputUrl as string | undefined;
    const progress = resp.progress as number | undefined;

    if (status === 'completed' && outputUrl) {
      return { render_id: renderId, status: 'completed', output: { url: outputUrl } };
    }
    if (status === 'failed') {
      throw new Error(`Render failed: ${(resp.error as string) ?? 'unknown error'}`);
    }

    attempt++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const progressStr = typeof progress === 'number' ? ` ${Math.round(progress)}%` : '';
    onProgress?.(`Rendering...${progressStr} (${elapsed}s)`);

    await new Promise((r) => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * POLL_BACKOFF, MAX_POLL_MS);
  }

  throw new Error('Render timed out after 5 minutes');
}

export async function downloadRender(
  url: string,
  outputPath?: string,
  projectId?: string,
): Promise<string> {
  const dir = getOutputDir();
  const filename = projectId ? `${projectId}.mp4` : 'output.mp4';
  const destPath = resolve(outputPath ?? join(dir, filename));

  await client.downloadToFile(url, destPath);
  return destPath;
}

export async function renderAndDownload(
  projectId: string,
  outputPath?: string,
  sessionId?: string,
): Promise<string> {
  const spin = ui.spinner('Checking draft...');

  let draft: Record<string, unknown>;
  try {
    draft = await getProjectDraft(projectId);
    spin.succeed('Draft validated');
  } catch (err) {
    spin.fail('Failed to get project draft');
    throw err;
  }

  if (!sessionId) {
    const sessResp = await client.get<{ sessions: Array<{ session_id: string }> }>(
      `/projects/${projectId}/sessions`,
    );
    sessionId = sessResp.sessions?.[0]?.session_id;
    if (!sessionId) {
      throw new Error('No session found for this project');
    }
  }

  const renderSpin = ui.spinner('Submitting render...');
  let renderId: string;
  try {
    renderId = await submitRender(projectId, sessionId, draft);
    renderSpin.text = 'Rendering...';
  } catch (err) {
    renderSpin.fail('Failed to submit render');
    throw err;
  }

  let renderResult: RenderStatusResponse;
  try {
    renderResult = await pollRenderStatus(renderId, (text) => {
      renderSpin.text = text;
    });
    renderSpin.succeed('Render complete');
  } catch (err) {
    renderSpin.fail('Render failed');
    throw err;
  }

  if (!renderResult.output?.url) {
    throw new Error('Render completed but no output URL returned');
  }

  const downloadSpin = ui.spinner('Downloading...');
  try {
    const filePath = await downloadRender(renderResult.output.url, outputPath, projectId);
    downloadSpin.succeed(`Saved to ${filePath}`);
    return filePath;
  } catch (err) {
    downloadSpin.fail('Download failed');
    throw err;
  }
}

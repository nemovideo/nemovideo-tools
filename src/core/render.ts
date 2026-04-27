import * as client from './client.js';
import * as ui from '../ui.js';
import { getOutputDir } from '../config.js';
import type { FrontendState, RenderSubmitResponse, RenderStatusResponse } from './types.js';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const MAX_POLL_ATTEMPTS = 10;
const RENDER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function getProjectDraft(projectId: string): Promise<FrontendState> {
  const state = await client.get<FrontendState>(`/api/v1/state/frontend/${projectId}`);
  if (!state.draft || Object.keys(state.draft).length === 0) {
    throw new Error('Project has no draft to render. Create or edit content first.');
  }
  return state;
}

export async function submitRender(
  projectId: string,
  draft: Record<string, unknown>,
): Promise<string> {
  const result = await client.post<RenderSubmitResponse>(
    '/services/v1/render-proxy/lambda',
    { project_id: projectId, draft },
  );
  return result.render_id;
}

export async function pollRenderStatus(renderId: string): Promise<RenderStatusResponse> {
  let attempts = 0;
  const startTime = Date.now();

  while (attempts < MAX_POLL_ATTEMPTS) {
    if (Date.now() - startTime > RENDER_TIMEOUT_MS) {
      throw new Error('Render timed out after 5 minutes');
    }

    const status = await client.get<RenderStatusResponse>(
      `/services/v1/render-proxy/lambda/${renderId}`,
    );

    if (status.status === 'completed') return status;
    if (status.status === 'failed') {
      throw new Error(`Render failed: ${status.error ?? 'unknown error'}`);
    }

    attempts++;
    if (attempts < MAX_POLL_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  throw new Error('Render timed out: max poll attempts exceeded');
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
): Promise<string> {
  const spin = ui.spinner('Checking draft...');

  let state: FrontendState;
  try {
    state = await getProjectDraft(projectId);
    spin.succeed('Draft validated');
  } catch (err) {
    spin.fail('Failed to get project draft');
    throw err;
  }

  const renderSpin = ui.spinner('Submitting render...');
  let renderId: string;
  try {
    renderId = await submitRender(projectId, state.draft!);
    renderSpin.text = 'Rendering...';
  } catch (err) {
    renderSpin.fail('Failed to submit render');
    throw err;
  }

  let renderResult: RenderStatusResponse;
  try {
    renderResult = await pollRenderStatus(renderId);
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

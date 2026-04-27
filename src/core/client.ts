import { createRequire } from 'node:module';
import { getApiKey, getBaseUrl } from '../config.js';
import type { GatewayResponse } from './types.js';

const require = createRequire(import.meta.url);

function getPackageVersion(): string {
  try {
    const pkg = require('../../package.json');
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function detectPlatform(): string {
  if (process.env.CURSOR_SESSION_ID || process.env.CURSOR_TRACE_ID) return 'cursor';
  if (process.env.CLAUDE_CODE) return 'claude_code';
  return 'terminal';
}

function buildHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Skill-Source': 'nemo-video-cli',
    'X-Skill-Version': getPackageVersion(),
    'X-Skill-Platform': detectPlatform(),
    ...extraHeaders,
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}

function buildUrl(path: string): string {
  const base = getBaseUrl().replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export class GatewayError extends Error {
  constructor(
    public code: number,
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'GatewayError';
  }

  get isAuthError(): boolean {
    return this.code === 1010 || this.code === 1011 || this.statusCode === 401;
  }

  get isInsufficientCredits(): boolean {
    return this.code === 2001;
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: GatewayResponse | undefined;
    try {
      body = await response.json() as GatewayResponse;
    } catch {
      // non-JSON error response
    }

    const message = body?.message ?? `HTTP ${response.status} ${response.statusText}`;
    throw new GatewayError(body?.code ?? -1, message, response.status);
  }

  const body = await response.json();

  if (typeof body === 'object' && body !== null && 'code' in body) {
    const envelope = body as GatewayResponse<T>;
    if (envelope.code !== 0) {
      throw new GatewayError(envelope.code, envelope.message);
    }
    return envelope.data;
  }

  return body as T;
}

export async function get<T>(path: string, query?: Record<string, string>): Promise<T> {
  let url = buildUrl(path);
  if (query) {
    const params = new URLSearchParams(query);
    url += `?${params.toString()}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(),
  });

  return handleResponse<T>(response);
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: buildHeaders(),
    body: body != null ? JSON.stringify(body) : undefined,
  });

  return handleResponse<T>(response);
}

export async function uploadFile(
  path: string,
  filePath: string,
  fileName: string,
  extraFields?: Record<string, string>,
): Promise<unknown> {
  const { readFile } = await import('node:fs/promises');
  const fileBuffer = await readFile(filePath);
  const blob = new Blob([fileBuffer]);

  const form = new FormData();
  form.append('file', blob, fileName);
  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) {
      form.append(k, v);
    }
  }

  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    'X-Skill-Source': 'nemo-video-cli',
    'X-Skill-Version': getPackageVersion(),
    'X-Skill-Platform': detectPlatform(),
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers,
    body: form,
  });

  return handleResponse(response);
}

export async function downloadToFile(url: string, destPath: string): Promise<void> {
  const { createWriteStream } = await import('node:fs');
  const { mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  const { Readable } = await import('node:stream');
  const { pipeline } = await import('node:stream/promises');

  await mkdir(dirname(destPath), { recursive: true });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Download failed: empty response body');
  }

  const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
  await pipeline(nodeStream, createWriteStream(destPath));
}

export { getPackageVersion, detectPlatform, buildUrl };

import WebSocket from 'ws';
import type { IncomingMessage } from 'node:http';
import { EventEmitter } from 'node:events';
import type { WSClientMessage, WSServerMessage } from './types.js';
import { getPackageVersion } from './client.js';

const HANDSHAKE_RETRIABLE_STATUSES = new Set([502, 503, 504]);
const HANDSHAKE_MAX_RETRIES = 10;
const HANDSHAKE_RETRY_DELAYS_MS = [
  2000, 3000, 3000, 3000, 3000,
  5000, 5000, 5000, 5000, 5000,
];

function readResponseBody(res: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    res.on('error', () => resolve(''));
    setTimeout(() => resolve(Buffer.concat(chunks).toString('utf-8')), 2000);
  });
}

const AUTH_FAIL_PATTERNS = [
  'invalid authentication token',
  'invalid token',
  'invalid or expired',
  'missing authentication token',
  'token not found',
  'token has been revoked',
  'token has expired',
];

function parseRejectReason(body: string): string {
  if (!body) return '';
  try {
    const obj = JSON.parse(body) as Record<string, unknown>;
    return String(obj.reason ?? obj.message ?? obj.detail ?? '');
  } catch {
    return body.slice(0, 200).trim();
  }
}

function isTransient403(reason: string): boolean {
  if (!reason) return true;
  const lower = reason.toLowerCase();
  return !AUTH_FAIL_PATTERNS.some((p) => lower.includes(p));
}

export interface WSConnectionOptions {
  url: string;
  onReconnectFailed?: () => void;
}

export class WSClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempted = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private onReconnectFailed?: () => void;

  constructor(options: WSConnectionOptions) {
    super();
    this.url = options.url;
    this.onReconnectFailed = options.onReconnectFailed;
  }

  connect(): Promise<void> {
    return this.connectWithRetry(0);
  }

  private connectWithRetry(attempt: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.closed = false;
      this.ws = new WebSocket(this.url, {
        headers: { 'User-Agent': `nemovideo-tools/${getPackageVersion()}` },
      });

      this.ws.on('open', () => {
        this.startPing();
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as WSServerMessage;
          this.emit('message', msg);
          this.emit(msg.type, msg);
        } catch {
          this.emit('parse_error', data.toString());
        }
      });

      this.ws.on('close', (code, reason) => {
        this.stopPing();

        if (code === 4001) {
          this.emit('error', new Error('Authentication failed (invalid token)'));
          return;
        }
        if (code === 4002) {
          this.emit('error', new Error('Missing session_id'));
          return;
        }

        if (!this.closed && !this.reconnectAttempted) {
          this.reconnectAttempted = true;
          this.emit('reconnecting');
          this.reconnect().catch(() => {
            this.onReconnectFailed?.();
            this.emit('reconnect_failed');
          });
        } else if (!this.closed) {
          this.emit('disconnected', { code, reason: reason.toString() });
        }
      });

      // Handle non-101 handshake responses (403, 404, 502, etc.)
      // Listening for 'unexpected-response' suppresses the default 'error' emit
      this.ws.on('unexpected-response', (_req: unknown, res: IncomingMessage) => {
        const status = res.statusCode ?? 0;

        readResponseBody(res).then((body) => {
          const reason = parseRejectReason(body);
          const canRetry =
            HANDSHAKE_RETRIABLE_STATUSES.has(status) ||
            (status === 403 && isTransient403(reason));

          if (canRetry && attempt < HANDSHAKE_MAX_RETRIES && !this.closed) {
            const delay = HANDSHAKE_RETRY_DELAYS_MS[attempt] ?? 5000;
            this.emit('handshake_retry', { status, attempt: attempt + 1, delay, reason });
            setTimeout(() => {
              if (this.closed) {
                reject(new Error('Connection cancelled'));
                return;
              }
              this.connectWithRetry(attempt + 1).then(resolve, reject);
            }, delay);
            return;
          }

          const detail = reason ? ` — ${reason}` : '';
          reject(new Error(
            `WebSocket handshake failed: server returned ${status}${detail}` +
              (canRetry ? ' (retries exhausted)' : ''),
          ));
        });
      });

      this.ws.on('error', (err) => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          reject(err);
        } else {
          this.emit('error', err);
        }
      });
    });
  }

  private async reconnect(): Promise<void> {
    await new Promise((r) => setTimeout(r, 1000));
    return this.connectWithRetry(0);
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30_000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  send(msg: WSClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.closed = true;
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export function buildWSUrl(baseUrl: string, token: string, sessionId: string): string {
  const wsBase = baseUrl
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://')
    .replace(/\/$/, '');
  return `${wsBase}/ws/chat?token=${encodeURIComponent(token)}&session_id=${encodeURIComponent(sessionId)}`;
}

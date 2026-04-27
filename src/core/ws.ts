import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import type { WSClientMessage, WSServerMessage } from './types.js';

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
    return new Promise((resolve, reject) => {
      this.closed = false;
      this.ws = new WebSocket(this.url);

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
    return this.connect();
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

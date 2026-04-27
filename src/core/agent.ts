import { getApiKey, getBaseUrl } from '../config.js';
import { WSClient, buildWSUrl } from './ws.js';
import type { WSServerMessage } from './types.js';
import * as ui from '../ui.js';
import type { Ora } from 'ora';

const AGENT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface AgentResult {
  completed: boolean;
  texts: string[];
  error?: string;
}

export async function runAgentSession(
  sessionId: string,
  prompt: string,
): Promise<AgentResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('No API key configured. Run `nemo setup` first.');
  }

  const baseUrl = getBaseUrl();
  const wsUrl = buildWSUrl(baseUrl, apiKey, sessionId);
  const wsClient = new WSClient({ url: wsUrl });

  let currentSpinner: Ora | null = null;
  const collectedTexts: string[] = [];
  let chunkBuffer = '';
  let completed = false;
  let messageSent = false;
  let toolDepth = 0;

  return new Promise<AgentResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      wsClient.close();
      currentSpinner?.fail('Timeout: agent did not respond within 10 minutes');
      resolve({ completed: false, texts: collectedTexts, error: 'timeout' });
    }, AGENT_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      flushChunkBuffer();
      if (currentSpinner) {
        currentSpinner.stop();
        currentSpinner = null;
      }
    }

    function flushChunkBuffer() {
      if (chunkBuffer.trim()) {
        collectedTexts.push(chunkBuffer.trim());
        chunkBuffer = '';
      }
    }

    wsClient.on('session_ready', () => {
      if (currentSpinner) {
        currentSpinner.succeed('Connected to agent');
        currentSpinner = null;
      }
      if (!messageSent) {
        messageSent = true;
        currentSpinner = ui.spinner('AI is working...');
        wsClient.send({ type: 'message', content: prompt, metadata: {} });
      }
    });

    wsClient.on('warming_up', () => {
      if (currentSpinner) currentSpinner.text = 'Starting agent...';
    });

    wsClient.on('status', (msg: WSServerMessage) => {
      if (msg.status === 'sandbox_startup' && currentSpinner) {
        currentSpinner.text = 'Starting sandbox...';
      }
    });

    wsClient.on('chunk', (msg: WSServerMessage) => {
      if (msg.text) {
        chunkBuffer += msg.text;
        if (currentSpinner && toolDepth === 0) {
          const preview = chunkBuffer.slice(-60).replace(/\n/g, ' ');
          currentSpinner.text = `AI: ${preview}`;
        }
      }
    });

    wsClient.on('text', (msg: WSServerMessage) => {
      if (msg.text) {
        flushChunkBuffer();
        if (currentSpinner) {
          currentSpinner.stop();
          currentSpinner = null;
        }
        ui.agentText(msg.text.slice(0, 200));
        if (!collectedTexts.includes(msg.text)) {
          collectedTexts.push(msg.text);
        }
        currentSpinner = ui.spinner('Processing...');
      }
    });

    wsClient.on('thinking_start', () => {
      if (currentSpinner) currentSpinner.text = 'AI is thinking...';
    });

    wsClient.on('thinking_end', () => {
      if (currentSpinner) currentSpinner.text = 'Processing...';
    });

    wsClient.on('tool_start', (msg: WSServerMessage) => {
      toolDepth++;
      flushChunkBuffer();
      const toolName = (msg as Record<string, unknown>).name as string | undefined;
      if (currentSpinner) {
        if (toolName?.includes('generate') || toolName?.includes('video')) {
          currentSpinner.text = `Generating video... (${toolName})`;
        } else if (toolName?.includes('edit') || toolName?.includes('draft')) {
          currentSpinner.text = `Editing timeline... (${toolName})`;
        } else if (toolName?.includes('music') || toolName?.includes('audio')) {
          currentSpinner.text = `Adding audio... (${toolName})`;
        } else if (toolName) {
          currentSpinner.text = `Running: ${toolName}`;
        } else {
          currentSpinner.text = 'Processing...';
        }
      }
    });

    wsClient.on('tool_end', () => {
      toolDepth = Math.max(0, toolDepth - 1);
      if (currentSpinner && toolDepth === 0) {
        currentSpinner.text = 'Processing...';
      }
    });

    wsClient.on('done', () => {
      cleanup();
      completed = true;
      wsClient.close();
      resolve({ completed: true, texts: collectedTexts });
    });

    wsClient.on('error', (err: Error | WSServerMessage) => {
      cleanup();
      wsClient.close();
      if (err instanceof Error) {
        reject(err);
      } else {
        const agentError = err.error ?? 'Unknown agent error';
        resolve({ completed: false, texts: collectedTexts, error: agentError });
      }
    });

    wsClient.on('reconnecting', () => {
      if (currentSpinner) currentSpinner.text = 'Reconnecting...';
    });

    wsClient.on('reconnect_failed', () => {
      cleanup();
      resolve({
        completed: false,
        texts: collectedTexts,
        error: 'Connection lost. Check project status with: nemo project get <id>',
      });
    });

    currentSpinner = ui.spinner('Connecting to agent...');
    wsClient.connect().catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

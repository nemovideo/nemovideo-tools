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
  let completed = false;
  let agentError: string | undefined;

  return new Promise<AgentResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      wsClient.close();
      currentSpinner?.fail('Timeout: agent did not respond within 10 minutes');
      resolve({ completed: false, texts: collectedTexts, error: 'timeout' });
    }, AGENT_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      if (currentSpinner) {
        currentSpinner.stop();
        currentSpinner = null;
      }
    }

    wsClient.on('session_ready', () => {
      if (currentSpinner) {
        currentSpinner.succeed('Connected to agent');
        currentSpinner = null;
      }
      currentSpinner = ui.spinner('AI is working...');
      wsClient.send({ type: 'message', content: prompt, metadata: {} });
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
        collectedTexts.push(msg.text);
      }
    });

    wsClient.on('text', (msg: WSServerMessage) => {
      if (msg.text) {
        if (currentSpinner) {
          currentSpinner.stop();
          currentSpinner = null;
        }
        ui.agentText(msg.text.slice(0, 120));
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

    wsClient.on('tool_start', () => {
      if (currentSpinner) currentSpinner.text = 'Processing...';
    });

    wsClient.on('tool_end', () => {
      if (currentSpinner) currentSpinner.text = 'Processing...';
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
        agentError = err.message;
        reject(err);
      } else {
        agentError = err.error ?? 'Unknown agent error';
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

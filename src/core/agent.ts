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
      const text = msg.text || (msg as Record<string, unknown>).content as string | undefined;
      if (text) {
        chunkBuffer += text;
        if (currentSpinner && toolDepth === 0) {
          const preview = chunkBuffer.slice(-60).replace(/\n/g, ' ');
          currentSpinner.text = `AI: ${preview}`;
        }
      }
    });

    wsClient.on('text', (msg: WSServerMessage) => {
      const text = msg.text || (msg as Record<string, unknown>).content as string | undefined;
      if (text) {
        flushChunkBuffer();
        if (currentSpinner) {
          currentSpinner.stop();
          currentSpinner = null;
        }
        ui.agentText(text.slice(0, 200));
        if (!collectedTexts.includes(text)) {
          collectedTexts.push(text);
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

    function handleToolStart(msg: WSServerMessage) {
      toolDepth++;
      flushChunkBuffer();
      const raw = msg as Record<string, unknown>;
      const toolName = (raw.tool ?? raw.tool_name ?? raw.name) as string | undefined;
      if (currentSpinner && toolName) {
        if (toolName.includes('generate_video') || toolName.includes('seedance')) {
          currentSpinner.text = `Generating video... (${toolName})`;
        } else if (toolName.includes('music') || toolName.includes('audio') || toolName.includes('voiceover')) {
          currentSpinner.text = `Generating audio... (${toolName})`;
        } else if (toolName.includes('edit') || toolName.includes('draft') || toolName.includes('multitrack')) {
          currentSpinner.text = `Editing timeline... (${toolName})`;
        } else if (toolName.includes('understand') || toolName.includes('analyze')) {
          currentSpinner.text = `Analyzing media... (${toolName})`;
        } else {
          currentSpinner.text = `Running tool: ${toolName}`;
        }
      } else if (currentSpinner) {
        currentSpinner.text = 'Processing...';
      }
    }

    function handleToolEnd() {
      toolDepth = Math.max(0, toolDepth - 1);
      if (currentSpinner && toolDepth === 0) {
        currentSpinner.text = 'Processing...';
      }
    }

    wsClient.on('tool_start', handleToolStart);
    wsClient.on('toolcall_start', handleToolStart);
    wsClient.on('tool_end', handleToolEnd);
    wsClient.on('toolcall_end', handleToolEnd);

    wsClient.on('done', () => {
      clearTimeout(timeout);
      if (chunkBuffer.trim()) {
        if (currentSpinner) {
          currentSpinner.stop();
          currentSpinner = null;
        }
        const fullText = chunkBuffer.trim();
        ui.agentText(fullText.slice(0, 300));
        collectedTexts.push(fullText);
        chunkBuffer = '';
      }
      if (currentSpinner) {
        currentSpinner.stop();
        currentSpinner = null;
      }
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

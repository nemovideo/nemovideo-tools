import { getApiKey, getBaseUrl } from '../config.js';
import { WSClient, buildWSUrl } from './ws.js';
import type { WSServerMessage } from './types.js';
import * as ui from '../ui.js';
import type { Ora } from 'ora';

const AGENT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const LONG_RUNNING_TOOLS = ['generate_video', 'seedance', 'generate_music', 'suno'];

function isLongRunningTool(name: string): boolean {
  return LONG_RUNNING_TOOLS.some((t) => name.includes(t));
}

function getToolLabel(name: string): string {
  if (name.includes('generate_video') || name.includes('seedance'))
    return 'Generating video — may take 2-5 min';
  if (name.includes('music') || name.includes('audio') || name.includes('voiceover'))
    return 'Generating audio — may take 1-2 min';
  if (name.includes('edit') || name.includes('draft') || name.includes('multitrack'))
    return 'Editing timeline';
  if (name.includes('understand') || name.includes('analyze'))
    return 'Analyzing media';
  return `Running: ${name}`;
}

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
    throw new Error('No API key configured. Run `nemovideo setup` first.');
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
      if (toolTimerInterval) {
        clearInterval(toolTimerInterval);
        toolTimerInterval = null;
      }
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

    let toolStartTime = 0;
    let currentToolName = '';
    let toolTimerInterval: ReturnType<typeof setInterval> | null = null;

    function handleToolStart(msg: WSServerMessage) {
      toolDepth++;
      flushChunkBuffer();
      const raw = msg as Record<string, unknown>;
      const toolName = (raw.tool ?? raw.tool_name ?? raw.name) as string | undefined;
      currentToolName = toolName ?? '';
      toolStartTime = Date.now();

      if (toolTimerInterval) clearInterval(toolTimerInterval);

      if (currentSpinner && toolName) {
        const label = getToolLabel(toolName);
        currentSpinner.text = label;

        if (isLongRunningTool(toolName)) {
          toolTimerInterval = setInterval(() => {
            const elapsed = Math.round((Date.now() - toolStartTime) / 1000);
            if (currentSpinner) {
              currentSpinner.text = `${label} (${elapsed}s)`;
            }
          }, 1000);
        }
      } else if (currentSpinner) {
        currentSpinner.text = 'Processing...';
      }
    }

    function handleToolEnd() {
      toolDepth = Math.max(0, toolDepth - 1);
      if (toolTimerInterval) {
        clearInterval(toolTimerInterval);
        toolTimerInterval = null;
      }
      if (currentSpinner && toolDepth === 0) {
        if (currentToolName) {
          const elapsed = Math.round((Date.now() - toolStartTime) / 1000);
          currentSpinner.text = `${getToolLabel(currentToolName)} done (${elapsed}s)`;
        }
        currentToolName = '';
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

    wsClient.on('handshake_retry', (info: { status: number; attempt: number; delay: number }) => {
      if (currentSpinner) {
        currentSpinner.text = `Session not ready (${info.status}), retrying in ${info.delay / 1000}s (attempt ${info.attempt})...`;
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
        error: 'Connection lost. Check project status with: nemovideo project get <id>',
      });
    });

    currentSpinner = ui.spinner('Connecting to agent...');
    wsClient.connect().catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

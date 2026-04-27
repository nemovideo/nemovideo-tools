import { Command } from 'commander';
import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { requireAuth } from '../core/auth.js';
import { getBaseUrl } from '../config.js';
import * as client from '../core/client.js';
import { GatewayError } from '../core/client.js';
import * as ui from '../ui.js';
import type { Session } from '../core/types.js';

function openBrowser(url: string): void {
  const cmd =
    platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

function getWebUrl(baseUrl: string): string {
  if (baseUrl.includes('dev')) return 'https://dev.nemovideo.ai';
  return 'https://nemovideo.ai';
}

export function registerOpenCommand(program: Command): void {
  program
    .command('open <projectId>')
    .description('Open project in browser')
    .action(async (projectId: string) => {
      try {
        requireAuth();

        const spin = ui.spinner('Getting session...');
        try {
          const resp = await client.get<{ sessions: Session[] }>(
            `/projects/${projectId}/sessions`,
          );
          const sessionId = resp.sessions?.[0]?.session_id;
          if (!sessionId) {
            spin.fail('No session found for this project');
            return;
          }

          const webUrl = getWebUrl(getBaseUrl());
          const url = `${webUrl}/workspace/project/${projectId}/${sessionId}`;

          spin.succeed('Opening browser...');
          ui.info(url);
          openBrowser(url);
        } catch (err) {
          spin.fail('Failed to open project');
          throw err;
        }
      } catch (err) {
        if (err instanceof GatewayError) {
          ui.error(err.message);
        } else {
          ui.error((err as Error).message);
        }
        process.exitCode = 1;
      }
    });
}

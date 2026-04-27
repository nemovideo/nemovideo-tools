import { Command } from 'commander';
import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { requireAuth } from '../core/auth.js';
import * as client from '../core/client.js';
import { GatewayError } from '../core/client.js';
import * as ui from '../ui.js';
import type { ExchangeClaimTokenResponse } from '../core/types.js';

function openBrowser(url: string): void {
  const cmd =
    platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

export function registerOpenCommand(program: Command): void {
  program
    .command('open <projectId>')
    .description('Open project in browser')
    .action(async (projectId: string) => {
      try {
        requireAuth();

        const spin = ui.spinner('Generating browser link...');
        try {
          const result = await client.post<ExchangeClaimTokenResponse>(
            '/api/auth/exchange-claim-token',
            { project_id: projectId },
          );

          const url = `https://nemovideo.com/workspace/claim?ct=${result.claim_token}`;
          spin.succeed('Opening browser...');
          ui.info(url);
          openBrowser(url);
        } catch (err) {
          spin.fail('Failed to generate browser link');
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

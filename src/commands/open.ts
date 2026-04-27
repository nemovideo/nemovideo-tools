import { Command } from 'commander';
import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { requireAuth } from '../core/auth.js';
import { getBaseUrl } from '../config.js';
import * as ui from '../ui.js';

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

        const baseUrl = getBaseUrl().replace('mega-x-api-dev', 'dev').replace('mega-x-api.', '');
        const webUrl = baseUrl.includes('dev')
          ? 'https://dev.nemovideo.com'
          : 'https://nemovideo.com';
        const url = `${webUrl}/workspace/${projectId}`;

        ui.info(`Opening ${url}`);
        openBrowser(url);
      } catch (err) {
        ui.error((err as Error).message);
        process.exitCode = 1;
      }
    });
}

import { Command } from 'commander';
import { requireAuth } from '../core/auth.js';
import { GatewayError } from '../core/client.js';
import { renderAndDownload } from '../core/render.js';
import * as ui from '../ui.js';
import type { ExportOptions } from '../core/types.js';

export function registerExportCommand(program: Command): void {
  program
    .command('export <projectId>')
    .description('Export/render a project video')
    .option('-o, --output <path>', 'Output file path')
    .action(async (projectId: string, opts: ExportOptions) => {
      try {
        requireAuth();

        const filePath = await renderAndDownload(projectId, opts.output);
        console.log();
        ui.success(`Done! ${filePath}`);
        ui.info('Export is free (0 credits)');
      } catch (err) {
        if (err instanceof GatewayError) {
          if (err.isAuthError) {
            ui.error('Authentication failed. Run `nemo setup` to configure your API key.');
          } else {
            ui.error(err.message);
          }
        } else {
          ui.error((err as Error).message);
        }
        process.exitCode = 1;
      }
    });
}

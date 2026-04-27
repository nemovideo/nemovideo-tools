import { Command } from 'commander';
import { resolve, basename, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { requireAuth } from '../core/auth.js';
import { uploadFile, GatewayError } from '../core/client.js';
import * as ui from '../ui.js';

const SUPPORTED_EXTENSIONS = new Set([
  '.mp4', '.mov', '.avi', '.webm', '.mkv',
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp3', '.wav', '.m4a', '.aac',
]);

export function registerUploadCommand(program: Command): void {
  program
    .command('upload <file>')
    .description('Upload a media file to a project')
    .requiredOption('--project <id>', 'Target project ID')
    .action(async (file: string, opts: { project: string }) => {
      try {
        requireAuth();

        const filePath = resolve(file);
        if (!existsSync(filePath)) {
          ui.error(`File not found: ${filePath}`);
          process.exitCode = 1;
          return;
        }

        const ext = extname(filePath).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          ui.error(`Unsupported file type: ${ext}`);
          ui.info(`Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`);
          process.exitCode = 1;
          return;
        }

        const fileStats = await stat(filePath);
        const fileName = basename(filePath);
        const sizeMB = (fileStats.size / (1024 * 1024)).toFixed(1);

        const spin = ui.spinner(`Uploading ${fileName} (${sizeMB}MB)...`);
        try {
          await uploadFile('/files/upload', filePath, fileName, {
            project_id: opts.project,
          });
          spin.succeed(`Uploaded ${fileName}`);
        } catch (err) {
          spin.fail('Upload failed');
          throw err;
        }
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

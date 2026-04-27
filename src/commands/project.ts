import { Command } from 'commander';
import { requireAuth } from '../core/auth.js';
import * as client from '../core/client.js';
import { GatewayError, downloadToFile } from '../core/client.js';
import * as ui from '../ui.js';
import { getOutputDir } from '../config.js';
import { resolve, join } from 'node:path';
import type {
  Project,
  FrontendState,
  RenderStatusResponse,
  ProjectDownloadOptions,
} from '../core/types.js';

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function registerProjectCommand(program: Command): void {
  const projectCmd = program
    .command('project')
    .description('Manage projects');

  // nemo project list
  projectCmd
    .command('list')
    .description('List all projects')
    .action(async () => {
      try {
        requireAuth();

        const spin = ui.spinner('Loading projects...');
        try {
          const resp = await client.get<{ projects: Project[]; count: number }>('/projects');
          spin.stop();
          const projects = resp.projects ?? [];

          if (projects.length === 0) {
            ui.info('No projects found. Create one with: nemo create -p "your description"');
            return;
          }

          const headers = ['ID', 'Name', 'Created'];
          const rows = projects.map((p) => [
            p.project_id,
            (p.name ?? '(unnamed)').slice(0, 30) + ((p.name ?? '').length > 30 ? '...' : ''),
            formatTimeAgo(p.created_at),
          ]);

          console.log();
          ui.table(headers, rows);
        } catch (err) {
          spin.fail('Failed to load projects');
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

  // nemo project get <id>
  projectCmd
    .command('get <id>')
    .description('Get project details')
    .action(async (id: string) => {
      try {
        requireAuth();

        const spin = ui.spinner('Loading project...');
        try {
          const [project, state] = await Promise.all([
            client.get<Project>(`/projects/${id}`),
            client.get<FrontendState>(`/api/v1/state/frontend/${id}`).catch(() => null),
          ]);
          spin.stop();

          ui.heading(`Project: ${project.project_id}`);
          console.log(`  Name:    ${project.name ?? '(unnamed)'}`);
          console.log(`  Created: ${project.created_at}`);
          console.log(`  Updated: ${project.updated_at ?? '-'}`);

          if (state?.draft) {
            console.log(`  Draft:   ${ui.bold('available')}`);
          } else {
            console.log(`  Draft:   ${ui.dim('empty')}`);
          }

          ui.printNextSteps(id);
        } catch (err) {
          spin.fail('Failed to load project');
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

  // nemo project download <id>
  projectCmd
    .command('download <id>')
    .description('Download the latest rendered video')
    .option('-o, --output <path>', 'Output file path')
    .action(async (id: string, opts: ProjectDownloadOptions) => {
      try {
        requireAuth();

        const spin = ui.spinner('Fetching download link...');
        try {
          const renderStatus = await client.get<RenderStatusResponse>(
            `/services/v1/render-proxy/${id}/download`,
          );

          if (!renderStatus.output?.url) {
            spin.fail('No rendered video found');
            ui.info(`Export first: nemo export ${id}`);
            return;
          }

          spin.text = 'Downloading...';

          const dir = getOutputDir();
          const destPath = resolve(opts.output ?? join(dir, `${id}.mp4`));
          await downloadToFile(renderStatus.output.url, destPath);

          const sizeMB = renderStatus.output.size
            ? `(${(renderStatus.output.size / (1024 * 1024)).toFixed(1)}MB)`
            : '';

          spin.succeed(`Saved ${destPath} ${sizeMB}`);
        } catch (err) {
          spin.fail('Download failed');
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

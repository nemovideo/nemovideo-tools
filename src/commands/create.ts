import { Command } from 'commander';
import { requireAuth } from '../core/auth.js';
import * as client from '../core/client.js';
import { runAgentSession } from '../core/agent.js';
import { renderAndDownload } from '../core/render.js';
import * as ui from '../ui.js';
import type { CreateProjectResponse, CreateOptions } from '../core/types.js';

export function registerCreateCommand(program: Command): void {
  program
    .command('create')
    .description('Create a new video project')
    .requiredOption('-p, --prompt <text>', 'Video description prompt')
    .option('-d, --duration <seconds>', 'Video duration in seconds', '5')
    .option('-r, --ratio <ratio>', 'Aspect ratio (16:9, 9:16, 1:1)', '16:9')
    .option('-e, --export', 'Automatically export/render after creation')
    .option('-o, --output <path>', 'Output file path (requires --export)')
    .action(async (opts: CreateOptions) => {
      try {
        requireAuth();

        // Step 1: Create project
        const createSpin = ui.spinner('Creating project...');
        let projectData: CreateProjectResponse;
        try {
          projectData = await client.post<CreateProjectResponse>('/projects', {
            create_session: true,
          });
          createSpin.succeed(`Project created: ${projectData.project_id}`);
        } catch (err) {
          createSpin.fail('Failed to create project');
          throw err;
        }

        const { project_id, session_id } = projectData;

        // Step 2: Run agent with prompt
        const fullPrompt = buildPrompt(opts);
        const result = await runAgentSession(session_id, fullPrompt);

        if (!result.completed) {
          if (result.error) {
            ui.error(result.error);
          }
          ui.warn(`Project created but agent did not complete. Project ID: ${project_id}`);
          process.exitCode = 1;
          return;
        }

        ui.success(`Done! Project: ${project_id}`);

        // Step 3: Export if requested
        if (opts.export) {
          console.log();
          try {
            const filePath = await renderAndDownload(project_id, opts.output);
            ui.success(`Exported: ${filePath}`);
          } catch (err) {
            ui.error(`Export failed: ${(err as Error).message}`);
            ui.info(`You can export later: nemovideo export ${project_id}`);
          }
        } else {
          ui.printNextSteps(project_id);
        }
      } catch (err) {
        handleCommandError(err);
      }
    });
}

function buildPrompt(opts: CreateOptions): string {
  const parts = [opts.prompt];
  if (opts.duration) parts.push(`Duration: ${opts.duration} seconds`);
  if (opts.ratio && opts.ratio !== '16:9') parts.push(`Aspect ratio: ${opts.ratio}`);
  return parts.join('. ');
}

function handleCommandError(err: unknown): void {
  if (err instanceof client.GatewayError) {
    if (err.isAuthError) {
      ui.error('Authentication failed. Run `nemovideo setup` to configure your API key.');
    } else if (err.isInsufficientCredits) {
      ui.error('Insufficient credits. Top up at: nemovideo.com/dashboard/billing');
    } else if (err.isRateLimited) {
      ui.error('Rate limited. Please wait and try again.');
    } else {
      ui.error(err.message);
    }
  } else {
    ui.error((err as Error).message);
  }
  process.exitCode = 1;
}

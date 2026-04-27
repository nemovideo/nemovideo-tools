import { Command } from 'commander';
import { requireAuth } from '../core/auth.js';
import * as client from '../core/client.js';
import { GatewayError } from '../core/client.js';
import { runAgentSession } from '../core/agent.js';
import * as ui from '../ui.js';
import type { SessionsResponse } from '../core/types.js';

export function registerChatCommand(program: Command): void {
  program
    .command('chat <projectId>')
    .description('Send a message to an existing project (edit/refine)')
    .requiredOption('-p, --prompt <text>', 'Message to send')
    .action(async (projectId: string, opts: { prompt: string }) => {
      try {
        requireAuth();

        // Step 1: Get session
        const sessionSpin = ui.spinner('Getting session...');
        let sessionId: string;
        try {
          const sessions = await client.get<SessionsResponse>(
            `/projects/${projectId}/sessions`,
          );
          if (!sessions.sessions || sessions.sessions.length === 0) {
            sessionSpin.fail('No sessions found for this project');
            ui.error('Project may not exist or has no active sessions.');
            process.exitCode = 1;
            return;
          }
          sessionId = sessions.sessions[0].id;
          sessionSpin.succeed('Session found');
        } catch (err) {
          sessionSpin.fail('Failed to get session');
          throw err;
        }

        // Step 2: Run agent
        const result = await runAgentSession(sessionId, opts.prompt);

        if (!result.completed) {
          if (result.error) {
            ui.error(result.error);
          }
          process.exitCode = 1;
          return;
        }

        ui.success('Done!');
        ui.printNextSteps(projectId);
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

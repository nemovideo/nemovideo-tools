import { Command } from 'commander';
import { requireAuth } from '../core/auth.js';
import * as client from '../core/client.js';
import { GatewayError } from '../core/client.js';
import * as ui from '../ui.js';
import type { BalanceResponse, UsageHistoryResponse } from '../core/types.js';

export function registerCreditsCommand(program: Command): void {
  const creditsCmd = program
    .command('credits')
    .description('Check credit balance')
    .action(async () => {
      try {
        requireAuth();

        const spin = ui.spinner('Loading balance...');
        try {
          const balance = await client.get<BalanceResponse>('/billing/balance');
          spin.stop();

          console.log();
          console.log(`  Available: ${ui.bold(String(balance.available))} | Frozen: ${balance.frozen} | Total consumed: ${balance.total_consumed}`);
          console.log(`  Top up: ${ui.link('https://nemovideo.com/dashboard/billing')}`);
        } catch (err) {
          spin.fail('Failed to load balance');
          throw err;
        }
      } catch (err) {
        if (err instanceof GatewayError) {
          if (err.isAuthError) {
            ui.error('Authentication failed. Run `nemovideo setup` to configure your API key.');
          } else {
            ui.error(err.message);
          }
        } else {
          ui.error((err as Error).message);
        }
        process.exitCode = 1;
      }
    });

  creditsCmd
    .command('history')
    .description('View credit usage history')
    .action(async () => {
      try {
        requireAuth();

        const spin = ui.spinner('Loading usage history...');
        try {
          const usage = await client.get<UsageHistoryResponse>('/billing/usage/conversations');
          spin.stop();

          if (!usage.records || usage.records.length === 0) {
            ui.info('No usage history yet.');
            return;
          }

          const headers = ['Date', 'Type', 'Credits', 'Description'];
          const rows = usage.records.map((r) => [
            new Date(r.created_at).toLocaleDateString(),
            r.type,
            String(r.credits),
            r.description ?? '',
          ]);

          console.log();
          ui.table(headers, rows);
          console.log();
          console.log(ui.dim(`  Total records: ${usage.total}`));
        } catch (err) {
          spin.fail('Failed to load usage history');
          throw err;
        }
      } catch (err) {
        if (err instanceof GatewayError) {
          if (err.isAuthError) {
            ui.error('Authentication failed. Run `nemovideo setup` to configure your API key.');
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

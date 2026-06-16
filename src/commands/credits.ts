import { Command } from 'commander';
import { requireAuth } from '../core/auth.js';
import * as client from '../core/client.js';
import { GatewayError } from '../core/client.js';
import {
  fetchConversationUsage,
  filterUsageByProject,
  formatUsageTableRow,
} from '../core/usage-history.js';
import * as ui from '../ui.js';
import type { BalanceResponse } from '../core/types.js';

function handleCommandError(err: unknown): void {
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
          console.log(
            `  Available: ${ui.bold(String(balance.available))} | Frozen: ${balance.frozen} | Total consumed: ${balance.total_consumed}`,
          );
          console.log(`  Top up: ${ui.link('https://nemovideo.com/dashboard/billing')}`);
        } catch (err) {
          spin.fail('Failed to load balance');
          throw err;
        }
      } catch (err) {
        handleCommandError(err);
      }
    });

  creditsCmd
    .command('history')
    .description('View credit usage history (GET /billing/usage/conversations)')
    .option('--json', 'Print raw usage entries as JSON')
    .option('--all-pages', 'Fetch every page (page_size capped at 100)')
    .option('--page-size <n>', 'Items per page (1-100, default 100)', '100')
    .option('--page-no <n>', 'Page number (default 1)', '1')
    .option('--start-date <YYYY-MM-DD>', 'UTC start date filter')
    .option('--end-date <YYYY-MM-DD>', 'UTC end date filter')
    .option('--project-id <id>', 'Filter conversation rows by project_id (client-side)')
    .action(async (opts) => {
      try {
        requireAuth();

        const pageSize = Math.min(Math.max(Number.parseInt(opts.pageSize, 10) || 100, 1), 100);
        const pageNo = Math.max(Number.parseInt(opts.pageNo, 10) || 1, 1);
        const query = {
          page_no: pageNo,
          page_size: pageSize,
          start_date: opts.startDate as string | undefined,
          end_date: opts.endDate as string | undefined,
        };

        const spin = ui.spinner('Loading usage history...');
        let items;
        let total;
        let pagesFetched;
        try {
          const result = await fetchConversationUsage(query, {
            allPages: Boolean(opts.allPages),
          });
          items = result.items;
          total = result.total;
          pagesFetched = result.pages_fetched;
          spin.stop();
        } catch (err) {
          spin.fail('Failed to load usage history');
          throw err;
        }

        if (opts.projectId) {
          items = filterUsageByProject(items, opts.projectId);
        }

        if (items.length === 0) {
          ui.info('No usage history yet.');
          return;
        }

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                total,
                pages_fetched: pagesFetched,
                filtered_by_project_id: opts.projectId ?? null,
                items,
              },
              null,
              2,
            ),
          );
          return;
        }

        const headers = ['Date', 'Kind', 'Credits', 'Project', 'Session', 'Description'];
        const rows = items.map((item) => formatUsageTableRow(item));

        console.log();
        ui.table(headers, rows);
        console.log();
        console.log(ui.dim(`  Rows shown: ${items.length} | API total: ${total}`));
        if (pagesFetched > 1) {
          console.log(ui.dim(`  Pages fetched: ${pagesFetched}`));
        }
        if (opts.projectId) {
          console.log(ui.dim(`  Filtered by project_id: ${opts.projectId}`));
        }
        if (!opts.allPages && total > items.length) {
          console.log(
            ui.dim('  More rows available — rerun with --all-pages to fetch everything.'),
          );
        }
      } catch (err) {
        handleCommandError(err);
      }
    });
}

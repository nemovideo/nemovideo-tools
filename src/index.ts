import { Command } from 'commander';
import { createRequire } from 'node:module';
import { registerSetupCommand } from './commands/setup.js';
import { registerConfigCommand } from './commands/config.js';
import { registerCreateCommand } from './commands/create.js';
import { registerChatCommand } from './commands/chat.js';
import { registerExportCommand } from './commands/export.js';
import { registerUploadCommand } from './commands/upload.js';
import { registerOpenCommand } from './commands/open.js';
import { registerProjectCommand } from './commands/project.js';
import { registerCreditsCommand } from './commands/credits.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

async function checkForUpdates() {
  try {
    const { default: updateNotifier } = await import('update-notifier');
    updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 }).notify();
  } catch {
    // silently ignore update check failures
  }
}

const program = new Command();

program
  .name('nemovideo')
  .description('NemoVideo CLI — AI video creation and editing')
  .version(pkg.version);

registerSetupCommand(program);
registerConfigCommand(program);
registerCreateCommand(program);
registerChatCommand(program);
registerExportCommand(program);
registerUploadCommand(program);
registerOpenCommand(program);
registerProjectCommand(program);
registerCreditsCommand(program);

await checkForUpdates();
program.parse();

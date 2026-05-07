import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getApiKey, setApiKey } from '../config.js';
import { verifyToken, isTokenFormat } from '../core/auth.js';
import * as client from '../core/client.js';
import { GatewayError } from '../core/client.js';
import * as ui from '../ui.js';
import type { BalanceResponse } from '../core/types.js';

async function openUrl(url: string): Promise<void> {
  const { exec } = await import('node:child_process');
  const { platform } = await import('node:os');
  const cmd =
    platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`);
}

async function confirm(rl: ReturnType<typeof createInterface>, question: string): Promise<boolean> {
  const answer = await rl.question(question);
  return answer.toLowerCase() !== 'n';
}

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Configure NemoVideo CLI (register, billing, API key)')
    .action(async () => {
      ui.heading('NemoVideo CLI 🎬');

      const existingKey = getApiKey();
      if (existingKey) {
        const spin = ui.spinner('Verifying existing API key...');
        try {
          await verifyToken(existingKey);
          const balance = await client.get<BalanceResponse>('/billing/balance');
          spin.succeed('API key is valid');
          ui.success(`Balance: ${balance.available} credits`);
          console.log();

          const rl = createInterface({ input, output });
          try {
            const reconfigure = await rl.question('  ? Reconfigure with a new key? (y/N) ');
            if (reconfigure.toLowerCase() !== 'y') {
              ui.info('You\'re all set! Run: nemovideo create -p "your video description"');
              return;
            }
          } finally {
            rl.close();
          }
        } catch {
          spin.warn('Existing API key is invalid, starting setup...');
        }
      }

      const rl = createInterface({ input, output });

      try {
        console.log('  CLI requires registration and billing before use.');
        console.log('  (Free trial available at nemovideo.com)\n');

        // Step 1: Register
        console.log('  1. Register an account');
        await openUrl('https://nemovideo.com/register');
        ui.info(`Opening ${ui.link('https://nemovideo.com/register')} ...`);
        await confirm(rl, '  ? Registration complete? (Y/n) ');
        console.log();

        // Step 2: Billing
        console.log('  2. Add billing');
        await openUrl('https://nemovideo.com/dashboard/billing');
        ui.info(`Opening ${ui.link('https://nemovideo.com/dashboard/billing')} ...`);
        await confirm(rl, '  ? Billing setup complete? (Y/n) ');
        console.log();

        // Step 3: API Key
        console.log('  3. Get API Key');
        await openUrl('https://nemovideo.com/workspace/api-keys');
        ui.info(`Opening ${ui.link('https://nemovideo.com/workspace/api-keys')} ...`);

        let apiKey = '';
        while (!apiKey) {
          const answer = await rl.question('  ? Paste your API Key: ');
          const trimmed = answer.trim();
          if (isTokenFormat(trimmed)) {
            apiKey = trimmed;
          } else {
            ui.error('Invalid key format. API keys start with nmv_usr_');
          }
        }

        setApiKey(apiKey);
        const spin = ui.spinner('Verifying...');
        try {
          await verifyToken(apiKey);
          const balance = await client.get<BalanceResponse>('/billing/balance');
          spin.succeed('Verification successful!');
          ui.success(`Balance: ${balance.available} credits`);
          console.log();
          ui.info('Now run: nemovideo create -p "your video description"');
        } catch (err) {
          spin.warn('API key saved, but verification failed');
          if (err instanceof GatewayError) {
            ui.error(err.message);
          } else {
            ui.error('Could not verify API key. Check your network and try again.');
          }
        }
      } finally {
        rl.close();
      }
    });
}

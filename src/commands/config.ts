import { Command } from 'commander';
import { getAll, getConfigValue, setConfigValue, getConfigPath } from '../config.js';
import * as ui from '../ui.js';

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage CLI configuration');

  configCmd
    .command('set <key> <value>')
    .description('Set a config value (api_key, base_url, output_dir)')
    .action((key: string, value: string) => {
      try {
        setConfigValue(key, value);
        ui.success(`${key} = ${key === 'api_key' ? value.slice(0, 12) + '...' : value}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exitCode = 1;
      }
    });

  configCmd
    .command('get [key]')
    .description('Get a config value, or show all config')
    .action((key?: string) => {
      if (key) {
        const value = getConfigValue(key);
        if (value === undefined) {
          ui.error(`Unknown config key: ${key}`);
          process.exitCode = 1;
        } else {
          const display = key === 'api_key' && value ? value.slice(0, 12) + '...' : value;
          console.log(display || '(not set)');
        }
      } else {
        const all = getAll();
        ui.heading('Configuration');
        console.log(`  api_key:    ${all.api_key ? all.api_key.slice(0, 12) + '...' : '(not set)'}`);
        console.log(`  base_url:   ${all.base_url}`);
        console.log(`  output_dir: ${all.output_dir}`);
        console.log();
        console.log(ui.dim(`  Config file: ${getConfigPath()}`));
      }
    });
}

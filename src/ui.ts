import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export function spinner(text: string): Ora {
  return ora({ text, color: 'cyan' }).start();
}

export function success(msg: string): void {
  console.log(chalk.green('  ✓ ') + msg);
}

export function error(msg: string): void {
  console.error(chalk.red('  ✗ ') + msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow('  ⚠ ') + msg);
}

export function info(msg: string): void {
  console.log(chalk.cyan('  ℹ ') + msg);
}

export function dim(msg: string): string {
  return chalk.dim(msg);
}

export function bold(msg: string): string {
  return chalk.bold(msg);
}

export function link(url: string): string {
  return chalk.underline.blue(url);
}

export function heading(msg: string): void {
  console.log();
  console.log(chalk.bold(`  ${msg}`));
  console.log();
}

export function agentText(text: string): void {
  console.log(chalk.dim('    > ') + text);
}

export function table(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || '').length))
  );

  const headerLine = headers
    .map((h, i) => chalk.bold(h.padEnd(colWidths[i])))
    .join('  ');
  const separator = colWidths.map((w) => '─'.repeat(w)).join('──');

  console.log(`  ${headerLine}`);
  console.log(`  ${chalk.dim(separator)}`);
  for (const row of rows) {
    const line = row.map((c, i) => (c || '').padEnd(colWidths[i])).join('  ');
    console.log(`  ${line}`);
  }
}

export function printNextSteps(projectId: string): void {
  console.log();
  console.log(chalk.dim('    导出: ') + `nemovideo export ${projectId}`);
  console.log(chalk.dim('    编辑: ') + `nemovideo chat ${projectId} -p "你的修改指令"`);
  console.log(chalk.dim('    打开: ') + `nemovideo open ${projectId}`);
}

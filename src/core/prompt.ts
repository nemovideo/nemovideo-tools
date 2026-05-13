import { createInterface } from 'node:readline';
import chalk from 'chalk';
import type { AskQuestion } from './types.js';

const LETTER_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY);
}

function askLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function promptQuestion(q: AskQuestion): Promise<string[]> {
  console.log();
  console.log(chalk.bold(q.prompt));

  for (let i = 0; i < q.options.length; i++) {
    const letter = LETTER_LABELS[i] ?? String(i + 1);
    console.log(`  ${chalk.cyan(letter)}  ${q.options[i].label}`);
  }

  if (!isInteractive()) {
    const first = q.options[0];
    console.log(chalk.dim(`  (non-interactive: auto-selecting "${first.label}")`));
    return [first.id];
  }

  const hint = q.allow_multiple
    ? 'Enter letters separated by commas (e.g. A,C), or press Enter to skip'
    : 'Enter a letter, or press Enter to skip';

  const raw = await askLine(chalk.dim(`  ${hint}: `));
  if (!raw) return [];

  const letters = raw.toUpperCase().split(/[,\s]+/).filter(Boolean);
  const selected: string[] = [];

  for (const letter of letters) {
    const idx = LETTER_LABELS.indexOf(letter);
    if (idx >= 0 && idx < q.options.length) {
      selected.push(q.options[idx].id);
    }
  }

  if (!q.allow_multiple && selected.length > 1) {
    return [selected[0]];
  }

  return selected;
}

function resolveLabel(q: AskQuestion, id: string): string {
  const opt = q.options.find((o) => o.id === id);
  return opt?.label ?? id;
}

export async function handleAskQuestions(
  title: string | undefined,
  questions: AskQuestion[],
): Promise<string> {
  if (title) {
    console.log();
    console.log(chalk.yellow.bold(`? ${title}`));
  }

  const answerLines: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const selectedIds = await promptQuestion(q);
    const labels = selectedIds.map((id) => resolveLabel(q, id));
    const answer = labels.length > 0 ? labels.join(', ') : 'Skipped';
    answerLines.push(`${i + 1}. ${q.prompt}: ${answer}`);
  }

  return answerLines.join('\n');
}

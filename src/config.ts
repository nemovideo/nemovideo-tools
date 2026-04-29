import Conf from 'conf';
import type { CLIConfig } from './core/types.js';

const DEFAULT_BASE_URL = 'https://mega-x-api.nemovideo.ai';
const DEFAULT_OUTPUT_DIR = './output';

const config = new Conf<CLIConfig>({
  projectName: 'nemovideo',
  defaults: {
    api_key: '',
    base_url: DEFAULT_BASE_URL,
    output_dir: DEFAULT_OUTPUT_DIR,
  },
});

export function getApiKey(): string {
  return process.env.NEMOVIDEO_API_KEY || config.get('api_key');
}

export function setApiKey(key: string): void {
  config.set('api_key', key);
}

export function getBaseUrl(): string {
  return config.get('base_url') || DEFAULT_BASE_URL;
}

export function setBaseUrl(url: string): void {
  config.set('base_url', url);
}

export function getOutputDir(): string {
  return config.get('output_dir') || DEFAULT_OUTPUT_DIR;
}

export function setOutputDir(dir: string): void {
  config.set('output_dir', dir);
}

export function getAll(): CLIConfig {
  return {
    api_key: getApiKey(),
    base_url: getBaseUrl(),
    output_dir: getOutputDir(),
  };
}

export function getConfigValue(key: string): string | undefined {
  const all = getAll();
  return (all as unknown as Record<string, string>)[key];
}

export function setConfigValue(key: string, value: string): void {
  const validKeys: (keyof CLIConfig)[] = ['api_key', 'base_url', 'output_dir'];
  if (!validKeys.includes(key as keyof CLIConfig)) {
    throw new Error(`Unknown config key: ${key}. Valid keys: ${validKeys.join(', ')}`);
  }
  config.set(key as keyof CLIConfig, value);
}

export function getConfigPath(): string {
  return config.path;
}

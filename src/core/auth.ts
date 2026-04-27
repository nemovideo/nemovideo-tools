import * as client from './client.js';
import { getApiKey } from '../config.js';
import type { VerifyTokenResponse } from './types.js';

export function isTokenFormat(token: string): boolean {
  return token.startsWith('nmv_usr_');
}

export async function verifyToken(token?: string): Promise<VerifyTokenResponse> {
  const apiKey = token ?? getApiKey();
  if (!apiKey) {
    throw new Error('No API key configured. Run `nemo setup` first.');
  }
  if (!isTokenFormat(apiKey)) {
    throw new Error('Invalid API key format. Keys start with nmv_usr_');
  }

  return client.post<VerifyTokenResponse>('/auth/verify', { token: apiKey });
}

export function requireAuth(): string {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('No API key configured. Run `nemo setup` to get started.');
  }
  return apiKey;
}

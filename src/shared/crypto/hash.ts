import { createHash, randomBytes } from 'crypto';

const API_KEY_PREFIX = 'aos_live_';
const KEY_BYTES = 32;
const PREFIX_LENGTH = 12;

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(KEY_BYTES).toString('hex')}`;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function apiKeyPrefix(key: string): string {
  return key.slice(0, PREFIX_LENGTH);
}

import {
  apiKeyPrefix,
  generateApiKey,
  hashApiKey,
} from '../../src/shared/crypto/hash';

describe('API key hashing', () => {
  it('hashes deterministically and never equals plaintext', () => {
    const key = generateApiKey();
    const hashed = hashApiKey(key);
    expect(hashed).not.toBe(key);
    expect(hashApiKey(key)).toBe(hashed);
    expect(apiKeyPrefix(key).startsWith('aos_live_')).toBe(true);
  });
});

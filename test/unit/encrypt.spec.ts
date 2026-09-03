import { decrypt, encrypt } from '../../src/shared/crypto/encrypt';

describe('AES-256-GCM encrypt', () => {
  const originalKey = process.env.APP_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
  });

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalKey;
  });

  it('round-trips plaintext and never stores it as-is', () => {
    const plaintext = 'sk-vendor-secret';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });
});

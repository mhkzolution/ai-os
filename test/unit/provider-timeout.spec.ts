import { withProviderTimeout } from '../../src/shared/ai/provider-timeout';

describe('withProviderTimeout', () => {
  it('maps an aborted signal to PROVIDER_TIMEOUT', async () => {
    await expect(
      withProviderTimeout(async (signal) => {
        await new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        });
      }, 20),
    ).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      category: 'PROVIDER',
      retryable: true,
    });
  });
});

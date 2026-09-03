export class ProviderTimeoutError extends Error {
  readonly code = 'PROVIDER_TIMEOUT';
  readonly category = 'PROVIDER';
  readonly retryable = true;

  constructor(ms: number) {
    super(`Provider did not respond within ${ms}ms`);
    this.name = 'ProviderTimeoutError';
  }
}

export async function withProviderTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const signal = AbortSignal.timeout(ms);
  try {
    return await work(signal);
  } catch (error) {
    if (signal.aborted) {
      throw new ProviderTimeoutError(ms);
    }
    throw error;
  }
}

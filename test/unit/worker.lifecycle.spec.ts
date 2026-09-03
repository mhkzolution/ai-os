import { runWorker } from '../../src/worker.lifecycle';

describe('runWorker', () => {
  it('does not resolve the wait promise until a signal is fired', async () => {
    const app = { close: jest.fn().mockResolvedValue(undefined) };
    let fireSignal: () => Promise<void> = async () => undefined;

    const wait = runWorker(app, {
      onSignals: (_signals, handler) => {
        fireSignal = handler;
      },
    });

    const beforeSignal = await Promise.race([
      wait.then(() => 'resolved' as const),
      new Promise<'pending'>((resolve) =>
        setTimeout(() => resolve('pending'), 50),
      ),
    ]);

    expect(beforeSignal).toBe('pending');
    expect(app.close).not.toHaveBeenCalled();

    await fireSignal();
    await wait;

    expect(app.close).toHaveBeenCalledTimes(1);
  });
});

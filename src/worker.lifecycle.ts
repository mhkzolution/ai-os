export type Closable = {
  close: (signal?: string) => Promise<unknown>;
};

export type RunWorkerOptions = {
  onSignals?: (
    signals: NodeJS.Signals[],
    handler: () => Promise<void>,
  ) => void;
};

const WORKER_SIGNALS: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

export function runWorker(
  app: Closable,
  options: RunWorkerOptions = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let shuttingDown = false;

    const shutdown = async (): Promise<void> => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      try {
        await app.close();
        resolve();
      } catch (err) {
        reject(err);
      }
    };

    if (options.onSignals) {
      options.onSignals(WORKER_SIGNALS, shutdown);
      return;
    }

    for (const signal of WORKER_SIGNALS) {
      process.once(signal, () => {
        void shutdown();
      });
    }
  });
}

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  let settleKeepAlive: (() => void) | undefined;
  const keepAlive = new Promise<void>((resolve) => {
    settleKeepAlive = resolve;
  });

  const close = app.close.bind(app);
  app.close = async (signal?: string) => {
    settleKeepAlive?.();
    settleKeepAlive = undefined;
    return close(signal);
  };

  app.enableShutdownHooks();
  Logger.log('Worker started and idle');
  await keepAlive;
}

void bootstrap();

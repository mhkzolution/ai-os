import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log('Worker started and idle');
  await new Promise<void>(() => {
    /* keep process alive; BullMQ processors are added in a later task */
  });
}
void bootstrap();

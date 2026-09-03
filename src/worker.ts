import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { runWorker } from './worker.lifecycle';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  Logger.log('Worker started and idle');
  await runWorker(app);
}

void bootstrap();

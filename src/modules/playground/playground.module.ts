import { Module } from '@nestjs/common';
import { AiModule } from '../../shared/ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { CostsModule } from '../costs/costs.module';
import { UsageModule } from '../usage/usage.module';
import { PlaygroundController } from './playground.controller';
import { PlaygroundService } from './playground.service';

@Module({
  imports: [AuthModule, AiModule, UsageModule, CostsModule],
  controllers: [PlaygroundController],
  providers: [PlaygroundService],
})
export class PlaygroundModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { RateLimitGuard } from './rate-limit.guard';

@Module({
  imports: [AuthModule],
  controllers: [ClientsController],
  providers: [ClientsService, ApiKeyService, ApiKeyGuard, RateLimitGuard],
  exports: [ClientsService, ApiKeyService, ApiKeyGuard, RateLimitGuard],
})
export class ClientsModule {}

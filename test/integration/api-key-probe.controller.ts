import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiKeyGuard,
  RequestWithClient,
} from '../../src/modules/clients/api-key.guard';
import { RateLimitGuard } from '../../src/modules/clients/rate-limit.guard';

@Controller('api-key-probe')
export class ApiKeyProbeController {
  @Get()
  @UseGuards(ApiKeyGuard, RateLimitGuard)
  ping(@Req() req: RequestWithClient) {
    return { clientId: req.client.id };
  }
}

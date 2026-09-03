import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyService } from './api-key.service';
import type { RequestClient } from './public-client';

export type RequestWithClient = Request & { client: RequestClient };

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithClient>();
    const rawKey = request.header('x-api-key');
    request.client = await this.apiKeyService.authenticate(rawKey);
    return true;
  }
}

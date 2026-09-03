import { Injectable } from '@nestjs/common';
import type { Model, Provider } from '../../../generated/prisma/client';
import { ModelPurpose } from '../../../generated/prisma/enums';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  ProviderResolveError,
  resolveProviderAndModel,
} from './provider-resolve';

type ProviderWithModels = Provider & { models: Model[] };

@Injectable()
export class ProviderResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    purpose: ModelPurpose,
  ): Promise<{ provider: ProviderWithModels; model: Model }> {
    const providers = await this.prisma.provider.findMany({
      include: { models: true },
    });
    const result = resolveProviderAndModel(providers, purpose);
    if (!result.ok) {
      throw new ProviderResolveError(result.code);
    }
    return { provider: result.provider, model: result.model };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Provider } from '../../../generated/prisma/client';
import { encrypt } from '../../shared/crypto/encrypt';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

function toPublicProvider(provider: Provider) {
  const { apiKeyEncrypted, ...rest } = provider;
  return {
    ...rest,
    hasApiKey: apiKeyEncrypted.length > 0,
  };
}

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProviderDto) {
    const provider = await this.prisma.provider.create({
      data: {
        name: dto.name,
        type: dto.type,
        apiKeyEncrypted: dto.apiKey ? encrypt(dto.apiKey) : '',
        baseUrl: dto.baseUrl,
        isActive: dto.isActive ?? true,
        priority: dto.priority,
      },
    });
    return toPublicProvider(provider);
  }

  async findAll() {
    const providers = await this.prisma.provider.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return providers.map(toPublicProvider);
  }

  async findOne(id: string) {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException(`Provider ${id} not found`);
    }
    return toPublicProvider(provider);
  }

  async update(id: string, dto: UpdateProviderDto) {
    await this.findOne(id);
    const provider = await this.prisma.provider.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        baseUrl: dto.baseUrl,
        isActive: dto.isActive,
        priority: dto.priority,
        ...(dto.apiKey !== undefined
          ? { apiKeyEncrypted: dto.apiKey ? encrypt(dto.apiKey) : '' }
          : {}),
      },
    });
    return toPublicProvider(provider);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.provider.delete({ where: { id } });
    return { id };
  }
}

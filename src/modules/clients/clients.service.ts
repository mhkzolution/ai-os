import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { ClientKeyKind } from '../../../generated/prisma/enums';
import {
  apiKeyPrefix,
  generateApiKey,
  hashApiKey,
} from '../../shared/crypto/hash';
import { throwIfPrismaConflict } from '../../shared/prisma/prisma-errors';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { toPublicClient } from './public-client';

const BCRYPT_COST = 12;
const KEY_SELECT = {
  id: true,
  kind: true,
  keyPrefix: true,
  isActive: true,
  lastUsedAt: true,
  createdAt: true,
  revokedAt: true,
} as const;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClientDto) {
    const apiKey = generateApiKey();
    const apiSecret = randomBytes(32).toString('hex');
    const apiSecretHash = await bcrypt.hash(apiSecret, BCRYPT_COST);

    try {
      const client = await this.prisma.client.create({
        data: {
          code: dto.code,
          name: dto.name,
          apiSecretHash,
          rateLimitPerMinute: dto.rateLimitPerMinute ?? 60,
          allowedIps: dto.allowedIps ?? [],
          keys: {
            create: {
              kind: ClientKeyKind.PRIMARY,
              keyHash: hashApiKey(apiKey),
              keyPrefix: apiKeyPrefix(apiKey),
            },
          },
        },
        include: { keys: { select: KEY_SELECT } },
      });
      return {
        client: toPublicClient(client),
        apiKey,
        apiSecret,
      };
    } catch (error) {
      throwIfPrismaConflict(error, 'Client code already exists');
    }
  }

  async findAll() {
    const clients = await this.prisma.client.findMany({
      include: { keys: { select: KEY_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
    return clients.map(toPublicClient);
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { keys: { select: KEY_SELECT } },
    });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    return toPublicClient(client);
  }

  async update(id: string, dto: UpdateClientDto) {
    const client = await this.requireClient(id);
    if (
      client.isSystem &&
      (dto.code !== undefined || dto.isSystem !== undefined)
    ) {
      throw new ForbiddenException(
        'System client code and isSystem cannot be changed',
      );
    }
    const updated = await this.prisma.client.update({
      where: { id },
      data: {
        name: dto.name,
        isActive: dto.isActive,
        rateLimitPerMinute: dto.rateLimitPerMinute,
        allowedIps: dto.allowedIps,
      },
      include: { keys: { select: KEY_SELECT } },
    });
    return toPublicClient(updated);
  }

  async remove(id: string) {
    const client = await this.requireClient(id);
    if (client.isSystem) {
      throw new ForbiddenException('System clients cannot be deleted');
    }
    await this.prisma.$transaction([
      this.prisma.clientKey.deleteMany({ where: { clientId: id } }),
      this.prisma.client.delete({ where: { id } }),
    ]);
    return { id };
  }

  async listKeys(id: string) {
    await this.requireClient(id);
    return this.prisma.clientKey.findMany({
      where: { clientId: id },
      select: KEY_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async rotateKey(id: string) {
    await this.requireClient(id);
    const apiKey = generateApiKey();
    await this.prisma.clientKey.create({
      data: {
        clientId: id,
        kind: ClientKeyKind.SECONDARY,
        keyHash: hashApiKey(apiKey),
        keyPrefix: apiKeyPrefix(apiKey),
      },
    });
    return { apiKey, kind: ClientKeyKind.SECONDARY };
  }

  async revokeKey(id: string, keyId: string) {
    await this.requireClient(id);
    const key = await this.prisma.clientKey.findFirst({
      where: { id: keyId, clientId: id },
    });
    if (!key) {
      throw new NotFoundException(`Key ${keyId} not found`);
    }
    await this.prisma.clientKey.update({
      where: { id: keyId },
      data: { isActive: false, revokedAt: new Date() },
    });
    return { id: keyId, revoked: true };
  }

  private async requireClient(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    return client;
  }
}

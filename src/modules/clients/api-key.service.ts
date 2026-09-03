import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { hashApiKey } from '../../shared/crypto/hash';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(rawKey: string | undefined) {
    if (!rawKey || rawKey.trim().length === 0) {
      throw new UnauthorizedException();
    }
    const key = await this.prisma.clientKey.findUnique({
      where: { keyHash: hashApiKey(rawKey) },
      include: { client: true },
    });
    if (!key || !key.isActive || key.revokedAt) {
      throw new UnauthorizedException();
    }
    if (!key.client.isActive) {
      throw new ForbiddenException();
    }
    void this.prisma.clientKey
      .update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);
    return key.client;
  }
}

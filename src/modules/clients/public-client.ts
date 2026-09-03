import type { Client } from '../../../generated/prisma/client';

export type RequestClient = Client;

export function toPublicClient(
  client: Client & {
    keys?: Array<{
      id: string;
      kind: string;
      keyPrefix: string;
      isActive: boolean;
      lastUsedAt: Date | null;
      createdAt: Date;
      revokedAt: Date | null;
    }>;
  },
) {
  const { apiSecretHash, ...rest } = client;
  void apiSecretHash;
  return rest;
}

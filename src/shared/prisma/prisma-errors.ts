import { ConflictException } from '@nestjs/common';

export function throwIfPrismaConflict(error: unknown, message: string): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(message);
  }
  throw error;
}

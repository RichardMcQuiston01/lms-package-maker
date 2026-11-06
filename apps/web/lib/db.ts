import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** One Prisma client per process, reused across hot reloads in development. */
export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma === undefined) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

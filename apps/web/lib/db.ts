import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * Server-only Prisma client singleton (Batch 02 §8/§14).
 *
 * `import 'server-only'` makes any attempt to import this module into a Client
 * Component a build-time error, so the database connection (and DATABASE_URL)
 * can never reach the browser. A single client instance is reused across hot
 * reloads in development to avoid exhausting connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

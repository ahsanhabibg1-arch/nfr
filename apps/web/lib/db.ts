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

/**
 * Bound the connection pool on managed PostgreSQL.
 *
 * WHY. Prisma's default pool is `physical_cpus * 2 + 1`, decided from the
 * machine Prisma happens to run on. A managed host advertises every core of the
 * underlying box, so on the deployment platform's build machine (~47 cores) one
 * client would try to open ~95 sockets. The deployment database allows 20
 * connections in total, of which 3 are reserved for superusers and ~13 are held
 * by the provider's own agents (failover slots, pg_cron, monitoring) — leaving
 * roughly 3 for the application. The result was a build that died part-way
 * through static generation:
 *
 *     FATAL: sorry, too many clients already   (Prisma P2037)
 *
 * `/sitemap.xml` made it worst: it runs thirteen queries in one `Promise.all`,
 * so the pool opens sockets as fast as it can.
 *
 * WHAT THIS DOES. `connection_limit` can only be given to Prisma through the
 * connection string, so when the URL does not already carry one this appends a
 * small production default. An explicit value in `DATABASE_URL` always wins, so
 * the deploy configuration stays authoritative and a larger database plan can
 * raise it without touching code.
 *
 * SCOPE. Production only. Development and the test suites keep Prisma's default
 * pool against a local PostgreSQL that allows 100 connections, so local work and
 * the DB-backed suites are unaffected.
 */
function boundedDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw || process.env.NODE_ENV !== 'production') return undefined;
  if (/[?&]connection_limit=/.test(raw)) return undefined; // explicit value wins
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}connection_limit=2&pool_timeout=30`;
}

const boundedUrl = boundedDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(boundedUrl ? { datasources: { db: { url: boundedUrl } } } : {}),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

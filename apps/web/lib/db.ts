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
 * client would try to open ~95 sockets against a database that allows 20
 * connections in total. The result was a build that died part-way through
 * static generation:
 *
 *     FATAL: sorry, too many clients already   (Prisma P2037)
 *
 * HOW MUCH ROOM THERE ACTUALLY IS. An earlier version of this comment said the
 * provider's own agents held about thirteen of the twenty, leaving roughly
 * three for the application. That was a misreading of `pg_stat_activity`:
 * measured against the deployed database, those rows are almost all
 * BACKGROUND WORKERS — checkpointer, walwriter, archiver, autovacuum and
 * replication launchers, the pg_cron launcher, io workers — and a background
 * worker does not occupy a `max_connections` slot. Counting only
 * `backend_type = 'client backend'`, the database carried THREE client
 * connections, one of which was the session doing the counting and one the
 * provider's management agent.
 *
 * So the real budget is `max_connections` (20) less
 * `superuser_reserved_connections` (3) less a provider agent or two: on the
 * order of fifteen, not three. The small pool below is still right — ninety-five
 * sockets overruns twenty however the remainder is divided, and a bounded pool
 * is what makes the ceiling predictable — but anyone sizing it from this
 * comment should size it against that number, and should re-measure with
 * `backend_type` in the query rather than trusting a row count.
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

/**
 * Interactive-transaction budget sized for a REMOTE database.
 *
 * WHY. Prisma's defaults are `maxWait: 2s` / `timeout: 5s`, and the editorial
 * writes are interactive transactions that issue dozens of sequential queries:
 * `saveArticle` alone resolves the category, author and relationships, rebuilds
 * every child collection, inserts one row per body block and per tag, then adds
 * a revision and an audit entry. Against a local PostgreSQL a round trip costs
 * a fraction of a millisecond, so the whole thing lands well inside 5 seconds.
 * Against the managed cloud database each round trip costs tens of milliseconds
 * and the same save takes longer than the budget, so Prisma closes the
 * transaction mid-flight and the next statement fails with:
 *
 *     P2028  Transaction API error: Transaction not found. Transaction ID is
 *            invalid, refers to an old closed transaction ...
 *
 * The editor surfaced that as "Unexpected server error", and because the
 * transaction rolls back, nothing was written: a long article could be composed
 * and never saved, leaving only its recovery snapshot behind. The failure was
 * invisible locally and reproducible only against the cloud database.
 *
 * WHAT THIS DOES. Raises the ceiling for every interactive transaction in the
 * app — the article writer is simply the longest one, and the info-page, media
 * and taxonomy writers have the same shape. It is a ceiling, not a delay: a
 * transaction still commits as soon as its work is done.
 */
const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    transactionOptions: { ...TRANSACTION_OPTIONS },
    ...(boundedUrl ? { datasources: { db: { url: boundedUrl } } } : {}),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

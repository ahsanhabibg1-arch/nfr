import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkMigrationReadiness, decideTestDatabase } from './testDbGuard';

/**
 * Stage 03 Task E — fail fast, and legibly, when the test database is behind.
 *
 * `vitest.config.ts` has already decided which database the run may use (and
 * blanked `DATABASE_URL` when there is none). This hook runs once, before any
 * suite loads, and answers the one question that check cannot: is that database
 * at the schema `prisma/migrations` describes?
 *
 * It stays quiet in the two cases where it has nothing to say:
 *   - no isolated test database -> the DB suites self-skip anyway;
 *   - the `_prisma_migrations` table is unreachable or absent -> that is either
 *     a database that has never been migrated at all, which the suites' own
 *     errors describe perfectly well, or a transient connection problem. Either
 *     way, blocking the whole run on a failed probe would be worse than the
 *     noise it is meant to prevent, so the probe never fails the run by itself.
 *
 * It never applies a migration. Telling the operator exactly what to run is the
 * whole point; doing it for them against a database this file did not verify is
 * not.
 */
export default async function setup(): Promise<void> {
  const decision = decideTestDatabase(process.env);
  if (decision.mode !== 'isolated') return;

  const migrationsDir = fileURLToPath(new URL('../../prisma/migrations', import.meta.url));
  if (!existsSync(migrationsDir)) return;

  const directories = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (directories.length === 0) return;

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: decision.databaseUrl } } });

  let applied: string[];
  try {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    applied = rows.map((r) => r.migration_name);
  } catch {
    // Unreachable, or never migrated. Not this hook's call to make — see above.
    await prisma.$disconnect();
    return;
  }
  await prisma.$disconnect();

  const readiness = checkMigrationReadiness(directories, applied, decision.target);
  if (!readiness.ok) throw new Error(`\n\n${readiness.message}\n`);

  console.info(`[tests] migrations: ${applied.length}/${directories.length} applied`);
}

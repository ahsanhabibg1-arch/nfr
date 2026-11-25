/**
 * NFRGuide — Migration replay & PostgreSQL FTS preservation gate (Batch 09 §24/§25).
 *
 * Replays EVERY committed migration from scratch onto a NEW, DISPOSABLE database and
 * verifies the Batch 07 full-text search survives:
 *   - all expected tables exist,
 *   - "Article"."searchVector" exists with PostgreSQL type `tsvector`,
 *   - the GIN index "Article_searchVector_idx" exists,
 *   - the generated column populates for a freshly-inserted row and matches a query.
 *
 * It NEVER touches the development database. It creates `<db>_migration_replay`, runs
 * `prisma migrate deploy` against it, asserts, then drops it. If the connecting role
 * lacks CREATEDB, it cannot do a clean replay; it then verifies the SAME FTS artifacts
 * on TEST_DATABASE_URL (which already has every migration applied) and says so clearly,
 * rather than claiming a full replay. Exits non-zero on any failure.
 *
 * Usage: `npm run test:migration`
 */
import { Client } from 'pg';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

/** Newline, by code point, so no layer of escaping can mangle it. */
const NL = String.fromCharCode(10);
const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(`${name}${detail ? ` — ${detail}` : ''}`); console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const EXPECTED_TABLES = [
  'Article', 'ArticleSeo', 'Category', 'Author', 'MediaAsset', 'SeoFinding', 'SeoAuditRun',
  'SearchQueryEvent', 'ContentViewEvent', 'AnalyticsDailyAggregate', 'AffiliatePartner',
  'AffiliateLink', 'AdPlacement', 'MonetizationDisclosure', 'StaffInvitation',
  'PasswordResetToken', 'SystemSetting', 'User', 'Role', 'Session', 'AuditLog',
];

async function assertFts(client: Client, context: string, withInsert: boolean) {
  const col = await client.query(
    `SELECT udt_name, is_generated FROM information_schema.columns WHERE table_name='Article' AND column_name='searchVector'`,
  );
  check(`[${context}] searchVector column exists as tsvector`, col.rows[0]?.udt_name === 'tsvector', JSON.stringify(col.rows[0] ?? null));
  check(`[${context}] searchVector is a generated column`, col.rows[0]?.is_generated === 'ALWAYS', String(col.rows[0]?.is_generated));

  const idx = await client.query(
    `SELECT indexdef FROM pg_indexes WHERE tablename='Article' AND indexname='Article_searchVector_idx'`,
  );
  check(`[${context}] GIN index exists`, /USING gin/i.test(idx.rows[0]?.indexdef ?? ''), idx.rows[0]?.indexdef ?? 'missing');

  const fn = await client.query(`SELECT to_tsvector('english','bull riding') @@ websearch_to_tsquery('english','bull') AS ok`);
  check(`[${context}] websearch_to_tsquery + ts match works`, fn.rows[0]?.ok === true);

  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`,
  );
  const names = new Set(tables.rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !names.has(t));
  check(`[${context}] all expected tables present`, missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : '');

  if (withInsert) {
    // Insert a minimal published article and confirm the generated vector populates.
    const uid = 'replay-' + Math.random().toString(36).slice(2, 8);
    await client.query(`INSERT INTO "Category" (id, slug, name, "sortOrder") VALUES ($1,$2,$3,0)`, [`cat-${uid}`, `cat-${uid}`, `Cat ${uid}`]);
    await client.query(`INSERT INTO "Author" (id, slug, name, role, "createdAt", "updatedAt") VALUES ($1,$2,$3,'Writer',now(),now())`, [`au-${uid}`, `au-${uid}`, `Au ${uid}`]);
    await client.query(
      `INSERT INTO "Article" (id, slug, title, excerpt, "articleType", "authorId", "categoryId", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,'feature',$5,$6,now(),now())`,
      [`art-${uid}`, `art-${uid}`, `Zylophonium championship ${uid}`, 'An excerpt for replay verification.', `au-${uid}`, `cat-${uid}`],
    );
    const q = await client.query(
      `SELECT count(*)::int AS n FROM "Article" WHERE id=$1 AND "searchVector" @@ websearch_to_tsquery('english','zylophonium')`,
      [`art-${uid}`],
    );
    check(`[${context}] generated searchVector populates + matches a query`, q.rows[0]?.n === 1, `matched ${q.rows[0]?.n}`);
  }
}

// Prefer an explicit privileged maintenance URL (a CREATEDB-capable role) when the
// owner provides one; otherwise fall back to the dev connection's credentials.
const ADMIN_BASE = process.env.MIGRATION_REPLAY_ADMIN_URL || DATABASE_URL!;
function adminUrlFor(databaseName: string): string {
  const u = new URL(ADMIN_BASE);
  u.pathname = `/${databaseName}`;
  return u.toString();
}

/**
 * Batch 02 Task F2 — a clean-from-zero replay that needs NO elevated privilege.
 *
 * The original gate could only replay into a brand-new DATABASE, which requires
 * CREATEDB. On this machine only `postgres` and one unrelated project's role
 * hold that attribute, so the gate always degraded to "verify the artifacts on
 * the already-migrated test database" — which proves the schema is right today
 * but proves nothing about replaying the migration history, and the assignment
 * is explicit that the fallback must not be counted as a full pass.
 *
 * A fresh SCHEMA is the same experiment at a lower privilege: `CREATE SCHEMA`
 * needs only CREATE on the database, which the test role already has.
 * `prisma migrate deploy` against `?schema=<fresh>` creates `_prisma_migrations`
 * and every table from nothing, so the history really is replayed from zero —
 * including the generated `tsvector` column and its GIN index, which are what
 * this gate exists to protect. The schema is dropped afterwards.
 *
 * Returns true when it ran (pass or fail); false when the privilege is missing,
 * so the caller can fall back and say so.
 */
async function schemaReplay(testUrl: string): Promise<boolean> {
  const schema = `replay_${Date.now().toString(36)}`;
  const probe = new Client({ connectionString: testUrl });
  try {
    await probe.connect();
    await probe.query(`CREATE SCHEMA "${schema}"`);
  } catch (e) {
    console.log(`  • cannot create a disposable schema either: ${(e as Error).message.split(NL)[0]}`);
    await probe.end().catch(() => {});
    return false;
  }

  const replayUrl = (() => {
    const u = new URL(testUrl);
    u.searchParams.set('schema', schema);
    return u.toString();
  })();

  console.log(`  • created disposable schema "${schema}" (no CREATEDB needed)`);
  console.log('  • running `prisma migrate deploy` into it from zero…');
  try {
    const res = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: path.resolve(here, '..'),
      env: { ...process.env, DATABASE_URL: replayUrl },
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const out = (res.stdout ?? '') + (res.stderr ?? '');
    check('clean replay (fresh schema): all migrations applied', res.status === 0 && /All migrations have been successfully applied|No pending migrations/i.test(out), `exit ${res.status}: ${out.slice(-300)}`);
    check('clean replay (fresh schema): no DROP COLUMN/INDEX in applied SQL output', !/drop column|drop index/i.test(out));

    const client = new Client({ connectionString: testUrl });
    try {
      await client.connect();
      // Resolve names inside the replayed schema only.
      await client.query(`SET search_path TO "${schema}"`);
      await assertFts(client, 'fresh-schema-replay', true);
    } finally {
      await client.end().catch(() => {});
    }
  } finally {
    try { await probe.query(`DROP SCHEMA "${schema}" CASCADE`); console.log(`  • dropped schema "${schema}"`); }
    catch (e) { console.log(`  • WARNING: could not drop schema "${schema}": ${(e as Error).message.split(NL)[0]}`); }
    await probe.end().catch(() => {});
  }
  return true;
}

async function main() {
  console.log('\nMigration replay & FTS preservation gate\n');
  const base = new URL(DATABASE_URL!);
  const replayDb = `${base.pathname.replace(/^\//, '')}_migration_replay`;

  // Try to create a disposable DB from the maintenance database.
  const maint = new Client({ connectionString: adminUrlFor('postgres') });
  let cleanReplay = false;
  try {
    await maint.connect();
    await maint.query(`DROP DATABASE IF EXISTS "${replayDb}"`);
    await maint.query(`CREATE DATABASE "${replayDb}"`);
    cleanReplay = true;
    console.log(`  • created disposable database "${replayDb}"`);
  } catch (e) {
    console.log(`  • cannot create a disposable database (role lacks CREATEDB): ${(e as Error).message.split('\n')[0]}`);
  } finally {
    await maint.end().catch(() => {});
  }

  if (cleanReplay) {
    const replayUrl = adminUrlFor(replayDb);
    console.log('  • running `prisma migrate deploy` on the fresh database…');
    const res = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: path.resolve(here, '..'),
      env: { ...process.env, DATABASE_URL: replayUrl },
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const out = (res.stdout ?? '') + (res.stderr ?? '');
    check('clean replay: all migrations applied', res.status === 0 && /All migrations have been successfully applied|No pending migrations/i.test(out), `exit ${res.status}`);
    check('clean replay: no DROP COLUMN/INDEX in applied SQL output', !/drop column|drop index/i.test(out));

    const client = new Client({ connectionString: replayUrl });
    try {
      await client.connect();
      await assertFts(client, 'fresh-replay', true);
    } finally {
      await client.end().catch(() => {});
    }
    // Drop the disposable DB.
    const maint2 = new Client({ connectionString: adminUrlFor('postgres') });
    try { await maint2.connect(); await maint2.query(`DROP DATABASE IF EXISTS "${replayDb}"`); console.log(`  • dropped "${replayDb}"`); }
    catch { /* leave it; harmless disposable */ }
    finally { await maint2.end().catch(() => {}); }
  } else if (TEST_DATABASE_URL && await schemaReplay(TEST_DATABASE_URL)) {
    // Handled inside schemaReplay(): a real clean-from-zero replay that needs no
    // elevated privilege. Nothing to do here.
  } else if (TEST_DATABASE_URL) {
    console.log('  • FALLBACK: verifying FTS artifacts on the test database (already fully migrated).');
    console.log('    (This is NOT a clean-from-zero replay — see the message above for why.)');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    try { await client.connect(); await assertFts(client, 'test-db', false); }
    finally { await client.end().catch(() => {}); }
  } else {
    check('a replay target is available', false, 'no CREATEDB and no TEST_DATABASE_URL');
  }

  console.log(`\nMigration replay: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) { console.error('FAILURES:\n' + fails.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}

main().catch((e) => { console.error('Replay runner error:', e); process.exit(1); });

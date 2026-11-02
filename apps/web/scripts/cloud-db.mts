/**
 * NFRGuide — Aiven cloud PostgreSQL helper (infra setup, not Batch 13).
 *
 * Reads CLOUD_DATABASE_URL from apps/web/.env (git-ignored). NEVER prints the URI,
 * password or any secret — only a REDACTED identity (user, host-prefix, port, db).
 *
 *   npx tsx scripts/cloud-db.mts audit         # read-only: version/TLS/role/objects/migrations
 *   npx tsx scripts/cloud-db.mts verify        # read-only: post-deploy schema + FTS verification
 *   npx tsx scripts/cloud-db.mts deploy --confirm   # runs `prisma migrate deploy` against cloud
 *
 * Safety: `deploy` requires --confirm AND aborts if the target host looks like the
 * local dev/test database (prevents ever pointing production commands at localhost).
 */
import { Client } from 'pg';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const env: Record<string, string> = {};
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
}

// Tolerate common paste mistakes without ever printing the value: a leading `psql `,
// surrounding single/double quotes, and stray whitespace are stripped so either the
// bare URI or the full `psql 'postgres://…'` console snippet works.
function sanitizeUri(v: string): string {
  let s = (v || '').trim();
  s = s.replace(/^psql\s+/i, '').trim();            // drop a leading `psql ` prefix
  s = s.replace(/^['"]|['"]$/g, '').trim();          // drop surrounding quotes
  return s;
}
const CLOUD = sanitizeUri(env.CLOUD_DATABASE_URL || process.env.CLOUD_DATABASE_URL || '');
if (!CLOUD) {
  console.error('CLOUD_DATABASE_URL is not set in apps/web/.env. Paste the Aiven URI there (locally, never in chat), then re-run.');
  process.exit(2);
}
if (!/^postgres(ql)?:\/\//.test(CLOUD)) {
  console.error('CLOUD_DATABASE_URL does not look like a postgres:// URI after cleanup. Check apps/web/.env line (should be just the postgres://…sslmode=require URI).');
  process.exit(2);
}

function parse(u: string) {
  const url = new URL(u);
  return { user: url.username, host: url.hostname, port: url.port || '5432', db: url.pathname.replace(/^\//, ''), ssl: url.searchParams.get('sslmode') };
}
function redactHost(h: string): string {
  // Show only the leading service label + a trailing marker, hide the full FQDN.
  const first = h.split('.')[0];
  return `${first}.…${h.endsWith('aivencloud.com') ? 'aivencloud.com' : '(host hidden)'}`;
}
const cloud = parse(CLOUD);
const localHosts = new Set([env.DATABASE_URL, env.TEST_DATABASE_URL].filter(Boolean).map((u) => { try { return new URL(u!).hostname; } catch { return ''; } }));

function assertNotLocal() {
  const isLocalish = cloud.host === 'localhost' || cloud.host === '127.0.0.1' || localHosts.has(cloud.host);
  if (isLocalish || !cloud.host.endsWith('aivencloud.com')) {
    console.error(`REFUSING: target host does not look like the Aiven cloud DB (got ${redactHost(cloud.host)}). Aborting to protect local databases.`);
    process.exit(3);
  }
}

function redactedIdentity() {
  console.log('Target (redacted):');
  console.log(`  user: ${cloud.user}`);
  console.log(`  host: ${redactHost(cloud.host)}`);
  console.log(`  port: ${cloud.port}`);
  console.log(`  db:   ${cloud.db}`);
  console.log(`  sslmode: ${cloud.ssl ?? '(unset!)'}`);
}

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  // Strip `sslmode` from the URI so node-pg does not force verify-full (which would
  // reject Aiven's CA chain); connect over TLS with CA verification relaxed for this
  // read-only tooling. (Prisma's own engine handles sslmode=require against Aiven.)
  const u = new URL(CLOUD);
  u.searchParams.delete('sslmode');
  const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try { return await fn(c); } finally { await c.end().catch(() => {}); }
}

async function audit() {
  assertNotLocal();
  redactedIdentity();
  await withClient(async (c) => {
    const ver = await c.query('SHOW server_version');
    console.log(`\nserver_version: ${ver.rows[0].server_version}`);
    const ssl = await c.query("SELECT ssl, version AS tls FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
    console.log(`TLS: ssl=${ssl.rows[0]?.ssl} ${ssl.rows[0]?.tls ?? ''}`);
    const role = await c.query('SELECT current_user AS u, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS super, (SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user) AS createdb, current_database() AS db');
    console.log(`role: ${role.rows[0].u} | superuser=${role.rows[0].super} | createdb=${role.rows[0].createdb} | current_db=${role.rows[0].db}`);
    const cr = await c.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS can_create, has_schema_privilege(current_user,'public','USAGE') AS can_use");
    console.log(`public schema: CREATE=${cr.rows[0].can_create} USAGE=${cr.rows[0].can_use}`);
    const tabs = await c.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'");
    console.log(`\npublic tables present: ${tabs.rows[0].n}`);
    if (tabs.rows[0].n > 0) {
      const names = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name LIMIT 60");
      console.log('  ' + names.rows.map((r) => r.table_name).join(', '));
    } else {
      console.log('  (database is EMPTY — no application tables)');
    }
    const mig = await c.query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has");
    if (mig.rows[0].has) {
      const rows = await c.query('SELECT migration_name, (finished_at IS NOT NULL) AS applied, (rolled_back_at IS NOT NULL) AS rb FROM "_prisma_migrations" ORDER BY migration_name');
      console.log(`\n_prisma_migrations: ${rows.rowCount} row(s)`);
      for (const r of rows.rows) console.log(`  ${r.applied ? 'OK' : '--'}${r.rb ? ' ROLLEDBACK' : ''} ${r.migration_name}`);
    } else {
      console.log('\n_prisma_migrations: ABSENT (no migrations applied yet)');
    }
  });
}

async function verify() {
  assertNotLocal();
  redactedIdentity();
  const EXPECT = ['Article', 'ArticleSeo', 'Category', 'Author', 'MediaAsset', 'User', 'Role', 'Session', 'AuditLog', 'EntitySeo', 'EntityFaq', 'Venue', 'Competitor', 'CompetitorParticipation', 'CompetitorDiscipline', 'ArticleCompetitor', 'CompetitorMedia'];
  let fail = 0; const ok = (n: string, c: boolean, d = '') => { console.log(`  ${c ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); if (!c) fail++; };
  await withClient(async (c) => {
    const tabs = new Set((await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map((r) => r.table_name));
    for (const t of EXPECT) ok(`table ${t} exists`, tabs.has(t));
    const col = await c.query("SELECT udt_name, is_generated FROM information_schema.columns WHERE table_name='Article' AND column_name='searchVector'");
    ok('Article.searchVector is tsvector', col.rows[0]?.udt_name === 'tsvector');
    ok('Article.searchVector is GENERATED', col.rows[0]?.is_generated === 'ALWAYS');
    const idx = await c.query("SELECT indexdef FROM pg_indexes WHERE tablename='Article' AND indexname='Article_searchVector_idx'");
    ok('GIN index on searchVector', /USING gin/i.test(idx.rows[0]?.indexdef ?? ''));
    const fts = await c.query("SELECT to_tsvector('english','bull riding') @@ websearch_to_tsquery('english','bull') AS r");
    ok('websearch_to_tsquery FTS works', fts.rows[0]?.r === true);
    const enumv = await c.query("SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='LandingEntityType' ORDER BY e.enumsortorder");
    const labels = enumv.rows.map((r) => r.enumlabel);
    ok('LandingEntityType has VENUE + COMPETITOR', labels.includes('VENUE') && labels.includes('COMPETITOR'), labels.join(','));
    const fk = await c.query("SELECT count(*)::int n FROM information_schema.table_constraints WHERE table_schema='public' AND constraint_type='FOREIGN KEY'");
    ok('foreign keys present', fk.rows[0].n > 0, `${fk.rows[0].n} FKs`);
    const mig = await c.query('SELECT count(*)::int n, count(rolled_back_at)::int rb FROM "_prisma_migrations"');
    ok('all migrations applied, none rolled back', mig.rows[0].n >= 11 && mig.rows[0].rb === 0, `${mig.rows[0].n} applied, ${mig.rows[0].rb} rolled back`);
  });
  console.log(`\nVerify: ${fail === 0 ? 'ALL PASSED' : fail + ' FAILED'}`);
  if (fail) process.exit(1);
}

function deploy() {
  assertNotLocal();
  if (!process.argv.includes('--confirm')) {
    console.error('REFUSING: `deploy` requires --confirm. This runs `prisma migrate deploy` against the CLOUD database.');
    process.exit(4);
  }
  redactedIdentity();
  console.log('\nRunning `prisma migrate deploy` against the cloud target…');
  const res = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: CLOUD }, // override ONLY for this child process
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  process.exit(res.status ?? 1);
}

const cmd = process.argv[2];
if (cmd === 'audit') await audit();
else if (cmd === 'verify') await verify();
else if (cmd === 'deploy') deploy();
else { console.error('usage: cloud-db.mts <audit|verify|deploy --confirm>'); process.exit(2); }

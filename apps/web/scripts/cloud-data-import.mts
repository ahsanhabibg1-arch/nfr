/**
 * NFRGuide — one-shot local → Aiven DATA-ONLY import (infra migration; owner-run).
 *
 * Dumps the local DB's data (NOT schema) and restores it into the Aiven cloud DB in a
 * SINGLE TRANSACTION (any error → full rollback, cloud left untouched). Excludes
 * `Session` (dev sessions) and `_prisma_migrations`. The destination schema is NOT
 * modified; generated columns (Article.searchVector) are omitted by pg_dump and
 * repopulate themselves on the cloud.
 *
 * Safety: refuses unless the target host ends with aivencloud.com; requires --confirm;
 * never uses --clean / reset / truncate; redacts all secrets.
 *
 *   npx tsx scripts/cloud-data-import.mts --confirm
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const PG = 'C:/Program Files/PostgreSQL/17/bin';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
const sanitize = (v: string) => (v || '').replace(/^psql\s+/i, '').replace(/^['"]|['"]$/g, '').trim();
const LOCAL = env.DATABASE_URL;
const CLOUD = sanitize(env.CLOUD_DATABASE_URL || '');
if (!LOCAL || !CLOUD) { console.error('DATABASE_URL and CLOUD_DATABASE_URL must both be set in .env'); process.exit(2); }
const lu = new URL(LOCAL); const cu = new URL(CLOUD);
if (!cu.hostname.endsWith('aivencloud.com')) { console.error(`REFUSE: cloud target is not aivencloud (${cu.hostname.split('.')[0]}…).`); process.exit(3); }
if (cu.hostname === lu.hostname) { console.error('REFUSE: cloud and local hosts are identical.'); process.exit(3); }
if (!process.argv.includes('--confirm')) { console.error('REFUSE: pass --confirm to write to the cloud database.'); process.exit(4); }

const pgEnv = (u: URL, extra: Record<string, string> = {}) => ({
  ...process.env, PGHOST: u.hostname, PGPORT: u.port || '5432',
  PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
  PGDATABASE: u.pathname.replace(/^\//, ''), ...extra,
});
const redact = (u: URL) => `${u.hostname.split('.')[0]}… / ${u.pathname.replace(/^\//, '')}`;

const dump = path.join(os.tmpdir(), `nfrguide_dataonly_${Date.now()}.dump`);
console.log(`Source (local): ${redact(lu)}`);
console.log(`Destination (cloud): ${redact(cu)}`);

// 1) data-only dump of local (exclude Session + _prisma_migrations)
console.log('\n[1/3] pg_dump --data-only (local)…');
let r = spawnSync(`${PG}/pg_dump.exe`, [
  '-Fc', '--data-only', '--no-owner', '--no-privileges',
  '--exclude-table-data=public."Session"', '--exclude-table-data=public."_prisma_migrations"',
  '-f', dump,
], { env: pgEnv(lu), encoding: 'utf8' });
if (r.status !== 0) { console.error('pg_dump failed:\n' + (r.stderr || '').split('\n').slice(0, 6).join('\n')); process.exit(1); }
console.log(`      dump: ${fs.statSync(dump).size} bytes`);

// 2) single-transaction data-only restore into cloud
console.log('[2/3] pg_restore --data-only --single-transaction (cloud)…');
r = spawnSync(`${PG}/pg_restore.exe`, [
  '-d', cu.pathname.replace(/^\//, ''),
  '--data-only', '--single-transaction', '--no-owner', '--no-privileges', '--exit-on-error', dump,
], { env: pgEnv(cu, { PGSSLMODE: 'require' }), encoding: 'utf8' });
try { fs.unlinkSync(dump); } catch { /* temp cleanup */ }
if (r.status !== 0) {
  console.error('RESTORE FAILED — rolled back; cloud left unchanged:\n' + (r.stderr || '').split('\n').filter(Boolean).slice(0, 10).join('\n'));
  process.exit(1);
}
console.log('      restore OK (committed)');

// 3) quick count parity check (read-only)
console.log('[3/3] verifying row counts (local vs cloud)…');
const check = `SELECT (SELECT count(*) FROM "Article") a,(SELECT count(*) FROM "Category") c,(SELECT count(*) FROM "User") u,(SELECT count(*) FROM "Discipline") d,(SELECT count(*) FROM "AuditLog") al,(SELECT count(*) FROM "Session") s;`;
const q = (u: URL) => spawnSync(`${PG}/psql.exe`, ['-t', '-A', '-F', ',', '-c', check], { env: pgEnv(u, u === cu ? { PGSSLMODE: 'require' } : {}), encoding: 'utf8' }).stdout?.trim();
console.log(`      local  (a,c,u,d,al,s): ${q(lu)}`);
console.log(`      cloud  (a,c,u,d,al,s): ${q(cu)}`);
console.log('\nDone. Cloud Session count should be 0 (excluded). Run `npx tsx scripts/cloud-db.mts verify` for the full schema/FTS check.');

/**
 * Integration-test database isolation guard (Phase 2 / Workstream 0).
 *
 * The DB-backed suites create and delete rows, so they must only ever run against a
 * disposable LOCAL database. `vitest.config.ts` calls this before any suite loads:
 *
 *   - TEST_DATABASE_URL unset  -> DATABASE_URL is blanked, so every DB suite self-skips
 *                                 (it never falls back to the development database).
 *   - TEST_DATABASE_URL set    -> it must point at a local host, use a database whose name
 *                                 marks it as disposable (`test` / `ci`), and must not be the
 *                                 development DATABASE_URL or CLOUD_DATABASE_URL. Otherwise
 *                                 the run aborts before any connection is made.
 *
 * Pure function (no side effects) so it can be unit-tested. Never returns or logs secrets.
 */

export type TestDbDecision =
  | { mode: 'isolated'; databaseUrl: string; target: string }
  | { mode: 'disabled'; reason: string }
  | { mode: 'refused'; reason: string };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DISPOSABLE_DB = /(^|[_-])(test|ci)([_-]|$)/i;

function parse(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw.trim().replace(/^['"]|['"]$/g, ''));
  } catch {
    return null;
  }
}

/** Host + database name only — safe to print. */
function describe(u: URL): string {
  return `${u.hostname}:${u.port || '5432'}/${u.pathname.replace(/^\//, '')}`;
}

function sameDatabase(a: URL, b: URL | null): boolean {
  if (!b) return false;
  return a.hostname === b.hostname && (a.port || '5432') === (b.port || '5432') && a.pathname === b.pathname;
}

export function decideTestDatabase(env: Record<string, string | undefined>): TestDbDecision {
  const rawTest = env.TEST_DATABASE_URL?.trim();
  if (!rawTest) {
    return { mode: 'disabled', reason: 'TEST_DATABASE_URL is not set; DB integration suites will skip.' };
  }

  const test = parse(rawTest);
  if (!test || !/^postgres(ql)?:$/.test(test.protocol)) {
    return { mode: 'refused', reason: 'TEST_DATABASE_URL is not a valid postgres:// URL.' };
  }
  const target = describe(test);

  if (!LOCAL_HOSTS.has(test.hostname)) {
    return { mode: 'refused', reason: `TEST_DATABASE_URL must target a local database (got host ${test.hostname}).` };
  }
  const dbName = test.pathname.replace(/^\//, '');
  if (!DISPOSABLE_DB.test(dbName)) {
    return { mode: 'refused', reason: `TEST_DATABASE_URL database "${dbName}" is not marked disposable (name must contain "test" or "ci").` };
  }
  if (sameDatabase(test, parse(env.CLOUD_DATABASE_URL))) {
    return { mode: 'refused', reason: 'TEST_DATABASE_URL points at CLOUD_DATABASE_URL.' };
  }
  // CI legitimately sets DATABASE_URL === TEST_DATABASE_URL (one disposable DB). Locally the
  // development database must never double as the test database.
  const dev = parse(env.DATABASE_URL);
  if (dev && sameDatabase(test, dev) && !DISPOSABLE_DB.test(dev.pathname.replace(/^\//, ''))) {
    return { mode: 'refused', reason: 'TEST_DATABASE_URL is the development database.' };
  }

  return { mode: 'isolated', databaseUrl: rawTest, target };
}

/**
 * For local maintenance scripts that only repair relationships (no content, no publishing),
 * e.g. scripts/seed-rodeo-links.mts: the target must be a LOCAL database, must not be the
 * cloud database, and the app must not be running as production. Returns a safe description
 * (host/db) or throws. (Batch B.)
 */
export function requireLocalNonProductionDatabase(env: Record<string, string | undefined>, scriptName: string): string {
  const db = parse(env.DATABASE_URL);
  const fail = (why: string) => new Error(`${scriptName} refuses to run: ${why}`);
  if (!db || !/^postgres(ql)?:$/.test(db.protocol)) throw fail('DATABASE_URL is missing or not a postgres:// URL.');
  if (!LOCAL_HOSTS.has(db.hostname)) throw fail(`DATABASE_URL must be a local database (got host ${db.hostname}).`);
  if (sameDatabase(db, parse(env.CLOUD_DATABASE_URL))) throw fail('DATABASE_URL is the cloud database.');
  if ((env.APP_ENV || '').toLowerCase() === 'production' || (env.NODE_ENV || '').toLowerCase() === 'production') {
    throw fail('APP_ENV/NODE_ENV is production.');
  }
  return describe(db);
}

/**
 * For maintenance/smoke scripts that WRITE to a database (users, sessions, articles):
 * returns the isolated test database URL to use, or throws. Fails closed — an unset,
 * remote, non-disposable, development or cloud target is refused. The script must set
 * DATABASE_URL to the returned value before importing any DB module. (Batch A, A8.)
 */
export function requireIsolatedScriptDatabase(env: Record<string, string | undefined>, scriptName: string): string {
  const d = decideTestDatabase(env);
  if (d.mode !== 'isolated') {
    throw new Error(
      `${scriptName} refuses to run: it writes to the database and needs an explicit isolated test database. ${d.reason} ` +
        'Set TEST_DATABASE_URL to a local *_test database and point the server under test at the same database.',
    );
  }
  return d.databaseUrl;
}

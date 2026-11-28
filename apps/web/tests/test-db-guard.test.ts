import { describe, it, expect } from 'vitest';
import {
  checkMigrationReadiness,
  decideTestDatabase,
  describeUnqueryableDatabase,
} from './support/testDbGuard';

describe('integration-test database isolation guard', () => {
  const local = 'postgresql://u:p@localhost:5433/nfrguide_test?schema=public';

  it('disables DB suites when TEST_DATABASE_URL is unset (no dev-DB fallback)', () => {
    const d = decideTestDatabase({ DATABASE_URL: 'postgresql://u:p@localhost:5433/nfrguide_dev' });
    expect(d.mode).toBe('disabled');
  });

  it('accepts a local disposable database', () => {
    const d = decideTestDatabase({ TEST_DATABASE_URL: local, DATABASE_URL: 'postgresql://u:p@localhost:5433/nfrguide_dev' });
    expect(d).toMatchObject({ mode: 'isolated', target: 'localhost:5433/nfrguide_test' });
  });

  it('accepts the CI layout where DATABASE_URL === TEST_DATABASE_URL (disposable)', () => {
    const ci = 'postgresql://ci:ci@localhost:5432/nfrguide_ci?schema=public';
    expect(decideTestDatabase({ TEST_DATABASE_URL: ci, DATABASE_URL: ci }).mode).toBe('isolated');
  });

  it('refuses a remote / cloud host', () => {
    const d = decideTestDatabase({ TEST_DATABASE_URL: 'postgres://avnadmin:x@pg-1.aivencloud.com:20376/defaultdb_test?sslmode=require' });
    expect(d.mode).toBe('refused');
  });

  it('refuses the CLOUD_DATABASE_URL even if it looked local', () => {
    const url = 'postgresql://u:p@localhost:6543/prod_ci';
    expect(decideTestDatabase({ TEST_DATABASE_URL: url, CLOUD_DATABASE_URL: url }).mode).toBe('refused');
  });

  it('refuses a database name not marked disposable', () => {
    expect(decideTestDatabase({ TEST_DATABASE_URL: 'postgresql://u:p@localhost:5433/nfrguide_dev' }).mode).toBe('refused');
    expect(decideTestDatabase({ TEST_DATABASE_URL: 'postgresql://u:p@localhost:5433/contest' }).mode).toBe('refused');
  });

  it('refuses when the test URL is the development database', () => {
    const dev = 'postgresql://u:p@localhost:5433/nfrguide';
    expect(decideTestDatabase({ TEST_DATABASE_URL: dev, DATABASE_URL: dev }).mode).toBe('refused');
  });

  it('refuses an unparseable URL and never echoes credentials', () => {
    const d = decideTestDatabase({ TEST_DATABASE_URL: 'not a url' });
    expect(d.mode).toBe('refused');
    const secret = decideTestDatabase({ TEST_DATABASE_URL: 'postgresql://user:S3CRET@db.example.com:5432/x_test' });
    expect(JSON.stringify(secret)).not.toContain('S3CRET');
  });
});

/**
 * Stage 03 Task E — the readiness check that replaces 71 misleading failures.
 *
 * The unapplied-migration case is the one worth pinning: the previous symptom
 * was 13 files failing on assorted Prisma column errors, which reads as broken
 * code rather than a database that is behind.
 */
describe('test database migration readiness', () => {
  const dirs = ['20260101000000_a', '20260102000000_b', '20260103000000_c'];
  const target = 'localhost:5433/nfrguide_test';

  it('passes when every migration directory has been applied', () => {
    const r = checkMigrationReadiness(dirs, [...dirs], target);
    expect(r).toEqual({ ok: true, missing: [] });
  });

  it('passes when the database reports MORE than the directories (a newer branch)', () => {
    // Switching to an older branch must not block the run: the schema is ahead,
    // not behind, and the suites for that branch still have what they need.
    const r = checkMigrationReadiness(dirs, [...dirs, '20260104000000_d'], target);
    expect(r.ok).toBe(true);
  });

  it('names every unapplied migration, in order', () => {
    const r = checkMigrationReadiness(dirs, ['20260101000000_a'], target);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['20260102000000_b', '20260103000000_c']);
  });

  it('gives an ACTIONABLE message: the count, the target, the names and the command', () => {
    const r = checkMigrationReadiness(dirs, ['20260101000000_a'], target);
    expect(r.message).toContain('2 migration(s) behind');
    expect(r.message).toContain(target);
    expect(r.message).toContain('applied: 1 of 3');
    expect(r.message).toContain('20260102000000_b');
    expect(r.message).toContain('20260103000000_c');
    expect(r.message).toContain('prisma migrate deploy');
    // It must steer to the TEST database explicitly — the failure mode this
    // whole guard exists to prevent is migrating the wrong one.
    expect(r.message).toContain('TEST_DATABASE_URL');
    expect(r.message).toMatch(/never the development or cloud one/i);
  });

  it('reports an entirely unmigrated database rather than passing it', () => {
    const r = checkMigrationReadiness(dirs, [], target);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(dirs);
  });

  it('passes vacuously when there are no migration directories at all', () => {
    expect(checkMigrationReadiness([], [], target).ok).toBe(true);
  });
});

/**
 * Stage 04-R, Task F. A configured isolated database that cannot be queried used
 * to end in a green run: the readiness probe swallowed the error, every DB suite
 * self-skipped on its own `SELECT 1`, and vitest exited 0. Under REQUIRE_DB_TESTS=1
 * that is the opposite of what the flag is for, so globalSetup now throws this.
 */
describe('unqueryable-database message (REQUIRE_DB_TESTS=1)', () => {
  const target = 'localhost:5432/nfrguide_test';

  it('says the run would otherwise pass while proving nothing', () => {
    const m = describeUnqueryableDatabase(target, new Error("Can't reach database server"));
    expect(m).toContain('REQUIRE_DB_TESTS=1');
    expect(m).toContain(target);
    expect(m).toContain("Can't reach database server");
    expect(m).toMatch(/no database coverage/i);
    // The whole point: name the false-pass, don't just report a connection error.
    expect(m).toMatch(/self-skip/i);
    expect(m).toContain('prisma migrate deploy');
  });

  it('skips the blank line and banner Prisma puts first, to quote the real cause', () => {
    const m = describeUnqueryableDatabase(
      target,
      new Error('\nInvalid `prisma.$queryRaw()` invocation:\n\nCan\'t reach database server'),
    );
    expect(m).toContain("cause:  Can't reach database server");
    expect(m).not.toContain('unknown error');
  });

  it('quotes only one line of a multi-line driver error', () => {
    const m = describeUnqueryableDatabase(
      target,
      new Error('Authentication failed\npassword=SUPERSECRET\nat Connection.connect'),
    );
    expect(m).toContain('Authentication failed');
    expect(m).not.toContain('SUPERSECRET');
    expect(m).not.toContain('Connection.connect');
  });

  it('never echoes a connection string, only the host/port/name target', () => {
    const m = describeUnqueryableDatabase(target, new Error('boom'));
    expect(m).not.toMatch(/postgres(ql)?:\/\//);
  });

  it('handles a thrown non-Error without losing the message', () => {
    expect(describeUnqueryableDatabase(target, 'ECONNREFUSED')).toContain('ECONNREFUSED');
    expect(describeUnqueryableDatabase(target, undefined)).toContain('unknown error');
  });
});

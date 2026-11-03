import { describe, it, expect } from 'vitest';
import { decideTestDatabase } from './support/testDbGuard';

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

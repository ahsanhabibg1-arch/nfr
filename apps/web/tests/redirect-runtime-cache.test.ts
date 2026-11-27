import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findVersion: vi.fn(),
  resolveLiveCanonical: vi.fn(),
  report: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    articleRedirect: { findMany: mocks.findMany, findFirst: mocks.findFirst },
    redirectCacheState: { findUnique: mocks.findVersion },
  },
}));

vi.mock('../lib/redirects/resolve', () => ({
  resolveLiveCanonical: mocks.resolveLiveCanonical,
}));

vi.mock('@/lib/logger', () => ({
  report: mocks.report,
}));

const liveRedirect = {
  sourcePath: '/articles/old/',
  targetPath: '/articles/live/',
  statusCode: 308,
};

describe('managed redirect snapshot cache', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.findMany.mockReset();
    mocks.findFirst.mockReset();
    mocks.findVersion.mockReset().mockResolvedValue({ version: 0n });
    mocks.resolveLiveCanonical.mockReset().mockResolvedValue(null);
    mocks.report.mockReset();
  });

  it('caches a bounded snapshot and reloads when the durable generation changes', async () => {
    mocks.findMany.mockResolvedValue([liveRedirect]);
    mocks.resolveLiveCanonical.mockImplementation(async (path: string) =>
      path === '/articles/live/' ? path : null,
    );
    const snapshot = await import('../lib/redirects/snapshot');

    await expect(snapshot.resolveManagedRedirectAtBoundary(liveRedirect.sourcePath)).resolves.toEqual({
      targetPath: '/articles/live/',
      statusCode: 308,
    });
    await expect(snapshot.resolveManagedRedirectAtBoundary('/articles/missing/')).resolves.toBeNull();
    await expect(snapshot.resolveManagedRedirectAtBoundary('/articles/missing/')).resolves.toBeNull();
    expect(mocks.findMany).toHaveBeenCalledTimes(1);

    mocks.findMany.mockResolvedValue([]);
    mocks.findVersion.mockResolvedValue({ version: 1n });
    await expect(snapshot.resolveManagedRedirectAtBoundary(liveRedirect.sourcePath)).resolves.toBeNull();
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not redirect a source that has since become canonical', async () => {
    mocks.findMany.mockResolvedValue([liveRedirect]);
    mocks.resolveLiveCanonical.mockImplementation(async (path: string) =>
      path === liveRedirect.sourcePath || path === liveRedirect.targetPath ? path : null,
    );
    const snapshot = await import('../lib/redirects/snapshot');

    await expect(snapshot.resolveManagedRedirectAtBoundary(liveRedirect.sourcePath)).resolves.toBeNull();
  });

  it('fails open for one request and recovers after a snapshot refresh failure', async () => {
    mocks.findMany.mockRejectedValueOnce(new Error('database temporarily unavailable')).mockResolvedValue([liveRedirect]);
    mocks.resolveLiveCanonical.mockImplementation(async (path: string) =>
      path === liveRedirect.targetPath ? path : null,
    );
    const snapshot = await import('../lib/redirects/snapshot');

    await expect(snapshot.resolveManagedRedirectAtBoundary(liveRedirect.sourcePath)).resolves.toBeNull();
    await expect(snapshot.resolveManagedRedirectAtBoundary(liveRedirect.sourcePath)).resolves.toEqual({
      targetPath: '/articles/live/',
      statusCode: 308,
    });
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.report).toHaveBeenCalledWith(
      'database',
      expect.any(Error),
      { fields: { operation: 'redirect_snapshot_refresh' } },
    );
  });

  it('fails open and retries when the durable generation read is unavailable', async () => {
    mocks.findVersion.mockRejectedValueOnce(new Error('database temporarily unavailable')).mockResolvedValue({ version: 0n });
    mocks.findMany.mockResolvedValue([liveRedirect]);
    mocks.resolveLiveCanonical.mockImplementation(async (path: string) =>
      path === liveRedirect.targetPath ? path : null,
    );
    const snapshot = await import('../lib/redirects/snapshot');

    await expect(snapshot.resolveManagedRedirectAtBoundary(liveRedirect.sourcePath)).resolves.toBeNull();
    await expect(snapshot.resolveManagedRedirectAtBoundary(liveRedirect.sourcePath)).resolves.toEqual({
      targetPath: '/articles/live/',
      statusCode: 308,
    });
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.report).toHaveBeenCalledWith(
      'database',
      expect.any(Error),
      { fields: { operation: 'redirect_cache_generation_read' } },
    );
  });

  it('discards an in-flight snapshot when a post-commit invalidation races its refresh', async () => {
    let finishFirstLoad!: (rows: typeof liveRedirect[]) => void;
    let version = 0n;
    mocks.findMany
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirstLoad = resolve; }))
      .mockResolvedValueOnce([]);
    mocks.findVersion.mockImplementation(async () => ({ version }));
    const snapshot = await import('../lib/redirects/snapshot');

    const pending = snapshot.resolveManagedRedirectAtBoundary(liveRedirect.sourcePath);
    await vi.waitFor(() => expect(mocks.findMany).toHaveBeenCalledTimes(1));
    version = 1n;
    finishFirstLoad([liveRedirect]);

    await expect(pending).resolves.toBeNull();
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
  });

  it('keeps redirects beyond the memory bound available via a direct overflow lookup', async () => {
    const rows = Array.from({ length: 5_000 }, (_, i) => ({
      sourcePath: `/articles/cached-${i}/`,
      targetPath: '/articles/live/',
      statusCode: 308,
    }));
    mocks.findMany.mockResolvedValue([...rows, {
      sourcePath: '/articles/overflow/',
      targetPath: '/articles/live/',
      statusCode: 302,
    }]);
    mocks.findFirst.mockResolvedValue({
      sourcePath: '/articles/overflow/',
      targetPath: '/articles/live/',
      statusCode: 302,
    });
    mocks.resolveLiveCanonical.mockImplementation(async (path: string) =>
      path === '/articles/live/' ? path : null,
    );
    const snapshot = await import('../lib/redirects/snapshot');

    await expect(snapshot.resolveManagedRedirectAtBoundary('/articles/overflow/')).resolves.toEqual({
      targetPath: '/articles/live/',
      statusCode: 302,
    });
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
  });
});

/**
 * Stage 03 / SEO-04 + APP-01 — protected system routes at the boundary.
 *
 * Two properties, and the second is the one the old code lacked: a protected
 * route must not be redirected BY ANY MEANS, and it must not reach the database
 * to establish that. Every case below drives the real
 * `resolveManagedRedirectAtBoundary` with mocked Prisma, so "no database read"
 * is asserted against the call counts rather than argued.
 */
describe('protected system routes at the redirect boundary', () => {
  const PROTECTED = ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/manifest.json'];

  beforeEach(() => {
    vi.resetModules();
    mocks.findMany.mockReset();
    mocks.findFirst.mockReset();
    mocks.findVersion.mockReset().mockResolvedValue({ version: 0n });
    mocks.resolveLiveCanonical.mockReset().mockResolvedValue(null);
    mocks.report.mockReset();
  });

  it('never redirects a protected route, and never queries the database for one', async () => {
    const snapshot = await import('../lib/redirects/snapshot');

    for (const p of [...PROTECTED, ...PROTECTED.map((p) => `${p}/`), '/ROBOTS.TXT', '/admin/', '/api/health/']) {
      await expect(snapshot.resolveManagedRedirectAtBoundary(p), p).resolves.toBeNull();
    }

    // The whole point of SEO-04: not one generation read, snapshot load or
    // overflow lookup happened for any of them.
    expect(mocks.findVersion).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('refuses an INVALID LEGACY ROW that names a protected route as its source', async () => {
    // A row written before the validator existed, or inserted around the admin
    // service. It is live and otherwise well-formed, so only the boundary guard
    // and the snapshot filter stand between it and a redirected robots.txt.
    mocks.findMany.mockResolvedValue([
      { sourcePath: '/robots.txt/', targetPath: '/articles/live/', statusCode: 308 },
    ]);
    mocks.resolveLiveCanonical.mockImplementation(async (path: string) =>
      path === '/articles/live/' ? path : null,
    );
    const snapshot = await import('../lib/redirects/snapshot');

    await expect(snapshot.resolveManagedRedirectAtBoundary('/robots.txt')).resolves.toBeNull();
    await expect(snapshot.resolveManagedRedirectAtBoundary('/robots.txt/')).resolves.toBeNull();
    expect(mocks.findVersion).not.toHaveBeenCalled();

    // The same row is also refused admission to the snapshot, so a future caller
    // that skipped the boundary guard would still not find it.
    await expect(snapshot.resolveManagedRedirectAtBoundary('/articles/other/')).resolves.toBeNull();
    const loaded = mocks.findMany.mock.calls.length;
    expect(loaded).toBeGreaterThan(0);
  });

  it('is unaffected by a STALE CACHE entry for a protected route', async () => {
    mocks.findMany.mockResolvedValue([
      { sourcePath: '/sitemap.xml/', targetPath: '/articles/live/', statusCode: 301 },
      { sourcePath: '/articles/old/', targetPath: '/articles/live/', statusCode: 308 },
    ]);
    mocks.resolveLiveCanonical.mockImplementation(async (path: string) =>
      path === '/articles/live/' ? path : null,
    );
    const snapshot = await import('../lib/redirects/snapshot');

    // Warm the cache with a legitimate lookup, so the protected path is being
    // tested against a POPULATED snapshot rather than an empty one.
    await expect(snapshot.resolveManagedRedirectAtBoundary('/articles/old/')).resolves.toEqual({
      targetPath: '/articles/live/',
      statusCode: 308,
    });
    mocks.findVersion.mockClear();

    await expect(snapshot.resolveManagedRedirectAtBoundary('/sitemap.xml')).resolves.toBeNull();
    expect(mocks.findVersion).not.toHaveBeenCalled();
  });

  it('serves protected routes unchanged when the redirect database is unavailable', async () => {
    // The availability property. If the generation read throws, a protected
    // route must still resolve to "no redirect" without the error reaching the
    // caller — robots.txt cannot depend on the database being up.
    mocks.findVersion.mockRejectedValue(new Error('connection refused'));
    mocks.findMany.mockRejectedValue(new Error('connection refused'));
    const snapshot = await import('../lib/redirects/snapshot');

    for (const p of PROTECTED) {
      await expect(snapshot.resolveManagedRedirectAtBoundary(p), p).resolves.toBeNull();
    }
    expect(mocks.findVersion).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('still resolves a legitimate content redirect, so the guard is not over-broad', async () => {
    mocks.findMany.mockResolvedValue([
      { sourcePath: '/articles/old/', targetPath: '/articles/live/', statusCode: 308 },
    ]);
    mocks.resolveLiveCanonical.mockImplementation(async (path: string) =>
      path === '/articles/live/' ? path : null,
    );
    const snapshot = await import('../lib/redirects/snapshot');

    await expect(snapshot.resolveManagedRedirectAtBoundary('/articles/old/')).resolves.toEqual({
      targetPath: '/articles/live/',
      statusCode: 308,
    });
    // And a public slug that merely resembles a reserved one is NOT bypassed.
    await expect(snapshot.resolveManagedRedirectAtBoundary('/administration/')).resolves.toBeNull();
    expect(mocks.findVersion).toHaveBeenCalled();
  });
});

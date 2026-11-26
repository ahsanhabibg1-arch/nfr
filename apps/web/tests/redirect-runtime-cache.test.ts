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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findArticle: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  prisma: {
    articleRedirect: { findFirst: mocks.findFirst },
    article: { findFirst: mocks.findArticle },
  },
}));

describe('redirect lookup cache invalidation races', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.findFirst.mockReset();
    mocks.findArticle.mockReset().mockResolvedValue({
      slug: 'live',
      subcategoryTaxon: null,
    });
  });

  it('does not let a pre-invalidation query repopulate the local cache', async () => {
    let finishFirstLookup!: (row: { targetPath: string; statusCode: number } | null) => void;
    mocks.findFirst
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirstLookup = resolve; }))
      .mockResolvedValueOnce(null);
    const redirects = await import('../lib/redirects/resolve');

    const pending = redirects.resolveRedirect('/articles/old/');
    await vi.waitFor(() => expect(mocks.findFirst).toHaveBeenCalledTimes(1));
    redirects.clearRedirectLookupCache();
    finishFirstLookup({ targetPath: '/articles/live/', statusCode: 308 });

    await expect(pending).resolves.toMatchObject({ destination: '/articles/live/', statusCode: 308 });
    await expect(redirects.resolveRedirect('/articles/old/')).resolves.toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledTimes(2);
  });
});

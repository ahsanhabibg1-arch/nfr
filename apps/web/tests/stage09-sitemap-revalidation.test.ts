import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Stage 09 continuation — Workstream C/D: publication changes revalidate the sitemap.
 *
 * `app/sitemap.ts` reads the database without any request API, so Next caches it
 * statically, and a legal slug is listed only while a published InfoPage exists
 * (`lib/seo/sitemapEntries.ts`). Before this change, publishing or unpublishing an
 * InfoPage revalidated the page paths but NOT `/sitemap.xml`, so an unpublished
 * (noindex) page could stay advertised in the cached sitemap.
 *
 * These tests call the real Server Actions. Only the service layer, the auth
 * guard and `next/cache` are replaced, so what is asserted is the action's own
 * revalidation behaviour.
 */

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('@/lib/cms/guard', () => ({
  getActor: async () => ({ id: 'u1', roles: ['super_admin'] }),
  AuthzError: class extends Error {},
  toActionError: (e: unknown) => ({ ok: false, error: String(e) }),
}));
vi.mock('@/lib/cms/infoPageService', () => ({
  saveInfoPageDraft: vi.fn(async () => undefined),
  submitForReview: vi.fn(async () => undefined),
  approveInfoPage: vi.fn(async () => undefined),
  publishInfoPage: vi.fn(async () => undefined),
  revertToDraft: vi.fn(async () => undefined),
  unpublishInfoPage: vi.fn(async () => undefined),
}));
vi.mock('@/lib/cms/entitySeoService', () => ({ upsertEntitySeo: vi.fn(async () => ({ id: 'seo1' })) }));
vi.mock('@/lib/cms/faqService', () => ({}));

const info = await import('../app/admin/info-page-actions');
const landing = await import('../app/admin/landing-seo-actions');
const paths = () => revalidatePath.mock.calls.map((c) => c[0]);

beforeEach(() => revalidatePath.mockClear());

describe('Stage 09 continuation — publication changes revalidate the sitemap', () => {
  it('publishing an InfoPage revalidates the page, its /info/ alias and the sitemap', async () => {
    expect(await info.publishInfoPageAction('privacy')).toEqual({ ok: true });
    expect(paths()).toEqual(expect.arrayContaining(['/privacy/', '/info/privacy/', '/sitemap.xml']));
  });

  it('unpublishing an InfoPage revalidates the sitemap, so a noindex page is not left listed', async () => {
    expect(await info.unpublishInfoPageAction('privacy')).toEqual({ ok: true });
    expect(paths()).toContain('/sitemap.xml');
  });

  it('a draft save does not touch the sitemap (it cannot change publication)', async () => {
    await info.saveInfoPageDraftAction({ slug: 'privacy', title: 't', body: 'b', seoTitle: null, metaDescription: null });
    expect(paths()).not.toContain('/sitemap.xml');
  });

  it('saving entity SEO (noindex / canonical) revalidates the sitemap', async () => {
    expect((await landing.upsertEntitySeoAction('VENUE', 'v1', { noindex: true })).ok).toBe(true);
    expect(paths()).toContain('/sitemap.xml');
  });
});

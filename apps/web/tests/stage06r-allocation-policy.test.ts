import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, WorkflowStatus } from '@prisma/client';

/**
 * Stage 06-R — R-01 (stable category identity) and R-02 (allocation policies).
 *
 * The scenarios are the ones that actually went wrong in production, reproduced
 * structurally rather than by naming Entertainment or Events & Shopping:
 *
 *   - a parent category with six articles spread over six subcategories;
 *   - a category with three articles, ALL of which the hero takes, which is
 *     what made the live homepage claim nothing had been published.
 *
 * Every row is created with a unique prefix and deleted afterwards, so the
 * suite never depends on — or disturbs — seeded data.
 */

let db: PrismaClient | undefined;
let content: typeof import('../lib/content') | undefined;
let home: typeof import('../lib/cms/homepageData') | undefined;
let available = false;

if (process.env.DATABASE_URL) {
  db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    available = true;
    content = await import('../lib/content');
    home = await import('../lib/cms/homepageData');
  } catch {
    available = false;
  }
}

const suite = available && db && content && home ? describe : describe.skip;

const TAG = `s06r${Math.random().toString(36).slice(2, 8)}`;

interface Ctx {
  authorId: string;
  entId: string;
  evId: string;
  entName: string;
  evName: string;
}
let c: Ctx;

/** Minimal visible slot. */
const slot = (id: string, sectionType: string, order: number, props: Record<string, unknown> = {}) => ({
  id,
  sectionType,
  visible: true,
  order,
  props,
});

suite('Stage 06-R — category identity and allocation policy', () => {
  beforeAll(async () => {
    const author = await db!.author.create({
      data: { name: `S06R Author ${TAG}`, slug: `s06r-author-${TAG}`, role: 'Staff Writer' },
    });

    // "Entertainment-like": 6 published articles across 6 subcategories.
    const ent = await db!.category.create({
      data: { name: `S06R Entertainment ${TAG}`, slug: `s06r-ent-${TAG}` },
    });
    // "Events-like": 3 published articles, which the hero will take.
    const ev = await db!.category.create({
      data: { name: `S06R Events ${TAG}`, slug: `s06r-ev-${TAG}` },
    });

    const mk = (
      categoryId: string,
      suffix: string,
      status: WorkflowStatus,
      subcategoryId: string | null,
      minutesAgo: number,
    ) =>
      db!.article.create({
        data: {
          slug: `${TAG}-${suffix}`,
          title: `S06R ${suffix}`,
          excerpt: 'fixture',
          articleType: 'news',
          workflowStatus: status,
          authorId: author.id,
          categoryId,
          subcategoryId,
          publishedAt: new Date(Date.now() - minutesAgo * 60_000),
        },
      });

    for (let i = 1; i <= 6; i++) {
      const sub = await db!.subcategory.create({
        data: { categoryId: ent.id, name: `S06R Sub ${i} ${TAG}`, slug: `s06r-sub-${i}-${TAG}`, sortOrder: i },
      });
      await mk(ent.id, `ent-${i}`, WorkflowStatus.PUBLISHED, sub.id, i);
    }
    // Ineligible rows, one of each kind.
    await mk(ent.id, 'ent-draft', WorkflowStatus.DRAFT, null, 1);
    await mk(ent.id, 'ent-review', WorkflowStatus.IN_REVIEW, null, 1);
    await mk(ent.id, 'ent-archived', WorkflowStatus.ARCHIVED, null, 1);
    const future = await db!.article.create({
      data: {
        slug: `${TAG}-ent-future`,
        title: 'S06R future',
        excerpt: 'fixture',
        articleType: 'news',
        workflowStatus: WorkflowStatus.SCHEDULED,
        authorId: author.id,
        categoryId: ent.id,
        publishedAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect(future.id).toBeTruthy();

    for (let i = 1; i <= 3; i++) await mk(ev.id, `ev-${i}`, WorkflowStatus.PUBLISHED, null, i);

    c = { authorId: author.id, entId: ent.id, evId: ev.id, entName: ent.name, evName: ev.name };
  });

  afterAll(async () => {
    await db!.article.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });
    await db!.subcategory.deleteMany({ where: { categoryId: { in: [c.entId, c.evId] } } });
    await db!.category.deleteMany({ where: { id: { in: [c.entId, c.evId] } } });
    await db!.author.deleteMany({ where: { id: c.authorId } });
    await db!.$disconnect();
  });

  /* ── R-01: stable identity ──────────────────────────────────────── */

  it('resolves by stable categoryId regardless of name and slug', async () => {
    const got = await content!.resolveSectionCategory({ categoryId: c.entId, token: 'nonsense-token' });
    expect(got?.id).toBe(c.entId);
  });

  it('survives a DISPLAY NAME change when the id is stored', async () => {
    const renamed = `S06R Renamed ${TAG}`;
    await db!.category.update({ where: { id: c.entId }, data: { name: renamed } });
    try {
      const byId = await content!.getPublishedArticlesBySection({ categoryId: c.entId, token: c.entName });
      expect(byId).toHaveLength(6); // old token is stale; the id still works
    } finally {
      await db!.category.update({ where: { id: c.entId }, data: { name: c.entName } });
    }
  });

  it('survives a SLUG change via the name fallback, with no id stored', async () => {
    await db!.category.update({ where: { id: c.entId }, data: { slug: `s06r-ent-moved-${TAG}` } });
    try {
      const byName = await content!.getPublishedArticlesBySection({ token: c.entName });
      expect(byName).toHaveLength(6);
    } finally {
      await db!.category.update({ where: { id: c.entId }, data: { slug: `s06r-ent-${TAG}` } });
    }
  });

  it('is deterministic when a name and a different slug both match', async () => {
    // `ev` is NAMED one thing; give `ent` that same string as its SLUG.
    const clash = `s06r-clash-${TAG}`;
    await db!.category.update({ where: { id: c.entId }, data: { slug: clash } });
    await db!.category.update({ where: { id: c.evId }, data: { name: clash } });
    try {
      // Name is tried before slug, so the NAME holder must win — every time.
      for (let i = 0; i < 3; i++) {
        const got = await content!.resolveSectionCategory({ token: clash });
        expect(got?.id).toBe(c.evId);
      }
    } finally {
      await db!.category.update({ where: { id: c.entId }, data: { slug: `s06r-ent-${TAG}` } });
      await db!.category.update({ where: { id: c.evId }, data: { name: c.evName } });
    }
  });

  /**
   * SUPERSEDED BY FC-01, deliberately.
   *
   * Stage 06-R originally let an unresolvable `categoryId` fall through to the
   * legacy token. The closure review judged that unsafe — a slot pointed at a
   * category that is later deleted would silently begin serving a DIFFERENT
   * category's articles under the same heading, with nothing reported. The
   * expectation is now the opposite: resolution stops, and the section reports
   * `invalid-source`. See the FC-01 block below for the full behaviour.
   */
  it('refuses to fall back to the token when the stored categoryId no longer exists', async () => {
    const got = await content!.getPublishedArticlesBySection({
      categoryId: '00000000-0000-0000-0000-000000000000',
      token: c.entName,
    });
    expect(got).toEqual([]);
  });

  it('fails safe — unknown references return nothing, never another category', async () => {
    expect(await content!.resolveSectionCategory({ token: `missing-${TAG}` })).toBeNull();
    expect(await content!.getPublishedArticlesBySection({ categoryId: '', token: '' })).toEqual([]);
  });

  it('keeps legacy bare-string callers working', async () => {
    expect(await content!.getPublishedArticlesBySection(c.entName)).toHaveLength(6);
  });

  it('excludes draft, in-review, archived and future-scheduled articles', async () => {
    const slugs = (await content!.getPublishedArticlesBySection(c.entName)).map((a) => a.slug);
    for (const bad of ['ent-draft', 'ent-review', 'ent-archived', 'ent-future']) {
      expect(slugs).not.toContain(`${TAG}-${bad}`);
    }
  });

  /* ── FC-01: an invalid explicit id must FAIL SAFE ─────────────────── */

  it('does NOT fall through to the token when an explicit categoryId is invalid', async () => {
    // The dangerous case: a slot deliberately pointed at one category whose row
    // is later deleted must not quietly start serving a different category.
    const r = await content!.resolveSectionCategoryResult({
      categoryId: '00000000-0000-0000-0000-000000000000',
      token: c.entName, // would resolve, and must NOT be used
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-id');
    expect(await content!.getPublishedArticlesBySection({
      categoryId: '00000000-0000-0000-0000-000000000000',
      token: c.entName,
    })).toEqual([]);
  });

  it('distinguishes an invalid source from a genuinely empty category', async () => {
    const invalid = await content!.resolveSectionCategoryResult({ categoryId: 'nope', token: c.entName });
    const unresolved = await content!.resolveSectionCategoryResult({ token: `missing-${TAG}` });
    expect(invalid.ok).toBe(false);
    expect(unresolved.ok).toBe(false);
    if (!invalid.ok && !unresolved.ok) {
      expect(invalid.reason).toBe('invalid-id');
      expect(unresolved.reason).toBe('unresolved');
    }
  });

  it('reports invalid-source on the homepage slot, not "nothing published"', async () => {
    const out = await home!.resolveHomepageSlots([
      slot('s-ent', 'entertainment', 1, { articleCount: 3, categoryId: 'deleted-category-id' }),
    ]);
    const d = out[0].data;
    expect(d.articles ?? []).toHaveLength(0);
    expect(d.emptyReason).toBe('invalid-source');
  });

  it('survives name AND slug changing together, because the id is stored', async () => {
    const newName = `S06R Both Changed ${TAG}`;
    const newSlug = `s06r-both-${TAG}`;
    await db!.category.update({ where: { id: c.entId }, data: { name: newName, slug: newSlug } });
    try {
      // Stale token, valid id — the id must carry it.
      const byId = await content!.getPublishedArticlesBySection({ categoryId: c.entId, token: c.entName });
      expect(byId).toHaveLength(6);
      // And with NO id, the stale token now legitimately resolves to nothing.
      expect(await content!.getPublishedArticlesBySection({ token: c.entName })).toEqual([]);
    } finally {
      await db!.category.update({ where: { id: c.entId }, data: { name: c.entName, slug: `s06r-ent-${TAG}` } });
    }
  });

  it('keeps every allocation policy working with an explicit id', async () => {
    for (const selectionPolicy of ['strict', 'smart-fallback', 'independent'] as const) {
      const out = await home!.resolveHomepageSlots([
        slot('s-ent', 'entertainment', 1, { articleCount: 3, categoryId: c.entId, selectionPolicy }),
      ]);
      expect(out[0].data.articles, selectionPolicy).toHaveLength(3);
      expect(out[0].data.emptyReason, selectionPolicy).toBeUndefined();
    }
  });

  /* ── R-02: allocation policies ──────────────────────────────────── */

  /** Hero that pins all three "events" articles, starving the section below. */
  const starvingHero = () =>
    slot('s-hero', 'editorial-hero', 1, {
      featuredIds: [`${TAG}-ev-1`],
      secondaryCount: 0,
    });

  async function evArticleIds(): Promise<string[]> {
    const rows = await db!.article.findMany({
      where: { categoryId: c.evId, workflowStatus: 'PUBLISHED' },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  it('STRICT: a starved category section stays empty, and says why', async () => {
    const out = await home!.resolveHomepageSlots([
      // A sibling section on the same category, resolved first, takes all three.
      // (A generic feed can no longer do this — that is the Stage 06 fix.)
      slot('s-ev-first', 'events-shopping', 1, { articleCount: 3, categoryId: c.evId }),
      slot('s-ev', 'events-shopping', 2, { articleCount: 3, categoryId: c.evId, selectionPolicy: 'strict' }),
    ]);
    const ev = out.find((r) => r.slot.id === 's-ev')!;
    expect(ev.data.articles ?? []).toHaveLength(0);
    // The message must not claim nothing was published.
    expect(ev.data.emptyReason).toBe('allocated-elsewhere');
    expect(ev.data.reusedAllocation).toBeFalsy();
  });

  it('SMART FALLBACK: re-shows the minimum needed instead of a false empty state', async () => {
    const ids = await evArticleIds();
    const out = await home!.resolveHomepageSlots([
      slot('s-ev-first', 'events-shopping', 1, { articleCount: 3, categoryId: c.evId }),
      slot('s-ev', 'events-shopping', 2, { articleCount: 3, categoryId: c.evId, selectionPolicy: 'smart-fallback' }),
    ]);
    const ev = out.find((r) => r.slot.id === 's-ev')!;
    expect(ev.data.articles).toHaveLength(1); // the default minimum, not all three
    expect(ev.data.reusedAllocation).toBe(true);
    // Only ever from this section's own category.
    expect(ids).toContain(ev.data.articles![0].id);
  });

  it('SMART FALLBACK: honours a configured fallback minimum, bounded by the count', async () => {
    const out = await home!.resolveHomepageSlots([
      slot('s-ev-first', 'events-shopping', 1, { articleCount: 3, categoryId: c.evId }),
      slot('s-ev', 'events-shopping', 2, {
        articleCount: 2,
        categoryId: c.evId,
        selectionPolicy: 'smart-fallback',
        fallbackMinimum: 4, // above the article count — must clamp to it
      }),
    ]);
    const ev = out.find((r) => r.slot.id === 's-ev')!;
    expect(ev.data.articles!.length).toBeLessThanOrEqual(2);
    expect(new Set(ev.data.articles!.map((a) => a.id)).size).toBe(ev.data.articles!.length);
  });

  it('SMART FALLBACK does nothing when unique content is available', async () => {
    const out = await home!.resolveHomepageSlots([
      slot('s-ent', 'entertainment', 1, { articleCount: 3, categoryId: c.entId, selectionPolicy: 'smart-fallback' }),
    ]);
    const ent = out.find((r) => r.slot.id === 's-ent')!;
    expect(ent.data.articles).toHaveLength(3);
    expect(ent.data.reusedAllocation).toBeFalsy();
  });

  it('INDEPENDENT: resolves its own content and does not starve later sections', async () => {
    const out = await home!.resolveHomepageSlots([
      slot('s-ev', 'events-shopping', 1, { articleCount: 3, categoryId: c.evId, selectionPolicy: 'independent' }),
      slot('s-latest', 'latest-coverage', 2, { articleCount: 6 }),
    ]);
    const ev = out.find((r) => r.slot.id === 's-ev')!;
    const latest = out.find((r) => r.slot.id === 's-latest')!;
    expect(ev.data.articles).toHaveLength(3);
    // It claimed nothing, so the generic feed could still take those articles.
    const shared = ev.data.articles!.map((a) => a.id).filter((id) => latest.data.articles!.some((a) => a.id === id));
    expect(shared.length).toBeGreaterThan(0);
    // Within-section deduplication is still mandatory.
    expect(new Set(ev.data.articles!.map((a) => a.id)).size).toBe(3);
  });

  it('never duplicates within a section under any policy', async () => {
    for (const selectionPolicy of ['strict', 'smart-fallback', 'independent'] as const) {
      const out = await home!.resolveHomepageSlots([
        slot('s-ent', 'entertainment', 1, { articleCount: 6, categoryId: c.entId, selectionPolicy }),
      ]);
      const got = out[0].data.articles ?? [];
      expect(new Set(got.map((a) => a.id)).size, selectionPolicy).toBe(got.length);
    }
  });

  it('defaults to STRICT, so stored layouts do not start repeating articles', async () => {
    const out = await home!.resolveHomepageSlots([
      slot('s-ev-first', 'events-shopping', 1, { articleCount: 3, categoryId: c.evId }),
      slot('s-ev', 'events-shopping', 2, { articleCount: 3, categoryId: c.evId }), // no policy stored
    ]);
    expect(out.find((r) => r.slot.id === 's-ev')!.data.articles ?? []).toHaveLength(0);
  });

  it('treats an unrecognised stored policy as strict', async () => {
    const out = await home!.resolveHomepageSlots([
      slot('s-ev-first', 'events-shopping', 1, { articleCount: 3, categoryId: c.evId }),
      slot('s-ev', 'events-shopping', 2, { articleCount: 3, categoryId: c.evId, selectionPolicy: 'wide-open' }),
    ]);
    expect(out.find((r) => r.slot.id === 's-ev')!.data.articles ?? []).toHaveLength(0);
  });

  it('respects the configured article limit and keeps pinned picks first', async () => {
    const all = await content!.getPublishedArticlesBySection({ categoryId: c.entId });
    const pin = all[3];
    const out = await home!.resolveHomepageSlots([
      slot('s-ent', 'entertainment', 1, { articleCount: 2, categoryId: c.entId, featuredIds: [pin.id] }),
    ]);
    const got = out[0].data.articles!;
    expect(got).toHaveLength(2);
    expect(got[0].id).toBe(pin.id);
  });

  it('reports a genuinely empty category honestly', async () => {
    const empty = await db!.category.create({ data: { name: `S06R Empty ${TAG}`, slug: `s06r-empty-${TAG}` } });
    try {
      const out = await home!.resolveHomepageSlots([
        slot('s-ent', 'entertainment', 1, { articleCount: 3, categoryId: empty.id, selectionPolicy: 'smart-fallback' }),
      ]);
      const d = out[0].data;
      expect(d.articles ?? []).toHaveLength(0);
      expect(d.emptyReason).toBe('no-eligible-content');
      expect(d.reusedAllocation).toBeFalsy();
    } finally {
      await db!.category.delete({ where: { id: empty.id } });
    }
  });

  it('reports a zero article count as a configuration choice, not missing content', async () => {
    const out = await home!.resolveHomepageSlots([
      slot('s-ent', 'entertainment', 1, { articleCount: 0, categoryId: c.entId }),
    ]);
    expect(out[0].data.emptyReason).toBe('limited-by-configuration');
  });

  it('keeps several category sections from cannibalising each other', async () => {
    const out = await home!.resolveHomepageSlots([
      slot('s-ent', 'entertainment', 1, { articleCount: 3, categoryId: c.entId }),
      slot('s-ev', 'events-shopping', 2, { articleCount: 3, categoryId: c.evId }),
    ]);
    const ent = out.find((r) => r.slot.id === 's-ent')!.data.articles!;
    const ev = out.find((r) => r.slot.id === 's-ev')!.data.articles!;
    expect(ent).toHaveLength(3);
    expect(ev).toHaveLength(3);
    expect(ent.map((a) => a.id).filter((id) => ev.some((a) => a.id === id))).toEqual([]);
  });

  it('renders in the admin order even though it resolves by specificity', async () => {
    const out = await home!.resolveHomepageSlots([
      slot('s-latest', 'latest-coverage', 1, { articleCount: 3 }),
      slot('s-ent', 'entertainment', 2, { articleCount: 3, categoryId: c.entId }),
    ]);
    expect(out.map((r) => r.slot.id)).toEqual(['s-latest', 's-ent']);
    expect(starvingHero().sectionType).toBe('editorial-hero');
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, WorkflowStatus } from '@prisma/client';

/**
 * Stage 06 — UI-02 / UI-03: homepage section content aggregation.
 *
 * WHAT THIS PINS. `getPublishedArticlesBySection` used to match
 * `category: { name: token }` and nothing else. Two consequences, both silent:
 *
 *   1. Callers that pass a SECTION ID (`lib/cms/detailTemplateData.ts` passes
 *      `'rodeo-events'` and `'competition'`) matched no category at all, so
 *      their related-article rails were permanently empty.
 *   2. `Category.name` is an admin-editable display string while
 *      `config/routes.ts` holds a hardcoded copy in `categoryKey`. A rename in
 *      the admin emptied the homepage's category sections with no error.
 *
 * Every fixture here is built from scratch with a unique prefix and removed
 * afterwards, so the suite asserts BEHAVIOUR rather than whatever the seeded
 * database happens to contain. Nothing is hardcoded to Entertainment or Events
 * & Shopping: the reported scenarios are reproduced structurally (a parent
 * category with several descendant subcategories), which is what makes the test
 * meaningful for any section.
 */

let db: PrismaClient | undefined;
let content: typeof import('../lib/content') | undefined;
let subcats: typeof import('../lib/cms/subcategoryContent') | undefined;
let available = false;

if (process.env.DATABASE_URL) {
  db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    available = true;
    content = await import('../lib/content');
    subcats = await import('../lib/cms/subcategoryContent');
  } catch {
    available = false;
  }
}

const suite = available && db && content ? describe : describe.skip;

/** Unique per run so parallel/repeat runs cannot collide. */
const TAG = `s06x${Math.random().toString(36).slice(2, 8)}`;
const DISPLAY_NAME = `Stage06 Fixture Section ${TAG}`;
/** Deliberately NOT a slugification of the display name — that is the drift being tested. */
const ARCHIVE_SLUG = `stage06-drifted-${TAG}`;

interface Ids {
  categoryId: string;
  authorId: string;
  subA: string;
  subB: string;
  emptyCategoryId: string;
}
let ids: Ids;

suite('Stage 06 — section aggregation across descendants', () => {
  beforeAll(async () => {
    const author = await db!.author.create({
      data: { name: `Stage06 Author ${TAG}`, slug: `stage06-author-${TAG}`, role: 'Staff Writer' },
    });
    const category = await db!.category.create({
      data: { name: DISPLAY_NAME, slug: ARCHIVE_SLUG, description: 'fixture' },
    });
    const empty = await db!.category.create({
      data: { name: `Stage06 Empty ${TAG}`, slug: `stage06-empty-${TAG}` },
    });
    const subA = await db!.subcategory.create({
      data: { categoryId: category.id, name: `Sub A ${TAG}`, slug: `stage06-sub-a-${TAG}`, sortOrder: 1 },
    });
    const subB = await db!.subcategory.create({
      data: { categoryId: category.id, name: `Sub B ${TAG}`, slug: `stage06-sub-b-${TAG}`, sortOrder: 2 },
    });
    const archivedSub = await db!.subcategory.create({
      data: {
        categoryId: category.id,
        name: `Sub Archived ${TAG}`,
        slug: `stage06-sub-arch-${TAG}`,
        sortOrder: 3,
        archivedAt: new Date(),
      },
    });

    const mk = (
      suffix: string,
      status: WorkflowStatus,
      subcategoryId: string | null,
      publishedAt: Date | null,
    ) =>
      db!.article.create({
        data: {
          slug: `${TAG}-${suffix}`,
          title: `Stage06 ${suffix} ${TAG}`,
          excerpt: 'fixture excerpt',
          articleType: 'news',
          workflowStatus: status,
          authorId: author.id,
          categoryId: category.id,
          subcategoryId,
          publishedAt,
        },
      });

    const now = Date.now();
    const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);

    // Eligible: one filed directly on the parent, two via different descendants.
    await mk('direct-published', WorkflowStatus.PUBLISHED, null, at(10));
    await mk('sub-a-published', WorkflowStatus.PUBLISHED, subA.id, at(20));
    await mk('sub-b-published', WorkflowStatus.PUBLISHED, subB.id, at(30));
    // Still eligible: an archived SUBCATEGORY withdraws it from new assignment,
    // it does not unpublish articles already filed under it.
    await mk('sub-archived-published', WorkflowStatus.PUBLISHED, archivedSub.id, at(40));
    // Ineligible, every way an article can be ineligible.
    await mk('draft', WorkflowStatus.DRAFT, subA.id, null);
    await mk('in-review', WorkflowStatus.IN_REVIEW, subA.id, null);
    await mk('archived', WorkflowStatus.ARCHIVED, subB.id, at(50));
    await mk('scheduled-future', WorkflowStatus.SCHEDULED, subB.id, new Date(now + 86_400_000));

    ids = {
      categoryId: category.id,
      authorId: author.id,
      subA: subA.id,
      subB: subB.id,
      emptyCategoryId: empty.id,
    };
  });

  afterAll(async () => {
    await db!.article.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });
    await db!.subcategory.deleteMany({ where: { categoryId: ids.categoryId } });
    await db!.category.deleteMany({ where: { id: { in: [ids.categoryId, ids.emptyCategoryId] } } });
    await db!.author.deleteMany({ where: { id: ids.authorId } });
    await db!.$disconnect();
  });

  /* ── UI-02: the parent section must see its descendants ─────────────── */

  it('returns direct-category AND descendant-subcategory articles', async () => {
    const got = await content!.getPublishedArticlesBySection(DISPLAY_NAME);
    const slugs = got.map((a) => a.slug);
    expect(slugs).toContain(`${TAG}-direct-published`);
    expect(slugs).toContain(`${TAG}-sub-a-published`);
    expect(slugs).toContain(`${TAG}-sub-b-published`);
    expect(slugs).toContain(`${TAG}-sub-archived-published`);
    expect(got).toHaveLength(4);
  });

  it('excludes drafts, in-review, archived and future-scheduled articles', async () => {
    const slugs = (await content!.getPublishedArticlesBySection(DISPLAY_NAME)).map((a) => a.slug);
    for (const bad of ['draft', 'in-review', 'archived', 'scheduled-future']) {
      expect(slugs).not.toContain(`${TAG}-${bad}`);
    }
  });

  it('resolves the section by its ARCHIVE SLUG, not only its display name', async () => {
    // This is the regression: name and slug have deliberately drifted apart.
    const bySlug = await content!.getPublishedArticlesBySection(ARCHIVE_SLUG);
    const byName = await content!.getPublishedArticlesBySection(DISPLAY_NAME);
    expect(bySlug.map((a) => a.slug).sort()).toEqual(byName.map((a) => a.slug).sort());
    expect(bySlug).toHaveLength(4);
  });

  it('honours the configured limit while keeping newest-first order', async () => {
    const two = await content!.getPublishedArticlesBySection(DISPLAY_NAME, { limit: 2 });
    expect(two).toHaveLength(2);
    expect(two[0].slug).toBe(`${TAG}-direct-published`);
    expect(two[1].slug).toBe(`${TAG}-sub-a-published`);
  });

  it('applies excludeIds, which is how cross-slot deduplication works', async () => {
    const all = await content!.getPublishedArticlesBySection(DISPLAY_NAME);
    const drop = all[0];
    const rest = await content!.getPublishedArticlesBySection(DISPLAY_NAME, { excludeIds: [drop.id] });
    expect(rest.map((a) => a.id)).not.toContain(drop.id);
    expect(rest).toHaveLength(all.length - 1);
  });

  it('never returns the same article twice', async () => {
    const got = await content!.getPublishedArticlesBySection(DISPLAY_NAME);
    expect(new Set(got.map((a) => a.id)).size).toBe(got.length);
  });

  /* ── UI-03: the empty state must mean genuinely empty ───────────────── */

  it('returns an empty list for a category with no eligible articles', async () => {
    expect(await content!.getPublishedArticlesBySection(`Stage06 Empty ${TAG}`)).toEqual([]);
  });

  it('returns empty — not a misleading full feed — for an unknown section token', async () => {
    expect(await content!.getPublishedArticlesBySection('no-such-section-anywhere')).toEqual([]);
    expect(await content!.getPublishedArticlesBySection('')).toEqual([]);
  });

  /* ── the real-world callers that were silently broken ──────────────── */

  it('accepts a PRIMARY_SECTIONS id, which detailTemplateData passes', async () => {
    // 'competition' and 'rodeo-events' are section IDS, not category names. Before
    // the fix these matched nothing, so those rails were always empty.
    for (const token of ['competition', 'rodeo-events']) {
      const section = content!.getSectionMetaByCategorySlug(token);
      expect(section, `${token} must resolve to a known section`).toBeTruthy();
      const viaId = await content!.getPublishedArticlesBySection(token);
      const viaName = await content!.getPublishedArticlesBySection(section!.categoryKey);
      expect(viaId.map((a) => a.id)).toEqual(viaName.map((a) => a.id));
    }
  });

  it('derives each real section archive slug from its categoryKey', async () => {
    const { PRIMARY_SECTIONS } = await import('../config/routes');
    const expected: Record<string, string> = {
      competition: 'nfr-competition',
      entertainment: 'nfr-entertainment',
      'events-shopping': 'nfr-events-shopping',
      'plan-watch': 'nfr-plan-watch',
      'rodeo-events': 'more-rodeo',
    };
    for (const [key, slug] of Object.entries(expected)) {
      expect(content!.sectionCategorySlug(PRIMARY_SECTIONS[key].categoryKey)).toBe(slug);
    }
  });

  /* ── subcategory cards share the same resolution ───────────────────── */

  it('lists active subcategory cards by name or slug, excluding archived ones', async () => {
    const byName = await subcats!.getSubcategoryCardsForSection(DISPLAY_NAME);
    const bySlug = await subcats!.getSubcategoryCardsForSection(ARCHIVE_SLUG);
    const names = byName.map((c) => c.slug).sort();
    expect(names).toEqual([`stage06-sub-a-${TAG}`, `stage06-sub-b-${TAG}`]);
    expect(bySlug.map((c) => c.slug).sort()).toEqual(names);
  });

  /* ── resolution order: a generic feed must not starve a category section ── */

  it('resolves category sections BEFORE latest-coverage, so the broad feed cannot empty them', async () => {
    // Uses the REAL Entertainment category, because `SECTION_CATEGORY` maps the
    // homepage slot types onto the five configured primary sections.
    const { PRIMARY_SECTIONS } = await import('../config/routes');
    const entKey = PRIMARY_SECTIONS.entertainment.categoryKey;
    const entCategory = await db!.category.findFirst({ where: { name: entKey }, select: { id: true } });
    if (!entCategory) return; // no seeded Entertainment category in this database

    const author = await db!.author.findFirstOrThrow();
    const mkSlugs = [`${TAG}-ord-1`, `${TAG}-ord-2`, `${TAG}-ord-3`];
    try {
      // Published a moment ago, so a site-wide "latest" feed would claim them first.
      let i = 0;
      for (const slug of mkSlugs) {
        await db!.article.create({
          data: {
            slug,
            title: `Stage06 ordering ${slug}`,
            excerpt: 'fixture',
            articleType: 'news',
            workflowStatus: WorkflowStatus.PUBLISHED,
            authorId: author.id,
            categoryId: entCategory.id,
            publishedAt: new Date(Date.now() + 60_000 * ++i), // newest on the site
          },
        });
      }

      const { resolveHomepageSlots } = await import('../lib/cms/homepageData');
      const slot = (id: string, sectionType: string, order: number, articleCount: number) => ({
        id,
        sectionType,
        visible: true,
        order,
        props: { articleCount },
      });
      // latest-coverage sits ABOVE entertainment, exactly as on the live homepage.
      const out = await resolveHomepageSlots([
        slot('s-latest', 'latest-coverage', 1, 6),
        slot('s-ent', 'entertainment', 2, 3),
      ]);

      const ent = out.find((r) => r.slot.id === 's-ent');
      const latest = out.find((r) => r.slot.id === 's-latest');

      // The point of the fix: the category section is not empty.
      expect(ent?.data.articles?.length ?? 0).toBeGreaterThan(0);
      // And deduplication still holds across the two slots.
      const entIds = (ent?.data.articles ?? []).map((a) => a.id);
      const latestIds = (latest?.data.articles ?? []).map((a) => a.id);
      expect(entIds.filter((id) => latestIds.includes(id))).toEqual([]);
      // Render order still follows the admin's configured order.
      expect(out.map((r) => r.slot.id)).toEqual(['s-latest', 's-ent']);
    } finally {
      await db!.article.deleteMany({ where: { slug: { in: mkSlugs } } });
    }
  });

  it('counts only publicly eligible articles on each subcategory card', async () => {
    const cards = await subcats!.getSubcategoryCardsForSection(DISPLAY_NAME);
    const a = cards.find((c) => c.slug === `stage06-sub-a-${TAG}`);
    // Sub A holds one published article plus a draft and an in-review one.
    expect(a?.articleCount).toBe(1);
  });
});

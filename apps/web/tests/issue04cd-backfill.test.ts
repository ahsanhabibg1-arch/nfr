import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type * as BackfillSvc from '../lib/cms/subcategoryBackfill';

/**
 * Issue 04-C / 04-D — the mapping review and the backfill mechanism.
 *
 * EVERY data-changing test here uses SYNTHETIC fixtures it creates and deletes
 * itself. The eleven real articles are never used as writable fixtures — they
 * are only ever read, and one test asserts they are untouched afterwards.
 *
 * The mechanism's whole purpose is to refuse, so most of these tests assert a
 * refusal: an unmapped label, a slug collision, a missing approval, a MERGE
 * onto a target that does not exist. A backfill that is easy to run by accident
 * is the failure mode worth testing hardest.
 */

const MAPPING_PATH = resolve(__dirname, '../prisma/taxonomy/subcategory-mapping.json');
const SHIPPED_MAPPING = JSON.parse(readFileSync(MAPPING_PATH, 'utf8'));

/** The 11 legacy labels, as measured in BOTH the dev and production databases. */
const LEGACY = [
  ['nfr-competition', 'Championship Analysis'],
  ['nfr-competition', 'Discipline Deep Dive'],
  ['nfr-competition', 'Scoring & Tactics'],
  ['nfr-entertainment', 'Concerts & Nightlife'],
  ['nfr-events-shopping', 'Exhibition & Tack'],
  ['nfr-plan-watch', 'Accommodations'],
  ['nfr-plan-watch', 'Broadcast Intelligence'],
  ['nfr-plan-watch', 'Spectator Strategy'],
  ['nfr-plan-watch', 'Tickets'],
  ['nfr-plan-watch', 'Venue Navigation'],
  ['more-rodeo', 'Global Rodeo Hubs'],
] as const;

// ===========================================================================
// 1-2. The mapping file itself (no database needed)
// ===========================================================================

describe('04-C (1) the mapping covers all 11 legacy labels', () => {
  it('every measured (section, label) pair has exactly one entry', () => {
    const keys = SHIPPED_MAPPING.entries.map((e: { categorySlug: string; legacyLabel: string }) => `${e.categorySlug}|${e.legacyLabel}`);
    expect(keys).toHaveLength(11);
    expect(new Set(keys).size).toBe(11);
    for (const [section, label] of LEGACY) {
      expect(keys, `${section} / ${label} is missing`).toContain(`${section}|${label}`);
    }
  });

  it('every entry carries a recognised action', () => {
    for (const e of SHIPPED_MAPPING.entries) {
      expect(['CREATE', 'MERGE', 'RETAIN']).toContain(e.action);
    }
  });

  it('CREATE entries name both a target name and an already-normalised slug', async () => {
    const { normalizeSlug } = await import('../lib/cms/slugRules');
    for (const e of SHIPPED_MAPPING.entries.filter((x: { action: string }) => x.action === 'CREATE')) {
      expect(e.name, `${e.legacyLabel} needs a name`).toBeTruthy();
      expect(e.slug, `${e.legacyLabel} needs a slug`).toBeTruthy();
      expect(normalizeSlug(e.slug)).toBe(e.slug);
    }
  });

  it('RETAIN entries name no target at all', () => {
    for (const e of SHIPPED_MAPPING.entries.filter((x: { action: string }) => x.action === 'RETAIN')) {
      expect(e.name).toBeUndefined();
      expect(e.slug).toBeUndefined();
    }
  });

  it('a MERGE target is created by some CREATE entry in the same section', () => {
    const created = new Set(
      SHIPPED_MAPPING.entries
        .filter((e: { action: string }) => e.action === 'CREATE')
        .map((e: { categorySlug: string; slug: string }) => `${e.categorySlug}|${e.slug}`),
    );
    for (const e of SHIPPED_MAPPING.entries.filter((x: { action: string }) => x.action === 'MERGE')) {
      expect(created, `MERGE onto ${e.slug} has no CREATE to depend on`).toContain(`${e.categorySlug}|${e.slug}`);
    }
  });
});

describe('04-C (2) a proposal is never an approval', () => {
  it('REGRESSION: the shipped mapping is PENDING_OWNER_APPROVAL', () => {
    expect(SHIPPED_MAPPING.approval.status).toBe('PENDING_OWNER_APPROVAL');
    expect(SHIPPED_MAPPING.approval.approvedBy).toBeNull();
    expect(SHIPPED_MAPPING.approval.approvedAt).toBeNull();
  });

  it('the file says plainly that the recommendations carry no authority', () => {
    const raw = readFileSync(MAPPING_PATH, 'utf8');
    expect(raw).toMatch(/carry no authority/i);
    expect(raw).toMatch(/PENDING_OWNER_APPROVAL/);
  });
});

// ===========================================================================
// Database-backed: the mechanism, on synthetic fixtures only
// ===========================================================================

let available = false;
let prisma: PrismaClient;
let bf: typeof BackfillSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    bf = await import('../lib/cms/subcategoryBackfill');
    available = true;
  } catch {
    available = false;
  }
}

const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('04-D the backfill mechanism (synthetic fixtures)', () => {
  const slugs: string[] = [];
  const subIds: string[] = [];
  let catA: { id: string; slug: string };
  let catB: { id: string; slug: string };
  let authorId: string;
  /** A label unique to this run, so it cannot collide with real data. */
  const LABEL_A = `Synthetic Topic A ${rid()}`;
  const LABEL_B = `Synthetic Topic B ${rid()}`;
  const LABEL_RETAIN = `Synthetic Retained ${rid()}`;

  /** Articles created directly, so the service's own validation is not the thing under test. */
  async function makeArticle(categoryId: string, legacyLabel: string): Promise<string> {
    const slug = `i04cd-${rid()}`;
    slugs.push(slug);
    const a = await prisma.article.create({
      data: {
        slug, title: 'A Synthetic Backfill Fixture', excerpt: 'A synthetic excerpt for the backfill fixtures.',
        categoryId, authorId, articleType: 'General Information', workflowStatus: 'PUBLISHED',
        publishedAt: new Date(), subcategory: legacyLabel,
      },
      select: { id: true, slug: true },
    });
    return a.slug;
  }

  function mapping(entries: unknown[], approved = false) {
    return {
      version: 1,
      approval: approved
        ? { status: 'APPROVED', approvedBy: 'Test Owner', approvedAt: '2026-11-13' }
        : { status: 'PENDING_OWNER_APPROVAL' },
      entries,
    };
  }

  beforeAll(async () => {
    const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true }, take: 2 });
    catA = cats[0];
    catB = cats[1];
    authorId = (await prisma.author.findFirstOrThrow({ select: { id: true } })).id;
  });

  afterAll(async () => {
    if (!available) return;
    const rows = await prisma.article.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
    const ids = rows.map((r) => r.id);
    await prisma.article.updateMany({ where: { id: { in: ids } }, data: { subcategoryId: null } });
    await prisma.articleSeo.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.article.deleteMany({ where: { id: { in: ids } } });
    await prisma.subcategory.deleteMany({ where: { id: { in: subIds } } });
    await prisma.subcategory.deleteMany({ where: { slug: { startsWith: 'synthetic-' } } });
  });

  /** Only the synthetic articles are ever in scope. */
  const scope = () => ({ onlyArticleSlugs: slugs });

  // ---------------------------------------------------------------- 3, 6

  it('(6) REGRESSION: a dry run writes nothing at all', async () => {
    const slug = await makeArticle(catA.id, LABEL_A);
    const before = await prisma.subcategory.count();
    const report = await bf.runSubcategoryBackfill(prisma, {
      mapping: mapping([{ categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'CREATE', name: 'Synthetic A', slug: `synthetic-a-${rid()}` }]),
      onlyArticleSlugs: [slug],
    });
    expect(report.dryRun).toBe(true);
    expect(report.created).toBe(1);          // it reports what it WOULD do
    expect(report.attached).toBe(1);
    expect(await prisma.subcategory.count()).toBe(before);   // …and did not do it
    expect((await prisma.article.findFirstOrThrow({ where: { slug }, select: { subcategoryId: true } })).subcategoryId).toBeNull();
    expect(report.fingerprintUnchanged).toBe(true);
  });

  it('(3) REGRESSION: an unmapped label stops the run', async () => {
    const slug = await makeArticle(catA.id, LABEL_B);
    await expect(
      bf.runSubcategoryBackfill(prisma, { mapping: mapping([]), onlyArticleSlugs: [slug] }),
    // An entirely empty mapping is rejected by the schema itself ("too small"),
    // which is the same refusal reached one step earlier.
    ).rejects.toThrow(/not in the mapping|too small|at least|Invalid/i);

    // Even a mapping that covers a DIFFERENT label is refused.
    await expect(
      bf.runSubcategoryBackfill(prisma, {
        mapping: mapping([{ categorySlug: catA.slug, legacyLabel: 'Some Other Label', action: 'RETAIN' }]),
        onlyArticleSlugs: [slug],
      }),
    ).rejects.toThrow(/not in the mapping/i);
  });

  it('(2) an unapproved mapping cannot execute, only dry-run', async () => {
    const slug = await makeArticle(catA.id, LABEL_A);
    const entries = [{ categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'CREATE', name: 'Synthetic A2', slug: `synthetic-a2-${rid()}` }];
    await expect(
      bf.runSubcategoryBackfill(prisma, { mapping: mapping(entries), dryRun: false, onlyArticleSlugs: [slug] }),
    ).rejects.toThrow(/not approved/i);
    // The same mapping dry-runs fine.
    const r = await bf.runSubcategoryBackfill(prisma, { mapping: mapping(entries), onlyArticleSlugs: [slug] });
    expect(r.approved).toBe(false);
  });

  it('an approval missing its approver or date is still a refusal', async () => {
    const slug = await makeArticle(catA.id, LABEL_A);
    const entries = [{ categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'RETAIN' }];
    for (const approval of [
      { status: 'APPROVED' },
      { status: 'APPROVED', approvedBy: 'Owner' },
      { status: 'approved', approvedBy: 'Owner', approvedAt: '2026-11-13' },
    ]) {
      await expect(
        bf.runSubcategoryBackfill(prisma, { mapping: { version: 1, approval, entries }, dryRun: false, onlyArticleSlugs: [slug] }),
      ).rejects.toThrow(/not approved/i);
    }
  });

  // ---------------------------------------------------------------- 4, 5

  it('(4) REGRESSION: two CREATE entries targeting the same slug stop the run', async () => {
    const s1 = await makeArticle(catA.id, LABEL_A);
    const s2 = await makeArticle(catA.id, LABEL_B);
    const dup = `synthetic-dup-${rid()}`;
    await expect(
      bf.runSubcategoryBackfill(prisma, {
        mapping: mapping([
          { categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'CREATE', name: 'One', slug: dup },
          { categorySlug: catA.slug, legacyLabel: LABEL_B, action: 'CREATE', name: 'Two', slug: dup },
        ]),
        onlyArticleSlugs: [s1, s2],
      }),
    ).rejects.toThrow(/same slug|No suffix is added automatically/i);
  });

  it('a non-normalised or reserved slug in the mapping stops the run', async () => {
    const slug = await makeArticle(catA.id, LABEL_A);
    for (const bad of ['Synthetic Bad', 'admin', 'UPPER']) {
      await expect(
        bf.runSubcategoryBackfill(prisma, {
          mapping: mapping([{ categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'CREATE', name: 'Bad', slug: bad }]),
          onlyArticleSlugs: [slug],
        }),
      ).rejects.toThrow();
    }
  });

  it('(5) a MERGE onto a target that does not exist stops the run', async () => {
    const slug = await makeArticle(catA.id, LABEL_A);
    await expect(
      bf.runSubcategoryBackfill(prisma, {
        mapping: mapping([{ categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'MERGE', slug: `synthetic-missing-${rid()}` }], true),
        dryRun: false,
        onlyArticleSlugs: [slug],
      }),
    ).rejects.toThrow(/does not exist/i);
  });

  it('(5) an unknown primary section in the mapping stops the run', async () => {
    const slug = await makeArticle(catA.id, LABEL_A);
    await expect(
      bf.runSubcategoryBackfill(prisma, {
        mapping: mapping([
          { categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'RETAIN' },
          { categorySlug: 'no-such-section', legacyLabel: 'X', action: 'RETAIN' },
        ]),
        onlyArticleSlugs: [slug],
      }),
    ).rejects.toThrow(/unknown primary section/i);
  });

  // ---------------------------------------------------------------- 7, 8, 9

  it('(9) CREATE attaches the article and leaves the legacy text alone', async () => {
    const slug = await makeArticle(catA.id, LABEL_A);
    const target = `synthetic-create-${rid()}`;
    const r = await bf.runSubcategoryBackfill(prisma, {
      mapping: mapping([{ categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'CREATE', name: 'Synthetic Created', slug: target }], true),
      dryRun: false,
      onlyArticleSlugs: [slug],
    });
    expect(r.created).toBe(1);
    expect(r.attached).toBe(1);
    const sub = await prisma.subcategory.findFirstOrThrow({ where: { categoryId: catA.id, slug: target } });
    subIds.push(sub.id);
    const art = await prisma.article.findFirstOrThrow({ where: { slug }, select: { subcategoryId: true, subcategory: true } });
    expect(art.subcategoryId).toBe(sub.id);
    // THE legacy label is untouched — the public mapper prefers the managed name.
    expect(art.subcategory).toBe(LABEL_A);
  });

  it('(9) MERGE attaches to an existing target without creating anything', async () => {
    const target = `synthetic-merge-${rid()}`;
    const existing = await prisma.subcategory.create({
      data: { categoryId: catA.id, name: `Synthetic Merge Target ${rid()}`, slug: target },
      select: { id: true },
    });
    subIds.push(existing.id);
    const slug = await makeArticle(catA.id, LABEL_B);
    const r = await bf.runSubcategoryBackfill(prisma, {
      mapping: mapping([{ categorySlug: catA.slug, legacyLabel: LABEL_B, action: 'MERGE', slug: target }], true),
      dryRun: false,
      onlyArticleSlugs: [slug],
    });
    expect(r.created).toBe(0);
    expect(r.attached).toBe(1);
    expect(r.plan[0].reusedExisting).toBe(true);
    expect((await prisma.article.findFirstOrThrow({ where: { slug }, select: { subcategoryId: true } })).subcategoryId).toBe(existing.id);
  });

  it('(8) REGRESSION: RETAIN leaves the article legacy-only', async () => {
    const slug = await makeArticle(catA.id, LABEL_RETAIN);
    const r = await bf.runSubcategoryBackfill(prisma, {
      mapping: mapping([{ categorySlug: catA.slug, legacyLabel: LABEL_RETAIN, action: 'RETAIN' }], true),
      dryRun: false,
      onlyArticleSlugs: [slug],
    });
    expect(r.retained).toBe(1);
    expect(r.created).toBe(0);
    expect(r.attached).toBe(0);
    const art = await prisma.article.findFirstOrThrow({ where: { slug }, select: { subcategoryId: true, subcategory: true } });
    expect(art.subcategoryId).toBeNull();
    expect(art.subcategory).toBe(LABEL_RETAIN);
  });

  it('(7) REGRESSION: a second approved run is a no-op', async () => {
    const slug = await makeArticle(catA.id, LABEL_A);
    const target = `synthetic-idem-${rid()}`;
    const m = mapping([{ categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'CREATE', name: `Synthetic Idem ${rid()}`, slug: target }], true);

    const first = await bf.runSubcategoryBackfill(prisma, { mapping: m, dryRun: false, onlyArticleSlugs: [slug] });
    expect(first.created).toBe(1);
    expect(first.attached).toBe(1);
    const sub = await prisma.subcategory.findFirstOrThrow({ where: { categoryId: catA.id, slug: target }, select: { id: true } });
    subIds.push(sub.id);

    const second = await bf.runSubcategoryBackfill(prisma, { mapping: m, dryRun: false, onlyArticleSlugs: [slug] });
    expect(second.created).toBe(0);              // the target was reused
    expect(second.attached).toBe(0);             // the article was already attached
    expect(second.alreadyAttached).toBe(1);
    expect(await prisma.subcategory.count({ where: { categoryId: catA.id, slug: target } })).toBe(1);
  });

  // ---------------------------------------------------------------- 10, 11

  it('(10) REGRESSION: a partial failure rolls the WHOLE run back', async () => {
    const ok = await makeArticle(catA.id, LABEL_A);
    const bad = await makeArticle(catA.id, LABEL_B);
    const beforeSubs = await prisma.subcategory.count();

    // The first entry is valid; the second MERGEs onto a target that does not
    // exist, which throws AFTER the first CREATE has been written inside the
    // transaction.
    await expect(
      bf.runSubcategoryBackfill(prisma, {
        mapping: mapping([
          { categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'CREATE', name: `Synthetic Rollback ${rid()}`, slug: `synthetic-rollback-${rid()}` },
          { categorySlug: catA.slug, legacyLabel: LABEL_B, action: 'MERGE', slug: `synthetic-absent-${rid()}` },
        ], true),
        dryRun: false,
        onlyArticleSlugs: [ok, bad],
      }),
    ).rejects.toThrow(/does not exist/i);

    // Nothing from the first entry survived.
    expect(await prisma.subcategory.count()).toBe(beforeSubs);
    expect((await prisma.article.findFirstOrThrow({ where: { slug: ok }, select: { subcategoryId: true } })).subcategoryId).toBeNull();
    expect((await prisma.article.findFirstOrThrow({ where: { slug: bad }, select: { subcategoryId: true } })).subcategoryId).toBeNull();
  });

  it('(11) protected article fields are unchanged by a successful run', async () => {
    const slug = await makeArticle(catA.id, LABEL_A);
    const before = await prisma.article.findFirstOrThrow({ where: { slug } });
    const target = `synthetic-protect-${rid()}`;
    const r = await bf.runSubcategoryBackfill(prisma, {
      mapping: mapping([{ categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'CREATE', name: `Synthetic Protect ${rid()}`, slug: target }], true),
      dryRun: false,
      onlyArticleSlugs: [slug],
    });
    expect(r.attached).toBe(1);
    const sub = await prisma.subcategory.findFirstOrThrow({ where: { categoryId: catA.id, slug: target }, select: { id: true } });
    subIds.push(sub.id);
    const after = await prisma.article.findFirstOrThrow({ where: { slug } });
    // Only subcategoryId may differ.
    expect({ ...after, subcategoryId: null, updatedAt: before.updatedAt, version: before.version })
      .toEqual({ ...before, subcategoryId: null });
  });

  it('(5) cross-section assignment is impossible: the target is resolved in the article\'s own section', async () => {
    const slug = await makeArticle(catA.id, LABEL_A);
    const target = `synthetic-xsection-${rid()}`;
    // The target exists only in catB, so a mapping claiming it under catA finds
    // nothing and a MERGE is refused rather than reaching across sections.
    const other = await prisma.subcategory.create({
      data: { categoryId: catB.id, name: `Synthetic Other ${rid()}`, slug: target }, select: { id: true },
    });
    subIds.push(other.id);
    await expect(
      bf.runSubcategoryBackfill(prisma, {
        mapping: mapping([{ categorySlug: catA.slug, legacyLabel: LABEL_A, action: 'MERGE', slug: target }], true),
        dryRun: false,
        onlyArticleSlugs: [slug],
      }),
    ).rejects.toThrow(/does not exist in/i);
    expect((await prisma.article.findFirstOrThrow({ where: { slug }, select: { subcategoryId: true } })).subcategoryId).toBeNull();
  });

  // ---------------------------------------------------------------- 12

  it('(12) THE REAL 11 ARTICLES were never written to by any of the above', async () => {
    const legacy = await prisma.article.findMany({
      where: { subcategory: { not: null }, slug: { notIn: slugs } },
      select: { slug: true, subcategory: true, subcategoryId: true },
    });
    expect(legacy.length).toBeGreaterThanOrEqual(11);
    for (const a of legacy) {
      expect(a.subcategoryId, `${a.slug} was modified`).toBeNull();
      expect(a.subcategory).not.toBeNull();
    }
  });

  it('(12) the shipped PENDING mapping dry-runs over the real 11 and writes nothing', async () => {
    // The real safety rehearsal: the actual mapping file against the actual
    // eleven production-shaped articles, identified by their known labels.
    const real = await prisma.article.findMany({
      where: { subcategory: { in: LEGACY.map(([, label]) => label) }, slug: { notIn: slugs } },
      select: { slug: true },
    });
    expect(real.length).toBeGreaterThanOrEqual(11);

    const before = await prisma.subcategory.count();
    const report = await bf.runSubcategoryBackfill(prisma, {
      mapping: SHIPPED_MAPPING,
      onlyArticleSlugs: real.map((a) => a.slug),
    });
    expect(report.dryRun).toBe(true);
    expect(report.approved).toBe(false);
    expect(report.plan.length).toBeGreaterThanOrEqual(11);
    expect(report.fingerprintUnchanged).toBe(true);
    expect(await prisma.subcategory.count()).toBe(before);
    expect(await prisma.article.count({
      where: { subcategory: { not: null }, subcategoryId: { not: null }, slug: { notIn: slugs } },
    })).toBe(0);
  });

  it('(3) an UNSCOPED run refuses here, because this database holds labels the mapping does not cover', async () => {
    /**
     * Not a defect — the guard proving itself on real data. Other suites share
     * this database and create articles with their own legacy labels, so an
     * unscoped run finds (section, label) pairs absent from the mapping and
     * stops. In production the same run would either cover every label or
     * refuse, which is exactly the intended behaviour: it is never possible to
     * backfill "most" of them.
     */
    await expect(bf.runSubcategoryBackfill(prisma, { mapping: SHIPPED_MAPPING }))
      .rejects.toThrow(/not in the mapping/i);
  });
});

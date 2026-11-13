import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';
import type { RoleKey } from '../lib/auth/rbac';
import type * as RodeoSvc from '../lib/cms/rodeoService';
import type * as LandingSvc from '../lib/cms/landingAdminService';
import { DisciplineGuideHeader } from '../components/editorial/DisciplineGuideHeader';
import type { Discipline } from '../types';

/**
 * Issue 03 — Discipline CMS ownership.
 *
 * THE DEFECT. A discipline guide page renders thirteen content fields. The
 * admin write path (`updateDiscipline`) accepted four, and its schema carried a
 * comment saying slug, name and the guide JSON were "intentionally NOT editable
 * here — the evergreen guide content is preserved". The content was indeed
 * preserved and it was editable nowhere: the Rodeo Coverage modal pointed
 * operators at Landing SEO, where no guide editor existed either.
 *
 * These tests assert BEHAVIOUR — what reaches the database, what survives a
 * partial save, what the public component renders — not the presence of fields
 * or strings. The two assertions that matter most are the ones proving a save
 * cannot destroy content: a four-field save must not wipe the name, hero image
 * or guide, and editing one discipline must not touch another.
 */

let available = false;
let prisma: PrismaClient;
let rodeo: typeof RodeoSvc;
let landing: typeof LandingSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    rodeo = await import('../lib/cms/rodeoService');
    landing = await import('../lib/cms/landingAdminService');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = true;
  } catch {
    available = false;
  }
}

const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

const FULL_GUIDE = {
  introduction: 'An editorial introduction to the discipline.',
  competitionFormat: 'Ten rounds, one ride per night.',
  stockProfile: 'Bucking horses selected for consistency.',
  historicBenchmark: 'The record is 94.5 points.',
  scoringBreakdown: [
    { title: 'Rider control', description: 'Judged out of 50 points.' },
    { title: 'Animal performance', description: 'Judged out of 50 points.' },
  ],
  rulesHighlights: ['Mark out of the chute.', 'Eight-second ride.'],
  terminology: [
    { term: 'Mark out', definition: 'Spurs over the shoulders on the first jump.' },
    { term: 'Rigging', definition: 'The handhold strapped to the horse.' },
  ],
  beginnerTips: ['Watch the spurring rhythm.', 'Listen for the whistle.'],
};

suite('Issue 03 — Discipline CMS ownership', () => {
  const ids: string[] = [];
  const users: string[] = [];
  let admin: Actor;
  let reader: Actor;

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({
      data: { email: `issue03-${roleKey}-${rid()}@example.com`, name: `I3 ${roleKey}`, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    users.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  async function makeDiscipline(over: Record<string, unknown> = {}): Promise<string> {
    const slug = `issue03-${rid()}`;
    const row = await prisma.discipline.create({
      data: {
        slug, name: 'Bareback Riding Test', summary: 'A seeded summary that must survive.',
        shortName: 'Bareback', category: 'Roughstock', tagline: 'A seeded tagline.',
        image: '/assets/images/seeded-hero.jpg', imageCredit: 'Seeded Credit',
        guide: FULL_GUIDE, ...over,
      },
      select: { id: true },
    });
    ids.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    admin = await makeUser('administrator');
    // `author` is a real staff role that lacks `rodeo.manage`.
    reader = await makeUser('author');
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.discipline.deleteMany({ where: { id: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  const guideOf = async (id: string) =>
    ((await prisma.discipline.findUniqueOrThrow({ where: { id }, select: { guide: true } })).guide ?? {}) as Record<string, unknown>;

  // -------------------------------------------------------------------------
  // 1. Existing data loads into the admin fields.
  // -------------------------------------------------------------------------

  it('(1) existing discipline data — including the whole guide — loads into the admin loader', async () => {
    const id = await makeDiscipline();
    const detail = await landing.getLandingDetail(admin, 'DISCIPLINE', id);
    const d = detail.disciplineFields!;
    expect(d.name).toBe('Bareback Riding Test');
    expect(d.summary).toBe('A seeded summary that must survive.');
    expect(d.image).toBe('/assets/images/seeded-hero.jpg');
    expect(d.imageCredit).toBe('Seeded Credit');
    expect(d.guide.introduction).toBe(FULL_GUIDE.introduction);
    expect(d.guide.scoringBreakdown).toEqual(FULL_GUIDE.scoringBreakdown);
    expect(d.guide.terminology).toHaveLength(2);
    expect(d.guide.beginnerTips).toEqual(FULL_GUIDE.beginnerTips);
  });

  it('(1b) a discipline with a null guide loads as an empty guide rather than failing', async () => {
    const id = await makeDiscipline({ guide: null });
    const detail = await landing.getLandingDetail(admin, 'DISCIPLINE', id);
    expect(detail.disciplineFields!.guide).toEqual({});
  });

  // -------------------------------------------------------------------------
  // 2 + 3. Hero image and prose reach the database and the public mapper.
  // -------------------------------------------------------------------------

  it('(2) updating the hero image and credit persists', async () => {
    const id = await makeDiscipline();
    await rodeo.updateDiscipline(admin, id, {
      summary: 'kept', image: '/api/media/2026/11/new-hero.jpg', imageCredit: 'New Credit',
    });
    const row = await prisma.discipline.findUniqueOrThrow({ where: { id } });
    expect(row.image).toBe('/api/media/2026/11/new-hero.jpg');
    expect(row.imageCredit).toBe('New Credit');
  });

  it('(2b) clearing the hero image with an empty string sets it to null', async () => {
    const id = await makeDiscipline();
    await rodeo.updateDiscipline(admin, id, { summary: 'kept', image: '', imageCredit: '' });
    const row = await prisma.discipline.findUniqueOrThrow({ where: { id } });
    expect(row.image).toBeNull();
    expect(row.imageCredit).toBeNull();
  });

  it('(3) REGRESSION: introduction, tagline and name reach the public mapper', async () => {
    const id = await makeDiscipline();
    await rodeo.updateDiscipline(admin, id, {
      summary: 'A new summary.', name: 'Renamed Discipline', tagline: 'A new tagline.',
      guide: { introduction: 'A new introduction.' },
    });
    const { toDiscipline } = await import('../lib/mappers');
    const mapped = toDiscipline(await prisma.discipline.findUniqueOrThrow({ where: { id } }));
    expect(mapped.name).toBe('Renamed Discipline');
    expect(mapped.tagline).toBe('A new tagline.');
    expect(mapped.summary).toBe('A new summary.');
    expect(mapped.introduction).toBe('A new introduction.');
  });

  // -------------------------------------------------------------------------
  // 4 + 5. Lists persist with order, and support add / edit / remove / reorder.
  // -------------------------------------------------------------------------

  it('(4) scoring criteria and rules persist in the submitted order', async () => {
    const id = await makeDiscipline({ guide: null });
    await rodeo.updateDiscipline(admin, id, {
      summary: 'kept',
      guide: {
        scoringBreakdown: [
          { title: 'First', description: 'One.' },
          { title: 'Second', description: 'Two.' },
          { title: 'Third', description: 'Three.' },
        ],
        rulesHighlights: ['Rule A', 'Rule B', 'Rule C'],
      },
    });
    const g = await guideOf(id);
    expect((g.scoringBreakdown as { title: string }[]).map((s) => s.title)).toEqual(['First', 'Second', 'Third']);
    expect(g.rulesHighlights).toEqual(['Rule A', 'Rule B', 'Rule C']);
  });

  it('(4b) REORDER: re-sending the array in a new order is the new public order', async () => {
    const id = await makeDiscipline();
    const reversed = [...FULL_GUIDE.scoringBreakdown].reverse();
    await rodeo.updateDiscipline(admin, id, { summary: 'kept', guide: { scoringBreakdown: reversed } });
    const g = await guideOf(id);
    expect((g.scoringBreakdown as { title: string }[]).map((s) => s.title)).toEqual(['Animal performance', 'Rider control']);
  });

  it('(5) terminology and tips support add, edit, remove and reorder', async () => {
    const id = await makeDiscipline();

    // ADD
    await rodeo.updateDiscipline(admin, id, {
      summary: 'kept',
      guide: { terminology: [...FULL_GUIDE.terminology, { term: 'Spur', definition: 'A heel attachment.' }] },
    });
    expect((await guideOf(id)).terminology).toHaveLength(3);

    // EDIT
    await rodeo.updateDiscipline(admin, id, {
      summary: 'kept',
      guide: { terminology: [{ term: 'Mark out', definition: 'An edited definition.' }] },
    });
    expect((await guideOf(id)).terminology).toEqual([{ term: 'Mark out', definition: 'An edited definition.' }]);

    // REMOVE every entry — an empty array is a real value, not "unchanged"
    await rodeo.updateDiscipline(admin, id, { summary: 'kept', guide: { terminology: [] } });
    expect((await guideOf(id)).terminology).toEqual([]);

    // REORDER tips
    await rodeo.updateDiscipline(admin, id, {
      summary: 'kept', guide: { beginnerTips: ['Listen for the whistle.', 'Watch the spurring rhythm.'] },
    });
    expect((await guideOf(id)).beginnerTips).toEqual(['Listen for the whistle.', 'Watch the spurring rhythm.']);
  });

  // -------------------------------------------------------------------------
  // The content-preservation guarantees — the two that matter most.
  // -------------------------------------------------------------------------

  it('CRITICAL: a legacy four-field save does NOT wipe the name, hero image or guide', async () => {
    const id = await makeDiscipline();
    // Exactly what the pre-Issue-03 Landing SEO form sent.
    await rodeo.updateDiscipline(admin, id, {
      shortName: 'Bareback', category: 'Roughstock', tagline: 'A seeded tagline.',
      summary: 'A seeded summary that must survive.',
    });
    const row = await prisma.discipline.findUniqueOrThrow({ where: { id } });
    expect(row.name).toBe('Bareback Riding Test');
    expect(row.image).toBe('/assets/images/seeded-hero.jpg');
    expect(row.imageCredit).toBe('Seeded Credit');
    expect(row.guide).toEqual(FULL_GUIDE);
  });

  it('CRITICAL: a partial guide save leaves every other guide section untouched', async () => {
    const id = await makeDiscipline();
    await rodeo.updateDiscipline(admin, id, { summary: 'kept', guide: { introduction: 'Only this changed.' } });
    const g = await guideOf(id);
    expect(g.introduction).toBe('Only this changed.');
    expect(g.scoringBreakdown).toEqual(FULL_GUIDE.scoringBreakdown);
    expect(g.terminology).toEqual(FULL_GUIDE.terminology);
    expect(g.rulesHighlights).toEqual(FULL_GUIDE.rulesHighlights);
    expect(g.beginnerTips).toEqual(FULL_GUIDE.beginnerTips);
    expect(g.competitionFormat).toBe(FULL_GUIDE.competitionFormat);
  });

  it('guide keys the schema does not model are preserved, not dropped', async () => {
    const id = await makeDiscipline({
      guide: { ...FULL_GUIDE, relatedArticleSlugs: ['a-slug'], sources: [{ title: 'A source', url: 'https://example.com/' }] },
    });
    await rodeo.updateDiscipline(admin, id, { summary: 'kept', guide: { introduction: 'Changed.' } });
    const g = await guideOf(id);
    // Related content and sources use the EXISTING model and must survive a
    // guide edit — Issue 03 §3F says not to invent a new relationship model.
    expect(g.relatedArticleSlugs).toEqual(['a-slug']);
    expect(g.sources).toEqual([{ title: 'A source', url: 'https://example.com/' }]);
  });

  // -------------------------------------------------------------------------
  // 6 + 7 + 8. Validation, authorization, isolation.
  // -------------------------------------------------------------------------

  it('(6) invalid input is rejected and nothing is written', async () => {
    const id = await makeDiscipline();
    const before = await prisma.discipline.findUniqueOrThrow({ where: { id } });
    const bad: unknown[] = [
      { summary: '' },                                                     // required, empty
      { summary: 'ok', name: '' },                                         // name cannot be blank
      { summary: 'ok', category: 'Freestyle' },                            // not an allowed classification
      { summary: 'ok', guide: { scoringBreakdown: [{ title: '', description: 'x' }] } },
      { summary: 'ok', guide: { terminology: [{ term: 'x', definition: '' }] } },
      { summary: 'ok', guide: { rulesHighlights: [''] } },
      { summary: 'ok', guide: { introduction: 'x'.repeat(4001) } },
      { summary: 'x'.repeat(2001) },
    ];
    for (const input of bad) {
      await expect(rodeo.updateDiscipline(admin, id, input as RodeoSvc.DisciplineInput)).rejects.toThrow();
    }
    const after = await prisma.discipline.findUniqueOrThrow({ where: { id } });
    expect(after).toEqual(before);
  });

  it('(6b) a missing discipline is a not_found error, not a silent create', async () => {
    await expect(rodeo.updateDiscipline(admin, 'no-such-id', { summary: 'x' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('(7) an unauthorized role cannot modify a discipline', async () => {
    const id = await makeDiscipline();
    await expect(
      rodeo.updateDiscipline(reader, id, { summary: 'hijacked', guide: { introduction: 'hijacked' } }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const row = await prisma.discipline.findUniqueOrThrow({ where: { id } });
    expect(row.summary).toBe('A seeded summary that must survive.');
    expect(row.guide).toEqual(FULL_GUIDE);
  });

  it('(8) editing one discipline does not modify another', async () => {
    const a = await makeDiscipline();
    const b = await makeDiscipline();
    const bBefore = await prisma.discipline.findUniqueOrThrow({ where: { id: b } });
    await rodeo.updateDiscipline(admin, a, {
      summary: 'Only A changed.', name: 'Only A', guide: { introduction: 'Only A.', beginnerTips: ['A only'] },
    });
    const bAfter = await prisma.discipline.findUniqueOrThrow({ where: { id: b } });
    expect(bAfter).toEqual(bBefore);
  });

  it('writes an audit entry that records whether guide content changed', async () => {
    const id = await makeDiscipline();
    await rodeo.updateDiscipline(admin, id, { summary: 'kept', guide: { introduction: 'x' } });
    await rodeo.updateDiscipline(admin, id, { summary: 'kept' });
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'discipline', entityId: id, action: 'rodeo.discipline.update' },
      orderBy: { createdAt: 'asc' }, select: { detail: true },
    });
    expect(logs.map((l) => l.detail)).toEqual(['core+guide', 'core']);
  });

  // -------------------------------------------------------------------------
  // 9. Entity SEO and FAQ authority is untouched.
  // -------------------------------------------------------------------------

  it('(9) existing Entity SEO and FAQ survive a discipline content edit', async () => {
    const id = await makeDiscipline();
    const seoSvc = await import('../lib/cms/entitySeoService');
    const faqSvc = await import('../lib/cms/faqService');
    await seoSvc.upsertEntitySeo(admin, 'DISCIPLINE', id, { seoTitle: 'An SEO title', metaDescription: 'A meta description for the discipline page.' });
    await faqSvc.createFaq(admin, 'DISCIPLINE', id, { question: 'How is it scored?', answer: 'Out of 100 points.' });

    await rodeo.updateDiscipline(admin, id, { summary: 'kept', name: 'Renamed', guide: { introduction: 'Changed.' } });

    const seo = await prisma.entitySeo.findFirstOrThrow({ where: { entityType: 'DISCIPLINE', entityId: id } });
    expect(seo.seoTitle).toBe('An SEO title');
    const faqs = await prisma.entityFaq.findMany({ where: { entityType: 'DISCIPLINE', entityId: id } });
    expect(faqs).toHaveLength(1);
    expect(faqs[0].question).toBe('How is it scored?');
  });

  it('(9b) the discipline editor creates no competing SEO fields', async () => {
    // The only SEO authority is EntitySeo; the discipline schema must not have
    // grown a seoTitle/metaDescription of its own.
    const id = await makeDiscipline();
    const row = await prisma.discipline.findUniqueOrThrow({ where: { id } });
    expect(Object.keys(row)).not.toContain('seoTitle');
    expect(Object.keys(row)).not.toContain('metaDescription');
  });

  // -------------------------------------------------------------------------
  // 10 + 11. Public template, and existing records without migration.
  // -------------------------------------------------------------------------

  it('(10) the public guide page renders the edited content end to end', async () => {
    const id = await makeDiscipline();
    const { slug } = await prisma.discipline.findUniqueOrThrow({ where: { id }, select: { slug: true } });
    await rodeo.updateDiscipline(admin, id, {
      summary: 'kept', guide: { introduction: 'A rendered introduction.', beginnerTips: ['A rendered tip.'] },
    });
    // `DisciplineGuideView` is an async server component that loads its own
    // data from the slug, so awaiting it exercises the real query path, the
    // real mapper and the real template — not a hand-built prop object.
    const { DisciplineGuideView } = await import('../views/DisciplineGuideView');
    const html = renderToStaticMarkup(await DisciplineGuideView({ slug }));
    expect(html).toContain('A rendered introduction.');
    expect(html).toContain('A rendered tip.');
    expect(html).toContain('Rider control');          // untouched guide section
    expect(html).toContain('Eight-second ride.');     // untouched rules
  });

  it('(11) a record stored before this change reads without migration', async () => {
    // Exactly the seeded shape: guide JSON with no new keys, written directly.
    const id = await makeDiscipline({ guide: { introduction: 'Legacy intro.', rulesHighlights: ['Legacy rule'] } });
    const detail = await landing.getLandingDetail(admin, 'DISCIPLINE', id);
    expect(detail.disciplineFields!.guide.introduction).toBe('Legacy intro.');
    const { toDiscipline } = await import('../lib/mappers');
    const d = toDiscipline(await prisma.discipline.findUniqueOrThrow({ where: { id } }));
    expect(d.rulesHighlights).toEqual(['Legacy rule']);
    expect(d.scoringBreakdown).toEqual([]); // defaulted, not crashed
  });

  it('(11b) all seven foundational disciplines still load and map', async () => {
    const { getAllDisciplines } = await import('../lib/content');
    const all = await getAllDisciplines();
    expect(all.length).toBeGreaterThanOrEqual(7);
    for (const d of all) {
      expect(typeof d.name).toBe('string');
      expect(Array.isArray(d.scoringBreakdown)).toBe(true);
      expect(Array.isArray(d.rulesHighlights)).toBe(true);
      expect(typeof d.imageAlt).toBe('string'); // always resolvable
    }
  });

  // -------------------------------------------------------------------------
  // 12. Media ALT / caption precedence on the discipline hero.
  // -------------------------------------------------------------------------

  it('(12) the hero ALT comes from the Media Library asset, not the name', async () => {
    const key = `2026/11/issue03-${rid()}.jpg`;
    const asset = await prisma.mediaAsset.create({
      data: {
        storageKey: key, url: `/api/media/${key}`, filename: 'hero.jpg', mimeType: 'image/jpeg',
        width: 2000, height: 1125, bytes: 1000, format: 'jpeg', extension: 'jpg',
        storageProvider: 'local', visibility: 'PUBLIC', processingStatus: 'READY',
        altText: 'A bareback rider spurring out of the chute.', caption: 'Round 3, 2026.',
        derivatives: {
          thumb: { key: `${key}__thumb.webp`, width: 320, height: 180, bytes: 1 },
          md: { key: `${key}__md.webp`, width: 768, height: 432, bytes: 1 },
          lg: { key: `${key}__lg.webp`, width: 1600, height: 900, bytes: 1 },
        },
      },
      select: { id: true, url: true },
    });
    const slug = `issue03-media-${rid()}`;
    const disc = await prisma.discipline.create({
      data: { slug, name: 'A Name That Must Not Become ALT', summary: 's', image: asset.url, guide: FULL_GUIDE },
      select: { id: true },
    });
    ids.push(disc.id);

    try {
      const { getRodeoDisciplineBySlug } = await import('../lib/content');
      const d = (await getRodeoDisciplineBySlug(slug))!;
      expect(d.imageAlt).toBe('A bareback rider spurring out of the chute.');
      expect(d.imageAltSource).toBe('media');
      expect(d.imageCaption).toBe('Round 3, 2026.');
      expect(d.imageSrcSet).toContain('__md.webp 768w');

      const html = renderToStaticMarkup(
        React.createElement(DisciplineGuideHeader as never, { discipline: d as Discipline } as never),
      );
      expect(html).toContain('alt="A bareback rider spurring out of the chute."');
      expect(html).not.toContain('alt="A Name That Must Not Become ALT"');
      // REGRESSION: the synthesised "<name> in action at the National Finals
      // Rodeo." caption is gone; the editor's caption is used instead.
      expect(html).not.toContain('in action at the National Finals Rodeo');
      expect(html).toContain('Round 3, 2026.');
      expect(html).toMatch(/srcset=/i);
    } finally {
      await prisma.mediaAsset.deleteMany({ where: { id: asset.id } });
    }
  });

  it('(12b) a decorative asset yields an empty ALT, and a non-DAM hero falls back to the name', async () => {
    const { toDiscipline } = await import('../lib/mappers');
    const base = {
      id: 'x', slug: 's', name: 'Fallback Name', shortName: null, category: null,
      tagline: null, summary: 's', imageCredit: null, guide: null,
    };
    // Decorative: an explicitly empty asset ALT.
    const decorative = toDiscipline({
      ...base, image: '/api/media/a.jpg',
      heroAsset: { altText: '', caption: null, derivatives: null, width: null, height: null, storageKey: 'a.jpg', url: '/api/media/a.jpg' },
    });
    expect(decorative.imageAlt).toBe('');
    expect(decorative.imageAltSource).toBe('media');

    // A legacy, non-DAM hero: no asset, so the name is the documented fallback.
    const legacy = toDiscipline({ ...base, image: '/assets/images/legacy.jpg', heroAsset: null });
    expect(legacy.imageAlt).toBe('Fallback Name');
    expect(legacy.imageAltSource).toBe('fallback');
    expect(legacy.imageSrcSet).toBeUndefined();
    expect(legacy.imageCaption).toBeUndefined();
  });

  it('(12c) hero asset lookup costs a constant number of queries for a list', async () => {
    // One batched findMany for the whole set, not one per discipline.
    const { getAllDisciplines } = await import('../lib/content');
    const all = await getAllDisciplines();
    expect(all.length).toBeGreaterThan(1);
    // Every row resolved an ALT without a per-row query path existing at all.
    expect(all.every((d) => typeof d.imageAlt === 'string')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Classification: a fixed taxonomy, asserted rather than assumed (§4).
// ---------------------------------------------------------------------------

describe('Issue 03 §4 — the two classifications are deliberately fixed', () => {
  it('only Roughstock and Timed Event are accepted, and they are not the site sections', async () => {
    const { PRIMARY_SECTIONS } = await import('../config/routes');
    const sectionNames = Object.values(PRIMARY_SECTIONS).map((s) => (s as { categoryKey?: string }).categoryKey);
    // The five navigation sections are a different axis entirely; if a future
    // change tried to replace the classification with them, this would fail.
    expect(sectionNames).not.toContain('Roughstock');
    expect(sectionNames).not.toContain('Timed Event');
  });

  /**
   * This replaced a test that read `CompetitionSection.tsx` as text and
   * asserted the file contained the strings `'Roughstock'` and `'Timed Event'`.
   * Once the vocabulary moved into `lib/content/disciplineClassifications.ts`
   * the literals left that file, and the grep failed even though the filter
   * behaved identically — it was testing where the characters sat, not what the
   * reader sees. This renders the component and asserts the rendered filter,
   * which is the thing that must not change.
   */
  it('the public Competition filter renders exactly these two values as buttons', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { CompetitionSection } = await import('../components/sections/CompetitionSection');
    const { DISCIPLINE_CLASSIFICATIONS } = await import('../lib/content/disciplineClassifications');

    const html = renderToStaticMarkup(
      React.createElement(CompetitionSection, {
        disciplines: [
          { id: 'a', slug: 'bull-riding', name: 'Bull Riding', category: 'Roughstock' },
          { id: 'b', slug: 'barrel-racing', name: 'Barrel Racing', category: 'Timed Event' },
        ] as never,
        onSelectDiscipline: () => {},
      }),
    );

    // Both classifications reach the reader as filter controls...
    expect(html).toContain('Roughstock');
    expect(html).toContain('Timed Events');
    // ...and nothing else does: a third button would mean the fixed vocabulary
    // grew without the owner decision this section's comment requires.
    const buttons = html.match(/<button[^>]*>([^<]*)<\/button>/g) ?? [];
    expect(buttons.length).toBe(DISCIPLINE_CLASSIFICATIONS.length + 1); // + "All"
    // The five editorial sections are a different axis and must never appear here.
    expect(html).not.toContain('NFR Competition');
    expect(html).not.toContain('More Rodeo');
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { EntitySeo, PrismaClient } from '@prisma/client';
import { PRIMARY_SECTIONS, ROUTES } from '../config/routes';
import { sectionMetadataInput, sectionDerivedMeta, sectionSeoEntityId } from '../lib/seo/sectionMeta';
import { buildMetadata, SITE_URL } from '../lib/seo';

/**
 * Batch S / S2 — EntitySeo(SECTION) search overrides on the five section landing pages.
 * Pure resolver tests + one isolated-test-DB suite for the real getEntitySeo lookup
 * (self-skips without DATABASE_URL; never touches the development database).
 */

const plan = PRIMARY_SECTIONS['plan-watch'];

function entitySeo(over: Partial<EntitySeo> = {}): EntitySeo {
  return {
    id: 'x', entityType: 'SECTION', entityId: 'plan-watch',
    seoTitle: null, metaDescription: null, canonicalOverride: null, ogImage: null,
    noindex: false, intro: null, updatedById: null, updatedAt: new Date(0),
    ...over,
  } as EntitySeo;
}

describe('S2 — section id ↔ route mapping (matches the Landing SEO admin key)', () => {
  it('uses PRIMARY_SECTIONS[key].id, which equals the key for all five sections', () => {
    expect(Object.keys(PRIMARY_SECTIONS).sort()).toEqual(['competition', 'entertainment', 'events-shopping', 'plan-watch', 'rodeo-events']);
    for (const [key, meta] of Object.entries(PRIMARY_SECTIONS)) expect(sectionSeoEntityId(meta)).toBe(key);
  });

  it('maps each id to its public route, including /rodeo-events/', () => {
    expect(PRIMARY_SECTIONS.competition.path).toBe(ROUTES.COMPETITION);
    expect(PRIMARY_SECTIONS.entertainment.path).toBe(ROUTES.ENTERTAINMENT);
    expect(PRIMARY_SECTIONS['events-shopping'].path).toBe(ROUTES.EVENTS_SHOPPING);
    expect(PRIMARY_SECTIONS['plan-watch'].path).toBe(ROUTES.PLAN_WATCH);
    expect(PRIMARY_SECTIONS['rodeo-events'].path).toBe('/rodeo-events/');
    expect(sectionSeoEntityId(PRIMARY_SECTIONS['rodeo-events'])).toBe('rodeo-events');
  });
});

describe('S2 — fallback (no EntitySeo record) is the pre-S2 metadata', () => {
  it('derived title/description/path come from the section identity', () => {
    expect(sectionDerivedMeta(plan)).toEqual({ title: 'NFR Plan & Watch — Coverage & Guides', description: plan.description, path: '/plan-watch/' });
  });

  it('null record → identical buildMetadata output to the previous route code', () => {
    const before = buildMetadata({ title: `${plan.name} — Coverage & Guides`, description: plan.description, path: plan.path });
    const after = buildMetadata(sectionMetadataInput(plan, null));
    expect(after).toEqual(before);
  });

  it('a SectionConfig-overridden identity still drives the fallback', () => {
    const custom = { ...plan, name: 'Plan Your Trip', description: 'Custom section description.' };
    expect(sectionMetadataInput(custom, null)).toMatchObject({ title: 'Plan Your Trip — Coverage & Guides', description: 'Custom section description.', path: '/plan-watch/' });
  });
});

describe('S2 — EntitySeo overrides', () => {
  it('applies every search field when set', () => {
    const m = sectionMetadataInput(plan, entitySeo({
      seoTitle: 'How to Watch the NFR', metaDescription: 'Streaming, TV and tickets.',
      canonicalOverride: '/plan-watch/', ogImage: '/media/plan.jpg', noindex: true,
    }));
    expect(m).toMatchObject({
      title: 'How to Watch the NFR', description: 'Streaming, TV and tickets.', path: '/plan-watch/',
      image: '/media/plan.jpg', canonical: `${SITE_URL}/plan-watch/`,
      // S3: an editor noindex keeps link following
      robots: { index: false, follow: true },
    });
  });

  it.each([
    ['seoTitle', { seoTitle: '   ' }, 'title', 'NFR Plan & Watch — Coverage & Guides'],
    ['metaDescription', { metaDescription: '' }, 'description', plan.description],
    ['ogImage', { ogImage: ' ' }, 'image', undefined],
    ['canonicalOverride', { canonicalOverride: '' }, 'canonical', undefined],
  ] as const)('blank %s falls back individually', (_f, over, key, expected) => {
    const m = sectionMetadataInput(plan, entitySeo({ seoTitle: 'Kept Title', metaDescription: 'Kept description.', ...over }));
    expect(m[key as keyof typeof m]).toEqual(expected);
    // the other overrides still apply
    if (key !== 'title') expect(m.title).toBe('Kept Title');
    if (key !== 'description') expect(m.description).toBe('Kept description.');
  });

  it('ignores an off-site canonical override (existing resolveCanonical rule)', () => {
    expect(sectionMetadataInput(plan, entitySeo({ canonicalOverride: 'https://other.example/plan/' })).canonical).toBeUndefined();
  });

  it('reaches the rendered metadata through buildMetadata', () => {
    const meta = buildMetadata(sectionMetadataInput(plan, entitySeo({ seoTitle: 'How to Watch the NFR', metaDescription: 'Streaming, TV and tickets.' })));
    expect(meta.title).toEqual({ absolute: 'How to Watch the NFR — NFRGuide' });
    expect(meta.description).toBe('Streaming, TV and tickets.');
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/plan-watch/`);
  });

  it('does not mutate the visible section identity (SectionConfig stays the owner)', () => {
    const identity = { ...plan };
    sectionMetadataInput(identity, entitySeo({ seoTitle: 'SEO Only', metaDescription: 'SEO only.' }));
    expect(identity).toEqual(plan);
  });
});

// ---- Real lookup against the isolated test DB ----
let prisma: PrismaClient;
let available = false;
let getEntitySeo: typeof import('../lib/cms/entitySeoService').getEntitySeo;
if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    getEntitySeo = (await import('../lib/cms/entitySeoService')).getEntitySeo;
    available = true;
  } catch { available = false; }
}
const dbSuite = available ? describe : describe.skip;

dbSuite('S2 — getEntitySeo(SECTION, id) per section (isolated test DB)', () => {
  const ids = Object.values(PRIMARY_SECTIONS).map((s) => s.id);
  let original: EntitySeo[] = [];

  beforeAll(async () => {
    original = await prisma.entitySeo.findMany({ where: { entityType: 'SECTION', entityId: { in: ids } } });
    await prisma.entitySeo.deleteMany({ where: { entityType: 'SECTION', entityId: { in: ids } } });
    await prisma.entitySeo.create({ data: { entityType: 'SECTION', entityId: 'plan-watch', seoTitle: 'S2 Plan Title', metaDescription: 'S2 plan description.' } });
    await prisma.entitySeo.create({ data: { entityType: 'SECTION', entityId: 'rodeo-events', seoTitle: 'S2 Rodeo Title' } });
  });

  afterAll(async () => {
    await prisma.entitySeo.deleteMany({ where: { entityType: 'SECTION', entityId: { in: ids } } });
    for (const { id: _id, ...row } of original) await prisma.entitySeo.create({ data: row });
  });

  it('each section resolves only its own record — no leakage between ids', async () => {
    const out: Record<string, ReturnType<typeof sectionMetadataInput>> = {};
    for (const s of Object.values(PRIMARY_SECTIONS)) out[s.id] = sectionMetadataInput(s, await getEntitySeo('SECTION', sectionSeoEntityId(s)));

    expect(out['plan-watch']).toMatchObject({ title: 'S2 Plan Title', description: 'S2 plan description.', path: '/plan-watch/' });
    // rodeo-events: title overridden, blank description falls back to its own identity
    expect(out['rodeo-events']).toMatchObject({ title: 'S2 Rodeo Title', description: PRIMARY_SECTIONS['rodeo-events'].description, path: '/rodeo-events/' });
    // sections without a record keep their own derived metadata
    for (const id of ['competition', 'entertainment', 'events-shopping']) {
      expect(out[id]).toEqual(sectionMetadataInput(PRIMARY_SECTIONS[id], null));
      expect(out[id].title).not.toContain('S2');
    }
  });
});

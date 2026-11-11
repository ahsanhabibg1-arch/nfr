import { describe, it, expect, vi, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

/**
 * Stage 07 Task F — the competitor and venue directory templates.
 *
 * WHAT IS PROVEN HERE:
 *
 *   1. All four directory block types render and are canvas-selectable.
 *   2. The required-block contradiction is gone: `directory-grid` is still
 *      `required: true`, and now that is TRUE rather than a trap.
 *   3. Search, filters, pagination, entity links and the empty state all still
 *      work — proven from rendered HTML, not from a substring in a route file.
 *   4. Listing data comes from the authoritative query; no competitor or venue
 *      record is storable in layout JSON.
 *   5. The default layout, and therefore both live pages, are unchanged.
 *   6. `columns` — declared and ignored for three stages — now has an effect,
 *      and an out-of-range stored value is clamped.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const {
  DIRECTORY_SECTIONS, buildDefaultSlots, getAvailableBlockTypes, getKnownSectionTypes,
  resolveMaxInstances, defaultSlotId,
} = await import('../lib/cms/sectionRegistry');
const { blockRegistry } = await import('../components/blocks/registry');
const { PageRenderer } = await import('../components/blocks/PageRenderer');
const { classifyBlockSupport } = await import('../lib/cms/pageCapability');

const DIRECTORY_KEYS = ['directory:competitors', 'directory:venues'] as const;

function slot(sectionType: string, order: number, props: Record<string, unknown> = {}): SectionSlot {
  return { id: `s07f-${sectionType}-${order}`, sectionType, visible: true, order, props };
}

function renderSlots(slots: { slot: SectionSlot; data: Record<string, unknown> }[], editorMode?: boolean): string {
  return renderToStaticMarkup(React.createElement(PageRenderer, { slots, editorMode }));
}

function renderBlock(sectionType: string, props: Record<string, unknown>, data: Record<string, unknown>): string {
  return renderSlots([{ slot: slot(sectionType, 0, props), data }]);
}

/** A representative listing payload, shaped as the routes build it. */
function listing(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    items: [
      { slug: 'stetson-wright', href: '/competitors/stetson-wright/', title: 'Stetson Wright', subtitle: 'The Kid', meta: 'Milford, UT', tags: 'Bull Riding · Saddle Bronc', badge: 'active' },
      { slug: 'sage-kimzey', href: '/competitors/sage-kimzey/', title: 'Sage Kimzey', meta: 'Strong City, OK', tags: 'Bull Riding' },
    ],
    total: 2,
    page: 1,
    totalPages: 1,
    entityLabel: 'competitor',
    entityLabelPlural: 'competitors',
    query: '',
    searchPlaceholder: 'Competitor name…',
    filterName: 'discipline',
    filterLabel: 'Discipline',
    filterAllLabel: 'All disciplines',
    filterValue: '',
    filterOptions: [{ value: 'bull-riding', label: 'Bull Riding' }],
    basePath: '/competitors/',
    resetHref: '/competitors/',
    prevHref: null,
    nextHref: null,
    ...over,
  };
}

/* ── 1. Every directory block renders and is selectable ───────────── */

describe('Stage 07 Task F — all four directory blocks render', () => {
  for (const type of ['directory-hero', 'directory-grid', 'directory-cta', 'rich-text-block']) {
    it(`${type} has a renderer`, () => {
      expect(typeof blockRegistry[type], type).toBe('function');
    });

    it(`${type} is classified canvas-editable, so the Admin badge is honest`, () => {
      expect(classifyBlockSupport(type, true), type).toBe('canvas');
    });

    it(`${type} gets a selectable container in the Builder canvas`, () => {
      const html = renderSlots([{ slot: slot(type, 0, { title: 'x' }), data: { heroTitle: 'x', ...listing() } }], true);
      expect(html).toContain(`data-slot-id="s07f-${type}-0"`);
    });
  }

  it('no directory block is left unsupported', () => {
    for (const type of getKnownSectionTypes('directory').keys()) {
      expect(classifyBlockSupport(type, true), type).not.toBe('unsupported');
    }
  });
});

/* ── 2. The required-block contradiction ──────────────────────────── */

describe('Stage 07 Task F — the required-block contradiction is resolved', () => {
  it('directory-grid is still required', () => {
    const def = getKnownSectionTypes('directory').get('directory-grid')!;
    expect(def.required).toBe(true);
  });

  it('...and now actually renders, which is what makes `required` truthful', () => {
    const html = renderBlock('directory-grid', { columns: 3 }, listing());
    expect(html).not.toBe('');
    expect(html).toContain('Stetson Wright');
  });

  it('directory-grid declares that its content is system-owned', () => {
    // The Builder owns WHERE the listing sits. It does not own what it lists,
    // and the Admin says so rather than inviting a hunt for a control.
    const def = getKnownSectionTypes('directory').get('directory-grid')!;
    expect(def.systemContent).toBe(true);
  });

  it('a directory layout containing the required listing is still savable', () => {
    // The hazard the Stage 06 handover named: deleting the type would have made
    // a stored directory layout unsavable. The type is still known.
    expect(getKnownSectionTypes('directory').has('directory-grid')).toBe(true);
    expect(getAvailableBlockTypes('directory').map((d) => d.type)).toContain('directory-grid');
  });
});

/* ── 3. Search, filters, pagination, links, empty state ───────────── */

describe('Stage 07 Task F — directory functionality is preserved in real HTML', () => {
  it('renders a no-JavaScript GET search form with the current query echoed back', () => {
    const html = renderBlock('directory-grid', {}, listing({ query: 'wright' }));
    expect(html).toContain('method="get"');
    expect(html).toContain('name="q"');
    expect(html).toContain('value="wright"');
    expect(html).toContain('Competitor name');
  });

  it('renders the filter select with its options and current value', () => {
    const html = renderBlock('directory-grid', {}, listing({ filterValue: 'bull-riding' }));
    expect(html).toContain('name="discipline"');
    expect(html).toContain('All disciplines');
    expect(html).toContain('Bull Riding');
    expect(html).toContain('value="bull-riding" selected');
  });

  it('omits the filter entirely when the directory has no options', () => {
    // The venue route only shows a country filter when countries exist.
    const html = renderBlock('directory-grid', {}, listing({ filterOptions: [], filterName: 'country' }));
    expect(html).not.toContain('name="country"');
    expect(html).toContain('name="q"');
  });

  it('renders every entry as a real crawlable link to its record', () => {
    const html = renderBlock('directory-grid', {}, listing());
    expect(html).toContain('href="/competitors/stetson-wright');
    expect(html).toContain('href="/competitors/sage-kimzey');
    expect(html).toContain('Stetson Wright');
    expect(html).toContain('Milford, UT');
    expect(html).toContain('Bull Riding · Saddle Bronc');
    expect(html).toContain('The Kid');
    expect(html).toContain('active');
  });

  it('renders the result count, singular and plural', () => {
    expect(renderBlock('directory-grid', {}, listing({ total: 2 }))).toContain('2 competitors');
    expect(renderBlock('directory-grid', {}, listing({ total: 1 }))).toContain('1 competitor');
  });

  it('describes a filtered result set in the count line', () => {
    const html = renderBlock('directory-grid', {}, listing({ query: 'wright', filterValue: 'bull-riding' }));
    // React HTML-escapes the quotation marks around the echoed query.
    expect(html).toContain('matching &quot;wright&quot;');
    expect(html).toContain('in Bull Riding');
  });

  it('renders an empty state instead of an empty grid', () => {
    const html = renderBlock('directory-grid', {}, listing({ items: [], total: 0 }));
    expect(html).toContain('No competitors match your search yet.');
    expect(html).not.toContain('<ul');
  });

  it('renders pagination with the hrefs the route supplied', () => {
    const html = renderBlock('directory-grid', {}, listing({
      page: 2, totalPages: 5, prevHref: '/competitors/?page=1', nextHref: '/competitors/?page=3',
    }));
    expect(html).toContain('aria-label="Pagination"');
    expect(html).toContain('Page 2 of 5');
    expect(html).toContain('page=1');
    expect(html).toContain('page=3');
  });

  it('omits pagination on a single page, and the Previous link on page one', () => {
    expect(renderBlock('directory-grid', {}, listing({ totalPages: 1 }))).not.toContain('Pagination');
    const first = renderBlock('directory-grid', {}, listing({ page: 1, totalPages: 3, nextHref: '/c/?page=2' }));
    expect(first).not.toContain('Previous');
    expect(first).toContain('Next');
  });

  it('offers Reset only when a query or filter is active', () => {
    expect(renderBlock('directory-grid', {}, listing())).not.toContain('Reset');
    expect(renderBlock('directory-grid', {}, listing({ query: 'x' }))).toContain('Reset');
  });

  it('labels both form controls, so the search form is usable by keyboard and screen reader', () => {
    const html = renderBlock('directory-grid', {}, listing());
    expect(html).toContain('for="directory-q"');
    expect(html).toContain('id="directory-q"');
    expect(html).toContain('for="directory-filter"');
    expect(html).toContain('id="directory-filter"');
    expect(html).toContain('type="submit"');
  });
});

/* ── 4. `columns`: declared for three stages, now consumed ────────── */

describe('Stage 07 Task F — the columns property finally has an effect', () => {
  it('changes the rendered grid class', () => {
    const two = renderBlock('directory-grid', { columns: 2 }, listing());
    const four = renderBlock('directory-grid', { columns: 4 }, listing());
    expect(two).toContain('sm:grid-cols-2');
    expect(two).not.toContain('lg:grid-cols-4');
    expect(four).toContain('lg:grid-cols-4');
  });

  it('clamps an out-of-range stored value instead of emitting an undefined class', () => {
    for (const stored of [0, -3, 99, 'nonsense']) {
      const html = renderBlock('directory-grid', { columns: stored }, listing());
      expect(html, `columns=${stored}`).toMatch(/grid-cols-1/);
      expect(html, `columns=${stored}`).not.toContain('grid-cols-undefined');
      expect(html, `columns=${stored}`).not.toContain('grid-cols-99');
    }
  });

  it('defaults to three columns when unset, as the routes rendered before', () => {
    const html = renderBlock('directory-grid', {}, listing());
    expect(html).toContain('lg:grid-cols-3');
  });
});

/* ── 5. The hero: one h1, image consumed ──────────────────────────── */

describe('Stage 07 Task F — the directory hero', () => {
  it('renders exactly one h1', () => {
    const html = renderBlock('directory-hero', { kicker: 'Directory' }, { heroTitle: 'Rodeo Competitors' });
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).toContain('Rodeo Competitors');
  });

  it('renders the hero image, which was resolved and dropped before Stage 07', () => {
    const html = renderBlock('directory-hero', {}, { heroTitle: 'Venues', heroImageUrl: '/media/arena.jpg' });
    expect(html).toContain('/media/arena.jpg');
  });

  it('renders an editable kicker, defaulting to the string the routes hardcoded', () => {
    expect(renderBlock('directory-hero', {}, { heroTitle: 'T' })).toContain('Directory');
    expect(renderBlock('directory-hero', { kicker: 'Our People' }, { heroTitle: 'T' })).toContain('Our People');
  });

  it('renders nothing rather than a blank heading when no title is available', () => {
    expect(renderBlock('directory-hero', {}, {})).toBe('');
  });

  it('a full directory page has exactly one h1 across all its blocks', () => {
    const html = renderSlots([
      { slot: slot('directory-hero', 0, { kicker: 'Directory' }), data: { heroTitle: 'Rodeo Competitors' } },
      { slot: slot('rich-text-block', 1, { title: 'About this list', body: 'Copy.' }), data: {} },
      { slot: slot('directory-grid', 2, { columns: 3 }), data: listing() },
      { slot: slot('directory-cta', 3), data: { ctaText: 'Browse venues', ctaUrl: '/venues/' } },
    ]);
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).toContain('About this list');
    expect(html).toContain('Browse venues');
  });
});

/* ── 6. Composition: order is the Builder's ───────────────────────── */

describe('Stage 07 Task F — the Builder genuinely controls directory composition', () => {
  it('moving the CTA above the listing moves it in the HTML', () => {
    const below = renderSlots([
      { slot: slot('directory-grid', 0, {}), data: listing() },
      { slot: slot('directory-cta', 1), data: { ctaText: 'MY CTA', ctaUrl: '/' } },
    ]);
    const above = renderSlots([
      { slot: slot('directory-grid', 1, {}), data: listing() },
      { slot: slot('directory-cta', 0), data: { ctaText: 'MY CTA', ctaUrl: '/' } },
    ]);
    expect(below.indexOf('MY CTA')).toBeGreaterThan(below.indexOf('Stetson Wright'));
    expect(above.indexOf('MY CTA')).toBeLessThan(above.indexOf('Stetson Wright'));
  });

  it('a rich-text block can be placed above or below the listing', () => {
    const html = renderSlots([
      { slot: slot('rich-text-block', 0, { title: 'INTRO COPY' }), data: {} },
      { slot: slot('directory-grid', 1, {}), data: listing() },
    ]);
    expect(html.indexOf('INTRO COPY')).toBeLessThan(html.indexOf('Stetson Wright'));
  });

  it('hiding the CTA removes it from the public page', () => {
    const hidden = { ...slot('directory-cta', 0), visible: false };
    expect(renderSlots([{ slot: hidden, data: { ctaText: 'GONE', ctaUrl: '/' } }])).toBe('');
  });
});

/* ── 7. No live page changed ──────────────────────────────────────── */

describe('Stage 07 Task F — the two live directory pages are unchanged', () => {
  it('the default directory layout is exactly the three blocks it always was', () => {
    expect(buildDefaultSlots('directory').map((s) => s.sectionType)).toEqual([
      'directory-hero', 'directory-grid', 'directory-cta',
    ]);
  });

  it('rich-text-block is library-only on directories', () => {
    const def = DIRECTORY_SECTIONS.find((d) => d.type === 'rich-text-block')!;
    expect(def.excludeFromDefaultsIn ?? []).toContain('directory');
    expect(resolveMaxInstances(def, 'directory')).toBe(2);
  });

  it('default slot ids are unchanged, so canvas selection keeps working', () => {
    for (const s of buildDefaultSlots('directory')) {
      expect(s.id).toBe(defaultSlotId('directory', s.sectionType));
    }
  });
});

/* ── 8. CMS ownership ─────────────────────────────────────────────── */

describe('Stage 07 Task F — directory records stay in the database', () => {
  const ENTITY_FIELDS = ['slug', 'fullName', 'knownAs', 'hometown', 'capacity', 'nickname', 'items', 'name'];

  it('no directory block declares an entity field as an editable prop', () => {
    const offenders: string[] = [];
    for (const def of DIRECTORY_SECTIONS) {
      for (const p of def.editableProps) {
        if (ENTITY_FIELDS.includes(p.key)) offenders.push(`${def.type}.${p.key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the listing block declares only a layout option, never content', () => {
    const def = getKnownSectionTypes('directory').get('directory-grid')!;
    expect(def.editableProps.map((p) => p.key)).toEqual(['columns']);
    expect(def.editableProps[0].tab).toBe('layout');
  });

  it('entries come from the data channel, not from slot props', () => {
    // Proof that a competitor cannot be smuggled into layout JSON: props bearing
    // entity-shaped keys produce no entries at all.
    const html = renderBlock(
      'directory-grid',
      { items: [{ slug: 'fake', title: 'INJECTED VIA PROPS', href: '/x/' }] },
      listing({ items: [] }),
    );
    expect(html).not.toContain('INJECTED VIA PROPS');
    expect(html).toContain('No competitors match');
  });
});

/* ── 9. DB-backed: the resolver emits what the registry allows ─────── */

let available = false;
let prisma: PrismaClient;
let resolveDirectorySlots: typeof import('../lib/cms/directoryData').resolveDirectorySlots;
const createdKeys: string[] = [];

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.pageLayout.findFirst();
    ({ resolveDirectorySlots } = await import('../lib/cms/directoryData'));
    available = true;
  } catch {
    available = false;
  }
}

afterAll(async () => {
  if (!available) return;
  for (const key of createdKeys) await prisma.pageLayout.deleteMany({ where: { pageKey: key } });
});

async function store(pageKey: string, published: SectionSlot[], draft: SectionSlot[] = []): Promise<void> {
  await prisma.pageLayout.upsert({
    where: { pageKey },
    create: { pageKey, publishedSections: published as unknown as object, draftSections: draft as unknown as object },
    update: { publishedSections: published as unknown as object, draftSections: draft as unknown as object },
  });
  if (!createdKeys.includes(pageKey)) createdKeys.push(pageKey);
}

describe.runIf(available)('Stage 07 Task F — the resolver no longer drops saved blocks', () => {
  for (const key of DIRECTORY_KEYS) {
    it(`${key} emits every saved, visible, recognised block`, async () => {
      await store(key, [
        slot('directory-hero', 0, { title: 'Stored heading' }),
        slot('rich-text-block', 1, { title: 'Stored intro' }),
        slot('directory-grid', 2, { columns: 2 }),
        slot('directory-cta', 3, { ctaText: 'Stored CTA', ctaUrl: '/' }),
      ]);

      const out = await resolveDirectorySlots(key, {
        listing: { ...listing(), defaultHeroTitle: 'Fallback', defaultHeroDescription: 'Fallback desc' } as never,
      });
      const types = out.map((r) => r.slot.sectionType);

      // Before Stage 07 this emitted only the hero and the CTA.
      expect(types).toEqual(['directory-hero', 'rich-text-block', 'directory-grid', 'directory-cta']);

      const html = renderSlots(out as never[]);
      expect(html).toContain('Stored heading');
      expect(html).toContain('Stored intro');
      expect(html).toContain('Stored CTA');
      expect(html).toContain('Stetson Wright');
    });
  }

  it('applies the route default when the operator left the heading empty', async () => {
    await store('directory:venues', [slot('directory-hero', 0, { title: '', description: '' })]);
    const out = await resolveDirectorySlots('directory:venues', {
      listing: { ...listing(), defaultHeroTitle: 'Rodeo Venues', defaultHeroDescription: 'Arenas we cover.' } as never,
    });
    expect(out[0].data.heroTitle).toBe('Rodeo Venues');
    expect(out[0].data.heroDescription).toBe('Arenas we cover.');
  });

  it('prefers the operator heading over the route default', async () => {
    await store('directory:venues', [slot('directory-hero', 0, { title: 'Arenas & Grounds' })]);
    const out = await resolveDirectorySlots('directory:venues', {
      listing: { ...listing(), defaultHeroTitle: 'Rodeo Venues', defaultHeroDescription: 'd' } as never,
    });
    expect(out[0].data.heroTitle).toBe('Arenas & Grounds');
  });

  it('keeps draft and published directory layouts isolated', async () => {
    await store(
      'directory:competitors',
      [slot('directory-hero', 0, { title: 'PUBLISHED HEADING' })],
      [slot('directory-hero', 0, { title: 'DRAFT HEADING' })],
    );
    const pub = await resolveDirectorySlots('directory:competitors', {
      listing: { ...listing(), defaultHeroTitle: 'd', defaultHeroDescription: 'd' } as never,
    });
    const draft = await resolveDirectorySlots('directory:competitors', {
      draft: true,
      listing: { ...listing(), defaultHeroTitle: 'd', defaultHeroDescription: 'd' } as never,
    });
    expect(pub[0].data.heroTitle).toBe('PUBLISHED HEADING');
    expect(draft[0].data.heroTitle).toBe('DRAFT HEADING');
  });

  it('emits an unrecognised legacy slot so the operator can see and remove it', async () => {
    await store('directory:venues', [
      slot('directory-hero', 0, { title: 'Venues' }),
      slot('some-removed-legacy-type', 1),
    ]);
    const out = await resolveDirectorySlots('directory:venues', {
      listing: { ...listing(), defaultHeroTitle: 'd', defaultHeroDescription: 'd' } as never,
    });
    expect(out.map((r) => r.slot.sectionType)).toContain('some-removed-legacy-type');
    // Public: nothing. Canvas: a removable notice.
    expect(renderSlots(out as never[])).not.toContain('some-removed-legacy-type');
    expect(renderSlots(out as never[], true)).toContain('does not render on the live site');
  });
});

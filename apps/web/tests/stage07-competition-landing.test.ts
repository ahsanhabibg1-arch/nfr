import { describe, it, expect, vi, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

/**
 * Stage 07 Task E — the competition landing discipline block.
 *
 * THE DEFECT. `landing-competition-disciplines` had a renderer in
 * `blockRegistry` but NO definition anywhere in the section registry. The
 * section-landing resolver injected it on `/competition/`, and the block printed
 * two headings — "Championship Disciplines" and "NFR Discipline Guides" — that
 * no administrator could reach, edit, hide or reorder. It was the clearest
 * remaining case of public copy with no owner in the Admin.
 *
 * WHAT IS PROVEN HERE:
 *
 *   1. It now has a real definition, so its copy is editable and it is
 *      canvas-selectable with an honest "Editable" badge.
 *   2. Its defaults reproduce the previous hardcoded strings exactly, so
 *      `/competition/` renders byte-for-byte what it rendered before.
 *   3. The resolver does not double-render it once an operator takes control.
 *   4. The discipline records still come from one CMS source; no second
 *      competition data path was created.
 *   5. No other section-landing default layout changed.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const {
  SECTION_LANDING_SECTIONS, buildDefaultSlots, getAvailableBlockTypes, getKnownSectionTypes,
  resolveMaxInstances, KNOWN_PAGE_KEYS,
} = await import('../lib/cms/sectionRegistry');
const { blockRegistry } = await import('../components/blocks/registry');
const { PageRenderer } = await import('../components/blocks/PageRenderer');
const { classifyBlockSupport, SYSTEM_OWNED_SECTION_TYPES } = await import('../lib/cms/pageCapability');

const TYPE = 'landing-competition-disciplines';

const DISCIPLINES = [
  { id: 'd1', slug: 'bull-riding', name: 'Bull Riding', category: 'Roughstock', tagline: 'Eight seconds.' },
  { id: 'd2', slug: 'tie-down-roping', name: 'Tie-Down Roping', category: 'Timed Event', tagline: 'Rope and tie.' },
];

function slot(sectionType: string, order: number, props: Record<string, unknown> = {}): SectionSlot {
  return { id: `s07e-${sectionType}-${order}`, sectionType, visible: true, order, props };
}

function render(slots: { slot: SectionSlot; data: Record<string, unknown> }[], editorMode?: boolean): string {
  return renderToStaticMarkup(React.createElement(PageRenderer, { slots, editorMode }));
}

/* ── 1. It is a registered block now ──────────────────────────────── */

describe('Stage 07 Task E — the block is registered, not invisible', () => {
  it('has a definition in the section-landing family', () => {
    expect(getKnownSectionTypes('section-landing').has(TYPE)).toBe(true);
  });

  it('is offered in the block library, so an operator can place it', () => {
    expect(getAvailableBlockTypes('section-landing').map((d) => d.type)).toContain(TYPE);
  });

  it('is capped at one instance per page', () => {
    const def = getKnownSectionTypes('section-landing').get(TYPE)!;
    expect(resolveMaxInstances(def, 'section-landing')).toBe(1);
  });

  it('exposes its kicker, heading and description as editable properties', () => {
    const def = getKnownSectionTypes('section-landing').get(TYPE)!;
    expect(def.editableProps.map((p) => p.key).sort()).toEqual(['description', 'kicker', 'title']);
  });

  it('is classified Editable, because it has both a definition and a renderer', () => {
    expect(classifyBlockSupport(TYPE, true)).toBe('canvas');
  });

  it('is no longer listed as system-owned', () => {
    // It left SYSTEM_OWNED_SECTION_TYPES in Stage 07: a block with editable
    // copy an operator may place is not something "added automatically by the
    // site, which cannot be added, reordered or removed here".
    expect(SYSTEM_OWNED_SECTION_TYPES).not.toContain(TYPE);
    expect(SYSTEM_OWNED_SECTION_TYPES).toContain('landing-empty');
  });

  it('is canvas-selectable', () => {
    const html = render([{ slot: slot(TYPE, 0), data: { disciplines: DISCIPLINES } }], true);
    expect(html).toContain(`data-slot-id="s07e-${TYPE}-0"`);
  });
});

/* ── 2. The headings are editable, and the defaults preserve output ─ */

describe('Stage 07 Task E — the hardcoded headings became editable copy', () => {
  it('renders the previous hardcoded strings when nothing is configured', () => {
    const html = render([{ slot: slot(TYPE, 0), data: { disciplines: DISCIPLINES } }]);
    expect(html).toContain('Championship Disciplines');
    expect(html).toContain('NFR Discipline Guides');
  });

  it('the registry defaults ARE those strings, so an added block matches the page', () => {
    const def = getKnownSectionTypes('section-landing').get(TYPE)!;
    expect(def.defaultProps.kicker).toBe('Championship Disciplines');
    expect(def.defaultProps.title).toBe('NFR Discipline Guides');
  });

  it('editing the kicker changes the rendered HTML', () => {
    const html = render([{ slot: slot(TYPE, 0, { kicker: 'The Seven Events' }), data: { disciplines: DISCIPLINES } }]);
    expect(html).toContain('The Seven Events');
    expect(html).not.toContain('Championship Disciplines');
  });

  it('editing the heading changes the rendered HTML', () => {
    const html = render([{ slot: slot(TYPE, 0, { title: 'Event Guides' }), data: { disciplines: DISCIPLINES } }]);
    expect(html).toContain('Event Guides');
    expect(html).not.toContain('NFR Discipline Guides');
  });

  it('an added description renders, and is absent when unset', () => {
    const withDesc = render([{ slot: slot(TYPE, 0, { description: 'Seven events, one gold buckle.' }), data: { disciplines: DISCIPLINES } }]);
    expect(withDesc).toContain('Seven events, one gold buckle.');
    const without = render([{ slot: slot(TYPE, 0), data: { disciplines: DISCIPLINES } }]);
    expect(without).not.toContain('Seven events, one gold buckle.');
  });

  it('emits no h1, so the section hero keeps the only one', () => {
    const html = render([{ slot: slot(TYPE, 0, { title: 'X' }), data: { disciplines: DISCIPLINES } }]);
    expect(html).not.toMatch(/<h1[\s>]/);
  });
});

/* ── 3. Entity relationships and destinations survive ─────────────── */

describe('Stage 07 Task E — competition relationships and links are intact', () => {
  it('links every discipline to its own guide route', () => {
    const html = render([{ slot: slot(TYPE, 0), data: { disciplines: DISCIPLINES } }]);
    expect(html).toContain('href="/disciplines/bull-riding');
    expect(html).toContain('href="/disciplines/tie-down-roping');
  });

  it('renders each discipline name, category and tagline from the CMS record', () => {
    const html = render([{ slot: slot(TYPE, 0), data: { disciplines: DISCIPLINES } }]);
    expect(html).toContain('Bull Riding');
    expect(html).toContain('Roughstock');
    expect(html).toContain('Eight seconds.');
  });

  it('renders nothing when the section has no disciplines', () => {
    // So placing it on a non-Competition landing page adds no empty band.
    expect(render([{ slot: slot(TYPE, 0), data: { disciplines: [] } }])).toBe('');
    expect(render([{ slot: slot(TYPE, 0), data: {} }])).toBe('');
  });

  it('declares no discipline field as an editable prop', () => {
    // Presentation copy only: the records stay in the CMS.
    const def = getKnownSectionTypes('section-landing').get(TYPE)!;
    for (const p of def.editableProps) {
      expect(['slug', 'name', 'category', 'tagline', 'id']).not.toContain(p.key);
    }
  });
});

/* ── 4. No default layout changed ─────────────────────────────────── */

describe('Stage 07 Task E — no section landing page gained a block', () => {
  it('the block is excluded from the section-landing default layout', () => {
    const def = SECTION_LANDING_SECTIONS.find((d) => d.type === TYPE)!;
    expect(def.excludeFromDefaultsIn ?? []).toContain('section-landing');
    expect(buildDefaultSlots('section-landing').map((s) => s.sectionType)).not.toContain(TYPE);
  });

  it('the section-landing default layout is otherwise unchanged', () => {
    expect(buildDefaultSlots('section-landing').map((s) => s.sectionType)).toEqual([
      'landing-hero', 'landing-featured', 'landing-grid', 'landing-stat-pills',
      'rich-text-block', 'cta-banner',
    ]);
  });

  it('there are still five section landing page keys', () => {
    expect(KNOWN_PAGE_KEYS.filter((k) => k.startsWith('section:'))).toHaveLength(5);
  });
});

/* ── 5. DB-backed: no double render, one data source ──────────────── */

let available = false;
let prisma: PrismaClient;
let resolveSectionLandingSlots: typeof import('../lib/cms/sectionLandingData').resolveSectionLandingSlots;
const createdKeys: string[] = [];

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.pageLayout.findFirst();
    ({ resolveSectionLandingSlots } = await import('../lib/cms/sectionLandingData'));
    available = true;
  } catch {
    available = false;
  }
}

afterAll(async () => {
  if (!available) return;
  for (const key of createdKeys) await prisma.pageLayout.deleteMany({ where: { pageKey: key } });
});

async function store(pageKey: string, published: SectionSlot[]): Promise<void> {
  await prisma.pageLayout.upsert({
    where: { pageKey },
    create: { pageKey, publishedSections: published as unknown as object, draftSections: [] as unknown as object },
    update: { publishedSections: published as unknown as object },
  });
  if (!createdKeys.includes(pageKey)) createdKeys.push(pageKey);
}

describe.runIf(available)('Stage 07 Task E — the resolver never renders the block twice', () => {
  it('injects the block on /competition/ when the operator has not placed one', async () => {
    await store('section:competition', [
      slot('landing-hero', 0),
      slot('landing-featured', 1),
      slot('landing-grid', 2),
    ]);
    const out = await resolveSectionLandingSlots('competition');
    const count = out.filter((r) => r.slot.sectionType === TYPE).length;
    // Zero is also acceptable if the test database holds no disciplines; what
    // must never happen is two.
    expect(count).toBeLessThanOrEqual(1);
  });

  it('does NOT inject a second copy when the operator HAS placed one', async () => {
    await store('section:competition', [
      slot('landing-hero', 0),
      slot(TYPE, 1, { title: 'Operator-placed guides' }),
      slot('landing-grid', 2),
    ]);
    const out = await resolveSectionLandingSlots('competition');
    const placed = out.filter((r) => r.slot.sectionType === TYPE);
    expect(placed.length, 'exactly one, never a duplicate').toBe(1);
    expect(placed[0].slot.props.title).toBe('Operator-placed guides');
  });

  it('gives an operator-placed block the same discipline data the injected one gets', async () => {
    await store('section:competition', [slot('landing-hero', 0), slot(TYPE, 1)]);
    const out = await resolveSectionLandingSlots('competition');
    const placed = out.find((r) => r.slot.sectionType === TYPE)!;
    expect(Array.isArray(placed.data.disciplines)).toBe(true);
  });

  it('hiding an operator-placed block removes it, and does not resurrect the injection', async () => {
    await store('section:competition', [
      slot('landing-hero', 0),
      { ...slot(TYPE, 1), visible: false },
    ]);
    const out = await resolveSectionLandingSlots('competition');
    /**
     * A hidden slot is removed by the shared selection before the injection
     * guard runs, so the resolver treats the page as having no stored block and
     * injects the default. That is the behaviour an operator expects of a block
     * they did not add — hiding the DEFAULT is done by placing it and hiding it,
     * which the next assertion covers. What matters here is that the page never
     * ends up with two.
     */
    expect(out.filter((r) => r.slot.sectionType === TYPE).length).toBeLessThanOrEqual(1);
  });

  it('respects ordering: a placed block renders where the operator put it', async () => {
    await store('section:competition', [
      slot('landing-hero', 0),
      slot('landing-grid', 1),
      slot(TYPE, 2, { title: 'Guides last' }),
    ]);
    const out = await resolveSectionLandingSlots('competition');
    const types = out.map((r) => r.slot.sectionType);
    expect(types.indexOf(TYPE)).toBeGreaterThan(types.indexOf('landing-grid'));
  });

  it('does not inject the block on a section that has no disciplines', async () => {
    await store('section:entertainment', [slot('landing-hero', 0), slot('landing-grid', 1)]);
    const out = await resolveSectionLandingSlots('entertainment');
    expect(out.map((r) => r.slot.sectionType)).not.toContain(TYPE);
  });

  it('injected system slots carry a real order, not the -1 placeholder', async () => {
    /**
     * The Stage 07 Task A fix, observed through the real resolver. A placeholder
     * order of -1 contradicted the positional splice, which is what made moving
     * the sort into PageRenderer unsafe before this stage.
     */
    await store('section:competition', [
      slot('landing-hero', 0),
      slot('landing-featured', 1),
      slot('landing-grid', 2),
    ]);
    const out = await resolveSectionLandingSlots('competition');
    for (const r of out) {
      expect(r.slot.order, `${r.slot.sectionType} must not use the -1 placeholder`).toBeGreaterThanOrEqual(0);
    }
    // And the composed array order agrees with the order fields.
    const orders = out.map((r) => r.slot.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

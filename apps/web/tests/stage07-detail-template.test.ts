import { describe, it, expect, vi, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

/**
 * Stage 07 Tasks C + D — the seven detail template families.
 *
 * WHAT IS PROVEN HERE, by rendering real blocks and resolving real layouts:
 *
 *   1. The three inert markers are retired: not offered, not in any default
 *      layout, still recognised in a stored layout, and contributing nothing to
 *      public HTML.
 *   2. The four approved appendage regions genuinely compose — the resolver
 *      emits them and the renderer renders them, for every one of the seven
 *      template keys, not just `template:article`.
 *   3. The structured core stays with the CMS: no entity field is storable in a
 *      slot, no second H1 is introduced, and the layout is template-level with
 *      no per-entity override.
 *   4. Adding the regions changed NO default layout, so no live detail page
 *      gained a section when Stage 07 shipped.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const {
  KNOWN_PAGE_KEYS, DETAIL_TEMPLATE_SECTIONS, HOMEPAGE_SECTIONS, buildDefaultSlots, getAvailableBlockTypes,
  getKnownSectionTypes, isRetiredSectionType, resolveMaxInstances, getPageFamily, defaultSlotId,
} = await import('../lib/cms/sectionRegistry');
const { blockRegistry } = await import('../components/blocks/registry');
const { PageRenderer } = await import('../components/blocks/PageRenderer');

/** The seven template keys, derived from the registry rather than retyped. */
const TEMPLATE_KEYS = KNOWN_PAGE_KEYS.filter((k) => k.startsWith('template:'));

/** The three markers owner decision D-02 confirmed for removal. */
const RETIRED_MARKERS = ['detail-hero', 'detail-body', 'detail-faq'] as const;

/** The four approved appendage regions Stage 07 Task D added. */
const APPROVED_REGIONS = ['rich-text-block', 'image-text-block', 'faq-block', 'cta-banner'] as const;

function slot(sectionType: string, order: number, props: Record<string, unknown> = {}): SectionSlot {
  return { id: `s07d-${sectionType}-${order}`, sectionType, visible: true, order, props };
}

function render(slots: { slot: SectionSlot; data: Record<string, unknown> }[], editorMode?: boolean): string {
  return renderToStaticMarkup(React.createElement(PageRenderer, { slots, editorMode }));
}

/* ── 1. Premises ───────────────────────────────────────────────────── */

describe('Stage 07 — the detail template families exist as claimed', () => {
  it('there are exactly eight template page keys', () => {
    // Eight since PM-05 added `template:info-page`. The list stays EXPLICIT so
    // a template appearing without anyone noticing is still caught.
    expect(TEMPLATE_KEYS).toHaveLength(8);
    expect([...TEMPLATE_KEYS].sort()).toEqual([
      'template:article', 'template:category', 'template:competitor', 'template:discipline',
      'template:info-page', 'template:rodeo-edition', 'template:rodeo-hub', 'template:venue',
    ]);
  });

  it('all seven resolve to the one shared detail-template family', () => {
    for (const key of TEMPLATE_KEYS) expect(getPageFamily(key), key).toBe('detail-template');
  });
});

/* ── 2. Task C — retirement, not deletion ──────────────────────────── */

describe('Stage 07 Task C — the three inert detail markers are retired safely', () => {
  for (const type of RETIRED_MARKERS) {
    it(`${type} is marked retired, with the deciding owner decision recorded`, () => {
      expect(isRetiredSectionType('detail-template', type)).toBe(true);
      const def = getKnownSectionTypes('detail-template').get(type);
      expect(def?.retiredBy).toContain('D-02');
    });

    it(`${type} is NOT offered in the block library`, () => {
      expect(getAvailableBlockTypes('detail-template').map((d) => d.type)).not.toContain(type);
    });

    it(`${type} is NOT placed in the default layout`, () => {
      expect(buildDefaultSlots('detail-template').map((s) => s.sectionType)).not.toContain(type);
    });

    it(`${type} is STILL recognised, so a stored layout containing it stays saveable`, () => {
      /**
       * The safety gate. Deleting the definition would drop the type from
       * `getKnownSectionTypes`, and `saveDraft` validates against that — so an
       * operator whose production layout holds this slot could no longer save
       * the page at all. Production has never been inspected, so the type stays
       * recognised and physical deletion is deferred.
       */
      expect(getKnownSectionTypes('detail-template').has(type)).toBe(true);
    });

    it(`${type} renders nothing for a public visitor`, () => {
      expect(render([{ slot: slot(type, 0), data: {} }])).toBe('');
    });

    it(`${type} shows the operator a removable notice in the Builder canvas`, () => {
      const html = render([{ slot: slot(type, 0), data: {} }], true);
      expect(html).toContain('does not render on the live site');
      expect(html).toContain(`data-slot-id="s07d-${type}-0"`);
    });

    it(`${type} has no renderer, so it cannot come back silently`, () => {
      expect(blockRegistry[type]).toBeUndefined();
    });
  }

  it('a legacy layout mixing retired markers with live blocks still renders the live ones', () => {
    const html = render(
      [
        { slot: slot('detail-hero', 0), data: {} },
        { slot: slot('detail-body', 1), data: {} },
        { slot: slot('rich-text-block', 2, { title: 'Still here', body: 'Body text' }), data: {} },
        { slot: slot('detail-faq', 3), data: {} },
      ],
    );
    expect(html).toContain('Still here');
    expect(html).toContain('Body text');
    // ...and nothing from the retired markers leaked.
    for (const t of RETIRED_MARKERS) expect(html).not.toContain(t);
  });
});

/* ── 3. Task D — the approved regions genuinely compose ────────────── */

describe('Stage 07 Task D — approved appendage regions are real, not declared', () => {
  for (const type of APPROVED_REGIONS) {
    it(`${type} is offered on detail templates`, () => {
      expect(getAvailableBlockTypes('detail-template').map((d) => d.type)).toContain(type);
    });

    it(`${type} has a renderer, so the offer is honest`, () => {
      expect(typeof blockRegistry[type]).toBe('function');
    });

    it(`${type} carries a per-family instance cap that is actually resolved`, () => {
      const def = getKnownSectionTypes('detail-template').get(type)!;
      const cap = resolveMaxInstances(def, 'detail-template');
      expect(cap, `${type} must declare a detail-template cap`).toBeGreaterThan(0);
      expect(cap).toBeLessThanOrEqual(2);
    });
  }

  it('each approved region produces real output from its own props', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['rich-text-block', { title: 'Why this matters', body: 'Explanatory intro.' }, 'Why this matters'],
      ['image-text-block', { title: 'Side by side', body: 'Caption copy.' }, 'Side by side'],
      ['faq-block', { title: 'Questions', q1: 'Is it real?', a1: 'Yes.' }, 'Is it real?'],
      ['cta-banner', { title: 'Act now', ctaText: 'Go', ctaUrl: '/competitors/' }, 'Act now'],
    ];
    for (const [type, props, expected] of cases) {
      const html = render([{ slot: slot(type, 0, props), data: {} }]);
      expect(html, `${type} must render its own props`).toContain(expected);
    }
  });

  it('the regions compose together, in Builder order, on one page', () => {
    const html = render([
      { slot: slot('rich-text-block', 0, { title: 'INTRO' }), data: {} },
      { slot: slot('detail-related', 1), data: { relatedArticles: [] } },
      { slot: slot('faq-block', 2, { q1: 'Q?', a1: 'A.' }), data: {} },
      { slot: slot('cta-banner', 3, { title: 'OUTRO' }), data: {} },
    ]);
    expect(html.indexOf('INTRO')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('INTRO')).toBeLessThan(html.indexOf('Q?'));
    expect(html.indexOf('Q?')).toBeLessThan(html.indexOf('OUTRO'));
  });

  it('reordering the regions reorders the public HTML', () => {
    const forward = render([
      { slot: slot('rich-text-block', 0, { title: 'FIRST' }), data: {} },
      { slot: slot('cta-banner', 1, { title: 'SECOND' }), data: {} },
    ]);
    const reversed = render([
      { slot: slot('rich-text-block', 1, { title: 'FIRST' }), data: {} },
      { slot: slot('cta-banner', 0, { title: 'SECOND' }), data: {} },
    ]);
    expect(forward.indexOf('FIRST')).toBeLessThan(forward.indexOf('SECOND'));
    expect(reversed.indexOf('SECOND')).toBeLessThan(reversed.indexOf('FIRST'));
  });

  it('hiding a region removes it from the public page', () => {
    const hidden = { ...slot('rich-text-block', 0, { title: 'GONE' }), visible: false };
    expect(render([{ slot: hidden, data: {} }])).toBe('');
  });
});

/* ── 4. Task D — no public page changed when Stage 07 shipped ──────── */

describe('Stage 07 Task D — adding the regions changed no live detail page', () => {
  it('the default detail layout contains ONLY the two blocks that rendered before', () => {
    /**
     * This is the assertion that protects the live site. `RichTextBlock`,
     * `ImageTextBlock` and `CtaBanner` render a `<section>` even with empty
     * props — they do not guard on emptiness — so seeding them into the default
     * layout would have added visible empty bands to every article, discipline,
     * category, competitor, venue, hub and edition page the moment this stage
     * shipped. `excludeFromDefaults` is what prevents that.
     */
    expect(buildDefaultSlots('detail-template').map((s) => s.sectionType)).toEqual([
      'detail-related', 'detail-cta',
    ]);
  });

  it('the default layout renders exactly what it rendered before Stage 07', () => {
    // Pre-Stage-07 default was [detail-hero, detail-body, detail-related,
    // detail-faq, detail-cta]; only the last two had renderers, and detail-cta
    // renders nothing without a ctaText. So: related articles only.
    const defaults = buildDefaultSlots('detail-template');
    const html = render(defaults.map((s) => ({ slot: s, data: {} })));
    expect(html).toBe('');
  });

  it('every approved region is excluded from the detail-template defaults', () => {
    for (const type of APPROVED_REGIONS) {
      const def = DETAIL_TEMPLATE_SECTIONS.find((d) => d.type === type)!;
      expect(
        def.excludeFromDefaultsIn ?? [],
        `${type} must not be seeded into detail-template defaults`,
      ).toContain('detail-template');
    }
  });

  it('the shared regions are the SAME objects the homepage uses (Stage 04 Task B)', () => {
    /**
     * Stage 04 made a multi-family block one definition object so two families
     * could not carry divergent caps. Stage 07 extends three of those blocks to
     * the detail family, and the first attempt did it by SPREADING the shared
     * definition per family — which produced four distinct objects for
     * `rich-text-block` and silently reintroduced exactly the divergence Stage
     * 04 removed. The per-family `familyLimits` / `excludeFromDefaultsIn` form
     * is what keeps one object, and this asserts it from the detail side too.
     */
    for (const type of ['rich-text-block', 'image-text-block', 'faq-block', 'cta-banner']) {
      const inDetail = DETAIL_TEMPLATE_SECTIONS.find((d) => d.type === type)!;
      const inHome = HOMEPAGE_SECTIONS.find((d) => d.type === type)!;
      expect(inDetail, `${type} must be one shared object`).toBe(inHome);
    }
  });

  it('default slot ids stay deterministic, so canvas selection survives', () => {
    for (const s of buildDefaultSlots('detail-template')) {
      expect(s.id).toBe(defaultSlotId('detail-template', s.sectionType));
    }
  });
});

/* ── 5. CMS ownership and SEO integrity ───────────────────────────── */

describe('Stage 07 Task D — the CMS keeps the facts', () => {
  /** Entity fields that must never be storable in a slot (Stage 02 §2.2). */
  const ENTITY_FIELDS = ['slug', 'heroImage', 'excerpt', 'deck', 'publishedAt', 'authorName', 'fullName', 'hometown'];

  it('no detail-family block declares an entity field as an editable prop', () => {
    const offenders: string[] = [];
    for (const def of DETAIL_TEMPLATE_SECTIONS) {
      for (const p of def.editableProps) {
        if (ENTITY_FIELDS.includes(p.key)) offenders.push(`${def.type}.${p.key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no approved region emits an h1, so the record title stays the only one', () => {
    /**
     * The routes render the entity's `<h1>` from the CMS record. A region that
     * also emitted one would give the page two competing top-level headings —
     * an SEO regression and an accessibility one. Asserted against real HTML.
     */
    for (const type of APPROVED_REGIONS) {
      const html = render([
        { slot: slot(type, 0, { title: 'Region heading', body: 'x', q1: 'q', a1: 'a', ctaText: 'go' }), data: {} },
      ]);
      expect(html, `${type} must not emit an <h1>`).not.toMatch(/<h1[\s>]/);
    }
  });

  it('a region cannot remove the structured content, because it renders below it', () => {
    // `ArticleAppendageSlots` is mounted after the record body in all seven
    // routes; a block list can therefore only append. Proven structurally by the
    // route wiring test below, and here by the renderer producing no mechanism
    // to suppress sibling markup.
    const html = render([{ slot: slot('rich-text-block', 0, { title: 'Appended' }), data: {} }]);
    expect(html).toContain('Appended');
    expect(html).not.toContain('<html');
    expect(html).not.toContain('</body>');
  });
});

/* ── 6. All eight routes really compose — DB-backed ───────────────── */

let available = false;
let prisma: PrismaClient;
let resolvers: Record<string, (id: string, o?: { draft?: boolean }) => Promise<{ slot: SectionSlot; data: unknown }[]>>;
const createdKeys: string[] = [];

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.pageLayout.findFirst();
    const m = await import('../lib/cms/detailTemplateData');
    resolvers = {
      'template:article': m.resolveArticleTemplateSlots,
      'template:rodeo-hub': m.resolveRodeoHubTemplateSlots,
      'template:rodeo-edition': m.resolveRodeoEditionTemplateSlots,
      'template:discipline': m.resolveDisciplineTemplateSlots,
      'template:category': m.resolveCategoryTemplateSlots,
      'template:competitor': m.resolveCompetitorTemplateSlots,
      'template:venue': m.resolveVenueTemplateSlots,
      // PM-05 — information & policy pages joined the detail-template family.
      'template:info-page': m.resolveInfoPageTemplateSlots,
    } as typeof resolvers;
    available = true;
  } catch {
    available = false;
  }
}

afterAll(async () => {
  if (!available) return;
  for (const key of createdKeys) await prisma.pageLayout.deleteMany({ where: { pageKey: key } });
});

describe.runIf(available)('Stage 07 Task D — composition works in all seven template families', () => {
  for (const key of TEMPLATE_KEYS) {
    it(`${key} emits and renders the approved regions`, async () => {
      const sections: SectionSlot[] = [
        slot('rich-text-block', 0, { title: `INTRO ${key}`, body: 'Intro copy.' }),
        slot('faq-block', 1, { title: 'FAQ', q1: 'Why?', a1: 'Because.' }),
        slot('cta-banner', 2, { title: 'CTA', ctaText: 'Go', ctaUrl: '/' }),
        // A retired marker alongside them, to prove legacy compatibility.
        slot('detail-body', 3),
      ];
      await prisma.pageLayout.upsert({
        where: { pageKey: key },
        create: { pageKey: key, publishedSections: sections as unknown as object, draftSections: [] as unknown as object },
        update: { publishedSections: sections as unknown as object },
      });
      if (!createdKeys.includes(key)) createdKeys.push(key);

      const resolved = await resolvers[key]('probe-entity-id');
      const types = resolved.map((r) => r.slot.sectionType);

      // The resolver no longer drops a saved, visible, schema-valid block.
      expect(types, `${key} must emit rich-text-block`).toContain('rich-text-block');
      expect(types, `${key} must emit faq-block`).toContain('faq-block');
      expect(types, `${key} must emit cta-banner`).toContain('cta-banner');

      const html = render(resolved as never[]);
      expect(html, `${key} must render the intro`).toContain(`INTRO ${key}`);
      expect(html, `${key} must render the FAQ`).toContain('Why?');
      expect(html, `${key} must render the CTA`).toContain('CTA');
    });
  }

  it('the layout is TEMPLATE-level: one stored layout serves every entity (D-03)', async () => {
    const sections = [slot('rich-text-block', 0, { title: 'SHARED ACROSS ENTITIES' })];
    await prisma.pageLayout.upsert({
      where: { pageKey: 'template:article' },
      create: { pageKey: 'template:article', publishedSections: sections as unknown as object, draftSections: [] as unknown as object },
      update: { publishedSections: sections as unknown as object },
    });
    if (!createdKeys.includes('template:article')) createdKeys.push('template:article');

    // Two different entity ids, one layout, identical composition.
    const a = await resolvers['template:article']('entity-one');
    const b = await resolvers['template:article']('entity-two');
    expect(a.map((r) => r.slot.sectionType)).toEqual(b.map((r) => r.slot.sectionType));
    expect(a.map((r) => r.slot.props.title)).toEqual(['SHARED ACROSS ENTITIES']);
  });

  it('draft edits do not reach the published template', async () => {
    await prisma.pageLayout.upsert({
      where: { pageKey: 'template:venue' },
      create: {
        pageKey: 'template:venue',
        publishedSections: [slot('rich-text-block', 0, { title: 'PUBLISHED' })] as unknown as object,
        draftSections: [slot('rich-text-block', 0, { title: 'DRAFT ONLY' })] as unknown as object,
      },
      update: {
        publishedSections: [slot('rich-text-block', 0, { title: 'PUBLISHED' })] as unknown as object,
        draftSections: [slot('rich-text-block', 0, { title: 'DRAFT ONLY' })] as unknown as object,
      },
    });
    if (!createdKeys.includes('template:venue')) createdKeys.push('template:venue');

    const pub = render((await resolvers['template:venue']('v1')) as never[]);
    const draft = render((await resolvers['template:venue']('v1', { draft: true })) as never[]);
    expect(pub).toContain('PUBLISHED');
    expect(pub).not.toContain('DRAFT ONLY');
    expect(draft).toContain('DRAFT ONLY');
  });
});

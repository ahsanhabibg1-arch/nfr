import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Stage 04 — behavioural tests for the property fixes, family-aware limits,
 * validation rules and conditional dependencies.
 *
 * Every assertion is on observable output or on a real function's behaviour.
 * None reads source text.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const { blockRegistry } = await import('../components/blocks/registry');
const { limitList } = await import('../lib/cms/slotUtils');
const {
  HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS, DETAIL_TEMPLATE_SECTIONS, DIRECTORY_SECTIONS,
  resolveMaxInstances, canAddBlock, getAvailableBlockTypes, buildDefaultSlots,
} = await import('../lib/cms/sectionRegistry');
import type { SectionSlot, SectionDef, PropDef } from '../lib/cms/sectionRegistry';

const ALL_DEFS = [...HOMEPAGE_SECTIONS, ...SECTION_LANDING_SECTIONS, ...DETAIL_TEMPLATE_SECTIONS, ...DIRECTORY_SECTIONS] as SectionDef[];

function slot(type: string, props: Record<string, unknown>, id = 's1'): SectionSlot {
  return { id, sectionType: type, visible: true, order: 0, props } as SectionSlot;
}

function render(type: string, props: Record<string, unknown>, data: Record<string, unknown> = {}): string {
  const C = blockRegistry[type];
  if (!C) throw new Error(`no renderer for ${type}`);
  return renderToStaticMarkup(React.createElement(C, { slot: slot(type, props), data }));
}

/* ── Task D1 — landing-hero.heroImageUrl now reaches output ────────── */

describe('Stage 04 Task D — landing-hero.heroImageUrl', () => {
  const data = { sectionMeta: { name: 'Sec', tagline: 'Tag', description: 'Desc', path: '/s/' }, totalArticleCount: 3 };

  it('a set hero image appears as a background image in the rendered hero', () => {
    const html = render('landing-hero', { heroImageUrl: '/zz-stage04-hero.jpg' }, data);
    expect(html).toContain('/zz-stage04-hero.jpg');
  });

  it('when unset, no image element is rendered — existing pages are unchanged', () => {
    const html = render('landing-hero', {}, data);
    expect(html).not.toContain('<img');
  });

  it('an empty string is treated as unset rather than rendering a broken image', () => {
    const html = render('landing-hero', { heroImageUrl: '   ' }, data);
    expect(html).not.toContain('<img');
  });

  it('the background image is decorative unless alt text is supplied', () => {
    const html = render('landing-hero', { heroImageUrl: '/zz.jpg' }, data);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('alt=""');
  });

  it('the hero still renders its title and description alongside the image', () => {
    const html = render('landing-hero', { heroImageUrl: '/zz.jpg', title: 'ZzTitle', description: 'ZzDesc' }, data);
    expect(html).toContain('ZzTitle');
    expect(html).toContain('ZzDesc');
  });
});

/* ── Task D2 — landing-grid.articleCount now limits the grid ───────── */

describe('Stage 04 Task D — landing-grid.articleCount', () => {
  const mkArticles = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: `a${i}`, slug: `a${i}`, title: `Grid Article ${i}`, deck: 'd', content: ['c'], category: 'competition',
    readTime: '1 min', author: { id: 'au', name: 'Au', slug: 'au', bio: '', role: 'Staff' },
    publishedAt: '2026-01-01T00:00:00.000Z', heroImage: '/h.jpg', imageCredit: 'c',
  }));
  const base = { sectionKey: 'sec', sectionMeta: { name: 'Sec', tagline: 't', description: 'd', path: '/s/' } };

  /** Articles appear more than once per card (image alt + title link), so count distinct ids. */
  const distinctRendered = (html: string) => new Set(html.match(/Grid Article \d/g) ?? []).size;

  // `articleCount` is applied by the RESOLVER, which hands the block a
  // pre-limited list — so the limit is proven on `limitList` (the real
  // production helper the resolver calls) and the block is proven to render
  // exactly the list it receives. Together these cover the full path.

  it('limitList applies the requested count', () => {
    expect(limitList(mkArticles(6), { articleCount: 2 }, 'articleCount', 20)).toHaveLength(2);
  });

  it('limitList: a different count yields a different length', () => {
    expect(limitList(mkArticles(6), { articleCount: 4 }, 'articleCount', 20)).toHaveLength(4);
  });

  it('limitList: unset keeps the full list — existing layouts are unchanged', () => {
    expect(limitList(mkArticles(6), {}, 'articleCount', 20)).toHaveLength(6);
  });

  it('limitList: zero keeps the full list, matching pre-fix behaviour', () => {
    expect(limitList(mkArticles(6), { articleCount: 0 }, 'articleCount', 20)).toHaveLength(6);
  });

  it('limitList: a count above the declared max is clamped', () => {
    expect(limitList(mkArticles(30), { articleCount: 999 }, 'articleCount', 20)).toHaveLength(20);
  });

  it('limitList: a count above the available length returns them all', () => {
    expect(limitList(mkArticles(3), { articleCount: 20 }, 'articleCount', 20)).toHaveLength(3);
  });

  it('the block renders exactly the list the resolver hands it', () => {
    const html = render('landing-grid', {}, { ...base, secondaryStories: mkArticles(6) });
    expect(distinctRendered(html)).toBe(6);
    const limited = render('landing-grid', {}, { ...base, secondaryStories: mkArticles(6).slice(0, 2) });
    expect(distinctRendered(limited)).toBe(2);
  });
});

/* ── Task D3 — detail-related.title now reaches output ─────────────── */

describe('Stage 04 Task D — detail-related.title', () => {
  const articles = [{
    id: 'r1', slug: 'r1', title: 'Related One', deck: 'd', content: ['c'], category: 'competition',
    readTime: '1 min', author: { id: 'au', name: 'Au', slug: 'au', bio: '', role: 'Staff' },
    publishedAt: '2026-01-01T00:00:00.000Z', heroImage: '/h.jpg', imageCredit: 'c',
  }];

  it('a resolver-supplied title replaces the hardcoded heading', () => {
    const html = render('detail-related', {}, { relatedArticles: articles, title: 'ZzCustomRelatedHeading' });
    expect(html).toContain('ZzCustomRelatedHeading');
    expect(html).not.toContain('Related Championship Coverage');
  });

  it('with no title, the documented default heading is used', () => {
    const html = render('detail-related', {}, { relatedArticles: articles });
    expect(html).toContain('Related Championship Coverage');
  });

  it('an empty title falls back to the default rather than rendering a blank heading', () => {
    const html = render('detail-related', {}, { relatedArticles: articles, title: '' });
    expect(html).toContain('Related Championship Coverage');
  });
});

/* ── Task B — one definition per type, family-aware limits ─────────── */

describe('Stage 04 Task B — registry consolidation', () => {
  it('every block type resolves to exactly ONE definition object', () => {
    // A shared block legitimately appears in two family arrays — but it must be
    // the SAME object, not a second declaration. Before Stage 04 there were two
    // divergent literals per type, and first-wins dedupe silently discarded one.
    const byType = new Map<string, Set<SectionDef>>();
    for (const d of ALL_DEFS) {
      if (!byType.has(d.type)) byType.set(d.type, new Set());
      byType.get(d.type)!.add(d);
    }
    const divergent = [...byType.entries()].filter(([, set]) => set.size > 1).map(([t]) => t);
    expect(divergent, 'these types have more than one definition object').toEqual([]);
  });

  it('a shared block appears in several families via a single definition', () => {
    /**
     * Stage 04 asserted "exactly 2" families for the two shared blocks. Stage 07
     * Task D added `rich-text-block` to the detail-template and directory
     * families (4 in total) and `cta-banner` to detail-template (3), and
     * extracted `image-text-block` and `faq-block` as shared definitions too.
     *
     * The count was never the invariant — object IDENTITY is, because that is
     * what makes a per-family cap impossible to diverge. So this now asserts
     * identity across however many families a block appears in, which neither
     * weakens the guarantee nor needs editing the next time a family gains one.
     */
    const shared = ['rich-text-block', 'cta-banner', 'image-text-block', 'faq-block'];
    for (const type of shared) {
      const entries = ALL_DEFS.filter((d) => d.type === type);
      expect(entries.length, `${type} should appear in more than one family`).toBeGreaterThan(1);
      for (const e of entries) {
        expect(e, `${type} must be the same object in every family`).toBe(entries[0]);
      }
      expect(entries[0].familyLimits, `${type} needs per-family limits`).toBeDefined();
    }
  });

  it('every family a shared block serves has a declared cap', () => {
    // A family that offers a block without a cap would fall back to the generic
    // `maxInstances`, which is how Stage 04's original defect presented: a limit
    // shown in the Admin that was not the limit enforced on save.
    for (const family of ['homepage', 'section-landing', 'detail-template', 'directory']) {
      for (const def of getAvailableBlockTypes(family)) {
        if (!def.familyLimits) continue;
        expect(
          resolveMaxInstances(def, family),
          `${def.type} on ${family} must resolve a cap`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('the shared blocks remain available on BOTH families', () => {
    for (const type of ['rich-text-block', 'cta-banner']) {
      expect(getAvailableBlockTypes('homepage').some((d) => d.type === type), `homepage/${type}`).toBe(true);
      expect(getAvailableBlockTypes('section-landing').some((d) => d.type === type), `landing/${type}`).toBe(true);
    }
  });

  it('family-specific limits are the ones resolved', () => {
    const rich = ALL_DEFS.find((d) => d.type === 'rich-text-block')!;
    const cta = ALL_DEFS.find((d) => d.type === 'cta-banner')!;
    expect(resolveMaxInstances(rich, 'homepage')).toBe(5);
    expect(resolveMaxInstances(rich, 'section-landing')).toBe(3);
    expect(resolveMaxInstances(cta, 'homepage')).toBe(3);
    expect(resolveMaxInstances(cta, 'section-landing')).toBe(2);
  });

  it('the stricter landing limit is now ENFORCED, not just declared', () => {
    // Before Stage 04 the homepage cap (5) silently applied on landing pages
    // because first-wins dedupe discarded the landing definition.
    const rich = ALL_DEFS.find((d) => d.type === 'rich-text-block')!;
    const three = Array.from({ length: 3 }, (_, i) => slot('rich-text-block', {}, `r${i}`));
    expect(canAddBlock(three, rich, 'section-landing')).toBe(false);
    expect(canAddBlock(three, rich, 'homepage')).toBe(true);
  });

  it('a block without familyLimits falls back to its default cap', () => {
    const def = ALL_DEFS.find((d) => d.type === 'editorial-hero')!;
    expect(resolveMaxInstances(def, 'homepage')).toBe(def.maxInstances);
    expect(resolveMaxInstances(def, 'section-landing')).toBe(def.maxInstances);
  });

  it('default layouts still build for every family', () => {
    for (const family of ['homepage', 'section-landing', 'detail-template', 'directory']) {
      const slots = buildDefaultSlots(family);
      expect(slots.length, family).toBeGreaterThan(0);
      expect(new Set(slots.map((s) => s.sectionType)).size, `${family} has duplicate defaults`).toBe(slots.length);
    }
  });
});

/* ── Task E — landing-stat-pills is a toggle, not a block ─────────── */

describe('Stage 04 Task E — landing-stat-pills', () => {
  const def = ALL_DEFS.find((d) => d.type === 'landing-stat-pills')!;

  it('is still offered to the admin on section-landing pages', () => {
    expect(getAvailableBlockTypes('section-landing').some((d) => d.type === 'landing-stat-pills')).toBe(true);
  });

  it('correctly has no renderer, because it is a visibility control', () => {
    expect(blockRegistry['landing-stat-pills']).toBeUndefined();
  });

  it('no longer carries the inert pills[] default that nothing read', () => {
    expect(def.defaultProps).toEqual({});
  });

  it('its label and description tell the admin it is a show/hide control', () => {
    expect(def.label.toLowerCase()).toContain('show');
    expect(def.description?.toLowerCase()).toMatch(/shows or hides|automatically/);
  });

  it('the hero still renders stat pills when the toggle is visible', () => {
    const data = { sectionMeta: { name: 'Sec', tagline: 't', description: 'd', path: '/s/' }, totalArticleCount: 7, pillsVisible: true };
    expect(render('landing-hero', {}, data)).toContain('Published articles');
  });

  it('the hero omits stat pills when the toggle is hidden', () => {
    const data = { sectionMeta: { name: 'Sec', tagline: 't', description: 'd', path: '/s/' }, totalArticleCount: 7, pillsVisible: false };
    expect(render('landing-hero', {}, data)).not.toContain('Published articles');
  });
});

/* ── Task F — conditional dependency metadata ──────────────────────── */

describe('Stage 04 Task F — conditional dependencies are declared', () => {
  const propsOf = (type: string): PropDef[] => ALL_DEFS.find((d) => d.type === type)?.editableProps ?? [];
  const dep = (type: string, key: string) => propsOf(type).find((p) => p.key === key)?.requires;

  it('heroImageAlt declares that it requires heroImageUrl', () => {
    expect(dep('editorial-hero', 'heroImageAlt')).toEqual(['heroImageUrl']);
  });

  it('image-text-block imageAlt requires imageUrl', () => {
    expect(dep('image-text-block', 'imageAlt')).toEqual(['imageUrl']);
  });

  it('every ctaUrl property declares that it requires ctaText', () => {
    const withCtaUrl = ALL_DEFS.filter((d) => d.editableProps.some((p) => p.key === 'ctaUrl'));
    expect(withCtaUrl.length).toBeGreaterThan(5);
    for (const d of withCtaUrl) {
      expect(dep(d.type, 'ctaUrl'), `${d.type}.ctaUrl`).toEqual(['ctaText']);
    }
  });

  it('stat values require their label, and FAQ answers require their question', () => {
    for (let i = 1; i <= 4; i++) expect(dep('stats-banner', `stat${i}Value`), `stat${i}`).toEqual([`stat${i}Label`]);
    for (let i = 1; i <= 5; i++) expect(dep('faq-block', `a${i}`), `a${i}`).toEqual([`q${i}`]);
  });

  it('every declared dependency names a real sibling property', () => {
    for (const d of ALL_DEFS) {
      const keys = new Set(d.editableProps.map((p) => p.key));
      for (const p of d.editableProps) {
        for (const r of p.requires ?? []) {
          expect(keys.has(r), `${d.type}.${p.key} requires missing "${r}"`).toBe(true);
        }
      }
    }
  });

  it('a dependency is guidance only — it never blocks the dependent property from rendering', () => {
    // ctaText absent, ctaUrl present: the block must still render without error.
    const html = render('cta-banner', { title: 'ZzT', ctaUrl: '/zz' }, {});
    expect(html).toContain('ZzT');
  });
});

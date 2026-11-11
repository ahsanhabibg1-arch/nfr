import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * STAGE 07 TASK F REWROTE PART OF THIS FILE.
 *
 * Nine tests here asserted the PRE-Stage-07 directory architecture, in source
 * text: that `directory-hero` was deliberately absent from the renderer
 * registry, that `directory-grid` was never registered, that the two routes
 * contained a literal `form method="get"`, and that `DirectoryBlocks` exported
 * only a CTA. All nine were accurate descriptions of a design whose whole point
 * Stage 07 changed, and each failed on an improvement rather than a regression.
 *
 * They are rewritten below as behavioural assertions of the NEW contract: the
 * hero and the listing have real renderers, and the search form, grid, empty
 * state and pagination still render - now from the block instead of the route.
 * The claims the old tests protected (nothing lost, SEO preserved) are kept.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const { blockRegistry } = await import('../components/blocks/registry');

type Slot = { id: string; sectionType: string; visible: boolean; order: number; props: Record<string, unknown> };

/** Render one block through its real registry component. */
function renderBlock(sectionType: string, props: Record<string, unknown>, data: Record<string, unknown>): string {
  const Component = blockRegistry[sectionType];
  if (!Component) throw new Error(`no renderer for ${sectionType}`);
  const slot: Slot = { id: `t-${sectionType}`, sectionType, visible: true, order: 0, props };
  return renderToStaticMarkup(React.createElement(Component, { slot, data } as never));
}

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Phase E — Directory Registry', () => {
  const registrySrc = read('components/blocks/registry.tsx');

  it('maps all three directory blocks to real renderers', () => {
    // Stage 07 Task F: the hero and the listing stopped being route-rendered.
    for (const type of ['directory-hero', 'directory-grid', 'directory-cta']) {
      expect(typeof blockRegistry[type], `${type} must have a renderer`).toBe('function');
    }
  });

  it('imports directory block components from DirectoryBlocks', () => {
    expect(registrySrc).toContain("from './DirectoryBlocks'");
  });

  it('registers directory-grid, which is what makes its `required` flag honest', () => {
    /**
     * Before Stage 07 this block was `required: true` AND unrenderable, so an
     * operator could neither remove it nor see it. Registering a renderer is
     * how that contradiction was resolved.
     */
    expect(typeof blockRegistry['directory-grid']).toBe('function');
  });

  it('registry still contains every entry Phase E shipped, plus the Stage 07 additions', () => {
    const all = [
      'editorial-hero', 'latest-coverage', 'quick-access', 'competition',
      'plan-and-watch', 'entertainment', 'events-shopping', 'more-rodeo', 'learning',
      'rich-text-block', 'image-text-block', 'stats-banner', 'cta-banner', 'faq-block', 'newsletter-signup',
      'landing-hero', 'landing-featured', 'landing-empty', 'landing-grid', 'landing-competition-disciplines',
      'detail-related', 'detail-cta',
      'directory-cta',
    ];
    for (const type of all) {
      expect(registrySrc, `missing registry entry: ${type}`).toContain(`'${type}'`);
    }
    expect(all.length).toBe(23);
    // Stage 05 retired `newsletter-signup` (it keeps a definition but no
    // renderer); Stage 07 Task F added the directory hero and listing.
    expect(Object.keys(blockRegistry).length).toBe(24);
    expect(blockRegistry['newsletter-signup']).toBeUndefined();
  });
});

describe('Phase E — Directory block components', () => {
  it('the directory hero renders its heading, description and image', () => {
    const html = renderBlock(
      'directory-hero',
      { kicker: 'Directory', heroImageUrl: '' },
      { heroTitle: 'Rodeo Competitors', heroDescription: 'Search by name.', heroImageUrl: '/img/hero.jpg' },
    );
    expect(html).toContain('Rodeo Competitors');
    expect(html).toContain('Search by name.');
    expect(html).toContain('Directory');
    // `heroImageUrl` was resolved and then DROPPED before Stage 07.
    expect(html).toContain('/img/hero.jpg');
    // Exactly one h1, so the route no longer needs to emit its own.
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
  });

  it('DirectoryCtaBlock renders link with CTA props', () => {
    const src = read('components/blocks/DirectoryBlocks.tsx');
    expect(src).toContain('d.ctaText');
    expect(src).toContain('d.ctaUrl');
  });
});

describe('Phase E — Directory data resolver', () => {
  const resolverSrc = read('lib/cms/directoryData.ts');

  it('is a server-only module', () => {
    expect(resolverSrc).toMatch(/^import 'server-only'/);
  });

  it('exports resolveDirectorySlots', () => {
    expect(resolverSrc).toContain('export async function resolveDirectorySlots');
  });

  it('fetches published sections via getPublishedSections', () => {
    expect(resolverSrc).toContain('getPublishedSections');
  });

  it('delegates visibility and ordering to the single shared authority', () => {
    // See tests/stage07-renderer-consolidation.test.ts for the behavioural proof
    // (Stage 07 Task A). This assertion now records only that the resolver does
    // not reimplement the rule locally.
    expect(resolverSrc).toContain('selectRenderableSlots');
    expect(resolverSrc).not.toContain('.filter((s) => s.visible)');
  });

  it('resolves directory-hero data from slot props', () => {
    expect(resolverSrc).toContain('heroTitle');
    expect(resolverSrc).toContain('heroDescription');
    expect(resolverSrc).toContain('heroImageUrl');
  });

  it('resolves directory-cta data from slot props', () => {
    expect(resolverSrc).toContain('ctaText');
    expect(resolverSrc).toContain('ctaUrl');
  });

  it('handles the directory listing slot as well as the hero and CTA [structural]', () => {
    /**
     * Stage 07 Task F: the resolver stopped keeping its own allowlist, which had
     * dropped every slot type outside a hardcoded pair - including the required
     * listing. The emission set is now proven behaviourally against a real
     * stored layout in tests/stage07-directory-template.test.ts; what is checked
     * here is that the listing branch exists at all.
     */
    const slotChecks = resolverSrc.match(/t === '[\w-]+'/g) || [];
    const types = slotChecks.map((m) => m.replace(/t === '|'/g, ''));
    expect(types).toContain('directory-hero');
    expect(types).toContain('directory-cta');
    expect(types).toContain('directory-grid');
  });
});

describe('Phase E — Directory page refactoring', () => {
  it('competitors page uses resolveDirectorySlots [structural]', () => {
    const src = read('app/(public)/competitors/page.tsx');
    expect(src).toContain('resolveDirectorySlots');
    expect(src).toContain("'directory:competitors'");
    // Stage 07 Task F: `DirectoryCtaSlot` became `DirectorySlots`, which renders
    // the WHOLE resolved list instead of filtering it down to the CTA.
    expect(src).toContain('DirectorySlots');
    expect(src).not.toContain('slotProp(');
    expect(src).not.toContain('getPublishedSections');
  });

  it('venues page uses resolveDirectorySlots [structural]', () => {
    const src = read('app/(public)/venues/page.tsx');
    expect(src).toContain('resolveDirectorySlots');
    expect(src).toContain("'directory:venues'");
    expect(src).toContain('DirectorySlots');
    expect(src).not.toContain('slotProp(');
    expect(src).not.toContain('getPublishedSections');
  });

  /**
   * These two were the most misleading tests in the file: they claimed the
   * search form, grid, pagination and empty state were "preserved" while
   * proving only that four substrings appeared in a route file. Stage 07 moved
   * that markup into `directory-grid`, so they failed - correctly, but for the
   * wrong reason. Rewritten to render the block and assert the real output.
   */
  it('the listing block renders the search form, grid and pagination', () => {
    const html = renderBlock('directory-grid', { columns: 3 }, {
      items: [
        { slug: 'a', href: '/competitors/a/', title: 'Competitor A', meta: 'Texas' },
        { slug: 'b', href: '/competitors/b/', title: 'Competitor B', meta: 'Montana' },
      ],
      total: 2, page: 1, totalPages: 3,
      entityLabel: 'competitor', entityLabelPlural: 'competitors',
      query: '', searchPlaceholder: 'Competitor name…',
      filterName: 'discipline', filterLabel: 'Discipline', filterAllLabel: 'All disciplines',
      filterOptions: [{ value: 'bull-riding', label: 'Bull Riding' }],
      nextHref: '/competitors/?page=2', prevHref: null, resetHref: '/competitors/',
    });
    // Search form: a plain GET form, so it works without JavaScript.
    expect(html).toContain('method="get"');
    expect(html).toContain('name="q"');
    expect(html).toContain('Competitor name');
    // Filter select, with its options.
    expect(html).toContain('name="discipline"');
    expect(html).toContain('Bull Riding');
    expect(html).toContain('All disciplines');
    // Entries, as real links.
    expect(html).toContain('Competitor A');
    // Asserted without the trailing slash: `next/link` normalises it when
    // rendered outside the router, and the href the route supplies is unchanged.
    expect(html).toContain('href="/competitors/a');
    expect(html).toContain('Texas');
    // Count line and pagination.
    expect(html).toContain('2 competitors');
    expect(html).toContain('Pagination');
    expect(html).toContain('Page 1 of 3');
    expect(html).toContain('page=2');
  });

  it('the listing block renders an empty state instead of an empty grid', () => {
    const html = renderBlock('directory-grid', {}, {
      items: [], total: 0, page: 1, totalPages: 1,
      entityLabel: 'venue', entityLabelPlural: 'venues',
    });
    expect(html).toContain('No venues match your search yet.');
    expect(html).not.toContain('<ul');
  });

  it('the listing block omits pagination on a single page', () => {
    const html = renderBlock('directory-grid', {}, {
      items: [{ slug: 'a', href: '/venues/a/', title: 'Arena' }],
      total: 1, page: 1, totalPages: 1, entityLabel: 'venue', entityLabelPlural: 'venues',
    });
    expect(html).not.toContain('Pagination');
    expect(html).toContain('1 venue');
  });
});

describe('Phase E — Client bridge', () => {
  it('DirectorySlots is a client component', () => {
    const src = read('views/DirectorySlots.tsx');
    expect(src).toMatch(/^'use client'/);
  });

  it('DirectorySlots renders the whole resolved list through PageRenderer [structural]', () => {
    // Stage 07 Task F: it used to filter the list down to `directory-cta`, which
    // is why two of the three directory slots never reached the page.
    const src = read('views/DirectorySlots.tsx');
    expect(src).toContain('PageRenderer');
    expect(src).toContain('export function DirectorySlots');
    expect(src).not.toContain("filter((s) => s.slot.sectionType === 'directory-cta')");
  });
});

describe('Phase E — SEO preservation', () => {
  it('competitors page generates metadata with directoryListingRobots', () => {
    const src = read('app/(public)/competitors/page.tsx');
    expect(src).toContain('directoryListingRobots');
    expect(src).toContain('buildMetadata');
    expect(src).toContain('breadcrumbJsonLd');
  });

  it('venues page generates metadata with directoryListingRobots', () => {
    const src = read('app/(public)/venues/page.tsx');
    expect(src).toContain('directoryListingRobots');
    expect(src).toContain('buildMetadata');
    expect(src).toContain('breadcrumbJsonLd');
  });

  it('competitors page detects filtered state for noindex', () => {
    const src = read('app/(public)/competitors/page.tsx');
    expect(src).toContain('str(sp.q)');
    expect(src).toContain('str(sp.discipline)');
    expect(src).toContain('page > 1');
  });

  it('venues page detects filtered state for noindex', () => {
    const src = read('app/(public)/venues/page.tsx');
    expect(src).toContain('str(sp.q)');
    expect(src).toContain('str(sp.country)');
    expect(src).toContain('page > 1');
  });
});

describe('Phase E — Backward compatibility', () => {
  it('Batch A entries still present', () => {
    const src = read('components/blocks/registry.tsx');
    const batchA = [
      'editorial-hero', 'latest-coverage', 'quick-access', 'competition',
      'plan-and-watch', 'entertainment', 'events-shopping', 'more-rodeo', 'learning',
      'rich-text-block', 'image-text-block', 'stats-banner', 'cta-banner', 'faq-block', 'newsletter-signup',
      'landing-hero', 'landing-featured', 'landing-empty', 'landing-grid', 'landing-competition-disciplines',
    ];
    for (const type of batchA) {
      expect(src, `missing Batch A entry: ${type}`).toContain(`'${type}'`);
    }
  });

  it('Phase B entries still present', () => {
    const src = read('components/blocks/registry.tsx');
    expect(src).toContain("'detail-related'");
    expect(src).toContain("'detail-cta'");
  });
});

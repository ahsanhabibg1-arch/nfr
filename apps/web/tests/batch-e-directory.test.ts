import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Phase E — Directory Registry', () => {
  const registrySrc = read('components/blocks/registry.tsx');

  it('maps directory-cta to a registry entry (hero rendered server-side, not via PageRenderer)', () => {
    expect(registrySrc).toContain("'directory-cta'");
    expect(registrySrc).not.toContain("'directory-hero'");
  });

  it('imports directory block components from DirectoryBlocks', () => {
    expect(registrySrc).toContain("from './DirectoryBlocks'");
  });

  it('does not register directory-grid as an independent block', () => {
    const entries = registrySrc.slice(registrySrc.indexOf('blockRegistry'));
    expect(entries).not.toContain("'directory-grid'");
  });

  it('registry has 23 total renderable entries (21 Batch A + 2 Phase B + 1 Phase E — directory-hero is server-side)', () => {
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
  });
});

describe('Phase E — Directory block components', () => {
  it('DirectoryBlocks exports only DirectoryCtaBlock (hero is server-side)', () => {
    const src = read('components/blocks/DirectoryBlocks.tsx');
    expect(src).not.toContain('export function DirectoryHeroBlock');
    expect(src).toContain('export function DirectoryCtaBlock');
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

  it('filters visible slots and sorts by order', () => {
    expect(resolverSrc).toContain('.filter((s) => s.visible)');
    expect(resolverSrc).toContain('.sort((a, b) => a.order - b.order)');
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

  it('only emits directory-hero and directory-cta slots', () => {
    const slotChecks = resolverSrc.match(/t === '[\w-]+'/g) || [];
    const types = slotChecks.map((m) => m.replace(/t === '|'/g, ''));
    expect(types).toContain('directory-hero');
    expect(types).toContain('directory-cta');
    expect(types).not.toContain('directory-grid');
  });
});

describe('Phase E — Directory page refactoring', () => {
  it('competitors page uses resolveDirectorySlots', () => {
    const src = read('app/(public)/competitors/page.tsx');
    expect(src).toContain('resolveDirectorySlots');
    expect(src).toContain("'directory:competitors'");
    expect(src).toContain('DirectoryCtaSlot');
    expect(src).not.toContain('slotProp(');
    expect(src).not.toContain('getPublishedSections');
  });

  it('venues page uses resolveDirectorySlots', () => {
    const src = read('app/(public)/venues/page.tsx');
    expect(src).toContain('resolveDirectorySlots');
    expect(src).toContain("'directory:venues'");
    expect(src).toContain('DirectoryCtaSlot');
    expect(src).not.toContain('slotProp(');
    expect(src).not.toContain('getPublishedSections');
  });

  it('competitors page preserves search form, grid, pagination and empty state', () => {
    const src = read('app/(public)/competitors/page.tsx');
    expect(src).toContain('form method="get"');
    expect(src).toContain('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3');
    expect(src).toContain('Pagination');
    expect(src).toContain('No competitors match');
  });

  it('venues page preserves search form, grid, pagination and empty state', () => {
    const src = read('app/(public)/venues/page.tsx');
    expect(src).toContain('form method="get"');
    expect(src).toContain('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3');
    expect(src).toContain('Pagination');
    expect(src).toContain('No venues match');
  });
});

describe('Phase E — Client bridge', () => {
  it('DirectorySlots is a client component', () => {
    const src = read('views/DirectorySlots.tsx');
    expect(src).toMatch(/^'use client'/);
  });

  it('DirectorySlots exports CTA slot renderer using PageRenderer (hero is server-side)', () => {
    const src = read('views/DirectorySlots.tsx');
    expect(src).toContain('PageRenderer');
    expect(src).not.toContain('export function DirectoryHeroSlot');
    expect(src).toContain('export function DirectoryCtaSlot');
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

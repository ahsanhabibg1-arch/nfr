import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Stage 07 Task A: converting the ordering test from source text to behaviour
// means rendering real blocks, and three of them call useRouter during render.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const { PageRenderer } = await import('../components/blocks/PageRenderer');

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Batch A — Block Registry contract', () => {
  const registrySrc = read('components/blocks/registry.tsx');

  it('maps every HOMEPAGE_SECTIONS type to a registry entry', () => {
    const homepage = [
      'editorial-hero', 'latest-coverage', 'quick-access', 'competition',
      'plan-and-watch', 'entertainment', 'events-shopping', 'more-rodeo', 'learning',
      'rich-text-block', 'image-text-block', 'stats-banner', 'cta-banner', 'faq-block', 'newsletter-signup',
    ];
    for (const type of homepage) {
      expect(registrySrc, `missing registry entry: ${type}`).toContain(`'${type}'`);
    }
  });

  it('maps every SECTION_LANDING_SECTIONS type to a registry entry', () => {
    const landing = ['landing-hero', 'landing-featured', 'landing-grid', 'rich-text-block', 'cta-banner'];
    for (const type of landing) {
      expect(registrySrc, `missing registry entry: ${type}`).toContain(`'${type}'`);
    }
  });

  it('exports blockRegistry as a Record<string, component>', () => {
    expect(registrySrc).toContain('export const blockRegistry');
  });
});

describe('Batch A — PageRenderer architecture', () => {
  it('PageRenderer is a client component', () => {
    const src = read('components/blocks/PageRenderer.tsx');
    expect(src).toMatch(/^'use client'/);
  });

  it('PageRenderer renders slots in order via registry lookup', () => {
    /**
     * Stage 07 Task A converted this from source text to behaviour. It used to
     * assert the substring 'slots.map', which broke when the renderer started
     * mapping the SELECTED list (`renderable.map`) instead of the raw one — a
     * change that made ordering stronger, not weaker. Rendering two real blocks
     * and checking their emitted order proves the claim the name makes.
     */
    const html = renderToStaticMarkup(
      React.createElement(PageRenderer, {
        slots: [
          { slot: { id: 'b', sectionType: 'cta-banner', visible: true, order: 1, props: { ctaText: 'B' } }, data: {} },
          { slot: { id: 'a', sectionType: 'cta-banner', visible: true, order: 0, props: { ctaText: 'A' } }, data: {} },
        ],
        editorMode: true,
      }),
    );
    expect(html.indexOf('data-slot-id="a"')).toBeLessThan(html.indexOf('data-slot-id="b"'));
  });

  it('HomeView delegates slot rendering to PageRenderer', () => {
    const src = read('views/HomeView.tsx');
    expect(src).toContain('PageRenderer');
    expect(src).not.toContain('renderCore');
    expect(src).not.toContain('renderPremiumBlock');
  });

  it('HomeView still renders chrome (announcements, global blocks, draft bar)', () => {
    const src = read('views/HomeView.tsx');
    expect(src).toContain('AnnouncementBanner');
    expect(src).toContain('GlobalBlockRenderer');
    expect(src).toContain('IntroBanner');
    expect(src).toContain('DRAFT PREVIEW');
  });
});

describe('Batch A — Section landing slot-order rendering', () => {
  it('SectionLandingView uses resolveSectionLandingSlots', () => {
    const src = read('views/SectionLandingView.tsx');
    expect(src).toContain('resolveSectionLandingSlots');
    expect(src).not.toContain('getSlot(');
  });

  it('SectionLandingSlots renders via PageRenderer', () => {
    const src = read('views/SectionLandingSlots.tsx');
    expect(src).toContain('PageRenderer');
  });

  it('section landing resolver fetches published sections and delegates ordering', () => {
    // Stage 07 Task A: ordering is no longer hand-written here. Behavioural
    // proof lives in tests/stage07-renderer-consolidation.test.ts.
    const src = read('lib/cms/sectionLandingData.ts');
    expect(src).toContain('getPublishedSections');
    expect(src).toContain('selectRenderableSlots');
    expect(src).toContain('section:${sectionKey}');
  });

  it('section landing resolver injects competition disciplines for competition section only', () => {
    const src = read('lib/cms/sectionLandingData.ts');
    expect(src).toContain("sectionKey === 'competition'");
    expect(src).toContain('getAllDisciplines');
  });
});

describe('Batch A — Premium blocks are shared between homepage and landing', () => {
  it('premium block components are in a shared file', () => {
    const src = read('components/blocks/PremiumBlocks.tsx');
    expect(src).toContain('RichTextBlock');
    expect(src).toContain('CtaBanner');
    expect(src).toContain('ImageTextBlock');
    expect(src).toContain('StatsBanner');
    expect(src).toContain('FaqBlock');
    expect(src).toContain('NewsletterSignup');
  });

  it('registry imports premium blocks from shared file', () => {
    const src = read('components/blocks/registry.tsx');
    expect(src).toContain("from './PremiumBlocks'");
  });

  it('section landing registry includes rich-text-block and cta-banner', () => {
    const src = read('lib/cms/sectionRegistry.ts');
    const landingSection = src.slice(src.indexOf('SECTION_LANDING_SECTIONS'));
    expect(landingSection).toContain("type: 'rich-text-block'");
    expect(landingSection).toContain("type: 'cta-banner'");
  });
});

describe('Batch A — Template page keys in admin UI', () => {
  it('ADMIN_VISIBLE_PAGE_KEYS includes all template keys (Task 2 activated)', () => {
    const src = read('lib/cms/sectionRegistry.ts');
    expect(src).toContain('ADMIN_VISIBLE_PAGE_KEYS');
    expect(src).toContain("'template:rodeo-hub'");
    expect(src).toContain("'template:rodeo-edition'");
    expect(src).toContain("'template:discipline'");
    expect(src).toContain("'template:category'");
    expect(src).toContain('DEAD_PAGE_KEYS');
  });

  it('admin website page uses ADMIN_VISIBLE_PAGE_KEYS', () => {
    const src = read('app/admin/(dashboard)/website/page.tsx');
    expect(src).toContain('ADMIN_VISIBLE_PAGE_KEYS');
  });

  it('KNOWN_PAGE_KEYS is still exported for validation (pageLayoutService)', () => {
    const src = read('lib/cms/pageLayoutService.ts');
    expect(src).toContain('KNOWN_PAGE_KEYS');
  });
});

describe('Batch A — Existing routes preserved', () => {
  it('homepage route is unchanged', () => {
    const src = read('app/(public)/page.tsx');
    expect(src).toContain('resolveHomepageSlots');
    expect(src).toContain('HomeView');
  });

  it('section landing route still renders SectionLandingView', () => {
    const src = read('app/(public)/[section]/page.tsx');
    expect(src).toContain('SectionLandingView');
  });

  it('rodeo-events route still renders SectionLandingView and RodeoDirectory', () => {
    const src = read('app/(public)/rodeo-events/page.tsx');
    expect(src).toContain('SectionLandingView');
    expect(src).toContain('RodeoDirectory');
  });
});

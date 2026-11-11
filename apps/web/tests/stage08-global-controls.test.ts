import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Stage 08 Tasks E and F — footer ownership and Appearance controls.
 *
 * SCOPE DISCIPLINE. D-05 (footer ownership) and D-06 (Appearance controls) are
 * both UNAPPROVED owner decisions — the decision register's last approval round
 * (2026-11-09, at Stage 05 authorization) lists both as still requiring
 * approval, and no later round exists. So Stage 08 implements NEITHER decision.
 *
 * What this file does instead:
 *
 *   1. PINS the current behaviour, so the owner's eventual choice is made
 *      against a measured starting point rather than a description, and so a
 *      later stage cannot change footer ownership by accident.
 *   2. Proves the ONE policy-independent defect fix Stage 08 did make: two
 *      Appearance controls that saved and rendered nothing.
 *
 * The decision-ready proposals are in
 * `docs/stage-08/STAGE_08_GLOBAL_CONTROLS_AND_DECISIONS.md`.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const { SiteFooter } = await import('../components/SiteFooter');
const { IntroBanner } = await import('../components/public/IntroBanner');
const { SITE_CONFIG_KEYS } = await import('../lib/cms/siteConfigService');

type FooterConfig = Parameters<typeof SiteFooter>[0]['config'];

function footer(config: FooterConfig = {}, nav?: { sections?: never[]; academy?: never[] }): string {
  return renderToStaticMarkup(
    React.createElement(SiteFooter as never, { config, sections: nav?.sections, academy: nav?.academy } as never),
  );
}

function banner(config: Record<string, unknown>): string {
  return renderToStaticMarkup(React.createElement(IntroBanner as never, { config } as never));
}

/* ── Task E — footer ownership, PINNED not changed ────────────────── */

describe('Stage 08 Task E — current footer ownership is pinned (D-05 unapproved)', () => {
  it('CMS footer columns REPLACE the navigation-driven columns', () => {
    /**
     * This is the defect D-05 exists to resolve, and it is still live: once
     * `SiteConfig('footer').columns` is configured, editing footer links under
     * Header & Nav produces NO public change — "I changed it and nothing
     * happened". Stage 08 does not pick an owner; it pins the behaviour so the
     * decision is taken against a verified fact.
     */
    const withColumns = footer({
      columns: [{ title: 'Custom Column', links: [{ label: 'Custom Link', url: '/custom/' }] }],
    });
    expect(withColumns).toContain('Custom Column');
    expect(withColumns).toContain('Custom Link');
    // The menu-driven headings are gone, not merged.
    expect(withColumns).not.toContain('Editorial Sections');
    expect(withColumns).not.toContain('Spectator Academy');
  });

  it('falls back to the navigation-driven columns when none are configured', () => {
    const noColumns = footer({});
    expect(noColumns).toContain('Editorial Sections');
    expect(noColumns).toContain('Spectator Academy');
  });

  it('ignores a configured column with no title or no links', () => {
    const html = footer({
      columns: [
        { title: '', links: [{ label: 'x', url: '/x/' }] },
        { title: 'No Links', links: [] },
      ] as never,
    });
    // Both are filtered out, so the navigation fallback applies.
    expect(html).toContain('Editorial Sections');
    expect(html).not.toContain('No Links');
  });

  it('force-merges DIRECTORY_LINKS regardless of admin navigation', () => {
    // The second half of D-05's finding: these appear even when the nav table
    // has custom academy links, so an admin cannot remove them.
    const html = footer({});
    // Asserted by LABEL: `next/link` normalises the trailing slash away when
    // rendered outside the App Router, so the href text is not stable here.
    expect(html).toContain('Competitors Directory');
    expect(html).toContain('Venues Directory');
    expect(html).toContain('href="/competitors');
    expect(html).toContain('href="/venues');
  });

  it('keeps the publication-policy column whatever the configuration', () => {
    // Required legal links; D-13 governs their content, not their presence.
    const withColumns = footer({ columns: [{ title: 'Only Mine', links: [{ label: 'L', url: '/l/' }] }] });
    expect(withColumns.toLowerCase()).toContain('polic');
  });

  it('renders editable tagline, description, copyright and status text', () => {
    const html = footer({
      tagline: 'TAGLINE-SENTINEL',
      description: 'DESCRIPTION-SENTINEL',
      copyright: 'COPYRIGHT-SENTINEL',
      statusText: 'STATUS-SENTINEL',
    });
    for (const s of ['TAGLINE-SENTINEL', 'DESCRIPTION-SENTINEL', 'COPYRIGHT-SENTINEL', 'STATUS-SENTINEL']) {
      expect(html, `${s} must reach the public footer`).toContain(s);
    }
  });

  it('falls back to the hardcoded description and copyright when unset', () => {
    const html = footer({});
    expect(html).toContain('An independent editorial publication');
    expect(html).toContain('NFRGuide.com. Independent rodeo publication.');
  });

  it('accepts only https social links', () => {
    const html = footer({
      socialLinks: [
        { platform: 'Good', url: 'https://example.com/good' },
        { platform: 'Insecure', url: 'http://example.com/bad' },
        { platform: 'Scripted', url: 'javascript:alert(1)' },
      ],
    });
    expect(html).toContain('https://example.com/good');
    expect(html).not.toContain('http://example.com/bad');
    expect(html).not.toContain('javascript:');
  });

  it('keeps the independence disclaimer, which no admin control edits', () => {
    // Hardcoded on purpose: it is a legal statement, and D-13 governs legal
    // content. Stage 08 does not move it into an editable field.
    const html = footer({});
    expect(html).toContain('Independent Publication Notice');
    expect(html).toContain('not affiliated with');
  });

  it('is rendered from exactly one place, so no route shows a different footer', () => {
    /**
     * Task E asks whether different routes render inconsistent footer
     * information. They cannot: `SiteFooter` has a single consumer, mounted in
     * the public layout.
     */
    const root = path.join(__dirname, '..');
    const hits: string[] = [];
    for (const dir of ['app', 'components', 'views']) {
      const walk = (d: string): void => {
        for (const entry of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
          const rel = path.join(d, entry.name);
          if (entry.isDirectory()) walk(rel);
          else if (/\.tsx?$/.test(entry.name) && !entry.name.startsWith('SiteFooter')) {
            const src = fs.readFileSync(path.join(root, rel), 'utf8');
            if (/<SiteFooter\b/.test(src)) hits.push(rel);
          }
        }
      };
      walk(dir);
    }
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain('PublicChrome');
  });

  it('no Builder block duplicates footer information', () => {
    // The non-duplication rule: global brand/contact text must not be copied
    // into page-specific layout JSON.
    const registry = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cms', 'sectionRegistry.ts'), 'utf8');
    for (const key of ['copyright', 'tagline', 'socialLinks', 'statusText']) {
      expect(registry, `no block may own the footer's ${key}`).not.toContain(`key: '${key}'`);
    }
  });
});

/* ── Task F — Appearance controls ─────────────────────────────────── */

const APPEARANCE_FIELDS = [
  'introBannerStyle', 'introBannerImageUrl', 'introBannerEyebrow', 'introBannerHeadline',
  'introBannerDescription', 'introBannerCtaLabel', 'introBannerCtaUrl',
  'introBannerCtaSecondaryLabel', 'introBannerCtaSecondaryUrl', 'introBannerFocalX',
  'introBannerFocalY', 'introBannerMobileFocalX', 'introBannerMobileFocalY', 'introBannerZoom',
  'introBannerOverlayDarkness', 'introBannerDesktopHeight', 'introBannerMobileHeight',
  'introBannerTextAlign', 'introBannerVerticalAlign', 'introBannerFullWidth', 'introBannerImageAlt',
];

describe('Stage 08 Task F — the Appearance screen governs only the homepage banner', () => {
  it('has exactly two site-config keys, neither of which is a theme', () => {
    expect([...SITE_CONFIG_KEYS]).toEqual(['footer', 'appearance']);
  });

  it('every one of its 21 fields is an introBanner field', () => {
    /**
     * D-06's central finding, re-verified: the tab is called "Appearance" and
     * implies site-wide control, while all 21 fields configure one banner on one
     * page. The page background and brand gold are literals in `PublicChrome`
     * and the header/footer, and the logo is not editable at all.
     */
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cms', 'siteConfigService.ts'), 'utf8');
    const iface = src.slice(src.indexOf('export interface AppearanceConfig'), src.indexOf('const AppearanceConfigSchema'));
    const declared = [...iface.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
    expect(declared.sort()).toEqual([...APPEARANCE_FIELDS].sort());
    expect(declared.every((f) => f.startsWith('introBanner'))).toBe(true);
  });

  it('is gated OUTSIDE the component, in HomeView [structural]', () => {
    /**
     * A control that saves but does not render, and Stage 08 does NOT change it.
     *
     * The gate is in `HomeView`, not in `IntroBanner`:
     *
     *     {appearance?.introBannerStyle && appearance.introBannerHeadline && <IntroBanner … />}
     *
     * So an operator who uploads a banner image but leaves the headline empty
     * saves successfully and sees nothing on the homepage — and the component
     * itself would have rendered the image quite happily. Changing WHEN the
     * banner appears is a product decision inside D-06's scope, so this is
     * reported and pinned rather than altered.
     */
    const homeView = fs.readFileSync(path.join(__dirname, '..', 'views', 'HomeView.tsx'), 'utf8');
    expect(homeView).toContain('appearance?.introBannerStyle && appearance.introBannerHeadline');
  });

  it('the component itself would happily render an image-only banner', () => {
    // The behavioural half, split out so the title claims only what the body
    // proves — the gate correctly flagged the combined version.
    expect(banner({ introBannerImageUrl: '/img/x.jpg' })).toContain('<img');
    // And it renders nothing only when it has neither a headline nor an image.
    expect(banner({})).toBe('');
  });
});

describe('Stage 08 Task F — the mobile focal point now actually renders', () => {
  const base = {
    introBannerStyle: 'editorial',
    introBannerHeadline: 'Headline',
    introBannerImageUrl: '/img/hero.jpg',
    introBannerFocalX: 10,
    introBannerFocalY: 20,
  };

  it('publishes both focal points, so a phone and a desktop differ', () => {
    /**
     * THE FIX. `introBannerMobileFocalX/Y` had an Admin slider, a Zod schema
     * entry and persistence — and were read by NOTHING. The image used the
     * desktop focal point at every width, so an operator could move both
     * sliders, save successfully, and see no change on a phone.
     *
     * This is a defect fix, not an implementation of D-06: it makes an existing
     * labelled control do what its label says. No theme, token, palette,
     * typography option or brand rule is introduced.
     */
    const html = banner({ ...base, introBannerMobileFocalX: 80, introBannerMobileFocalY: 90 });
    expect(html).toContain('--nfr-focal-desktop:10% 20%');
    expect(html).toContain('--nfr-focal-mobile:80% 90%');
  });

  it('switches between them with a media query, needing no JavaScript', () => {
    // So it is correct in the first painted frame and in the HTML a crawler
    // sees, rather than after hydration.
    const html = banner({ ...base, introBannerMobileFocalX: 80, introBannerMobileFocalY: 90 });
    expect(html).toContain('@media (min-width:768px)');
    expect(html).toContain('object-position:var(--nfr-focal-mobile)');
    expect(html).toContain('object-position:var(--nfr-focal-desktop)');
  });

  it('keeps a literal objectPosition as the fallback', () => {
    const html = banner({ ...base, introBannerMobileFocalX: 80, introBannerMobileFocalY: 90 });
    expect(html).toContain('object-position:10% 20%');
  });

  it('defaults the mobile focal point to the desktop one, so stored configs are unchanged', () => {
    /**
     * The compatibility guarantee. A configuration saved before this fix has no
     * mobile values; defaulting to 50% would have moved its image on every
     * phone. Defaulting to the desktop value reproduces the old rendering
     * exactly.
     */
    const html = banner(base);
    expect(html).toContain('--nfr-focal-desktop:10% 20%');
    expect(html).toContain('--nfr-focal-mobile:10% 20%');
  });

  it('defaults both to centre when nothing is configured', () => {
    const html = banner({ introBannerStyle: 'editorial', introBannerHeadline: 'H', introBannerImageUrl: '/i.jpg' });
    expect(html).toContain('--nfr-focal-desktop:50% 50%');
    expect(html).toContain('--nfr-focal-mobile:50% 50%');
  });

  it('still honours the zoom control alongside the focal points', () => {
    const html = banner({ ...base, introBannerZoom: 120 });
    expect(html).toContain('scale(1.2)');
  });

  it('wires the fixed control through schema and editor [structural]', () => {
    // Task F asks for the complete chain on any control claimed as working.
    // The PUBLIC RENDERING half is proven behaviourally by the tests above;
    // this half records the persistence and Admin-input links, which are
    // structural facts and honestly named as such.
    const svcSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cms', 'siteConfigService.ts'), 'utf8');
    const editorSrc = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'AdminAppearanceEditor.tsx'), 'utf8');
    // Persistence + validation bounds.
    expect(svcSrc).toContain('introBannerMobileFocalX: z.number().min(0).max(100).optional()');
    // Admin input, and it is included in what the editor gathers for saving.
    expect(editorSrc).toContain('introBannerMobileFocalX: mobileFocalX');
    expect(editorSrc).toContain('Mobile Focal X');
    // Public rendering is asserted behaviourally by the tests above.
  });
});

/* ── Global controls stay global ──────────────────────────────────── */

describe('Stage 08 Tasks E/F — global controls do not collide with per-page settings', () => {
  it('no Builder block declares an introBanner property', () => {
    /**
     * D-06 option (b) would migrate these 21 fields into `editorial-hero`
     * props, and that migration is UNAPPROVED. If a block had started carrying
     * them, the homepage hero would have two owners — the violation Stage 02
     * §2.3 already records for this pair.
     */
    const registry = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cms', 'sectionRegistry.ts'), 'utf8');
    expect(registry).not.toContain('introBanner');
  });

  it('the appearance config is read once, by the homepage route only', () => {
    const root = path.join(__dirname, '..');
    const hits: string[] = [];
    const walk = (d: string): void => {
      for (const entry of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
        const rel = path.join(d, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = fs.readFileSync(path.join(root, rel), 'utf8');
          if (/getPublished<AppearanceConfig>/.test(src)) hits.push(rel);
        }
      }
    };
    walk('app');
    expect(hits, 'a second reader would be a second owner').toHaveLength(1);
    expect(hits[0]).toMatch(/page\.tsx$/);
  });
});

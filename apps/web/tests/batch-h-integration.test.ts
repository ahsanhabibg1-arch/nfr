import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Phase H — Preview route reliability', () => {
  const src = read('app/admin/(dashboard)/website/preview/route.ts');

  it('validates against ADMIN_VISIBLE_PAGE_KEYS, not KNOWN_PAGE_KEYS', () => {
    expect(src).toContain('ADMIN_VISIBLE_PAGE_KEYS');
    expect(src).not.toMatch(/\bKNOWN_PAGE_KEYS\b/);
  });

  it('imports publicArticleWhere from fixturePolicy', () => {
    expect(src).toContain("from '@/lib/fixturePolicy'");
    expect(src).toContain('publicArticleWhere');
  });

  it('uses publicArticleWhere() for article slug lookup', () => {
    expect(src).toContain('publicArticleWhere()');
    expect(src).not.toContain("workflowStatus: 'PUBLISHED'");
  });

  it('pageKeyToUrl returns null as its final fallback (no fallthrough to /)', () => {
    const fn = src.slice(src.indexOf('async function pageKeyToUrl'));
    const lines = fn.split('\n').map((l) => l.trim()).filter(Boolean);
    const lastReturn = [...lines].reverse().find((l) => l.startsWith('return'));
    expect(lastReturn).toBe('return null;');
  });

  it('error message for null targetUrl is generic, not article-specific', () => {
    expect(src).not.toContain('No published article available');
    expect(src).toContain('No previewable URL for page key');
  });
});

describe('Phase H — Block registry ↔ sectionRegistry alignment', () => {
  const registry = read('components/blocks/registry.tsx');
  const sectionReg = read('lib/cms/sectionRegistry.ts');

  it('registry has exactly 22 block entries', () => {
    const entries = registry.match(/'[a-z][\w-]+'/g) ?? [];
    const blockEntries = entries.filter((e) => {
      const m = e.replace(/'/g, '');
      return registry.includes(`'${m}':`) && m !== 'use client';
    });
    const uniqueKeys = [...new Set(blockEntries)];
    // 22 after Stage 05 retired newsletter-signup (owner decision D-11): the
    // block has no renderer, so a legacy slot renders nothing at all.
    // 24 after Stage 07 Task F gave `directory-hero` and `directory-grid` real
    // renderers, which is what made their Admin labels truthful.
    expect(uniqueKeys.length).toBe(24);
  });

  it('every blockRegistry key has a SectionDef somewhere in sectionRegistry (except synthetic blocks)', () => {
    const synthetic = new Set(['landing-empty', 'landing-competition-disciplines']);
    const keys = [...registry.matchAll(/'([\w-]+)':/g)].map((m) => m[1]).filter((k) => !synthetic.has(k));
    for (const key of keys) {
      expect(sectionReg, `missing SectionDef for "${key}"`).toContain(`type: '${key}'`);
    }
  });

  it('types with no renderer are intentionally absent from blockRegistry', () => {
    /**
     * REWRITTEN IN STAGE 07. The list used to include `directory-hero` and
     * `directory-grid`, described as "server-only". That was accurate but it was
     * the defect, not the design: the hero's text reached the page only because
     * each route read its props by hand, and the listing block rendered nothing
     * at all while being `required: true`. Task F gave both real renderers.
     *
     * What remains absent, and should be:
     *  - the three detail markers, retired under owner decision D-02 (Task C);
     *  - `landing-stat-pills`, a visibility toggle the resolver reads and skips,
     *    which correctly has no appearance of its own.
     */
    const noRenderer = ['detail-hero', 'detail-body', 'detail-faq', 'landing-stat-pills'];
    for (const type of noRenderer) {
      expect(registry, `"${type}" should not be in blockRegistry`).not.toContain(`'${type}':`);
    }
    const nowRendered = ['directory-hero', 'directory-grid'];
    for (const type of nowRendered) {
      expect(registry, `"${type}" should now be in blockRegistry`).toContain(`'${type}':`);
    }
  });
});

describe('Phase H — Draft/published consistency across page families', () => {
  it('homepage route uses isStaffDraftPreview and branches on draft', () => {
    const src = read('app/(public)/page.tsx');
    expect(src).toContain('isStaffDraftPreview');
    expect(src).toContain('getDraftSections');
    expect(src).toContain('getPublishedSections');
  });

  it('section landing resolver uses conditional fetch pattern', () => {
    const src = read('lib/cms/sectionLandingData.ts');
    expect(src).toContain('options?.draft ? getDraftSections : getPublishedSections');
  });

  it('directory resolver uses conditional fetch pattern', () => {
    const src = read('lib/cms/directoryData.ts');
    expect(src).toContain('options?.draft ? getDraftSections : getPublishedSections');
  });

  it('detail template resolver uses conditional fetch pattern', () => {
    const src = read('lib/cms/detailTemplateData.ts');
    expect(src).toContain('options?.draft ? getDraftSections : getPublishedSections');
  });

  it('all six public routes import isStaffDraftPreview', () => {
    const routes = [
      'app/(public)/page.tsx',
      'app/(public)/[section]/page.tsx',
      'app/(public)/rodeo-events/page.tsx',
      'app/(public)/competitors/page.tsx',
      'app/(public)/venues/page.tsx',
      'app/(public)/articles/[slug]/page.tsx',
    ];
    for (const route of routes) {
      const src = read(route);
      expect(src, `${route} missing isStaffDraftPreview`).toContain('isStaffDraftPreview');
    }
  });
});

describe('Phase H — SEO isolation verification', () => {
  const routes = [
    'app/(public)/[section]/page.tsx',
    'app/(public)/rodeo-events/page.tsx',
    'app/(public)/competitors/page.tsx',
    'app/(public)/venues/page.tsx',
    'app/(public)/articles/[slug]/page.tsx',
  ];

  for (const route of routes) {
    it(`${route} generateMetadata does not reference draft/preview`, () => {
      const src = read(route);
      const metaFn = src.slice(
        src.indexOf('export async function generateMetadata'),
        src.indexOf('export default'),
      );
      expect(metaFn).not.toContain('draftMode');
      expect(metaFn).not.toContain('getDraftSections');
      expect(metaFn).not.toContain('isStaffDraftPreview');
    });
  }

  it('homepage generateMetadata does not reference draft/preview', () => {
    const src = read('app/(public)/page.tsx');
    const metaFn = src.slice(
      src.indexOf('export async function generateMetadata'),
      src.indexOf('export default'),
    );
    expect(metaFn).not.toContain('draftMode');
    expect(metaFn).not.toContain('getDraftSections');
    expect(metaFn).not.toContain('isStaffDraftPreview');
  });
});

describe('Phase H — Preview security completeness', () => {
  const src = read('app/admin/(dashboard)/website/preview/route.ts');

  it('calls requireUser before enabling draftMode', () => {
    const fnBody = src.slice(src.indexOf('async function GET'));
    const userCall = fnBody.indexOf('await requireUser()');
    const enableCall = fnBody.indexOf('.enable()');
    expect(userCall).toBeGreaterThan(-1);
    expect(userCall).toBeLessThan(enableCall);
  });

  it('checks system.config permission', () => {
    expect(src).toContain("'system.config'");
    expect(src).toContain('roleHasPermission');
  });

  it('verifies draft exists before enabling draftMode', () => {
    const draftCheck = src.indexOf('draftSections');
    const enable = src.indexOf('.enable()');
    expect(draftCheck).toBeLessThan(enable);
  });

  it('sets noindex in both meta tag and response header', () => {
    expect(src).toContain('noindex, nofollow');
    expect(src).toContain("'X-Robots-Tag': 'noindex'");
  });

  it('sets no-store cache control', () => {
    expect(src).toContain('no-store, no-cache, must-revalidate');
  });
});

describe('Phase H — Template page keys active (Task 2)', () => {
  it('ADMIN_VISIBLE_PAGE_KEYS includes all 4 template keys', () => {
    const src = read('lib/cms/sectionRegistry.ts');
    expect(src).toContain('DEAD_PAGE_KEYS');
    expect(src).toContain('ADMIN_VISIBLE_PAGE_KEYS');
    expect(src).toContain("'template:rodeo-hub'");
    expect(src).toContain("'template:rodeo-edition'");
    expect(src).toContain("'template:discipline'");
    expect(src).toContain("'template:category'");
  });

  it('preview route imports ADMIN_VISIBLE_PAGE_KEYS not KNOWN_PAGE_KEYS', () => {
    const src = read('app/admin/(dashboard)/website/preview/route.ts');
    expect(src).toContain("import { ADMIN_VISIBLE_PAGE_KEYS }");
    expect(src).not.toContain("import { KNOWN_PAGE_KEYS }");
  });
});

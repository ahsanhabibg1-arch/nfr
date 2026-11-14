import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getPageFamily,
  buildDefaultSlots,
  getAvailableBlockTypes,
  getSectionsForFamily,
  getAllFamilies,
  canAddBlock,
  countBlockInstances,
  KNOWN_PAGE_KEYS,
  ADMIN_VISIBLE_PAGE_KEYS,
  HOMEPAGE_SECTIONS,
  SECTION_LANDING_SECTIONS,
  DETAIL_TEMPLATE_SECTIONS,
  DIRECTORY_SECTIONS,
} from '../lib/cms/sectionRegistry';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/* ── 1. sectionRegistry pure-function tests ──────────────────────── */

describe('Phase I — getPageFamily mapping', () => {
  it('maps homepage', () => expect(getPageFamily('homepage')).toBe('homepage'));
  it('maps section keys', () => {
    expect(getPageFamily('section:competition')).toBe('section-landing');
    expect(getPageFamily('section:rodeo-events')).toBe('section-landing');
  });
  it('maps template keys', () => {
    expect(getPageFamily('template:article')).toBe('detail-template');
  });
  it('maps directory keys', () => {
    expect(getPageFamily('directory:competitors')).toBe('directory');
    expect(getPageFamily('directory:venues')).toBe('directory');
  });
  it('returns unknown for unrecognized prefixes', () => {
    expect(getPageFamily('garbage:foo')).toBe('unknown');
  });
});

describe('Phase I — buildDefaultSlots', () => {
  for (const family of getAllFamilies()) {
    it(`${family} produces slots with unique IDs`, () => {
      const slots = buildDefaultSlots(family);
      const ids = slots.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it(`${family} produces slots with sequential order`, () => {
      const slots = buildDefaultSlots(family);
      for (let i = 0; i < slots.length; i++) {
        expect(slots[i].order).toBe(i);
      }
    });

    it(`${family} produces all-visible slots by default`, () => {
      const slots = buildDefaultSlots(family);
      expect(slots.every((s) => s.visible)).toBe(true);
    });

    it(`${family} produces no duplicate sectionTypes`, () => {
      const slots = buildDefaultSlots(family);
      const types = slots.map((s) => s.sectionType);
      expect(new Set(types).size).toBe(types.length);
    });
  }
});

describe('Phase I — canAddBlock and countBlockInstances', () => {
  it('allows adding a block when under maxInstances', () => {
    const def = HOMEPAGE_SECTIONS.find((d) => d.type === 'editorial-hero')!;
    const slots: SectionSlot[] = [];
    expect(canAddBlock(slots, def)).toBe(true);
  });

  it('rejects adding a block when at maxInstances', () => {
    const def = HOMEPAGE_SECTIONS.find((d) => d.type === 'editorial-hero')!;
    const slots: SectionSlot[] = [
      { id: 'a', sectionType: 'editorial-hero', visible: true, order: 0, props: {} },
    ];
    expect(canAddBlock(slots, def)).toBe(false);
  });

  it('always allows when maxInstances is undefined', () => {
    const def = { ...HOMEPAGE_SECTIONS[0], type: 'test', maxInstances: undefined };
    const slots: SectionSlot[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`, sectionType: 'test', visible: true, order: i, props: {},
    }));
    expect(canAddBlock(slots, def)).toBe(true);
  });

  it('counts block instances correctly', () => {
    const slots: SectionSlot[] = [
      { id: 'a', sectionType: 'cta-banner', visible: true, order: 0, props: {} },
      { id: 'b', sectionType: 'rich-text-block', visible: true, order: 1, props: {} },
      { id: 'c', sectionType: 'cta-banner', visible: true, order: 2, props: {} },
    ];
    expect(countBlockInstances(slots, 'cta-banner')).toBe(2);
    expect(countBlockInstances(slots, 'rich-text-block')).toBe(1);
    expect(countBlockInstances(slots, 'nonexistent')).toBe(0);
  });
});

/* ── 2. Page key governance ──────────────────────────────────────── */

describe('Phase I — KNOWN_PAGE_KEYS governance', () => {
  it('has exactly 16 keys (Tasks 2+3 added competitor/venue; PM-05 added info-page)', () => {
    // 16 since PM-05 added `template:info-page`. These counts are tripwires:
    // they exist so a page key cannot appear without somebody stating why.
    expect(KNOWN_PAGE_KEYS.length).toBe(16);
  });

  it('ADMIN_VISIBLE_PAGE_KEYS has all 16 keys (Tasks 2+3 activated all templates)', () => {
    expect(ADMIN_VISIBLE_PAGE_KEYS.length).toBe(16);
  });

  it('every ADMIN_VISIBLE key is in KNOWN_PAGE_KEYS', () => {
    const known = new Set<string>(KNOWN_PAGE_KEYS);
    for (const k of ADMIN_VISIBLE_PAGE_KEYS) {
      expect(known.has(k), `${k} not in KNOWN_PAGE_KEYS`).toBe(true);
    }
  });

  it('all template keys are in ADMIN_VISIBLE (Task 2 activated)', () => {
    const visible = new Set<string>(ADMIN_VISIBLE_PAGE_KEYS);
    const templateKeys = ['template:rodeo-hub', 'template:rodeo-edition', 'template:discipline', 'template:category'];
    for (const k of templateKeys) {
      expect(visible.has(k), `template key ${k} should be in ADMIN_VISIBLE`).toBe(true);
    }
  });

  it('every ADMIN_VISIBLE key maps to a known page family', () => {
    for (const k of ADMIN_VISIBLE_PAGE_KEYS) {
      expect(getPageFamily(k)).not.toBe('unknown');
    }
  });
});

/* ── 3. Section family completeness ──────────────────────────────── */

describe('Phase I — Section family completeness', () => {
  it('homepage sections match registry expectations (9 core + 6 premium)', () => {
    expect(HOMEPAGE_SECTIONS.length).toBe(15);
  });

  /**
   * STAGE 07 UPDATED THESE THREE COUNTS. Each is a deliberate act, recorded so a
   * silent drift still fails review:
   *
   *  - section-landing 6 → 7: Task E registered
   *    `landing-competition-disciplines`, which previously rendered two
   *    hardcoded headings on /competition/ with no definition anywhere, so no
   *    administrator could edit, hide or reorder it.
   *  - detail-template 5 → 9: Task D added the four approved appendage regions
   *    under owner decision D-02 Option B ("shared structured editorial
   *    templates, with optional approved appendage sections").
   *  - directory 3 → 4: Task F added `rich-text-block`, so a directory page has
   *    at least one genuine presentation choice.
   *
   * All five additions are library-only via `excludeFromDefaultsIn`, so no
   * default layout and no live page changed. Proven in
   * tests/stage07-detail-template.test.ts and
   * tests/stage07-directory-template.test.ts.
   */
  it('section-landing has 7 section defs', () => {
    expect(SECTION_LANDING_SECTIONS.length).toBe(7);
  });

  it('detail-template has 9 section defs', () => {
    expect(DETAIL_TEMPLATE_SECTIONS.length).toBe(9);
  });

  it('directory has 4 section defs', () => {
    expect(DIRECTORY_SECTIONS.length).toBe(4);
  });

  it('getAllFamilies returns 4 families', () => {
    const families = getAllFamilies();
    expect(families).toHaveLength(4);
    expect(families).toContain('homepage');
    expect(families).toContain('section-landing');
    expect(families).toContain('detail-template');
    expect(families).toContain('directory');
  });
});

/* ── 4. pageLayoutService validation logic (source inspection) ──── */

describe('Phase I — pageLayoutService validation contracts', () => {
  const src = read('lib/cms/pageLayoutService.ts');

  it('validateSectionTypes checks against family-specific block types', () => {
    // Stage 05: save validation uses getKnownSectionTypes, which INCLUDES
    // retired blocks so a layout stored before a retirement stays editable.
    // The block library still uses getAvailableBlockTypes, which excludes them.
    // Behaviour proven in tests/stage05-content-source.test.ts.
    expect(src).toContain('getKnownSectionTypes(family)');
    expect(src).toContain('known.has(s.sectionType)');
  });

  /* Stage 04 Task C replaced the string-only prop checks with validation driven
   * by each block's own PropDef. These five assertions tracked the OLD
   * implementation's literals; they now track the new layer's markers. The
   * GUARANTEES they were protecting are proven behaviourally — by 34 tests in
   * tests/stage04-property-validation.test.ts, which drive the real saveDraft
   * service and assert what it accepts and rejects. */

  it('enforces a maximum property length', () => {
    expect(src).toContain('MAX_PROP_CHARS');
    expect(src).toContain('exceeds ${MAX_PROP_CHARS} characters');
  });

  it('rejects dangerous markup in text props, beyond just <script>', () => {
    expect(src).toContain('UNSAFE_MARKUP');
    expect(src).toContain('disallowed markup');
  });

  it('validates URL props against a same-site path or http(s) URL', () => {
    expect(src).toContain('SAFE_URL');
    expect(src).toContain('relative path or an http(s) URL');
  });

  it('rejects unsafe URL schemes', () => {
    expect(src).toContain('UNSAFE_SCHEME');
    expect(src).toContain('disallowed URL scheme');
  });

  it('validateBlockLimits enforces the family-aware instance cap', () => {
    expect(src).toContain('resolveMaxInstances');
    expect(src).toContain('exceeds max instances');
  });

  it('validateUniqueIds rejects duplicate block IDs', () => {
    expect(src).toContain('Duplicate block ID');
  });

  it('validatePageKey checks against KNOWN_PAGE_KEYS', () => {
    expect(src).toContain('KNOWN_PAGE_KEYS');
    expect(src).toContain('Unknown page key');
  });

  it('saveDraft requires system.config permission', () => {
    expect(src).toContain("need(actor)");
    expect(src).toContain("'system.config'");
  });

  it('publishLayout copies draftSections to publishedSections', () => {
    const fn = src.slice(src.indexOf('async function publishLayout'), src.indexOf('async function resetDraftToPublished'));
    expect(fn).toContain('JSON.parse(JSON.stringify(layout.draftSections))');
    expect(fn).toContain('publishedSections:');
  });

  it('resetDraftToPublished copies publishedSections to draftSections', () => {
    expect(src).toContain('draftSections: JSON.parse(JSON.stringify(layout.publishedSections))');
  });

  // Stage 03 Task G moved the shared logic into `resolveSections`, so these two
  // no longer slice the individual function bodies. The BEHAVIOUR they protect —
  // falling back to family defaults for a missing layout, an empty layout, and a
  // database failure — is now proven directly, with the three cases
  // distinguished, in tests/stage03-layout-observability.test.ts.
  it('section retrieval falls back to buildDefaultSlots on missing/empty layout', () => {
    expect(src).toContain('buildDefaultSlots(getPageFamily(pageKey))');
  });

  it('both published and draft retrieval route through the shared resolver', () => {
    expect(src).toContain("resolveSections(pageKey, 'publishedSections')");
    expect(src).toContain("resolveSections(pageKey, 'draftSections')");
  });
});

/* ── 5. Preview route integration contracts ──────────────────────── */

describe('Phase I — Preview URL resolution for all page families', () => {
  const src = read('app/admin/(dashboard)/website/preview/route.ts');

  it('handles homepage → /', () => {
    expect(src).toContain("if (pageKey === 'homepage') return '/'");
  });

  it('handles section: prefix → /{sectionKey}/', () => {
    expect(src).toContain("pageKey.startsWith('section:')");
    expect(src).toContain("pageKey.replace('section:', '')");
  });

  it('handles template:article → /articles/{slug}/', () => {
    expect(src).toContain("pageKey === 'template:article'");
    expect(src).toContain('/articles/');
    expect(src).toContain('latest.slug');
  });

  it('handles directory:competitors → /competitors/', () => {
    expect(src).toContain("'directory:competitors'");
    expect(src).toContain("'/competitors/'");
  });

  it('handles directory:venues → /venues/', () => {
    expect(src).toContain("'directory:venues'");
    expect(src).toContain("'/venues/'");
  });

  it('falls through to null for unknown keys', () => {
    const fn = src.slice(src.indexOf('async function pageKeyToUrl'));
    const lines = fn.split('\n').map((l) => l.trim()).filter(Boolean);
    const lastReturn = [...lines].reverse().find((l) => l.startsWith('return'));
    expect(lastReturn).toBe('return null;');
  });
});

/* ── 6. Server/client boundary verification ──────────────────────── */

describe('Phase I — Server/client boundaries', () => {
  it('registry.tsx is a client component', () => {
    const src = read('components/blocks/registry.tsx');
    expect(src).toMatch(/^'use client'/);
  });

  it('PageRenderer.tsx is a client component', () => {
    const src = read('components/blocks/PageRenderer.tsx');
    expect(src).toMatch(/^'use client'/);
  });

  it('DirectorySlots.tsx is a client component', () => {
    const src = read('views/DirectorySlots.tsx');
    expect(src).toMatch(/^'use client'/);
  });

  it('client components do not import server-only modules (only import type)', () => {
    const clientFiles = [
      'components/blocks/registry.tsx',
      'components/blocks/PageRenderer.tsx',
      'views/DirectorySlots.tsx',
      'views/SectionLandingSlots.tsx',
      'views/ArticleAppendageSlots.tsx',
      'views/HomeView.tsx',
    ];
    for (const file of clientFiles) {
      const src = read(file);
      const imports = src.match(/^import .+ from .+$/gm) ?? [];
      for (const imp of imports) {
        if (imp.includes('server-only')) {
          throw new Error(`${file} imports server-only directly`);
        }
        if (imp.includes("from '@/lib/cms/") && !imp.startsWith('import type')) {
          const mod = imp.match(/from '(@\/lib\/cms\/[^']+)'/)?.[1];
          if (mod) {
            const modPath = mod.replace('@/', '').replace(/'/g, '') + '.ts';
            try {
              const modSrc = read(modPath);
              if (modSrc.includes("import 'server-only'")) {
                throw new Error(`${file} imports server-only module ${mod} without 'import type'`);
              }
            } catch (e) {
              if ((e as Error).message.includes('imports server-only')) throw e;
            }
          }
        }
      }
    }
  });

  const serverModules = [
    'lib/cms/previewGuard.ts',
    'lib/cms/directoryData.ts',
    'lib/cms/sectionLandingData.ts',
    'lib/cms/detailTemplateData.ts',
    'lib/cms/homepageData.ts',
    'lib/cms/pageLayoutService.ts',
  ];

  for (const mod of serverModules) {
    it(`${mod} is server-only`, () => {
      const src = read(mod);
      expect(src).toMatch(/^import 'server-only'/);
    });
  }
});

/* ── 7. Resolver draft-branching consistency ─────────────────────── */

describe('Phase I — Resolver draft-branching consistency', () => {
  const resolvers = [
    { name: 'sectionLandingData', path: 'lib/cms/sectionLandingData.ts' },
    { name: 'directoryData', path: 'lib/cms/directoryData.ts' },
    { name: 'detailTemplateData', path: 'lib/cms/detailTemplateData.ts' },
  ];

  for (const { name, path: p } of resolvers) {
    it(`${name} imports both getPublishedSections and getDraftSections`, () => {
      const src = read(p);
      expect(src).toContain('getPublishedSections');
      expect(src).toContain('getDraftSections');
    });

    it(`${name} accepts a draft option`, () => {
      /**
       * Stage 07 Task F widened `directoryData`'s options from an inline
       * `{ draft?: boolean }` to a named `ResolveDirectoryOptions` interface so
       * it could also carry the route's listing data. The draft capability is
       * unchanged, and draft/published ISOLATION is proven behaviourally in
       * tests/stage07-directory-template.test.ts.
       */
      const src = read(p);
      expect(src).toMatch(/options\?: \{ draft\?: boolean \}|options\?: Resolve\w+Options/);
      expect(src).toContain('draft?: boolean');
    });

    it(`${name} uses conditional fetch pattern`, () => {
      const src = read(p);
      expect(src).toContain('options?.draft ? getDraftSections : getPublishedSections');
    });

    it(`${name} delegates visibility and ordering to the single shared authority`, () => {
      // Stage 07 Task A. Behavioural proof: tests/stage07-renderer-consolidation.test.ts.
      const src = read(p);
      expect(src).toContain('selectRenderableSlots');
      expect(src).not.toContain('.filter((s) => s.visible)');
    });
  }
});

/* ── 8. Build compatibility signals ──────────────────────────────── */

describe('Phase I — Build compatibility', () => {
  it('next.config exists', () => {
    expect(fs.existsSync(path.join(root, 'next.config.mjs'))).toBe(true);
  });

  it('tsconfig.json exists with strict mode', () => {
    const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('no circular imports between page routes and resolvers', () => {
    const routes = [
      'app/(public)/page.tsx',
      'app/(public)/[section]/page.tsx',
      'app/(public)/competitors/page.tsx',
      'app/(public)/venues/page.tsx',
      'app/(public)/articles/[slug]/page.tsx',
    ];
    for (const route of routes) {
      const src = read(route);
      expect(src, `${route} should not import from another route`).not.toMatch(/from '@\/app\//);
    }
  });
});

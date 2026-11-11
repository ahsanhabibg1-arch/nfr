import { describe, it, expect } from 'vitest';

/**
 * Stage 06 Task 7 + Task 12.15 — page-family capability honesty.
 *
 * BEHAVIOUR PROVEN: all 15 Builder page keys carry a capability label that
 * matches what the code actually does, and the block-support classification
 * matches the real renderer registry.
 *
 * The cross-check in the first block is the load-bearing one.
 * `pageCapability.ts` mirrors the renderer list rather than importing the
 * client registry, and a stale mirror would make the Admin confidently label a
 * block "Editable" when nothing renders it. This asserts the mirror in BOTH
 * directions, so adding or removing a renderer without updating the
 * classification fails here instead of misleading an operator.
 */

const {
  RENDERED_SECTION_TYPES, SYSTEM_OWNED_SECTION_TYPES, NON_RENDERER_CONSUMERS,
  classifyBlockSupport, BLOCK_SUPPORT_LABELS, BLOCK_SUPPORT_HELP,
  PAGE_CAPABILITIES, getPageCapability, PAGE_COMPOSITION_LABELS,
} = await import('../lib/cms/pageCapability');

const { blockRegistry } = await import('../components/blocks/registry');
const {
  KNOWN_PAGE_KEYS, HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS,
  DETAIL_TEMPLATE_SECTIONS, DIRECTORY_SECTIONS, getPageFamily, getKnownSectionTypes,
} = await import('../lib/cms/sectionRegistry');

const FAMILY_DEFS: Record<string, readonly { type: string }[]> = {
  homepage: HOMEPAGE_SECTIONS,
  'section-landing': SECTION_LANDING_SECTIONS,
  'detail-template': DETAIL_TEMPLATE_SECTIONS,
  directory: DIRECTORY_SECTIONS,
};

/* ── The mirror must not drift ─────────────────────────────────────── */

describe('Stage 06 — the renderer mirror matches the real registry', () => {
  it('lists exactly the types blockRegistry renders', () => {
    expect([...RENDERED_SECTION_TYPES].sort()).toEqual(Object.keys(blockRegistry).sort());
  });

  it('claims no renderer that does not exist', () => {
    for (const t of RENDERED_SECTION_TYPES) {
      expect(blockRegistry[t], `mirror claims a renderer for "${t}" but none is registered`).toBeTruthy();
    }
  });

  it('omits no renderer that does exist', () => {
    for (const t of Object.keys(blockRegistry)) {
      expect(RENDERED_SECTION_TYPES, `"${t}" has a renderer but is missing from the mirror`).toContain(t);
    }
  });

  it('mirrors 24 renderers after Stage 07 Task F', () => {
    /**
     * 22 after Stage 05 retired the newsletter; 24 after Stage 07 Task F gave
     * `directory-hero` and `directory-grid` real renderers. Changing this number
     * is a deliberate act: the two assertions above already prove the mirror
     * equals `Object.keys(blockRegistry)` in both directions, so this one exists
     * only to make a silent drift in the TOTAL visible in review.
     */
    expect(RENDERED_SECTION_TYPES.length).toBe(24);
  });
});

/* ── Block classification ──────────────────────────────────────────── */

describe('Stage 06 Task 3 — block support classification', () => {
  it('classifies a type with a definition and a renderer as canvas-editable', () => {
    expect(classifyBlockSupport('latest-coverage', true)).toBe('canvas');
    expect(classifyBlockSupport('cta-banner', true)).toBe('canvas');
  });

  it('classifies the retired newsletter as retired, never as editable', () => {
    expect(classifyBlockSupport('newsletter-signup', true)).toBe('retired');
  });

  it('classifies the three inert detail markers as RETIRED, not unsupported', () => {
    /**
     * REWRITTEN IN STAGE 07. These three were `unsupported` because they had a
     * definition and no renderer. Task C retired them under owner decision D-02
     * ("confirmed for removal rather than promotion"), and retirement is the
     * more useful classification: `unsupported` tells an operator "no renderer
     * exists for this block", while `retired` tells them it is expected, that
     * visitors see nothing, and that removing it is safe.
     *
     * Reaching this verdict also required fixing `classifyBlockSupport`, which
     * checked retirement in only the `homepage` and `section-landing` families
     * and would have mislabelled every detail-family retirement.
     */
    for (const t of ['detail-hero', 'detail-body', 'detail-faq']) {
      expect(classifyBlockSupport(t, true), t).toBe('retired');
    }
  });

  it('classifies the directory hero and listing as canvas-editable', () => {
    /**
     * REWRITTEN IN STAGE 07 TASK F. `directory-hero` was `server-composed` — its
     * text reached the page because each route read the props by hand, so it was
     * neither "not rendered" nor clickable on the canvas. `directory-grid` was
     * `unsupported` AND `required: true`, so it could be neither removed nor
     * seen. Both now have real renderers, so both are ordinary canvas blocks.
     */
    expect(classifyBlockSupport('directory-hero', true)).toBe('canvas');
    expect(classifyBlockSupport('directory-grid', true)).toBe('canvas');
  });

  it('no block type is left classified `unsupported`', () => {
    /**
     * The Stage 07 completion criterion: "Unsupported blocks are resolved or
     * safely retired." Derived from the live registry rather than a list, so a
     * block added later with no renderer fails here instead of shipping as a
     * confident lie in the Admin.
     */
    const unsupported: string[] = [];
    for (const family of ['homepage', 'section-landing', 'detail-template', 'directory']) {
      for (const type of getKnownSectionTypes(family).keys()) {
        if (classifyBlockSupport(type, true) === 'unsupported') unsupported.push(`${family}/${type}`);
      }
    }
    expect(unsupported).toEqual([]);
  });

  it('classifies landing-stat-pills as a resolver flag', () => {
    expect(classifyBlockSupport('landing-stat-pills', true)).toBe('resolver-flag');
  });

  it('classifies resolver-injected blocks as system-owned', () => {
    for (const t of SYSTEM_OWNED_SECTION_TYPES) {
      expect(classifyBlockSupport(t, false), t).toBe('system');
    }
  });

  it('classifies a renderer with no definition as system-owned', () => {
    expect(classifyBlockSupport('landing-empty', false)).toBe('system');
  });

  it('classifies an entirely unknown type as unsupported', () => {
    expect(classifyBlockSupport('nonexistent-block-type', false)).toBe('unsupported');
  });

  it('gives every support level a label and a plain-language explanation', () => {
    for (const level of Object.keys(BLOCK_SUPPORT_LABELS)) {
      expect(BLOCK_SUPPORT_LABELS[level as keyof typeof BLOCK_SUPPORT_LABELS]).toBeTruthy();
      expect(BLOCK_SUPPORT_HELP[level as keyof typeof BLOCK_SUPPORT_HELP]?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('every non-renderer consumer names the code that consumes it', () => {
    for (const [type, entry] of Object.entries(NON_RENDERER_CONSUMERS)) {
      expect(entry.via, `${type} must name its consumer so the claim is checkable`).toMatch(/\.(ts|tsx)/);
      expect(entry.note.length).toBeGreaterThan(40);
    }
  });
});

/* ── Every definition in every family is classified ────────────────── */

describe('Stage 06 — no registry definition is left unclassified', () => {
  const PROP_TYPES = new Set(['text', 'textarea', 'number', 'boolean', 'select', 'color', 'url', 'image', 'featured', 'richtext']);

  for (const [family, defs] of Object.entries(FAMILY_DEFS)) {
    it(`classifies every ${family} block into a known support level`, () => {
      const valid = new Set(Object.keys(BLOCK_SUPPORT_LABELS));
      for (const def of defs) {
        if (PROP_TYPES.has(def.type)) continue; // not a section type
        const support = classifyBlockSupport(def.type, true);
        expect(valid.has(support), `${family}/${def.type} -> ${support}`).toBe(true);
      }
    });
  }

  it('reports no block as editable unless something actually renders or consumes it', () => {
    for (const defs of Object.values(FAMILY_DEFS)) {
      for (const def of defs) {
        if (classifyBlockSupport(def.type, true) !== 'canvas') continue;
        expect(blockRegistry[def.type], `"${def.type}" is labelled Editable but has no renderer`).toBeTruthy();
      }
    }
  });
});

/* ── Page capability for all 15 keys (Task 12.15) ──────────────────── */

describe('Stage 06 Task 12.15 — all 15 page keys carry an honest capability label', () => {
  it('covers every known page key', () => {
    expect(Object.keys(PAGE_CAPABILITIES).sort()).toEqual([...KNOWN_PAGE_KEYS].sort());
    expect(KNOWN_PAGE_KEYS.length).toBe(15);
  });

  it('gives each one a level, a summary and a fixed-parts list', () => {
    for (const key of KNOWN_PAGE_KEYS) {
      const cap = getPageCapability(key);
      expect(cap.pageKey).toBe(key);
      expect(PAGE_COMPOSITION_LABELS[cap.level], key).toBeTruthy();
      expect(cap.summary.length, key).toBeGreaterThan(40);
      expect(cap.fixed.length, key).toBeGreaterThan(0);
    }
  });

  it('marks the homepage and the five section landings as fully composed', () => {
    const composed = KNOWN_PAGE_KEYS.filter((k) => getPageCapability(k).level === 'composed');
    expect(composed).toEqual([
      'homepage',
      'section:competition',
      'section:entertainment',
      'section:events-shopping',
      'section:plan-watch',
      'section:rodeo-events',
    ]);
  });

  it('marks all seven detail templates as template-plus-appendage, never composed', () => {
    const detail = KNOWN_PAGE_KEYS.filter((k) => getPageFamily(k) === 'detail-template');
    expect(detail.length).toBe(7);
    for (const k of detail) {
      expect(getPageCapability(k).level, k).toBe('template-appendage');
      expect(getPageCapability(k).summary).toContain('shared structured template');
    }
  });

  it('marks both directories as limited', () => {
    const dirs = KNOWN_PAGE_KEYS.filter((k) => getPageFamily(k) === 'directory');
    expect(dirs.length).toBe(2);
    for (const k of dirs) expect(getPageCapability(k).level, k).toBe('directory-limited');
  });

  it('tells a detail-template operator that the record content is not theirs to move', () => {
    const cap = getPageCapability('template:article');
    expect(cap.fixed.join(' ')).toContain('come from the CMS record');
    expect(cap.fixed.join(' ')).toContain('below the structured content');
  });

  it('tells a directory operator the list itself is generated', () => {
    /**
     * Stage 07 Task F changed WHO builds the search form — it moved from the
     * route into the required `directory-grid` block — so the wording changed
     * with it. The claim under test is unchanged: the operator must be told the
     * entries come from the database and that the search, filters and
     * pagination are not theirs to remove.
     */
    const cap = getPageCapability('directory:venues');
    const fixed = cap.fixed.join(' ');
    expect(fixed).toContain('entries come from the database');
    expect(fixed).toContain('search form, filters and pagination');
    expect(fixed).toContain('cannot be removed');
  });

  it('tells a directory operator what they CAN now change', () => {
    // The other half of honesty: Stage 07 Task F made the heading, the listing
    // position, its column count and surrounding text genuinely editable, and a
    // capability summary that omitted that would understate the page.
    const summary = getPageCapability('directory:competitors').summary;
    expect(summary).toContain('heading');
    expect(summary).toContain('columns');
  });

  it('falls back to a real capability for an unknown page key rather than throwing', () => {
    const cap = getPageCapability('made:up');
    expect(cap.level).toBeTruthy();
    expect(cap.summary).toBeTruthy();
  });

  it('family assignment agrees with the registry, not a second copy of the rules', () => {
    for (const key of KNOWN_PAGE_KEYS) {
      expect(getPageCapability(key).family).toBe(getPageFamily(key));
    }
  });
});

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

// ── Shared Utility Tests ──────────────────────────────────────────────

describe('Task 1 — Shared slot utilities (slotUtils.ts)', () => {
  const src = read('lib/cms/slotUtils.ts');

  it('exports pickedThenAuto', () => {
    expect(src).toContain('export async function pickedThenAuto');
  });

  /**
   * Stage 06 converted the six `numProp`/`idListProp` tests below from source
   * greps to calls.
   *
   * They asserted strings like `'export function numProp'` and
   * `'Math.min(max, Math.max(min, Math.round(n)))'` against the slotUtils FILE.
   * Stage 06 moved those two pure readers into `lib/cms/slotProps.ts` so the
   * Admin's Content Source panel could share one implementation with the
   * resolvers — `slotUtils` re-exports them, so every caller and every
   * behaviour was unchanged. All six still failed, because they were testing
   * where the characters lived rather than what the functions do.
   *
   * They now import through `slotUtils`, which proves the behaviour AND that
   * the re-export surface the resolvers depend on is intact.
   */
  it('exports a working numProp', async () => {
    const { numProp } = await import('../lib/cms/slotUtils');
    expect(typeof numProp).toBe('function');
    expect(numProp({ n: 3 }, 'n', 0, 0, 10)).toBe(3);
  });

  it('exports a working idListProp', async () => {
    const { idListProp } = await import('../lib/cms/slotUtils');
    expect(typeof idListProp).toBe('function');
    expect(idListProp({ ids: 'a,b' }, 'ids')).toEqual(['a', 'b']);
  });

  it('pickedThenAuto uses getPublishedArticlesByIds for manual picks', () => {
    expect(src).toContain('getPublishedArticlesByIds');
    expect(src).toContain("idListProp(props, 'featuredIds')");
  });

  it('pickedThenAuto fills remaining slots with auto callback', () => {
    // Stage 05 gave pickedThenAuto an optional SelectionContext, so the auto
    // call now passes a combined exclude list. Behaviour is proven in
    // tests/stage05-content-source.test.ts.
    expect(src).toContain('const fill = await auto(need, exclude)');
  });

  it('pickedThenAuto returns empty for zero count', () => {
    expect(src).toContain('if (count <= 0) return []');
  });

  it('pickedThenAuto slices result to count', () => {
    // Stage 05 replaced the trailing slice with an explicit bounded loop that
    // also rejects duplicates the auto resolver may return. Count boundaries
    // are proven behaviourally in tests/stage05-content-source.test.ts.
    expect(src).toContain('if (result.length === count) break;');
  });

  it('idListProp handles array input', async () => {
    const { idListProp } = await import('../lib/cms/slotUtils');
    expect(idListProp({ ids: ['a', 'b'] }, 'ids')).toEqual(['a', 'b']);
    expect(idListProp({ ids: ['a', '', 'b'] }, 'ids'), 'drops empties').toEqual(['a', 'b']);
  });

  it('idListProp handles comma-separated string input', async () => {
    const { idListProp } = await import('../lib/cms/slotUtils');
    expect(idListProp({ ids: 'a,b,c' }, 'ids')).toEqual(['a', 'b', 'c']);
    expect(idListProp({ ids: ' a , b ' }, 'ids'), 'trims').toEqual(['a', 'b']);
  });

  it('idListProp returns empty array for missing key', async () => {
    const { idListProp } = await import('../lib/cms/slotUtils');
    expect(idListProp({}, 'ids')).toEqual([]);
    expect(idListProp({ ids: null }, 'ids')).toEqual([]);
    expect(idListProp({ ids: 42 }, 'ids')).toEqual([]);
  });

  it('numProp clamps to min/max bounds', async () => {
    const { numProp } = await import('../lib/cms/slotUtils');
    expect(numProp({ n: 99 }, 'n', 6, 0, 12), 'above max').toBe(12);
    expect(numProp({ n: -5 }, 'n', 6, 0, 12), 'below min').toBe(0);
    expect(numProp({ n: 7 }, 'n', 6, 0, 12), 'in range').toBe(7);
    expect(numProp({ n: 3.6 }, 'n', 6, 0, 12), 'rounds').toBe(4);
  });

  it('numProp returns fallback for non-numeric input', async () => {
    const { numProp } = await import('../lib/cms/slotUtils');
    expect(numProp({}, 'n', 6, 0, 12)).toBe(6);
    expect(numProp({ n: 'abc' }, 'n', 6, 0, 12)).toBe(6);
    expect(numProp({ n: '' }, 'n', 6, 0, 12)).toBe(6);
    expect(numProp({ n: null }, 'n', 6, 0, 12)).toBe(6);
    expect(numProp({ n: '8' }, 'n', 6, 0, 12), 'numeric strings still parse').toBe(8);
  });

  it('is a server-only module', () => {
    expect(src).toContain("import 'server-only'");
  });
});

// ── Homepage Regression Tests ─────────────────────────────────────────

describe('Task 1 — Homepage regression', () => {
  const src = read('lib/cms/homepageData.ts');

  it('homepage imports shared utilities from slotUtils', () => {
    expect(src).toContain("from './slotUtils'");
    expect(src).toContain('pickedThenAuto');
    expect(src).toContain('numProp');
    expect(src).toContain('idListProp');
  });

  it('homepage re-exports shared utilities for external consumers', () => {
    expect(src).toContain("export { numProp, idListProp, pickedThenAuto, createSelectionContext } from './slotUtils'");
  });

  it('homepage does NOT define its own pickedThenAuto', () => {
    expect(src).not.toContain('async function pickedThenAuto');
  });

  it('homepage does NOT define its own numProp', () => {
    expect(src).not.toMatch(/^export function numProp/m);
    expect(src).not.toMatch(/^function numProp/m);
  });

  it('homepage does NOT define its own idListProp', () => {
    expect(src).not.toMatch(/^export function idListProp/m);
    expect(src).not.toMatch(/^function idListProp/m);
  });

  it('homepage still uses pickedThenAuto for editorial blocks', () => {
    expect(src).toContain('pickedThenAuto(slot.props, count');
  });

  it('homepage still uses idListProp for hero featured pick', () => {
    expect(src).toContain("idListProp(heroSlot.props, 'featuredIds')");
  });

  it('homepage still resolves hero exclusion', () => {
    expect(src).toContain('shownInHero');
  });
});

// ── Section Landing Featured Picker Tests ─────────────────────────────

describe('Task 1 — Section Landing featured article picker', () => {
  const registrySrc = read('lib/cms/sectionRegistry.ts');
  const resolverSrc = read('lib/cms/sectionLandingData.ts');

  it('landing-featured SectionDef includes featuredIds in editableProps', () => {
    const start = registrySrc.indexOf("'landing-featured'");
    const blockChunk = registrySrc.slice(start, start + 500);
    expect(blockChunk).toContain("key: 'featuredIds'");
    expect(blockChunk).toContain("type: 'featured'");
  });

  it('landing-featured has featuredIds in defaultProps', () => {
    const landingFeatured = registrySrc.slice(registrySrc.indexOf("'landing-featured'"));
    const nextType = landingFeatured.indexOf("type: '", 10);
    const block = landingFeatured.slice(0, nextType > 0 ? nextType : 200);
    expect(block).toContain("featuredIds: ''");
  });

  it('section landing resolver imports pickedThenAuto from slotUtils', () => {
    expect(resolverSrc).toContain("from './slotUtils'");
    expect(resolverSrc).toContain('pickedThenAuto');
  });

  it('section landing resolver imports idListProp from slotUtils', () => {
    expect(resolverSrc).toContain('idListProp');
  });

  it('section landing resolver checks for picked featured articles', () => {
    expect(resolverSrc).toContain("idListProp(featuredSlot.props, 'featuredIds')");
  });

  it('section landing resolver uses pickedThenAuto when articles are picked', () => {
    expect(resolverSrc).toContain('pickedThenAuto(featuredSlot.props, 1');
  });

  it('section landing resolver falls back to newest when no picks', () => {
    expect(resolverSrc).toContain('sectionArticles[0] ?? null');
  });

  it('section landing resolver excludes featured from secondary stories', () => {
    expect(resolverSrc).toContain('sectionArticles.filter((a) => a.id !== featuredStory?.id)');
  });

  it('section landing resolver preserves draft branch', () => {
    expect(resolverSrc).toContain('options?.draft ? getDraftSections : getPublishedSections');
  });

  it('section landing resolver preserves section-scoped filtering', () => {
    expect(resolverSrc).toContain('getPublishedArticlesBySection(sectionMeta.categoryKey)');
  });

  it('other section landing blocks are not affected', () => {
    expect(resolverSrc).toContain("t === 'landing-hero'");
    expect(resolverSrc).toContain("t === 'landing-grid'");
    expect(resolverSrc).toContain('secondaryStories');
  });

  it('competition discipline injection is preserved', () => {
    expect(resolverSrc).toContain("sectionKey === 'competition'");
    expect(resolverSrc).toContain('getAllDisciplines');
  });

  it('empty state injection is preserved', () => {
    expect(resolverSrc).toContain('landing-empty');
    expect(resolverSrc).toContain('sectionArticles.length === 0');
  });
});

// ── Builder UI Compatibility Tests ────────────────────────────────────

describe('Task 1 — Builder UI compatibility', () => {
  const editorSrc = read('views/admin/AdminPageLayoutEditor.tsx');

  it('Builder renders featured picker for type === featured', () => {
    expect(editorSrc).toContain("prop.type === 'featured'");
  });

  it('Builder imports featured candidates action', () => {
    expect(editorSrc).toContain('listFeaturedCandidatesAction');
  });

  it('Builder imports article details resolver', () => {
    expect(editorSrc).toContain('resolveArticleDetailsAction');
  });
});

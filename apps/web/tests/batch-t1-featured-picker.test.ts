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

  it('exports numProp', () => {
    expect(src).toContain('export function numProp');
  });

  it('exports idListProp', () => {
    expect(src).toContain('export function idListProp');
  });

  it('pickedThenAuto uses getPublishedArticlesByIds for manual picks', () => {
    expect(src).toContain('getPublishedArticlesByIds');
    expect(src).toContain("idListProp(props, 'featuredIds')");
  });

  it('pickedThenAuto fills remaining slots with auto callback', () => {
    expect(src).toContain('const fill = await auto(need, picked.map((a) => a.id))');
  });

  it('pickedThenAuto returns empty for zero count', () => {
    expect(src).toContain('if (count <= 0) return []');
  });

  it('pickedThenAuto slices result to count', () => {
    expect(src).toContain('.slice(0, count)');
  });

  it('idListProp handles array input', () => {
    expect(src).toContain('Array.isArray(raw)');
  });

  it('idListProp handles comma-separated string input', () => {
    expect(src).toContain("raw.split(',')");
  });

  it('idListProp returns empty array for missing key', () => {
    expect(src).toContain('return []');
  });

  it('numProp clamps to min/max bounds', () => {
    expect(src).toContain('Math.min(max, Math.max(min, Math.round(n)))');
  });

  it('numProp returns fallback for non-numeric input', () => {
    expect(src).toContain('if (!Number.isFinite(n)) return fallback');
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
    expect(src).toContain("export { numProp, idListProp, pickedThenAuto } from './slotUtils'");
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

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Stage 03 Task A — registry contract tests.
 *
 * BEHAVIOUR PROVEN: for every block type the Page Builder offers, every editable
 * property it advertises either produces observable output in the rendered HTML,
 * or is listed in an explicit exemption register with a reason.
 *
 * This is the invariant the project previously lacked. Ten properties shipped
 * inert behind 1549 passing tests because the suite asserted that symbols existed
 * in source files rather than that editing a property changed the page.
 *
 * Coverage is derived from the live registry, so a block or property added later
 * is covered automatically and cannot bypass the contract.
 */

// Three blocks call useRouter during render; it is unavailable outside Next's
// app router. Mocked so the real components can be rendered.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const { blockRegistry } = await import('../components/blocks/registry');
const {
  HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS, DETAIL_TEMPLATE_SECTIONS, DIRECTORY_SECTIONS,
} = await import('../lib/cms/sectionRegistry');
const {
  BLOCK_FIXTURES, EXEMPTIONS, RESOLVER_LEVEL_PROP_TYPES, SELECT_EXPECTATIONS, sentinelFor,
} = await import('./support/stage03BlockFixtures');

import type { SectionSlot } from '../lib/cms/sectionRegistry';

/* ── Derive coverage from the live registry ─────────────────────────── */

interface PropDefLike { key: string; type: string; label?: string }
interface SectionDefLike { type: string; editableProps?: PropDefLike[]; defaultProps?: Record<string, unknown> }

const ALL_DEFS: SectionDefLike[] = [
  ...HOMEPAGE_SECTIONS, ...SECTION_LANDING_SECTIONS, ...DETAIL_TEMPLATE_SECTIONS, ...DIRECTORY_SECTIONS,
] as unknown as SectionDefLike[];

/** First definition wins, mirroring getAvailableBlockTypes' dedupe. */
const UNIQUE_DEFS: SectionDefLike[] = (() => {
  const seen = new Set<string>();
  return ALL_DEFS.filter((d) => (seen.has(d.type) ? false : (seen.add(d.type), true)));
})();

function makeSlot(type: string, props: Record<string, unknown>): SectionSlot {
  return { id: `stage03-${type}`, sectionType: type, visible: true, order: 0, props } as SectionSlot;
}

function renderBlock(type: string, props: Record<string, unknown>, data: Record<string, unknown>): string {
  const Component = blockRegistry[type];
  if (!Component) throw new Error(`no renderer for "${type}"`);
  return renderToStaticMarkup(React.createElement(Component, { slot: makeSlot(type, props), data }));
}

/** What the contract expects of one declared property. */
type Verdict =
  | { kind: 'exempt'; reason: string }
  | { kind: 'sentinel'; value: string; expect: string };

function classify(blockType: string, prop: PropDefLike): Verdict {
  const exemption = EXEMPTIONS[`${blockType}.${prop.key}`] ?? EXEMPTIONS[blockType];
  if (exemption) return { kind: 'exempt', reason: exemption.reason };
  if (!blockRegistry[blockType]) return { kind: 'exempt', reason: 'NO_RENDERER' };
  if (RESOLVER_LEVEL_PROP_TYPES.has(prop.type)) return { kind: 'exempt', reason: 'VIA_RESOLVER' };
  if (prop.type === 'select') {
    const s = SELECT_EXPECTATIONS[blockType]?.[prop.key];
    if (!s) return { kind: 'exempt', reason: 'VIA_RESOLVER' };
    return { kind: 'sentinel', ...s };
  }
  return { kind: 'sentinel', ...sentinelFor(prop.type, prop.key) };
}

/* ── 1. Registry shape invariants ───────────────────────────────────── */

describe('Stage 03 Task A — registry shape', () => {
  it('derives coverage from the live registry, not a hardcoded list', () => {
    expect(UNIQUE_DEFS.length).toBeGreaterThan(20);
    expect(Object.keys(blockRegistry).length).toBeGreaterThan(20);
  });

  it('records the current registry/renderer split so a drift is visible', () => {
    const declared = UNIQUE_DEFS.map((d) => d.type);
    const rendered = Object.keys(blockRegistry);
    const noRenderer = declared.filter((t) => !rendered.includes(t));
    const undeclared = rendered.filter((t) => !declared.includes(t));

    /**
     * Current, documented state. Changing these numbers is a deliberate act and
     * must update the Stage 02 inventory too.
     *
     * STAGE 07 MOVED ALL FIVE. Family-array entries 29 -> 35, because three
     * shared blocks now serve the detail family and one serves the directory
     * family (each a REFERENCE to a single definition object, not a copy -
     * asserted in stage04-property-fixes.test.ts) and Task E registered
     * `landing-competition-disciplines`. Distinct declared types 27 -> 28, from
     * that same registration. Renderers 22 -> 24, from Task F giving the
     * directory hero and listing real renderers.
     *
     * The `noRenderer` list is the important one: it shrank from seven types to
     * four, and every remaining entry is there by design rather than by
     * omission - three retired markers (D-02) and one visibility toggle.
     */
    expect(ALL_DEFS.length).toBe(35);
    expect(declared.length).toBe(28);
    expect(rendered.length).toBe(24);
    expect(noRenderer.sort()).toEqual([
      'detail-body', 'detail-faq', 'detail-hero', 'landing-stat-pills', 'newsletter-signup',
    ]);
    // `landing-competition-disciplines` left this list in Stage 07 Task E: it
    // has a real definition now, so it is no longer a renderer without one.
    expect(undeclared.sort()).toEqual(['landing-empty']);
  });

  it('reports multi-family block definitions, and proves each is ONE object', () => {
    /**
     * Stage 03 named this "duplicate block definitions (known defect)" because
     * at the time `rich-text-block` and `cta-banner` were each declared TWICE,
     * as divergent literals, and first-wins dedupe silently discarded one.
     * Stage 04 Task B fixed that by making each a single object referenced from
     * both families, which left the COUNT above one without the defect.
     *
     * Stage 07 Task D extends that pattern to four shared blocks across four
     * families, so the count alone can no longer distinguish the fixed design
     * from the original defect. Object identity can, and does.
     */
    const byType = new Map<string, typeof ALL_DEFS>();
    for (const d of ALL_DEFS) {
      if (!byType.has(d.type)) byType.set(d.type, []);
      byType.get(d.type)!.push(d);
    }
    const multiFamily = [...byType.entries()].filter(([, defs]) => defs.length > 1).map(([t]) => t).sort();
    expect(multiFamily).toEqual(['cta-banner', 'faq-block', 'image-text-block', 'rich-text-block']);

    for (const type of multiFamily) {
      const defs = byType.get(type)!;
      for (const d of defs) {
        expect(d, `${type} must be the same object in every family`).toBe(defs[0]);
      }
    }
  });

  it('every registered renderer is a function', () => {
    for (const [type, Component] of Object.entries(blockRegistry)) {
      expect(typeof Component, type).toBe('function');
    }
  });
});

/* ── 2. The contract: every declared prop is consumed or exempt ─────── */

describe('Stage 03 Task A — declared properties reach rendered output', () => {
  const cases: { blockType: string; prop: PropDefLike }[] = [];
  for (const def of UNIQUE_DEFS) {
    for (const prop of def.editableProps ?? []) cases.push({ blockType: def.type, prop });
  }

  it('enumerates every declared property across every block type', () => {
    expect(cases.length).toBeGreaterThan(70);
  });

  for (const { blockType, prop } of cases) {
    const verdict = classify(blockType, prop);

    if (verdict.kind === 'exempt') {
      it(`${blockType}.${prop.key} — exempt (${verdict.reason}) and registered`, () => {
        const entry = EXEMPTIONS[`${blockType}.${prop.key}`] ?? EXEMPTIONS[blockType];
        const byType = RESOLVER_LEVEL_PROP_TYPES.has(prop.type) || prop.type === 'select';
        // An exemption must come from the register or from a resolver-level prop
        // type. Anything else would be a silent exemption.
        expect(Boolean(entry) || byType, `${blockType}.${prop.key} is exempt but unregistered`).toBe(true);
        if (entry) expect(entry.note.length, `${blockType}.${prop.key} needs a reason`).toBeGreaterThan(20);
      });
      continue;
    }

    it(`${blockType}.${prop.key} — editing it changes the rendered HTML`, () => {
      const fixture = BLOCK_FIXTURES[blockType];
      expect(fixture, `no fixture for ${blockType}`).toBeDefined();

      const withSentinel = renderBlock(blockType, { ...(fixture.baseProps ?? {}), [prop.key]: verdict.value }, fixture.data);
      expect(withSentinel, `${blockType} rendered nothing`).not.toBe('');
      expect(withSentinel, `${blockType}.${prop.key} did not reach output`).toContain(verdict.expect);

      // And the sentinel must be absent when the prop is not set — otherwise the
      // assertion above could pass on unrelated static markup.
      const without = renderBlock(blockType, { ...(fixture.baseProps ?? {}) }, fixture.data);
      expect(without, `${blockType}.${prop.key} appears even when unset`).not.toContain(verdict.expect);
    });
  }
});

/* ── 3. Exemptions cannot silently expand, and must not go stale ────── */

describe('Stage 03 Task A — exemption register integrity', () => {
  it('every register entry corresponds to a real declared block or property', () => {
    const declaredTypes = new Set(UNIQUE_DEFS.map((d) => d.type));
    const declaredPairs = new Set<string>();
    for (const d of UNIQUE_DEFS) for (const p of d.editableProps ?? []) declaredPairs.add(`${d.type}.${p.key}`);

    for (const key of Object.keys(EXEMPTIONS)) {
      const ok = declaredPairs.has(key) || declaredTypes.has(key);
      expect(ok, `stale exemption "${key}" — no such block type or property`).toBe(true);
    }
  });

  it('no register entry is stale: a prop with a renderer that now works must be removed', () => {
    const stale: string[] = [];
    for (const [key, entry] of Object.entries(EXEMPTIONS)) {
      if (entry.reason !== 'INERT') continue;
      const [blockType, propKey] = key.split('.');
      if (!propKey || !blockRegistry[blockType]) continue;
      const def = UNIQUE_DEFS.find((d) => d.type === blockType);
      const prop = def?.editableProps?.find((p) => p.key === propKey);
      if (!prop || RESOLVER_LEVEL_PROP_TYPES.has(prop.type)) continue;

      const fixture = BLOCK_FIXTURES[blockType];
      if (!fixture) continue;
      const s = sentinelFor(prop.type, prop.key);
      const html = renderBlock(blockType, { ...(fixture.baseProps ?? {}), [prop.key]: s.value }, fixture.data);
      if (html.includes(s.expect)) stale.push(key);
    }
    expect(stale, 'these props now reach output — remove them from EXEMPTIONS').toEqual([]);
  });

  it('no INERT exemptions remain — Stage 04 Task D cleared all three', () => {
    // Stage 03 registered 3 component-level inert properties. Stage 04 fixed
    // every one: landing-hero.heroImageUrl and landing-grid.articleCount are now
    // proven by the contract cases above, and detail-related.title moved to
    // VIA_RESOLVER because it is consumed through resolver data.
    const inert = Object.entries(EXEMPTIONS).filter(([, e]) => e.reason === 'INERT').map(([k]) => k).sort();
    expect(inert).toEqual([]);
  });

  it('every exemption carries a reason and the NO_RENDERER set is closed', () => {
    const noRenderer = Object.entries(EXEMPTIONS).filter(([, e]) => e.reason === 'NO_RENDERER').map(([k]) => k);
    /**
     * 8 before Stage 07, 4 after. Task F resolved the four directory entries by
     * giving `directory-hero` and `directory-grid` real renderers, so their
     * props moved to VIA_RESOLVER and resolver-level. The remaining four belong
     * to the three detail markers retired under owner decision D-02, which keep
     * a definition (and therefore an exemption) so a stored layout containing
     * one stays saveable.
     *
     * Every remaining NO_RENDERER entry now records WHY it is permanent, rather
     * than deferring to a later stage.
     */
    expect(noRenderer.length).toBe(4);
    for (const key of noRenderer) {
      expect(EXEMPTIONS[key].resolvedBy, `${key} must record its retirement`).toContain('retired');
    }
    const byDesign = Object.entries(EXEMPTIONS).filter(([, e]) => e.reason === 'BY_DESIGN').map(([k]) => k);
    expect(byDesign).toEqual(['landing-stat-pills']);
    for (const [key, entry] of Object.entries(EXEMPTIONS)) {
      expect(entry.note.length, `${key} needs a substantive note`).toBeGreaterThan(20);
    }
  });
});

/* ── 4. Negative control — the contract can actually fail ───────────── */

describe('Stage 03 Task A — negative control', () => {
  it('a working property FAILS the contract when its value is not passed through', () => {
    // Simulates the defect class this suite exists to catch: a renderer that
    // ignores a declared prop. `rich-text-block.title` works today; a renderer
    // that drops it must not satisfy the assertion.
    const BrokenBlock: React.FC<{ slot: SectionSlot; data: Record<string, unknown> }> = () =>
      React.createElement('section', null, 'static markup with no prop');

    const s = sentinelFor('text', 'title');
    const html = renderToStaticMarkup(
      React.createElement(BrokenBlock, { slot: makeSlot('rich-text-block', { title: s.value }), data: {} }),
    );
    expect(html).not.toContain(s.expect);
  });

  it('the real rich-text-block renderer DOES pass its title through', () => {
    const s = sentinelFor('text', 'title');
    const html = renderBlock('rich-text-block', { title: s.value, body: 'b' }, {});
    expect(html).toContain(s.expect);
  });

  it('an unregistered block type has no renderer', () => {
    expect(blockRegistry['stage03-no-such-block']).toBeUndefined();
  });
});

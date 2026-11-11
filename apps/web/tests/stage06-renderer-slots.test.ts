import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Stage 06 Task 4.1 + 4.6 + Task 9 — slot identity and unknown-block handling.
 *
 * BEHAVIOUR PROVEN, by rendering the real `PageRenderer` with the real block
 * registry:
 *
 *   1. Editor mode emits a stable `data-slot-id` container per slot, which is
 *      what click-to-select resolves against.
 *   2. Public output is UNCHANGED — no wrapper, no attributes. This is the
 *      assertion that protects the live site from the canvas feature.
 *   3. A slot whose type has no renderer is skipped safely in public, and
 *      explained to the operator in the canvas.
 *   4. A block that renders nothing still gets a container, so it can be
 *      selected instead of being invisible and unreachable.
 */

const { PageRenderer, __resetUnrenderableLogForTests } = await import('../components/blocks/PageRenderer');
const { blockRegistry } = await import('../components/blocks/registry');
import type { SectionSlot } from '../lib/cms/sectionRegistry';

function slot(sectionType: string, id: string, props: Record<string, unknown> = {}): SectionSlot {
  return { id, sectionType, visible: true, order: 0, props } as SectionSlot;
}

function render(slots: SectionSlot[], editorMode?: boolean): string {
  return renderToStaticMarkup(
    React.createElement(PageRenderer, {
      slots: slots.map((s) => ({ slot: s, data: {} })),
      editorMode,
    }),
  );
}

/** A type with a real renderer, chosen from the registry rather than assumed. */
const RENDERABLE = 'cta-banner';
/** A definition with no renderer — Stage 05 left these for Stage 07 removal. */
const UNRENDERABLE = 'detail-hero';

beforeEach(() => {
  __resetUnrenderableLogForTests();
});

describe('Stage 06 — the test premises hold', () => {
  it('the renderable type really is registered', () => {
    expect(blockRegistry[RENDERABLE]).toBeTruthy();
  });

  it('the unrenderable type really is NOT registered', () => {
    expect(blockRegistry[UNRENDERABLE]).toBeUndefined();
  });

  it('the retired newsletter type is still not registered', () => {
    expect(blockRegistry['newsletter-signup']).toBeUndefined();
  });
});

/* ── Public output must not change ─────────────────────────────────── */

describe('Stage 06 — public rendering is untouched by the canvas feature', () => {
  it('emits no data-slot-id on the public site', () => {
    const html = render([slot(RENDERABLE, 'slot-1')]);
    expect(html).not.toContain('data-slot-id');
    expect(html).not.toContain('data-nfr-slot');
  });

  it('emits no wrapper element around a block', () => {
    const html = render([slot(RENDERABLE, 'slot-1')]);
    expect(html.startsWith('<div data-nfr-slot')).toBe(false);
  });

  it('public and editor output differ ONLY by the wrapper', () => {
    const pub = render([slot(RENDERABLE, 'slot-1')]);
    const edit = render([slot(RENDERABLE, 'slot-1')], true);
    expect(edit).toContain(pub);
    expect(edit.length).toBeGreaterThan(pub.length);
  });

  it('defaults to public when no editor mode is given and no provider is present', () => {
    const html = render([slot(RENDERABLE, 'slot-1')]);
    expect(html).not.toContain('data-slot-id');
  });
});

/* ── Editor mode emits selectable containers ───────────────────────── */

describe('Stage 06 Task 4.1 — editor mode gives every slot a stable data-slot-id', () => {
  it('emits the slot id as an attribute', () => {
    const html = render([slot(RENDERABLE, 'slot-abc')], true);
    expect(html).toContain('data-slot-id="slot-abc"');
  });

  it('emits the slot type too, which the outline label uses', () => {
    const html = render([slot(RENDERABLE, 'slot-abc')], true);
    expect(html).toContain(`data-slot-type="${RENDERABLE}"`);
  });

  it('emits one container per slot, with distinct ids', () => {
    const html = render([slot(RENDERABLE, 'a'), slot(RENDERABLE, 'b'), slot(RENDERABLE, 'c')], true);
    expect(html.match(/data-nfr-slot/g)?.length).toBe(3);
    for (const id of ['a', 'b', 'c']) expect(html).toContain(`data-slot-id="${id}"`);
  });

  it('keeps the ids the Builder stores, so selection survives a refresh', () => {
    const id = '6c972912-55c8-44ad-ac84-bde18f9cc36b';
    expect(render([slot(RENDERABLE, id)], true)).toContain(`data-slot-id="${id}"`);
  });
});

/* ── Unknown / retired blocks (Task 9) ─────────────────────────────── */

describe('Stage 06 Task 9 — a slot with no renderer is handled safely', () => {
  it('renders nothing at all for a public visitor', () => {
    const html = render([slot(UNRENDERABLE, 'slot-x')]);
    expect(html).toBe('');
  });

  it('does not throw', () => {
    expect(() => render([slot(UNRENDERABLE, 'slot-x')])).not.toThrow();
    expect(() => render([slot(UNRENDERABLE, 'slot-x')], true)).not.toThrow();
  });

  it('leaks no internal detail to a visitor', () => {
    const html = render([slot(UNRENDERABLE, 'slot-x')]);
    expect(html).not.toContain(UNRENDERABLE);
    expect(html).not.toContain('blockRegistry');
    expect(html).not.toContain('renderer');
  });

  it('explains it to the operator in the canvas instead', () => {
    const html = render([slot(UNRENDERABLE, 'slot-x')], true);
    expect(html).toContain('does not render on the live site');
    expect(html).toContain(UNRENDERABLE);
  });

  it('still gives it a selectable container, so it can be removed', () => {
    const html = render([slot(UNRENDERABLE, 'slot-x')], true);
    expect(html).toContain('data-slot-id="slot-x"');
    expect(html).toContain('data-nfr-unrenderable="1"');
  });

  it('does not stop later blocks from rendering', () => {
    const html = render([slot(UNRENDERABLE, 'bad'), slot(RENDERABLE, 'good')], true);
    expect(html).toContain('data-slot-id="good"');
  });

  it('logs once per type, not once per occurrence', () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg?: unknown) => { warnings.push(String(msg)); };
    try {
      render([slot(UNRENDERABLE, 'a'), slot(UNRENDERABLE, 'b'), slot(UNRENDERABLE, 'c')]);
    } finally {
      console.warn = original;
    }
    expect(warnings.length, 'diagnostic logging must be bounded').toBe(1);
    expect(warnings[0]).toContain(UNRENDERABLE);
  });

  it('names the type in the log, so the diagnostic is actionable', () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg?: unknown) => { warnings.push(String(msg)); };
    try {
      render([slot('totally-made-up-type', 'z')]);
    } finally {
      console.warn = original;
    }
    expect(warnings[0]).toContain('totally-made-up-type');
    expect(warnings[0]).toContain('PageRenderer');
  });
});

/* ── The retired newsletter stays inert (Stage 05 guarantee) ───────── */

describe('Stage 06 — retiring the newsletter block still collects nothing', () => {
  it('renders no form or input in public mode', () => {
    const html = render([slot('newsletter-signup', 'nl-1')]);
    expect(html).toBe('');
  });

  it('renders no form or input in the canvas either — only the operator notice', () => {
    const html = render([slot('newsletter-signup', 'nl-1')], true);
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    expect(html.toLowerCase()).not.toContain('type="email"');
    expect(html).toContain('does not render on the live site');
  });
});

/* ── Ordering and visibility — REWRITTEN IN STAGE 07 TASK A ───────────
 *
 * Stage 06 asserted the opposite of what follows: that `PageRenderer` neither
 * filtered hidden slots nor sorted by `order`, because both lived in the four
 * resolvers. Stage 07 Task A consolidated the rule into
 * `lib/cms/slotSelection.ts` and made this renderer its final authority, per
 * the approved Stage 02 architecture §3.3.
 *
 * The two tests below are the SAME behaviours, re-asserted against the new
 * contract rather than deleted. The Stage 06 versions are preserved as the
 * `legacySelect` oracle in `tests/stage07-slot-selection.test.ts`, which proves
 * the consolidated rule produces identical output for every stored layout.
 */

describe('Stage 07 Task A — ordering and visibility are now enforced here', () => {
  it('sorts slots by `order`, not by the order they were passed in', () => {
    const second = { ...slot(RENDERABLE, 'second'), order: 1 } as SectionSlot;
    const first = { ...slot(RENDERABLE, 'first'), order: 0 } as SectionSlot;
    // Passed deliberately backwards.
    const html = render([second, first], true);
    expect(html.indexOf('data-slot-id="first"')).toBeLessThan(html.indexOf('data-slot-id="second"'));
  });

  it('still renders an already-ordered list in that order', () => {
    const a = { ...slot(RENDERABLE, 'a'), order: 0 } as SectionSlot;
    const b = { ...slot(RENDERABLE, 'b'), order: 1 } as SectionSlot;
    const html = render([a, b], true);
    expect(html.indexOf('data-slot-id="a"')).toBeLessThan(html.indexOf('data-slot-id="b"'));
  });

  it('filters a hidden slot out of PUBLIC html', () => {
    const hidden = { ...slot(RENDERABLE, 'hidden-slot'), visible: false } as SectionSlot;
    expect(render([hidden])).toBe('');
  });

  it('filters a hidden slot out of the CANVAS too, so the canvas matches the live page', () => {
    /**
     * The canvas mounts the real page. A hidden block that showed up only in
     * the canvas would make the operator's preview disagree with what visitors
     * get — the class of lie this programme exists to remove. Visibility is
     * toggled from the structure tree, which reads the stored layout directly
     * and is unaffected by this filter.
     */
    const hidden = { ...slot(RENDERABLE, 'hidden-slot'), visible: false } as SectionSlot;
    expect(render([hidden], true)).toBe('');
  });

  it('keeps the visible slots when one in the middle is hidden', () => {
    const first = { ...slot(RENDERABLE, 'first'), order: 0 } as SectionSlot;
    const middle = { ...slot(RENDERABLE, 'middle'), order: 1, visible: false } as SectionSlot;
    const last = { ...slot(RENDERABLE, 'last'), order: 2 } as SectionSlot;
    const html = render([first, middle, last], true);
    expect(html).toContain('data-slot-id="first"');
    expect(html).not.toContain('data-slot-id="middle"');
    expect(html).toContain('data-slot-id="last"');
  });

  it('does not log an unrenderable warning for a slot it filtered out', () => {
    /**
     * Selection happens before the renderer lookup, so a hidden slot of an
     * unsupported type produces no diagnostic noise — it was never going to
     * render for a reason that has nothing to do with the registry.
     */
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg?: unknown) => { warnings.push(String(msg)); };
    try {
      render([{ ...slot(UNRENDERABLE, 'hidden-bad'), visible: false } as SectionSlot]);
    } finally {
      console.warn = original;
    }
    expect(warnings).toEqual([]);
  });

  it('applying selection twice renders exactly what applying it once renders', () => {
    const slots: SectionSlot[] = [
      { ...slot(RENDERABLE, 'c'), order: 2 } as SectionSlot,
      { ...slot(RENDERABLE, 'a'), order: 0 } as SectionSlot,
      { ...slot(RENDERABLE, 'hidden'), order: 1, visible: false } as SectionSlot,
      { ...slot(RENDERABLE, 'b'), order: 1 } as SectionSlot,
    ];
    const once = render(slots, true);
    // Pre-select, then hand the renderer the already-selected list.
    const preSelected = slots.filter((s) => s.visible).sort((x, y) => x.order - y.order);
    expect(render(preSelected, true)).toBe(once);
  });
});

import { describe, it, expect } from 'vitest';
import {
  isSlotVisible,
  compareSlotOrder,
  selectRenderableSlots,
  selectRenderableResolved,
  orderAfter,
  findContractViolations,
} from '../lib/cms/slotSelection';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

/**
 * Stage 07 Task A — the single authoritative visibility/order contract.
 *
 * These are behavioural tests: every one calls the real function and asserts a
 * computed outcome. None inspects source text.
 *
 * The first block is the EQUIVALENCE suite required by the directive ("before
 * modifying behavior, write tests for the current valid cases"). It pins the
 * consolidated function against a literal transcription of the five hand-written
 * copies it replaces, so a divergence in public output fails here rather than
 * reaching a page.
 */

function slot(partial: Partial<SectionSlot> & { sectionType: string }): SectionSlot {
  return {
    id: partial.id ?? `${partial.sectionType}-${partial.order ?? 0}`,
    sectionType: partial.sectionType,
    visible: partial.visible ?? true,
    order: partial.order ?? 0,
    props: partial.props ?? {},
  };
}

/** Literal transcription of the pre-Stage-07 code, kept as the oracle. */
function legacySelect(slots: SectionSlot[]): SectionSlot[] {
  return slots.filter((s) => s.visible).sort((a, b) => a.order - b.order);
}

describe('Stage 07 Task A — consolidation is behaviour-preserving', () => {
  const cases: Array<{ name: string; input: SectionSlot[] }> = [
    { name: 'empty list', input: [] },
    { name: 'single visible slot', input: [slot({ sectionType: 'cta-banner', order: 0 })] },
    { name: 'single hidden slot', input: [slot({ sectionType: 'cta-banner', order: 0, visible: false })] },
    {
      name: 'already ordered',
      input: [
        slot({ sectionType: 'landing-hero', order: 0 }),
        slot({ sectionType: 'landing-featured', order: 1 }),
        slot({ sectionType: 'landing-grid', order: 2 }),
      ],
    },
    {
      name: 'out of order',
      input: [
        slot({ sectionType: 'landing-grid', order: 2 }),
        slot({ sectionType: 'landing-hero', order: 0 }),
        slot({ sectionType: 'landing-featured', order: 1 }),
      ],
    },
    {
      name: 'hidden in the middle',
      input: [
        slot({ sectionType: 'landing-hero', order: 0 }),
        slot({ sectionType: 'landing-featured', order: 1, visible: false }),
        slot({ sectionType: 'landing-grid', order: 2 }),
      ],
    },
    {
      name: 'all hidden',
      input: [
        slot({ sectionType: 'landing-hero', order: 0, visible: false }),
        slot({ sectionType: 'landing-grid', order: 1, visible: false }),
      ],
    },
    {
      name: 'duplicate orders',
      input: [
        slot({ sectionType: 'a-first', order: 1 }),
        slot({ sectionType: 'b-second', order: 1 }),
        slot({ sectionType: 'c-third', order: 1 }),
      ],
    },
    {
      name: 'gaps in order',
      input: [
        slot({ sectionType: 'x', order: 40 }),
        slot({ sectionType: 'y', order: 0 }),
        slot({ sectionType: 'z', order: 7 }),
      ],
    },
  ];

  for (const c of cases) {
    it(`matches the replaced implementation exactly: ${c.name}`, () => {
      const legacy = legacySelect([...c.input]);
      const consolidated = selectRenderableSlots(c.input);
      expect(consolidated.map((s) => s.id)).toEqual(legacy.map((s) => s.id));
    });
  }

  it('matches the replaced implementation over 300 generated layouts', () => {
    // Deterministic pseudo-random so a failure is reproducible.
    let seed = 20260711;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 300; i++) {
      const n = Math.floor(rand() * 9);
      const input = Array.from({ length: n }, (_, k) =>
        slot({
          sectionType: `t${k}`,
          id: `id-${k}`,
          order: Math.floor(rand() * 6),
          visible: rand() > 0.3,
        }),
      );
      expect(selectRenderableSlots(input).map((s) => s.id)).toEqual(legacySelect([...input]).map((s) => s.id));
    }
  });

  it('treats a missing `visible` key the same way the replaced code did', () => {
    // SectionSlotSchema requires `visible`, so this is unreachable for a saved
    // layout; the assertion exists so the equivalence claim is not merely stated.
    const noKey = { id: 'x', sectionType: 'cta-banner', order: 0, props: {} } as unknown as SectionSlot;
    expect(isSlotVisible(noKey)).toBe(false);
    expect(selectRenderableSlots([noKey])).toHaveLength(0);
  });
});

describe('Stage 07 Task A — the rule itself', () => {
  it('removes hidden slots', () => {
    const out = selectRenderableSlots([
      slot({ sectionType: 'keep', order: 0 }),
      slot({ sectionType: 'drop', order: 1, visible: false }),
    ]);
    expect(out.map((s) => s.sectionType)).toEqual(['keep']);
  });

  it('orders ascending by order', () => {
    const out = selectRenderableSlots([
      slot({ sectionType: 'third', order: 9 }),
      slot({ sectionType: 'first', order: 1 }),
      slot({ sectionType: 'second', order: 4 }),
    ]);
    expect(out.map((s) => s.sectionType)).toEqual(['first', 'second', 'third']);
  });

  it('is stable for equal orders, so injected siblings keep their composed order', () => {
    const out = selectRenderableSlots([
      slot({ sectionType: 'injected-a', order: 1.5 }),
      slot({ sectionType: 'injected-b', order: 1.5 }),
    ]);
    expect(out.map((s) => s.sectionType)).toEqual(['injected-a', 'injected-b']);
  });

  it('does not mutate or reorder the caller array', () => {
    const input = [slot({ sectionType: 'b', order: 5 }), slot({ sectionType: 'a', order: 1 })];
    const snapshot = input.map((s) => s.sectionType);
    selectRenderableSlots(input);
    expect(input.map((s) => s.sectionType)).toEqual(snapshot);
  });

  it('sorts a non-finite order last instead of corrupting the comparison', () => {
    const broken = { ...slot({ sectionType: 'broken' }), order: Number.NaN } as SectionSlot;
    const out = selectRenderableSlots([broken, slot({ sectionType: 'ok', order: 3 })]);
    expect(out.map((s) => s.sectionType)).toEqual(['ok', 'broken']);
  });

  it('compareSlotOrder is a usable comparator in isolation', () => {
    expect(compareSlotOrder({ order: 1 }, { order: 2 })).toBeLessThan(0);
    expect(compareSlotOrder({ order: 2 }, { order: 1 })).toBeGreaterThan(0);
    expect(compareSlotOrder({ order: 2 }, { order: 2 })).toBe(0);
  });
});

/* ── The proof Stage 06 deferred ───────────────────────────────────── */

describe('Stage 07 Task A — double application is provably harmless', () => {
  const layouts: SectionSlot[][] = [
    [],
    [slot({ sectionType: 'landing-hero', order: 0 })],
    [
      slot({ sectionType: 'landing-hero', order: 0 }),
      slot({ sectionType: 'landing-featured', order: 1 }),
      // An injected system slot, ordered the way `orderAfter` orders it.
      slot({ sectionType: 'landing-competition-disciplines', order: 1.5 }),
      slot({ sectionType: 'landing-grid', order: 2 }),
    ],
    [
      slot({ sectionType: 'landing-hero', order: 0 }),
      slot({ sectionType: 'landing-featured', order: 1 }),
      slot({ sectionType: 'landing-competition-disciplines', order: 1.5 }),
      slot({ sectionType: 'landing-empty', order: 1.5 }),
      slot({ sectionType: 'cta-banner', order: 3, visible: false }),
    ],
  ];

  for (const [i, layout] of layouts.entries()) {
    it(`select(select(x)) equals select(x) for layout ${i}`, () => {
      const once = selectRenderableSlots(layout);
      const twice = selectRenderableSlots(once);
      expect(twice.map((s) => s.sectionType)).toEqual(once.map((s) => s.sectionType));
    });
  }

  it('is idempotent over 300 generated layouts', () => {
    let seed = 777;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 300; i++) {
      const n = Math.floor(rand() * 8);
      const input = Array.from({ length: n }, (_, k) =>
        slot({ sectionType: `t${k}`, id: `id-${k}`, order: Math.floor(rand() * 5), visible: rand() > 0.25 }),
      );
      const once = selectRenderableSlots(input);
      expect(selectRenderableSlots(once).map((s) => s.id)).toEqual(once.map((s) => s.id));
    }
  });

  it('REGRESSION: a placeholder order of -1 would have hoisted an injected block to the top', () => {
    /**
     * This is the defect that made Stage 06's deferral correct. Before Stage 07
     * the section-landing resolver spliced its injected slots positionally while
     * stamping them `order: -1`. Sorting such a list moves them to the front —
     * the discipline guides above the hero. The assertion documents the hazard
     * so nobody reintroduces the placeholder.
     */
    const withPlaceholder = [
      slot({ sectionType: 'landing-hero', order: 0 }),
      slot({ sectionType: 'landing-featured', order: 1 }),
      { ...slot({ sectionType: 'landing-competition-disciplines' }), order: -1 } as SectionSlot,
    ];
    expect(selectRenderableSlots(withPlaceholder)[0].sectionType).toBe('landing-competition-disciplines');

    // With a real order from `orderAfter`, composition order survives the sort.
    const fixed = [
      slot({ sectionType: 'landing-hero', order: 0 }),
      slot({ sectionType: 'landing-featured', order: 1 }),
      slot({ sectionType: 'landing-competition-disciplines', order: orderAfter({ order: 1 }, 99) }),
    ];
    expect(selectRenderableSlots(fixed).map((s) => s.sectionType)).toEqual([
      'landing-hero',
      'landing-featured',
      'landing-competition-disciplines',
    ]);
  });
});

describe('Stage 07 Task A — orderAfter', () => {
  it('places the injected slot immediately after its anchor', () => {
    expect(orderAfter({ order: 1 }, 99)).toBe(1.5);
    expect(orderAfter({ order: 0 }, 99)).toBe(0.5);
  });

  it('falls back to last when there is no anchor', () => {
    expect(orderAfter(undefined, 42)).toBe(42);
  });

  it('falls back to last when the anchor order is unusable', () => {
    expect(orderAfter({ order: Number.NaN }, 42)).toBe(42);
  });

  it('keeps the injected slot ahead of the successor of its anchor', () => {
    const anchor = 2;
    const injected = orderAfter({ order: anchor }, 99);
    expect(injected).toBeGreaterThan(anchor);
    expect(injected).toBeLessThan(anchor + 1);
  });
});

describe('Stage 07 Task A — resolved-pair selection and the contract guard', () => {
  const resolved = [
    { slot: slot({ sectionType: 'b', order: 2 }), data: {} },
    { slot: slot({ sectionType: 'hidden', order: 1, visible: false }), data: {} },
    { slot: slot({ sectionType: 'a', order: 0 }), data: {} },
  ];

  it('filters and orders resolved pairs identically', () => {
    expect(selectRenderableResolved(resolved).map((r) => r.slot.sectionType)).toEqual(['a', 'b']);
  });

  it('carries the data of each slot with it', () => {
    const pairs = [
      { slot: slot({ sectionType: 'second', order: 5 }), data: { mark: 2 } },
      { slot: slot({ sectionType: 'first', order: 1 }), data: { mark: 1 } },
    ];
    expect(selectRenderableResolved(pairs).map((r) => r.data.mark)).toEqual([1, 2]);
  });

  it('reports a hidden slot that reached the renderer', () => {
    expect(findContractViolations(resolved)).toEqual(['hidden']);
  });

  it('reports nothing once selection has been applied', () => {
    expect(findContractViolations(selectRenderableResolved(resolved))).toEqual([]);
  });
});

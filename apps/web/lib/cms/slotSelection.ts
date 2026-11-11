/**
 * The single authoritative visibility-and-order contract for layout slots
 * (Stage 07 Task A).
 *
 * WHY THIS MODULE EXISTS
 *
 * Before Stage 07 the rule "render visible slots in `order`" was implemented
 * FIVE times, by hand, in four files:
 *
 *   lib/cms/homepageData.ts:66        .filter((s) => s.visible).sort(...)
 *   lib/cms/sectionLandingData.ts:30  .filter((s) => s.visible).sort(...)
 *   lib/cms/detailTemplateData.ts:47  .filter((s) => s.visible).sort(...)
 *   lib/cms/detailTemplateData.ts:98  .filter((s) => s.visible).sort(...)
 *   lib/cms/directoryData.ts:26       .filter((s) => s.visible).sort(...)
 *
 * and `PageRenderer` applied neither, so the rule was guaranteed nowhere. The
 * approved Stage 02 architecture (§3.3, change 3+4) calls for exactly one
 * authority. This module is it, and `PageRenderer` enforces it as the last word
 * before HTML.
 *
 * THE DOUBLE-APPLICATION PROOF STAGE 06 COULD NOT PRODUCE
 *
 * Stage 06 deferred this because it could not cheaply prove a second
 * application in the renderer would be harmless. It would NOT have been, and
 * the reason is specific:
 *
 *   `resolveSectionLandingSlots` INJECTS two system slots —
 *   `landing-competition-disciplines` and `landing-empty` — by `splice()`ing
 *   them at a POSITIONAL index, while giving them the placeholder `order: -1`.
 *
 * So the resolver's array order and the slots' `order` fields disagreed. Had
 * `PageRenderer` sorted by `order`, both injected blocks would have jumped to
 * the TOP of the page: the discipline guides and the "nothing published yet"
 * empty state would have rendered above the section hero.
 *
 * That is fixed at the source here. `orderAfter()` gives an injected slot a
 * real fractional order derived from the slot it must follow, so the array
 * order and the `order` fields agree. Sorting then becomes order-preserving,
 * and the second application is provably idempotent:
 *
 *   selectRenderableSlots(selectRenderableSlots(x)) === selectRenderableSlots(x)
 *
 * asserted in `tests/stage07-slot-selection.test.ts` over both hand-built and
 * generated slot lists.
 *
 * WHAT "NO DOUBLE FILTERING OR SORTING" MEANS HERE (directive §3 requirement 7)
 *
 * There is exactly ONE implementation of the rule and no second, divergent one.
 * A resolver still calls it once, because it must not fetch content for a
 * hidden slot (requirement 8 — no wasted or dedup-perturbing queries), and
 * `PageRenderer` calls it once as the render authority. Those two calls cannot
 * disagree, because they are the same function over an idempotent operation.
 * What is eliminated is divergence, not the second invocation — and divergence
 * is what the five hand-written copies actually risked.
 *
 * STABILITY
 *
 * `Array.prototype.sort` is required to be stable (ES2019; Node 12+). Two slots
 * with an equal `order` therefore keep their incoming relative position, which
 * is what makes two injected slots targeting the same insertion point render in
 * the order the resolver composed them.
 */

import type { SectionSlot } from './sectionRegistry';

/**
 * Whether a slot reaches the page.
 *
 * BEHAVIOUR-PRESERVING BY DELIBERATE CHOICE. This is a truthiness test because
 * that is exactly what all five replaced copies did (`.filter((s) => s.visible)`),
 * so consolidation changes no public output for any stored layout.
 *
 * The tempting "improvement" — `visible !== false`, so a slot whose JSON lost
 * the key renders instead of vanishing — was rejected. `SectionSlotSchema` in
 * `pageLayoutService.ts` declares `visible: z.boolean()` as REQUIRED, so every
 * layout that has ever been saved through `saveDraft` carries a real boolean.
 * The two semantics can therefore only differ for hand-edited JSON, and in that
 * unreachable case the change would alter live HTML on a page no operator
 * touched. Stage 07 consolidates the rule; it does not quietly redefine it.
 */
export function isSlotVisible(slot: Pick<SectionSlot, 'visible'>): boolean {
  return Boolean(slot.visible);
}

/** The order comparator. Non-finite orders sort last, never crashing the sort. */
export function compareSlotOrder(a: Pick<SectionSlot, 'order'>, b: Pick<SectionSlot, 'order'>): number {
  const ao = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
  const bo = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
  return ao - bo;
}

/**
 * THE authoritative selection: visible slots, in ascending `order`, stable.
 *
 * Pure and non-mutating — it copies before sorting, so a caller's array (and
 * the stored layout it came from) is never reordered in place.
 */
export function selectRenderableSlots<T extends Pick<SectionSlot, 'visible' | 'order'>>(slots: readonly T[]): T[] {
  return slots.filter(isSlotVisible).slice().sort(compareSlotOrder);
}

/**
 * The same selection over already-resolved `{ slot, data }` pairs, which is the
 * shape `PageRenderer` receives.
 */
export function selectRenderableResolved<T extends { slot: Pick<SectionSlot, 'visible' | 'order'> }>(
  resolved: readonly T[],
): T[] {
  return resolved
    .filter((r) => isSlotVisible(r.slot))
    .slice()
    .sort((a, b) => compareSlotOrder(a.slot, b.slot));
}

/**
 * The `order` for a system slot a resolver injects immediately AFTER `prev`.
 *
 * Fractional on purpose. Renumbering every slot to its array index would also
 * work, but it would overwrite the operator's stored order values in the
 * resolved copy and make the rendered `order` unrelated to the saved layout —
 * harder to debug and easy to mistake for a persistence bug. A fraction keeps
 * every stored order intact and states the injected block's position
 * relationally: "after featured, before whatever came next".
 *
 * `prev === undefined` means "no anchor" — the slot goes last, which is what
 * the resolvers' own `out.length` fallback did.
 */
export function orderAfter(prev: Pick<SectionSlot, 'order'> | undefined, fallbackLast: number): number {
  if (!prev || !Number.isFinite(prev.order)) return fallbackLast;
  return prev.order + 0.5;
}

/**
 * Development-time contract check. Returns the types of any slots that reached
 * the renderer hidden — which, given the resolvers above, should always be
 * empty. Exported so a test can assert "the guard never fires in practice"
 * rather than leaving that as a claim.
 */
export function findContractViolations<T extends { slot: Pick<SectionSlot, 'visible' | 'order'> & { sectionType: string } }>(
  resolved: readonly T[],
): string[] {
  return resolved.filter((r) => !isSlotVisible(r.slot)).map((r) => r.slot.sectionType);
}

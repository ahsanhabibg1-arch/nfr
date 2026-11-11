'use client';

import React from 'react';
import { blockRegistry } from './registry';
import type { SectionSlot } from '@/lib/cms/sectionRegistry';
import { selectRenderableResolved } from '@/lib/cms/slotSelection';
import { useBuilderEditorMode } from './BuilderEditorMode';

export interface RenderedSlot {
  slot: SectionSlot;
  data: Record<string, unknown>;
}

/**
 * Bounded diagnostic log for slot types with no renderer (Stage 06 Task 9).
 *
 * The renderer previously skipped an unknown type in complete silence, which
 * satisfied "do not crash" but violated the Blueprint's invariant R1 ("skipped
 * AND logged"). That became a live problem in Stage 05: a retired block is
 * exactly this case, so an operator whose stored layout still contains a
 * newsletter slot saw it vanish with no explanation anywhere.
 *
 * Bounded deliberately. A homepage can hold many slots and a render can repeat
 * on every navigation, so logging per occurrence would flood the console and
 * bury the signal. One line per slot type per page load is enough to diagnose,
 * and the set is module-scoped so it resets with the document.
 */
const reportedUnrenderable = new Set<string>();

function reportUnrenderable(slot: SectionSlot): void {
  if (reportedUnrenderable.has(slot.sectionType)) return;
  reportedUnrenderable.add(slot.sectionType);
  // Intentionally console.warn and not an error report: an unrenderable slot is
  // a configuration state, not a fault, and it must never break a page.
  console.warn(
    `[PageRenderer] No renderer for section type "${slot.sectionType}" — slot skipped. ` +
      'This is expected for a retired block in a stored layout; otherwise the type is missing from blockRegistry.',
  );
}

/** Test seam: lets a suite assert the bound rather than infer it. */
export function __resetUnrenderableLogForTests(): void {
  reportedUnrenderable.clear();
}

/**
 * Admin-only notice for a slot that cannot render. Shown inside the Builder
 * canvas so the operator can see and remove the slot; a public visitor gets
 * nothing at all, so no internal detail is exposed and no layout shifts.
 */
function UnrenderableSlotNotice({ slot }: { slot: SectionSlot }) {
  return (
    <div
      data-nfr-slot=""
      data-slot-id={slot.id}
      data-slot-type={slot.sectionType}
      data-nfr-unrenderable="1"
      className="mx-auto my-2 max-w-[1280px] border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-amber-900"
    >
      <p className="text-xs font-semibold">This block does not render on the live site.</p>
      <p className="mt-0.5 text-[11px] leading-snug">
        Type <code className="font-mono">{slot.sectionType}</code> has no renderer — it is either retired or no longer
        supported. Visitors see nothing here. You can safely remove it from this page.
      </p>
    </div>
  );
}

/**
 * The single render path for layout slots, and — as of Stage 07 Task A — the
 * single authority for which slots render and in what order.
 *
 * WHAT CHANGED IN STAGE 07
 *
 * Visibility filtering and order sorting were implemented five times by hand
 * across the four resolvers, and applied nowhere here, so the rule was
 * guaranteed in no single place. They now come from `lib/cms/slotSelection.ts`,
 * which the resolvers and this renderer both call. The approved Stage 02
 * architecture (§3.3) asked for exactly this.
 *
 * WHY A SECOND APPLICATION IS SAFE, WHICH STAGE 06 COULD NOT SHOW
 *
 * Stage 06's note here claimed `resolveSections` sorts and filters before the
 * resolvers compose data. **That was wrong** — `resolveSections` only chooses
 * stored sections versus family defaults and backfills ids; it never filtered
 * or sorted. The real hazard was elsewhere and sharper: the section-landing
 * resolver injected two system slots at a positional index while stamping them
 * `order: -1`, so sorting would have hoisted the discipline guides and the
 * empty state above the hero. That is fixed at the source (`orderAfter`), and
 * `selectRenderableSlots` is now provably idempotent — `select(select(x))`
 * equals `select(x)` over hand-built and generated layouts in
 * `tests/stage07-slot-selection.test.ts`.
 *
 * So the resolvers' call and this one cannot disagree: same function, same
 * idempotent operation. The resolvers still select first because they must not
 * issue a content query for a hidden slot, and because the deduplication
 * context has to claim articles in render order.
 *
 * ONE DELIBERATE EXCEPTION TO "SELECTION HAPPENS HERE"
 *
 * `SectionLandingSlots` partitions the resolved list into the hero and the rest
 * so it can wrap the remainder in a container. It therefore calls this renderer
 * twice with two subsets. Selection applies within each subset, which is
 * order-preserving because the partition is by section type and the hero sorts
 * first either way — asserted in `tests/stage07-renderer-consolidation.test.ts`.
 */
export function PageRenderer({ slots, editorMode }: { slots: RenderedSlot[]; editorMode?: boolean }) {
  const contextEditorMode = useBuilderEditorMode();
  const editing = editorMode ?? contextEditorMode;

  // THE authoritative selection. Hidden slots cannot reach public HTML from any
  // caller, including one a later stage adds that forgets to select.
  const renderable = selectRenderableResolved(slots);

  return (
    <>
      {renderable.map((resolved) => {
        const Component = blockRegistry[resolved.slot.sectionType];
        const key = resolved.slot.id || `${resolved.slot.sectionType}-${resolved.slot.order}`;

        if (!Component) {
          reportUnrenderable(resolved.slot);
          // Public: nothing, exactly as before. Builder canvas: a visible notice.
          return editing ? <UnrenderableSlotNotice key={key} slot={resolved.slot} /> : null;
        }

        const el = <Component slot={resolved.slot} data={resolved.data} />;

        if (!editing) {
          // Public output is unchanged from Stage 05 — no wrapper, no attributes.
          return el ? <React.Fragment key={key}>{el}</React.Fragment> : null;
        }

        /**
         * Builder canvas only: a stable, selectable container per slot.
         *
         * The wrapper exists even when the block renders nothing, which is what
         * makes a zero-DOM block selectable from the tree instead of silently
         * unreachable (Stage 06 requirement 4.6). It is a plain block-level div
         * with no classes, so it inherits the flow it replaced; `space-y-*` and
         * `flex-col` parents space the wrappers exactly as they spaced the
         * sections.
         */
        return (
          <div key={key} data-nfr-slot="" data-slot-id={resolved.slot.id} data-slot-type={resolved.slot.sectionType}>
            {el}
          </div>
        );
      })}
    </>
  );
}

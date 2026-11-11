'use client';

import { PageRenderer, type RenderedSlot } from '@/components/blocks/PageRenderer';

/**
 * The whole body of a directory page, in Builder order (Stage 07 Task F).
 *
 * This replaced `DirectoryCtaSlot`, which filtered the resolved list down to
 * `directory-cta` and rendered nothing else — so two of the three directory
 * slots, including the required one, never reached the page. The route built
 * the rest by hand.
 *
 * Now the route resolves its slots and hands the whole list here, and
 * `PageRenderer` applies the one authoritative visibility/order rule. The
 * practical consequence for an operator is that moving the call-to-action above
 * the listing in the Builder actually moves it on the live page.
 */
export function DirectorySlots({ slots }: { slots: RenderedSlot[] }) {
  if (slots.length === 0) return null;
  return <PageRenderer slots={slots} />;
}

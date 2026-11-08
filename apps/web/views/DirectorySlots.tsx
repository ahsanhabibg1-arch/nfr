'use client';

import { PageRenderer, type RenderedSlot } from '@/components/blocks/PageRenderer';

export function DirectoryCtaSlot({ slots }: { slots: RenderedSlot[] }) {
  const cta = slots.filter((s) => s.slot.sectionType === 'directory-cta');
  if (cta.length === 0) return null;
  return <PageRenderer slots={cta} />;
}

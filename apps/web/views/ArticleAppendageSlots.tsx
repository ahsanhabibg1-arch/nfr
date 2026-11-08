'use client';

import { PageRenderer, type RenderedSlot } from '@/components/blocks/PageRenderer';

export function ArticleAppendageSlots({ slots }: { slots: RenderedSlot[] }) {
  if (slots.length === 0) return null;
  return <PageRenderer slots={slots} />;
}

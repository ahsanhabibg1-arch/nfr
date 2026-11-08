import type { SectionSlot } from '@/lib/cms/sectionRegistry';

export interface BlockProps {
  slot: SectionSlot;
  data: Record<string, unknown>;
}

export function slotStr(slot: SectionSlot, key: string, fallback = ''): string {
  const v = slot.props[key];
  return typeof v === 'string' ? v : fallback;
}

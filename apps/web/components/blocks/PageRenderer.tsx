'use client';

import React from 'react';
import { blockRegistry } from './registry';
import type { SectionSlot } from '@/lib/cms/sectionRegistry';

export interface RenderedSlot {
  slot: SectionSlot;
  data: Record<string, unknown>;
}

export function PageRenderer({ slots }: { slots: RenderedSlot[] }) {
  return (
    <>
      {slots.map((resolved) => {
        const Component = blockRegistry[resolved.slot.sectionType];
        if (!Component) return null;
        const key = resolved.slot.id || `${resolved.slot.sectionType}-${resolved.slot.order}`;
        const el = <Component slot={resolved.slot} data={resolved.data} />;
        return el ? <React.Fragment key={key}>{el}</React.Fragment> : null;
      })}
    </>
  );
}

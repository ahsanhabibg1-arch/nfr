'use client';

import React from 'react';
import { PageRenderer, type RenderedSlot } from '../components/blocks/PageRenderer';
import type { ResolvedLandingSlot } from '../lib/cms/sectionLandingData';

export function SectionLandingSlots({ slots }: { slots: ResolvedLandingSlot[] }) {
  const heroSlots = slots.filter((s) => s.slot.sectionType === 'landing-hero');
  const contentSlots = slots.filter((s) => s.slot.sectionType !== 'landing-hero');

  return (
    <>
      <PageRenderer slots={heroSlots as RenderedSlot[]} />
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-14">
        <PageRenderer slots={contentSlots as RenderedSlot[]} />
      </div>
    </>
  );
}

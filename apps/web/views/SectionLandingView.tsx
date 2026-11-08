import React from 'react';
import { resolveSectionLandingSlots } from '../lib/cms/sectionLandingData';
import { SectionLandingSlots } from './SectionLandingSlots';

export async function SectionLandingView({ sectionKey }: { sectionKey: string }) {
  const resolvedSlots = await resolveSectionLandingSlots(sectionKey);

  return (
    <div className="w-full bg-[#F7F3EA] text-[#0F1115]">
      <SectionLandingSlots slots={resolvedSlots} />
    </div>
  );
}

import React from 'react';
import { resolveSectionLandingSlots } from '../lib/cms/sectionLandingData';
import { SectionLandingSlots } from './SectionLandingSlots';

export async function SectionLandingView({ sectionKey, draft }: { sectionKey: string; draft?: boolean }) {
  const resolvedSlots = await resolveSectionLandingSlots(sectionKey, { draft });

  return (
    <div className="w-full bg-[#F7F3EA] text-[#0F1115]">
      <SectionLandingSlots slots={resolvedSlots} />
    </div>
  );
}

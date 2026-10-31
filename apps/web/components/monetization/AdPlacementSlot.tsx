import React from 'react';
import { getActiveAdPlacements } from '@/lib/monetization/publicMonetization';

/**
 * Public ad placement container (Batch 08 §9/§10/§25). Renders a reserved, clearly
 * labeled "Advertisement" container for each enabled placement in scope — but injects
 * NO ad script in this batch (owner-gated, §30). Returns nothing unless the owner has
 * enabled AdSense in config, so by default the public site shows no ad boxes. Space is
 * reserved to avoid layout shift when ads are eventually enabled.
 */
export async function AdPlacementSlot({ pageScope }: { pageScope: string }) {
  const placements = await getActiveAdPlacements(pageScope);
  if (placements.length === 0) return null;
  return (
    <>
      {placements.map((p) => (
        <aside
          key={p.id}
          className="w-full my-6 flex flex-col items-center justify-center p-4 border border-dashed border-stone-300 bg-[#F7F3EA]/60 rounded-sm text-center"
          aria-label="Advertisement"
          data-ad-slot={p.slot}
        >
          <div className="text-[10px] tracking-widest uppercase font-mono text-stone-500 mb-1">Advertisement</div>
          <div className={`w-full ${p.responsive ? 'max-w-4xl' : 'max-w-[728px]'} min-h-[90px] flex items-center justify-center bg-white/70 border border-stone-200 text-stone-400 text-xs font-sans`}>
            Ad space reserved · {p.name}
          </div>
        </aside>
      ))}
    </>
  );
}

export default AdPlacementSlot;

import React from 'react';

interface AdSlotProps {
  label?: string;
  format?: 'banner' | 'leaderboard' | 'compact';
  className?: string;
}

export const AdSlot: React.FC<AdSlotProps> = ({
  label = 'Editorial Partner / Western Heritage Sponsor',
  format = 'leaderboard',
  className = '',
}) => {
  return (
    <aside 
      className={`w-full my-8 flex flex-col items-center justify-center p-4 border border-dashed border-stone-300 bg-[#F7F3EA]/60 rounded-sm text-center ${className}`}
      aria-label="Sponsorship Notice"
    >
      <div className="text-[10px] tracking-widest uppercase font-mono text-stone-500 mb-1">
        Advertisement &middot; {label}
      </div>
      <div className={`w-full max-w-4xl flex items-center justify-between p-4 bg-white/80 border border-stone-200 text-stone-700 text-xs font-sans ${
        format === 'compact' ? 'flex-col gap-2 py-3' : 'flex-col sm:flex-row gap-4'
      }`}>
        <div className="text-left">
          <p className="font-semibold text-stone-900">Official Boots & Western Leathercraft Showcase</p>
          <p className="text-[11px] text-stone-500">Curated handcrafted Western gear at Cowboy Christmas Booth 2410.</p>
        </div>
        <span className="text-[11px] font-semibold text-[#8B5E3C] border border-[#8B5E3C]/30 px-3 py-1 bg-[#F7F3EA] uppercase tracking-wider shrink-0">
          Partner Showcase
        </span>
      </div>
      <p className="text-[10px] text-stone-400 mt-1 italic">
        NFRGuide preserves editorial independence. Sponsored placements are strictly delineated from journalism.
      </p>
    </aside>
  );
};

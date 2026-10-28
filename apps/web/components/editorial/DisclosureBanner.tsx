import React from 'react';
import { DisclosureType } from '../../types';

interface DisclosureBannerProps {
  type?: DisclosureType;
  customNote?: string;
  className?: string;
}

export const DisclosureBanner: React.FC<DisclosureBannerProps> = ({
  type = 'editorial-independent',
  customNote,
  className = '',
}) => {
  return (
    <div 
      className={`p-4 border rounded-sm text-xs font-sans leading-relaxed ${
        type === 'affiliate'
          ? 'bg-amber-50/60 border-amber-200 text-amber-900'
          : 'bg-[#F7F3EA] border-stone-300 text-stone-700'
      } ${className}`}
      role="note"
      aria-label="Editorial Disclosure"
    >
      <div className="flex items-start gap-2.5">
        <span className="font-bold uppercase tracking-wider text-[10px] text-[#8B5E3C] mt-0.5 shrink-0">
          {type === 'affiliate' ? 'Commercial Disclosure' : 'Editorial Independence'}
        </span>
        <div className="flex-1">
          {customNote ? (
            <p>{customNote}</p>
          ) : type === 'affiliate' ? (
            <p>
              NFRGuide participates in select affiliate programs for hotel accommodations and verified secondary ticket platforms. We may earn a modest commission on qualified purchases at no additional cost to readers. Editorial recommendations remain strictly independent and unbiased.
            </p>
          ) : (
            <p>
              NFRGuide is an independent editorial publication. We are not an official arm, partner, or commercial affiliate of the PRCA, WPRA, National Finals Rodeo, or Las Vegas Events.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

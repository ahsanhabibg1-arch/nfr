'use client';

import React from 'react';
import Link from 'next/link';
import { QuickLinkItem } from '../../types';

interface QuickAccessProps {
  items: QuickLinkItem[];
  onNavigateSection?: (sectionId: string) => void;
}

export const QuickAccess: React.FC<QuickAccessProps> = ({
  items,
  onNavigateSection,
}) => {
  return (
    <section id="quick-access" className="w-full bg-[#1E293B] text-white py-12 border-b border-white/10">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-4 border-b border-white/10 gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-[#D4A757] font-sans block mb-1">
              Quick Links
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white">
              NFR Quick Access
            </h2>
          </div>
          <div className="text-xs text-stone-400 font-sans max-w-md">
            Independent editorial reference links. NFRGuide is not a ticketing or streaming vendor.
          </div>
        </div>

        {/* 5-Column / Grid Quick Access Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {items.map((item) => {
            const cardContent = (
              <>
                <div>
                  <div className="flex items-center justify-between text-[11px] font-sans text-stone-400 mb-2">
                    <span className="text-[#D4A757] uppercase tracking-wider font-semibold">
                      {item.category}
                    </span>
                    {item.badge && (
                      <span className="text-[10px] text-stone-400 font-mono">
                        {item.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-serif font-semibold text-white group-hover:text-[#D4A757] transition-colors leading-snug">
                    {item.title}
                  </h3>

                  <p className="mt-2 text-xs text-stone-300 font-sans leading-relaxed line-clamp-3">
                    {item.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-[#D4A757] font-sans font-medium">
                  <span>Open section</span>
                  <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
                </div>
              </>
            );

            if (item.targetRoute) {
              return (
                <Link
                  key={item.id}
                  href={item.targetRoute}
                  className="group p-5 bg-[#0F1115] hover:bg-black/60 border border-white/10 hover:border-[#D4A757]/60 rounded-sm transition-all duration-200 flex flex-col justify-between"
                >
                  {cardContent}
                </Link>
              );
            }

            return (
              <div
                key={item.id}
                onClick={() => onNavigateSection && onNavigateSection(item.targetSectionId)}
                className="group cursor-pointer p-5 bg-[#0F1115] hover:bg-black/60 border border-white/10 hover:border-[#D4A757]/60 rounded-sm transition-all duration-200 flex flex-col justify-between"
              >
                {cardContent}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

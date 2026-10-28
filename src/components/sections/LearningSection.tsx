import React, { useState } from 'react';
import { LearningItem } from '../../types';
import { SectionHeading } from '../SectionHeading';

interface LearningSectionProps {
  resources: LearningItem[];
}

export const LearningSection: React.FC<LearningSectionProps> = ({ resources }) => {
  const [expandedId, setExpandedId] = useState<string | null>(resources[0]?.id || null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <section id="learning" className="w-full bg-[#FFFFFF] text-[#0F1115] py-16 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="Rodeo Academy &middot; Foundational Rules"
          title="Rodeo 101: Rules, Scoring &amp; Essential Formats"
          description="Clear, authoritative explanations designed for newcomers, first-time Vegas attendees, and seasoned fans wanting to master the scoring mechanics."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {resources.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className="bg-[#F7F3EA] border border-stone-300 rounded-sm p-6 flex flex-col justify-between hover:border-[#8B5E3C] transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-sans text-stone-500 mb-2">
                    <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">
                      {item.category}
                    </span>
                    <span className="font-mono text-stone-400">Rule Guide</span>
                  </div>

                  <h3 className="text-xl font-serif font-bold text-[#0F1115] leading-snug">
                    {item.title}
                  </h3>

                  <p className="mt-2 text-sm text-stone-700 font-sans leading-relaxed">
                    {item.summary}
                  </p>

                  {/* Bullet Points */}
                  <div className="mt-4 pt-3 border-t border-stone-300 space-y-2">
                    <h4 className="text-[11px] uppercase tracking-wider font-bold text-stone-600 font-sans">
                      Key Principles:
                    </h4>
                    <ul className="space-y-1.5 text-xs text-stone-700 font-sans">
                      {item.bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-[#D4A757] font-bold mt-0.5">&bull;</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Did You Know Box */}
                  <div className="mt-4 p-3 bg-white border border-stone-200 rounded-sm text-xs font-sans text-stone-800">
                    <span className="font-bold text-[#8B5E3C] block mb-0.5">Curator’s Note:</span>
                    {item.didYouKnow}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-stone-200 flex items-center justify-between text-xs font-sans text-[#8B5E3C]">
                  <span className="font-semibold">Independent Fact-Checked Resource</span>
                  <span className="text-stone-400 text-[11px]">Updated for 2026 Season</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

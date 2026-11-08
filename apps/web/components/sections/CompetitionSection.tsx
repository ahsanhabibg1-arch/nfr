'use client';

import React, { useState, useMemo } from 'react';
import { Discipline } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { ImageWithCredit } from '../ImageWithCredit';
import { type SectionCopy, copyOr } from './sectionCopy';

interface CompetitionSectionProps {
  disciplines: Discipline[];
  onSelectDiscipline: (discipline: Discipline) => void;
  /** Page Builder copy overrides. */
  copy?: SectionCopy;
}

export const CompetitionSection: React.FC<CompetitionSectionProps> = ({
  disciplines,
  onSelectDiscipline,
  copy = {},
}) => {
  const [filter, setFilter] = useState<'all' | 'Roughstock' | 'Timed Event'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return disciplines;
    return disciplines.filter((d) => d.category === filter);
  }, [disciplines, filter]);

  return (
    <section id="competition" className="w-full bg-[#FFFFFF] text-[#0F1115] py-16 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker={copyOr(copy.kicker, 'Competition')}
          title={copyOr(copy.title, 'The Seven NFR Disciplines')}
          description={copyOr(copy.description, 'Guides to the seven disciplines contested at the NFR: what each event involves and how it is scored.')}
        />

        {/* Filter Toggle */}
        <div className="flex items-center justify-between mb-8 pb-3 border-b border-stone-200">
          <div className="flex items-center gap-2">
            {(['all', 'Roughstock', 'Timed Event'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors ${
                  filter === mode
                    ? 'bg-[#0F1115] text-[#D4A757]'
                    : 'text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200'
                }`}
              >
                {mode === 'all' ? 'All 7 Events' : mode === 'Roughstock' ? 'Roughstock (3)' : 'Timed Events (4)'}
              </button>
            ))}
          </div>

          <span className="hidden sm:inline text-xs text-ink-muted font-sans italic">
            Click any discipline for rules &amp; 50/50 scoring analysis
          </span>
        </div>

        {/* 7 Disciplines Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((disc, idx) => (
            <article
              key={disc.id}
              onClick={() => onSelectDiscipline(disc)}
              className={`bg-[#F7F3EA] border border-stone-300 rounded-sm overflow-hidden hover:border-[#8B5E3C] hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between ${
                idx === 0 && filter === 'all' ? 'lg:col-span-2' : ''
              }`}
            >
              <div>
                <div className="overflow-hidden">
                  <ImageWithCredit
                    src={disc.image}
                    alt={disc.name}
                    credit={disc.imageCredit}
                    aspectRatioClass={idx === 0 && filter === 'all' ? 'aspect-[21/9]' : 'aspect-[16/10]'}
                  />
                </div>

                <div className="p-5">
                  <div className="flex items-center justify-between text-[11px] font-sans text-ink-muted mb-1.5">
                    <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">
                      {disc.category}
                    </span>
                    <span className="font-mono text-ink-muted">0{idx + 1}</span>
                  </div>

                  <h3 className="text-lg font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">
                    {disc.name}
                  </h3>

                  <p className="mt-1 text-xs text-stone-600 font-serif italic">
                    &ldquo;{disc.tagline}&rdquo;
                  </p>

                  <p className="mt-2 text-xs text-stone-700 font-sans leading-relaxed line-clamp-3">
                    {disc.summary}
                  </p>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-stone-200 bg-white/60 flex items-center justify-between text-xs font-sans text-[#8B5E3C] font-semibold">
                <span>View Rules &amp; Scoring</span>
                <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

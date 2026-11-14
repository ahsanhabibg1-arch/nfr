'use client';

import React, { useState, useMemo } from 'react';
import { Discipline } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { ImageWithCredit } from '../ImageWithCredit';
import { type SectionCopy, copyOr } from './sectionCopy';
import {
  DISCIPLINE_CLASSIFICATIONS,
  DISCIPLINE_CLASSIFICATION_PLURAL,
  toDisciplineClassification,
  type DisciplineClassification,
} from '../../lib/content/disciplineClassifications';

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
  const [filter, setFilter] = useState<string>('all');

  /**
   * The filter buttons, DERIVED entirely from the disciplines on the page.
   *
   * Batch 05 made classifications administrator-managed, so neither the button
   * set nor the counts can be written down any more. Three properties matter:
   *
   *   STABLE KEYS. A managed classification is keyed by its `id`, never by its
   *   name, so renaming "Timed Event" renames the button and breaks nothing.
   *   Only disciplines with no managed classification fall back to keying on the
   *   legacy `category` text.
   *
   *   ONLY CLASSIFICATIONS WITH ELIGIBLE DISCIPLINES APPEAR. The set is built
   *   from the disciplines actually rendered — which `getAllDisciplines()` has
   *   already filtered to active ones — so an archived discipline cannot put a
   *   button on the page, and a classification nothing uses does not appear. An
   *   inactive classification still shows while disciplines reference it, which
   *   is the point of deactivating rather than deleting: it stops NEW
   *   assignment without hiding published content.
   *
   *   COUNTS ARE COUNTED. They used to read "All 7 Events", "Roughstock (3)"
   *   and "Timed Events (4)" literally, which was true only for exactly the
   *   seven seeded disciplines.
   */
  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; sortOrder: number; count: number }>();
    disciplines.forEach((d, i) => {
      const managed = d.classification;
      const key = managed ? managed.id : `legacy:${toDisciplineClassification(d.category)}`;
      const label = managed
        ? managed.pluralName
        : DISCIPLINE_CLASSIFICATION_PLURAL[toDisciplineClassification(d.category)];
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      // Without managed rows there is no stored order, so the first appearance
      // in `disciplines` (already sorted by sortOrder) decides it.
      else byKey.set(key, { key, label, sortOrder: i, count: 1 });
    });
    return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [disciplines]);

  const matches = (d: Discipline, key: string) =>
    d.classification ? d.classification.id === key : `legacy:${toDisciplineClassification(d.category)}` === key;

  const filtered = useMemo(() => {
    if (filter === 'all') return disciplines;
    return disciplines.filter((d) => matches(d, filter));
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
        {/*
          The header and the filters WRAP rather than overflowing.

          Three filter buttons whose labels grow with the data ("All 7 Events",
          "Roughstock (3)", "Timed Events (4)") do not fit a 320px viewport on
          one line. Without wrapping they pushed the whole document wider than
          the screen, so every page using this section scrolled sideways — the
          defect `discipline-classifications.spec` measures at 320 and 390.

          Wrapping is used deliberately in place of a horizontal scroller or
          `overflow-x: hidden`: all three filters stay visible, keep their full
          hit area, and remain reachable in order by keyboard and screen reader.
          Nothing is hidden to make the measurement pass.
        */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-8 pb-3 border-b border-stone-200">
          <div className="flex flex-wrap items-center gap-2">
            {[{ key: 'all', label: `All ${disciplines.length} Events` },
              ...groups.map((g) => ({ key: g.key, label: `${g.label} (${g.count})` }))].map((mode) => (
              <button
                key={mode.key}
                onClick={() => setFilter(mode.key)}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors ${
                  filter === mode.key
                    ? 'bg-[#0F1115] text-[#D4A757]'
                    : 'text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200'
                }`}
              >
                {mode.label}
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

'use client';

import React, { useEffect } from 'react';
import { Discipline } from '../types';
import { ImageWithCredit } from './ImageWithCredit';

interface DisciplineModalProps {
  discipline: Discipline | null;
  onClose: () => void;
}

export const DisciplineModal: React.FC<DisciplineModalProps> = ({ discipline, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (discipline) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [discipline, onClose]);

  if (!discipline) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discipline-modal-title"
    >
      <div 
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-[#F7F3EA] text-[#0F1115] shadow-2xl rounded-sm overflow-hidden border border-stone-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1E293B] text-white">
          <div>
            <span className="text-[11px] uppercase tracking-widest text-[#D4A757] font-semibold">
              Official NFR Discipline &middot; {discipline.category}
            </span>
            <h2 id="discipline-modal-title" className="text-2xl sm:text-3xl font-serif font-bold text-white">
              {discipline.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 sm:p-8 space-y-6">
          <p className="text-base text-stone-700 italic font-serif">
            &ldquo;{discipline.tagline}&rdquo;
          </p>

          <ImageWithCredit
            src={discipline.image}
            alt={discipline.name}
            credit={discipline.imageCredit}
            aspectRatioClass="aspect-[16/9]"
          />

          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C]">
              Event Overview & Mechanics
            </h3>
            <p className="text-sm sm:text-base text-stone-800 font-sans leading-relaxed">
              {discipline.summary}
            </p>
          </div>

          {/* Scoring Rules Breakdown */}
          <div className="p-5 bg-white border border-stone-300 rounded-sm">
            <h3 className="text-xs uppercase tracking-widest font-sans font-bold text-[#0F1115] mb-3">
              Official Scoring & Timing Criteria
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {discipline.scoringBreakdown.map((item, idx) => (
                <div key={idx} className="border-l-2 border-[#D4A757] pl-3 py-1">
                  <h4 className="text-sm font-semibold text-stone-900">{item.title}</h4>
                  <p className="text-xs text-stone-600 mt-1">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Key Rules */}
          <div className="space-y-2">
            <h3 className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C]">
              Crucial Regulations & Disqualifications
            </h3>
            <ul className="space-y-1.5 text-xs sm:text-sm text-stone-700 font-sans">
              {discipline.rulesHighlights.map((rule, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-[#8B5E3C] font-bold">&bull;</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Stock & Historic Benchmark */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-stone-300 text-xs font-sans">
            <div>
              <span className="font-semibold text-stone-900 block mb-1">Livestock Profile</span>
              <p className="text-stone-600">{discipline.stockProfile}</p>
            </div>
            <div>
              <span className="font-semibold text-stone-900 block mb-1">Thomas &amp; Mack Benchmark</span>
              <p className="text-stone-600">{discipline.historicBenchmark}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-stone-300 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#0F1115] text-white hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider font-sans rounded-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

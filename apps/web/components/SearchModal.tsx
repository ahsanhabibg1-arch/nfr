'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Discipline, SearchIndexItem } from '../types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectArticle: (article: SearchIndexItem) => void;
  onSelectDiscipline: (discipline: Discipline) => void;
  // Navigate to the full server-side full-text search page for the current query.
  onSubmitQuery?: (query: string) => void;
  // Published content from the database (passed down from the server layout).
  searchArticles: SearchIndexItem[];
  searchDisciplines: Discipline[];
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectArticle,
  onSelectDiscipline,
  onSubmitQuery,
  searchArticles,
  searchDisciplines,
}) => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'articles' | 'disciplines'>('all');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredResults = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) {
      return {
        articles: searchArticles.slice(0, 4),
        disciplines: searchDisciplines.slice(0, 3),
      };
    }
    return {
      articles: searchArticles.filter(
        (a) => a.title.toLowerCase().includes(q) || a.deck.toLowerCase().includes(q) || a.category.toLowerCase().includes(q),
      ),
      disciplines: searchDisciplines.filter(
        (d) => d.name.toLowerCase().includes(q) || d.summary.toLowerCase().includes(q) || d.tagline.toLowerCase().includes(q),
      ),
    };
  }, [query, searchArticles, searchDisciplines]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#F7F3EA] rounded-sm shadow-2xl border border-stone-300 overflow-hidden text-[#0F1115]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3.5 border-b border-stone-300 bg-white">
          <svg className="w-5 h-5 text-stone-400 mr-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim() && onSubmitQuery) {
                e.preventDefault();
                onSubmitQuery(query.trim());
              }
            }}
            placeholder="Search NFR coverage, disciplines, streaming guides, or travel..."
            className="w-full bg-transparent text-sm sm:text-base font-sans text-stone-900 placeholder-stone-400 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-xs text-stone-400 hover:text-stone-700 px-2 py-1 mr-2">
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs uppercase font-mono tracking-wider text-stone-500 hover:text-stone-900 px-2 py-1 border border-stone-300 rounded"
          >
            Esc
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 border-b border-stone-200 bg-[#EDE6D6]/40 text-xs font-sans">
          <span className="text-stone-500 text-[11px] uppercase tracking-wider font-semibold">Filter:</span>
          {(['all', 'articles', 'disciplines'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                activeFilter === filter ? 'bg-[#0F1115] text-[#D4A757]' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-6">
          {query.trim() && onSubmitQuery && (
            <button
              onClick={() => onSubmitQuery(query.trim())}
              className="w-full flex items-center justify-between p-3 bg-[#0F1115] text-[#D4A757] rounded-sm text-sm font-sans font-semibold hover:bg-[#1a1d23] transition-colors"
            >
              <span>View all results for &ldquo;{query.trim()}&rdquo;</span>
              <span className="text-xs font-mono">Enter →</span>
            </button>
          )}
          {(activeFilter === 'all' || activeFilter === 'articles') && filteredResults.articles.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2 px-2">
                Editorial Coverage ({filteredResults.articles.length})
              </div>
              <div className="space-y-1">
                {filteredResults.articles.map((art) => (
                  <div
                    key={art.id}
                    onClick={() => { onSelectArticle(art); onClose(); }}
                    className="p-3 hover:bg-white rounded-sm cursor-pointer transition-colors border border-transparent hover:border-stone-200"
                  >
                    <div className="flex items-center gap-2 text-[11px] text-stone-500 font-sans">
                      <span className="font-semibold text-[#8B5E3C]">{art.category}</span>
                      <span>&middot;</span>
                      <span>{art.readTime}</span>
                    </div>
                    <h4 className="text-sm font-serif font-semibold text-stone-900 mt-0.5">{art.title}</h4>
                    <p className="text-xs text-stone-600 line-clamp-1 mt-1 font-sans">{art.deck}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(activeFilter === 'all' || activeFilter === 'disciplines') && filteredResults.disciplines.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2 px-2">
                NFR Disciplines ({filteredResults.disciplines.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredResults.disciplines.map((disc) => (
                  <div
                    key={disc.id}
                    onClick={() => { onSelectDiscipline(disc); onClose(); }}
                    className="p-3 bg-white/70 hover:bg-white rounded-sm border border-stone-200 cursor-pointer transition-colors"
                  >
                    <span className="text-[10px] uppercase font-bold text-stone-500">{disc.category}</span>
                    <h4 className="text-sm font-serif font-bold text-stone-900">{disc.name}</h4>
                    <p className="text-xs text-stone-600 line-clamp-2 mt-1 font-sans">{disc.tagline}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredResults.articles.length === 0 &&
            filteredResults.disciplines.length === 0 && (
              <div className="text-center py-10 text-stone-500 font-sans">
                <p className="text-sm">No editorial match found for &ldquo;{query}&rdquo;.</p>
                <p className="text-xs text-stone-400 mt-1">Try searching for &ldquo;bull riding&rdquo;, &ldquo;streaming&rdquo;, or &ldquo;tickets&rdquo;.</p>
              </div>
            )}
        </div>

        <div className="px-4 py-2 bg-stone-100 border-t border-stone-200 text-[11px] text-stone-500 font-sans flex justify-between items-center">
          <span>Search covers published editorial content &middot; navigates to dedicated pages</span>
          <span>Press <strong>Esc</strong> to close</span>
        </div>
      </div>
    </div>
  );
};

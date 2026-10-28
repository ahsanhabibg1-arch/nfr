'use client';

import React, { useEffect } from 'react';
import { Article } from '../types';
import { ImageWithCredit } from './ImageWithCredit';

interface ArticleModalProps {
  article: Article | null;
  onClose: () => void;
}

export const ArticleModal: React.FC<ArticleModalProps> = ({ article, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (article) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [article, onClose]);

  if (!article) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-article-title"
    >
      <div 
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#F7F3EA] text-[#0F1115] shadow-2xl rounded-sm overflow-hidden border border-stone-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-stone-300 bg-white">
          <div className="flex items-center gap-2 text-xs font-sans text-stone-600">
            <span className="font-semibold text-[#8B5E3C] uppercase tracking-wider">{article.category}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{article.readTime}</span>
            <span aria-hidden="true">&middot;</span>
            <span className="hidden sm:inline">{article.publishedAt}</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-stone-900 transition-colors focus-visible:ring-2 focus-visible:ring-[#D4A757] rounded-sm"
            aria-label="Close article modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto px-6 sm:px-10 py-8 space-y-6">
          {/* Prototype Notice */}
          <div className="bg-[#D4A757]/15 border border-[#D4A757]/40 px-4 py-2.5 rounded-sm text-xs font-sans text-[#0F1115] flex items-center justify-between">
            <span><strong>Editorial Preview:</strong> You are viewing demonstration coverage from NFRGuide Phase 0.</span>
            <span className="text-[11px] font-mono text-stone-500 uppercase">Phase 0 Specimen</span>
          </div>

          {/* Headline & Kicker */}
          <div className="space-y-3">
            <h1 
              id="modal-article-title"
              className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-[#0F1115] leading-tight text-balance"
            >
              {article.title}
            </h1>
            <p className="text-base sm:text-lg text-stone-700 font-sans leading-relaxed">
              {article.deck}
            </p>
          </div>

          {/* Author Byline */}
          <div className="flex items-center gap-3 py-3 border-y border-stone-300 text-xs font-sans text-stone-600">
            <div className="w-9 h-9 rounded-full bg-[#1E293B] text-[#D4A757] font-serif font-bold flex items-center justify-center text-sm shadow-sm">
              {article.author.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-stone-900">{article.author.name}</p>
              <p className="text-stone-500">{article.author.role}</p>
            </div>
            <div className="ml-auto text-right text-[11px] text-stone-500">
              <p>Independent Rodeo Journalism</p>
              <p>{article.publishedAt}</p>
            </div>
          </div>

          {/* Main Visual */}
          <div className="my-6">
            <ImageWithCredit
              src={article.heroImage}
              alt={article.title}
              credit={article.imageCredit}
              aspectRatioClass="aspect-[16/9]"
            />
          </div>

          {/* Key Takeaways */}
          {article.takeaways && article.takeaways.length > 0 && (
            <div className="p-5 bg-white border border-stone-300 rounded-sm">
              <h3 className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-3">
                Key Editorial Takeaways
              </h3>
              <ul className="space-y-2 text-sm text-stone-700 font-sans">
                {article.takeaways.map((takeaway, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="text-[#D4A757] font-bold mt-0.5" aria-hidden="true">&bull;</span>
                    <span>{takeaway}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Article Prose */}
          <div className="prose prose-stone max-w-none text-stone-800 font-sans text-base leading-relaxed space-y-4">
            {article.content.map((p, idx) => (
              <p key={idx} className={idx === 0 ? 'drop-cap text-stone-900' : 'text-stone-800'}>
                {p}
              </p>
            ))}
          </div>

          {/* Pull Quote */}
          {article.pullQuote && (
            <blockquote className="my-8 py-6 px-4 sm:px-8 border-y border-stone-300 bg-white/60 text-center">
              <p className="font-serif italic text-lg sm:text-xl text-[#0F1115] leading-relaxed">
                &ldquo;{article.pullQuote.quote}&rdquo;
              </p>
              <cite className="block mt-3 text-xs uppercase tracking-widest font-sans font-semibold text-[#8B5E3C]">
                &mdash; {article.pullQuote.attribution}
              </cite>
            </blockquote>
          )}

          {/* Independent Publication Disclaimer */}
          <div className="pt-6 border-t border-stone-300 text-xs font-sans text-stone-500 leading-normal">
            <p>
              <strong>Editorial Notice:</strong> NFRGuide is an independent publication dedicated to world-class western sports reporting. NFRGuide is not affiliated with, endorsed by, or partnered with the PRCA, PRORODEO, the National Finals Rodeo, or Las Vegas Events.
            </p>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-stone-300 bg-white">
          <span className="text-xs text-stone-500 font-sans">
            Category: <strong className="text-stone-700">{article.category}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#0F1115] text-white hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider font-sans rounded-sm transition-colors"
          >
            Close Article
          </button>
        </div>
      </div>
    </div>
  );
};

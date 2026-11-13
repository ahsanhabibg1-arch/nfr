'use client';

import React, { useState } from 'react';
import { Article } from '../../../types';
import { ArticleBody } from '../../editorial/ArticleBody';
import { AuthorBio } from '../../editorial/AuthorBio';
import { SourceList } from '../../editorial/SourceList';
import { DisclosureBanner } from '../../editorial/DisclosureBanner';
import { fallbackSnapshot, labelIn, type ArticleTypeSnapshot } from '../../../lib/content/articleTypeShape';

interface ArticleDraftPreviewProps {
  article: Article;
  onClose: () => void;
  /**
   * Batch 04-E — managed Article Type definitions, forwarded by the editor
   * shell. Omitted (an older caller, a test) falls back to the compiled-in
   * compatibility vocabulary, which is what this preview showed before 04-E.
   */
  articleTypes?: ArticleTypeSnapshot;
}

export const ArticleDraftPreview: React.FC<ArticleDraftPreviewProps> = ({ article, onClose, articleTypes }) => {
  const typeSnapshot = articleTypes ?? fallbackSnapshot();
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  const viewportWidthClass = {
    desktop: 'max-w-[1280px]',
    tablet: 'max-w-3xl',
    mobile: 'max-w-md',
  }[viewport];

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/90 backdrop-blur-xs flex flex-col overflow-hidden animate-fade-in">
      {/* Top Bar with viewport switchers and exit */}
      <div className="h-14 px-4 bg-[#0F1115] border-b border-white/10 flex items-center justify-between text-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-serif font-black text-[#D4A757] text-lg tracking-tight uppercase">
            NFR<span className="text-white">GUIDE</span>
          </span>
          <span className="text-stone-500">|</span>
          <span className="px-2 py-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-mono uppercase tracking-widest rounded-xs font-bold">
            Draft Preview &bull; Not Live
          </span>
        </div>

        {/* Viewport controls */}
        <div className="hidden sm:flex items-center gap-1 bg-white/10 p-0.5 rounded-xs text-xs font-mono">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`px-3 py-1 rounded-xs transition-colors ${
              viewport === 'desktop' ? 'bg-[#D4A757] text-[#0F1115] font-bold' : 'text-stone-300 hover:text-white'
            }`}
          >
            Desktop (1280px)
          </button>
          <button
            type="button"
            onClick={() => setViewport('tablet')}
            className={`px-3 py-1 rounded-xs transition-colors ${
              viewport === 'tablet' ? 'bg-[#D4A757] text-[#0F1115] font-bold' : 'text-stone-300 hover:text-white'
            }`}
          >
            Tablet (768px)
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`px-3 py-1 rounded-xs transition-colors ${
              viewport === 'mobile' ? 'bg-[#D4A757] text-[#0F1115] font-bold' : 'text-stone-300 hover:text-white'
            }`}
          >
            Mobile (390px)
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 text-xs font-mono font-semibold bg-white/10 hover:bg-white/20 text-white rounded-xs transition-colors flex items-center gap-1"
        >
          <span>&times; Exit Preview</span>
        </button>
      </div>

      {/* Main Preview Scrollable Canvas */}
      <div className="flex-1 overflow-y-auto bg-stone-800 p-4 sm:p-8 flex justify-center">
        <div className={`w-full ${viewportWidthClass} bg-[#F7F3EA] text-[#0F1115] rounded-xs shadow-2xl overflow-hidden transition-all duration-300`}>
          {/* Draft Notice Banner */}
          <div className="bg-amber-400 text-stone-950 px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-between">
            <span>DRAFT PREVIEW &bull; PROTOTYPE STATE (STATUS: {(article.workflowStatus || article.status || 'draft').toUpperCase()})</span>
            <span>SLUG: /articles/{article.slug}/</span>
          </div>

          <div className="p-6 sm:p-12 space-y-8">
            {/* Category & Section Tag */}
            <div className="flex items-center gap-2 text-xs font-mono text-[#8B5E3C] uppercase tracking-wider font-semibold">
              <span>{article.category}</span>
              <span>&bull;</span>
              {/* Batch 04-A: the literal 'Feature' here was a seventh vocabulary — a
                  value absent from the registry, the dropdown and the database.
                  The registry label is used, and an unknown value is shown as
                  stored rather than replaced. */}
              <span>{labelIn(typeSnapshot, article.articleType) || 'Unclassified'}</span>
              <span>&bull;</span>
              <span>{article.readTime || '4 min read'}</span>
            </div>

            {/* Headline (H1) & Deck */}
            <div className="space-y-4">
              <h1 className="text-3xl sm:text-5xl font-serif font-black text-[#0F1115] leading-[1.15] tracking-tight">
                {article.title}
              </h1>
              {article.deck && (
                <p className="text-lg sm:text-xl font-sans text-stone-700 leading-relaxed font-light">
                  {article.deck}
                </p>
              )}
            </div>

            {/* Author Byline Strip */}
            <div className="flex items-center gap-3 pt-4 border-t border-stone-300 text-xs font-sans text-stone-600">
              <div className="w-10 h-10 rounded-full bg-[#1E293B] text-[#D4A757] flex items-center justify-center font-serif font-bold text-sm">
                {article.author.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <div className="font-bold text-stone-900 text-sm">{article.author.name}</div>
                <div className="text-[11px] text-stone-500 font-mono">{article.author.role}</div>
              </div>
              <span className="text-stone-300 ml-auto font-mono text-[11px]">
                {article.publishedAt || 'Unpublished Draft'}
              </span>
            </div>

            {/* Featured Hero Photography */}
            {article.heroImage && (
              <div className="space-y-2">
                <div className="relative aspect-16/9 bg-stone-900 rounded-sm overflow-hidden border border-stone-300 shadow-sm">
                  <img
                    src={article.heroImage}
                    alt={article.imageAltText || article.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-stone-500 font-sans italic px-1">
                  <span>{article.imageCaption || article.imageAltText}</span>
                  <span className="font-mono text-stone-400 not-italic">Credit: {article.imageCredit}</span>
                </div>
              </div>
            )}

            {/* Commercial Disclosure if applicable */}
            {article.disclosure && article.disclosure !== 'none' && (
              <DisclosureBanner
                type={article.disclosure}
                customNote={article.disclosureNote}
              />
            )}

            {/* Structured Article Body */}
            <div className="pt-4 border-t border-stone-300">
              <ArticleBody article={article} />
            </div>

            {/* Sources list */}
            {article.sources && article.sources.length > 0 && (
              <div className="pt-6 border-t border-stone-300">
                <SourceList sources={article.sources} />
              </div>
            )}

            {/* Author Bio */}
            <div className="pt-6 border-t border-stone-300">
              <AuthorBio author={article.author} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

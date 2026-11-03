'use client';

import React, { useState } from 'react';
import { Article } from '../../../types';

interface SearchAppearancePreviewProps {
  article: Partial<Article>;
  slug: string;
}

export const SearchAppearancePreview: React.FC<SearchAppearancePreviewProps> = ({ article, slug }) => {
  const [deviceView, setDeviceView] = useState<'desktop' | 'mobile'>('desktop');
  const [previewTab, setPreviewTab] = useState<'google' | 'social'>('google');

  const displayTitle = (article.seo?.title || article.title || article.headline || 'Article Headline').trim();
  const displayDesc = (article.seo?.description || article.excerpt || article.deck || 'Authoritative championship rodeo reporting and spectator intelligence from NFRGuide.com.').trim();
  const displayImage = article.heroImage || '/assets/images/hero_bull_riding_1793166440262.jpg';
  const canonicalUrl = `https://nfrguide.com/articles/${slug || 'article-slug'}/`;

  return (
    <div className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs space-y-4">
      {/* Header & View Switchers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-stone-100 gap-2">
        <div>
          <h4 className="font-serif font-bold text-stone-900 text-sm">
            Search Appearance &amp; Social Card Preview
          </h4>
          <p className="text-[11px] text-ink-muted font-sans">
            Visual simulation of Google SERP indexing and OpenGraph social shares.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-stone-100 p-0.5 rounded-xs flex text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setPreviewTab('google')}
              className={`px-2 py-1 rounded-xs transition-colors ${
                previewTab === 'google' ? 'bg-white text-stone-900 font-bold shadow-2xs' : 'text-ink-muted hover:text-stone-900'
              }`}
            >
              Google SERP
            </button>
            <button
              type="button"
              onClick={() => setPreviewTab('social')}
              className={`px-2 py-1 rounded-xs transition-colors ${
                previewTab === 'social' ? 'bg-white text-stone-900 font-bold shadow-2xs' : 'text-ink-muted hover:text-stone-900'
              }`}
            >
              Social (OG)
            </button>
          </div>

          {previewTab === 'google' && (
            <div className="bg-stone-100 p-0.5 rounded-xs flex text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setDeviceView('desktop')}
                className={`px-2 py-1 rounded-xs transition-colors ${
                  deviceView === 'desktop' ? 'bg-white text-stone-900 font-bold shadow-2xs' : 'text-ink-muted'
                }`}
              >
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setDeviceView('mobile')}
                className={`px-2 py-1 rounded-xs transition-colors ${
                  deviceView === 'mobile' ? 'bg-white text-stone-900 font-bold shadow-2xs' : 'text-ink-muted'
                }`}
              >
                Mobile
              </button>
            </div>
          )}
        </div>
      </div>

      {/* GOOGLE PREVIEW */}
      {previewTab === 'google' && (
        <div className={`p-4 bg-[#F8F9FA] border border-stone-200 rounded-sm font-sans ${deviceView === 'mobile' ? 'max-w-md mx-auto shadow-sm' : ''}`}>
          {/* Breadcrumb row */}
          <div className="flex items-center gap-1.5 text-xs text-[#202124] mb-1">
            <div className="w-4 h-4 rounded-full bg-[#0F1115] text-[#D4A757] flex items-center justify-center text-[9px] font-bold font-serif">
              N
            </div>
            <div className="flex items-center gap-1 text-[12px] text-[#4d5156] font-normal leading-none truncate">
              <span>nfrguide.com</span>
              <span className="text-ink-muted">&rsaquo;</span>
              <span>articles</span>
              <span className="text-ink-muted">&rsaquo;</span>
              <span className="truncate">{slug || 'article-slug'}</span>
            </div>
          </div>

          {/* Title row */}
          <h3 className="text-[#1a0dab] hover:underline font-normal text-base sm:text-lg leading-snug cursor-pointer line-clamp-2">
            {displayTitle}
          </h3>

          {/* Description snippet */}
          <p className="text-[#4d5156] text-xs sm:text-sm leading-relaxed mt-1 line-clamp-3">
            {displayDesc}
          </p>

          <div className="mt-3 pt-2 border-t border-stone-200/60 flex items-center justify-between text-[10px] font-mono text-ink-muted">
            <span>Title: {displayTitle.length} chars (Target: 35–65)</span>
            <span>Desc: {displayDesc.length} chars (Target: 110–165)</span>
          </div>
        </div>
      )}

      {/* SOCIAL CARD PREVIEW */}
      {previewTab === 'social' && (
        <div className="max-w-lg mx-auto bg-white border border-stone-300 rounded-lg overflow-hidden shadow-sm font-sans">
          <div className="relative aspect-16/9 bg-stone-900 overflow-hidden">
            <img
              src={displayImage}
              alt={displayTitle}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 bg-black/70 text-[#D4A757] font-serif font-black text-[10px] px-2 py-0.5 uppercase tracking-wider rounded-xs">
              NFRGuide
            </div>
          </div>
          <div className="p-3 bg-stone-50 border-t border-stone-200">
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-muted block mb-0.5">
              NFRGUIDE.COM &bull; INDEPENDENT RODEO JOURNALISM
            </span>
            <h4 className="font-serif font-bold text-stone-900 text-sm leading-snug line-clamp-2 mb-1">
              {displayTitle}
            </h4>
            <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
              {displayDesc}
            </p>
          </div>
        </div>
      )}

      {/* Canonical URL & Indexing Directives */}
      <div className="pt-2 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
        <div>
          <span className="text-[10px] text-ink-muted uppercase tracking-wider block">Canonical URL:</span>
          <span className="text-stone-700 truncate block text-[11px]">{canonicalUrl}</span>
        </div>
        <div>
          <span className="text-[10px] text-ink-muted uppercase tracking-wider block">Robots Directives:</span>
          <span className="text-emerald-700 font-semibold block text-[11px]">index, follow (SSL Enforced)</span>
        </div>
      </div>
    </div>
  );
};

'use client';

import React, { useState, useMemo } from 'react';
import { Article } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { ImageWithCredit } from '../ImageWithCredit';
import { type SectionCopy, copyOr } from './sectionCopy';

interface LatestCoverageProps {
  articles: Article[];
  onSelectArticle: (article: Article) => void;
  /** Page Builder copy overrides. */
  copy?: SectionCopy;
  /** DOM id — must be unique when the block is used more than once. */
  anchorId?: string;
}

/**
 * Stage 03 (R-4) — the filter tabs are DERIVED from the articles this block was
 * given, not from a compiled-in list.
 *
 * The list used to be the five foundational section names, so an
 * administrator-created category could never appear on the homepage filter
 * however much it published — the same hardcoding H-01 removed from the editor.
 *
 * Deriving from the data makes both failure directions impossible: a tab can
 * never be empty, and a category present in the feed can never be missing. It
 * also satisfies "do not automatically display every new Category" — a category
 * appears only once the Builder's own article selection actually contains one
 * of its articles, so the Builder keeps deciding what the homepage shows.
 *
 * Order follows the feed (most recent first), which keeps the tab strip stable
 * for the editorial mix currently published rather than reordering on a whim.
 */
function deriveCategories(articles: Article[]): string[] {
  const seen: string[] = [];
  for (const a of articles) {
    const name = a.category?.trim();
    if (name && !seen.includes(name)) seen.push(name);
  }
  return ['All', ...seen];
}

export const LatestCoverage: React.FC<LatestCoverageProps> = ({
  articles,
  onSelectArticle,
  copy = {},
  anchorId = 'latest-coverage',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const categories = useMemo(() => deriveCategories(articles), [articles]);

  const filteredArticles = useMemo(() => {
    if (selectedCategory === 'All') return articles;
    return articles.filter((a) => a.category === selectedCategory);
  }, [articles, selectedCategory]);

  const featuredStory = filteredArticles[0] || articles[0];
  const standardStories = filteredArticles.slice(1);

  return (
    <section id={anchorId} className="w-full bg-[#F7F3EA] text-[#0F1115] py-14 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker={copyOr(copy.kicker, 'Latest')}
          title={copyOr(copy.title, 'Latest NFR Coverage')}
          description={copyOr(copy.description, 'The most recently published articles.')}
          actionLabel={copyOr(copy.ctaText, 'View All Coverage')}
          actionHref={copy.ctaUrl?.trim() || undefined}
          onActionClick={() => setSelectedCategory('All')}
        />

        {/* Category Filter Tabs (Interactive Filter Control - Compliant with Design Rules) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-4 mb-8 scrollbar-none border-b border-stone-200">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-[#0F1115] text-[#D4A757]'
                  : 'bg-white/80 text-stone-600 hover:text-stone-900 hover:bg-white border border-stone-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Magazine Grid: Featured Hero Story + 2-Column Standard Card List */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Featured Editorial Card (Col 1-7) */}
          {featuredStory && (
            <article 
              onClick={() => onSelectArticle(featuredStory)}
              className="lg:col-span-7 bg-white p-6 sm:p-8 border border-stone-300 rounded-sm shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
            >
              <div className="mb-4 overflow-hidden rounded-sm">
                <ImageWithCredit
                  src={featuredStory.heroImage}
                  alt={featuredStory.title}
                  credit={featuredStory.imageCredit}
                  aspectRatioClass="aspect-[16/10]"
                />
              </div>

              <div className="flex items-center gap-2 text-xs font-sans text-ink-muted mb-2">
                <span className="font-semibold text-[#8B5E3C] uppercase tracking-wider">
                  {featuredStory.category}
                </span>
                <span aria-hidden="true">&middot;</span>
                <span>{featuredStory.readTime}</span>
                <span aria-hidden="true">&middot;</span>
                <span>{featuredStory.publishedAt}</span>
              </div>

              <h3 className="text-xl sm:text-2xl font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">
                {featuredStory.title}
              </h3>

              <p className="mt-3 text-sm sm:text-base text-stone-700 font-sans leading-relaxed">
                {featuredStory.deck}
              </p>

              <div className="mt-6 pt-4 border-t border-stone-200 flex items-center justify-between text-xs font-sans">
                <span className="font-semibold text-stone-900">By {featuredStory.author.name}</span>
                <span className="text-[#8B5E3C] font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                  Read Full Story &rarr;
                </span>
              </div>
            </article>
          )}

          {/* Standard Article Cards (Col 8-12) */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            {standardStories.map((story) => (
              <article
                key={story.id}
                onClick={() => onSelectArticle(story)}
                className="bg-white p-5 border border-stone-300 rounded-sm hover:border-[#8B5E3C] transition-colors cursor-pointer group flex flex-col sm:flex-row lg:flex-col gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-[11px] font-sans text-ink-muted mb-1.5">
                    <span className="font-semibold text-[#8B5E3C] uppercase tracking-wider">
                      {story.category}
                    </span>
                    <span aria-hidden="true">&middot;</span>
                    <span>{story.readTime}</span>
                    <span aria-hidden="true">&middot;</span>
                    <span>{story.publishedAt}</span>
                  </div>

                  <h4 className="text-base font-serif font-semibold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">
                    {story.title}
                  </h4>

                  <p className="mt-1.5 text-xs text-stone-600 font-sans line-clamp-2 leading-relaxed">
                    {story.deck}
                  </p>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] font-sans text-ink-muted">
                  <span>{story.author.name}</span>
                  <span className="text-[#8B5E3C] font-medium group-hover:translate-x-1 transition-transform">
                    Read &rarr;
                  </span>
                </div>
              </article>
            ))}

            {standardStories.length === 0 && (
              <div className="p-8 bg-white border border-stone-300 text-center text-xs text-ink-muted font-sans">
                Showing single featured dispatch for {selectedCategory}.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

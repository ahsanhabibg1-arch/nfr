'use client';

import React, { useState, useMemo } from 'react';
import { Article } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { ImageWithCredit } from '../ImageWithCredit';
import { type SectionCopy, copyOr } from './sectionCopy';
import { ROUTES } from '../../config/routes';

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
        {/*
          Stage 06-R (R-04 §9.6) — the CTA now has a destination.

          It used to fall back to `undefined`, which made `SectionHeading`
          render a <button> whose only effect was resetting this component's own
          filter: a control labelled "View All Coverage" that went nowhere.
          `/coverage/` is that archive, used only as the DEFAULT — an
          administrator's own `ctaUrl` still wins, so an intentional custom
          destination is never overridden. Clearing the LABEL still hides the
          control entirely, which is how a section turns the CTA off.
        */}
        <SectionHeading
          kicker={copyOr(copy.kicker, 'Latest')}
          title={copyOr(copy.title, 'Latest NFR Coverage')}
          description={copyOr(copy.description, 'The most recently published articles.')}
          actionLabel={copyOr(copy.ctaText, 'View All Coverage')}
          actionHref={copy.ctaUrl?.trim() || ROUTES.COVERAGE}
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

        {/*
          Magazine Grid: Featured Hero Story + 2-Column Standard Card List.

          Stage 07 (UI-01). The row used to be `items-start`, so the featured
          card was only ever as tall as its own content while the stacked column
          beside it grew with every card it held. The result was a short card
          next to a tall list, read as "excessive unused space" — the excerpt was
          never truncated, there was simply nothing filling the rest of the row.

          `lg:items-stretch` lets the featured card take the row's full height
          and `lg:h-full` + a column flex layout distribute that height: the
          image keeps its aspect ratio, the text block takes the slack, and the
          byline sits on the bottom edge via `mt-auto`. Both constraints are
          `lg:`-scoped so the single-column mobile layout keeps its natural
          height and inherits none of it.
        */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start lg:items-stretch">
          {/* Featured Editorial Card (Col 1-7) */}
          {featuredStory && (
            <article
              onClick={() => onSelectArticle(featuredStory)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectArticle(featuredStory);
                }
              }}
              tabIndex={0}
              role="link"
              aria-label={featuredStory.title}
              className="lg:col-span-7 lg:h-full flex flex-col bg-white p-6 sm:p-8 border border-stone-300 rounded-sm shadow-sm hover:shadow-md transition-shadow cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5E3C] focus-visible:ring-offset-2"
            >
              {/*
                Stage 06-R (R-03) — the photograph absorbs the leftover height,
                within bounds.

                Equalising the card heights alone left a blank band in the
                middle of the card: the deck is a single editorial sentence and
                inventing more text is out of bounds, so the only honest thing
                that can grow is the image. `lg:flex-1` hands this box the
                leftover height and the arbitrary child selectors stretch the
                figure and its ratio box with it; the `<img>` is already
                `h-full object-cover`.

                Two deliberate guards, both learned from the first attempt:
                  - this wrapper stays a BLOCK, never `flex`. Making it a flex
                    container previously let the figure establish its own
                    intrinsic width and produced horizontal overflow at 360,
                    390, 768 and 1024px.
                  - `lg:max-h-[26rem]` bounds the growth, so `object-cover`
                    trims a little off a 16:10 photograph rather than cropping
                    a tall slot out of the middle of it.

                `aspect-[16/10]` still governs every width below `lg`, so the
                stacked mobile card keeps a reserved, predictable image box.
              */}
              <div className="mb-4 overflow-hidden rounded-sm w-full lg:flex-1 lg:min-h-[14rem] lg:max-h-[26rem] [&>figure]:lg:h-full [&>figure>div]:lg:h-full">
                <ImageWithCredit
                  src={featuredStory.heroImage}
                  alt={featuredStory.title}
                  credit={featuredStory.imageCredit}
                  aspectRatioClass="aspect-[16/10] lg:aspect-auto"
                />
              </div>

              {/*
                Sizes to its CONTENT, deliberately.

                This block used to be `flex-1` as well. With the image wrapper
                above also `flex-1`, the two siblings split the row's leftover
                height between them — so half the slack reappeared as a blank
                band between the excerpt and the byline, which is the very thing
                UI-01 was raised about. Exactly one element may grow, and it is
                the photograph.
              */}
              <div className="shrink-0">
                <div className="flex items-center gap-2 text-xs font-sans text-ink-muted mb-2">
                  <span className="font-semibold text-[#8B5E3C] uppercase tracking-wider">
                    {featuredStory.category}
                  </span>
                  <span aria-hidden="true">&middot;</span>
                  <span>{featuredStory.readTime}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span>{featuredStory.publishedAt}</span>
                </div>

                <h3 className="text-xl sm:text-2xl font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug text-balance">
                  {featuredStory.title}
                </h3>

                {/*
                  More of the editorial deck is shown on wide screens, where the
                  space exists, and it stays clamped so an unusually long deck
                  cannot overflow the card or push the byline out of the row. The
                  deck is optional, so nothing renders when it is absent.
                */}
                {featuredStory.deck && (
                  <p className="mt-3 text-sm sm:text-base text-stone-700 font-sans leading-relaxed line-clamp-4 lg:line-clamp-6">
                    {featuredStory.deck}
                  </p>
                )}
              </div>

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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectArticle(story);
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={story.title}
                className="bg-white p-5 border border-stone-300 rounded-sm hover:border-[#8B5E3C] transition-colors cursor-pointer group flex flex-col sm:flex-row lg:flex-col gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5E3C] focus-visible:ring-offset-2"
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

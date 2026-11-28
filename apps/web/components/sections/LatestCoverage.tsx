'use client';

import React, { useState, useMemo, useRef, useLayoutEffect } from 'react';
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

/**
 * The featured card's lead text, longest-first, with no repetition.
 *
 * `deck` is the editorial summary and `excerpt` the concise one; measured
 * across the published set they run 166-216 and 159-173 characters and say
 * DIFFERENT things, so together they supply roughly twice the material the
 * deck alone can. That matters because the number of lines the card shows is
 * decided by the space available (see `useFittedClamp`), and a deck that runs
 * out mid-gap would leave the blank band this is here to remove.
 *
 * The article BODY is deliberately NOT used. `toCardArticle` (lib/content.ts)
 * empties `content` and `structuredBody` for every card list, because the
 * homepage was serialising 16 complete articles into the client payload to
 * render titles and decks. Reaching for the body here would undo a measured
 * performance fix; `deck` and `excerpt` both survive that projection and cost
 * nothing extra.
 *
 * One is dropped when it merely repeats the other, which happens when an
 * editor fills both fields with the same sentence.
 */
function leadText(article: Article): string {
  const deck = (article.deck ?? '').trim();
  const excerpt = (article.excerpt ?? '').trim();

  const summary: string[] = [];
  if (deck) summary.push(deck);
  if (excerpt) {
    const a = deck.toLowerCase();
    const b = excerpt.toLowerCase();
    // Skip an excerpt that merely restates the deck, which happens when an
    // editor fills both fields with the same sentence.
    if (!deck || !(a === b || a.includes(b))) {
      if (b.includes(a) && deck) summary[0] = excerpt;
      else summary.push(excerpt);
    }
  }

  /*
    Then the article's own opening, if the resolver supplied one.

    `homepageData` gives THIS slot a bounded lead through
    `toCardArticlesWithLead`; every other card list still arrives with an empty
    `content`, so this simply contributes nothing there. The paragraph is
    already trimmed to `CARD_LEAD_MAX_CHARS` on a word boundary server-side —
    nothing is re-cut here, because the clamp decides how much of it is seen.

    It goes LAST on purpose. The deck is the sentence an editor wrote to sell
    the piece, so it leads; the body is what continues once the summary runs
    out, which is the order a reader expects.
  */
  const body = (article.content ?? []).map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);
  if (body.length) {
    const alreadySaid = summary.join(' ').toLowerCase();
    for (const paragraph of body) {
      if (!alreadySaid.includes(paragraph.toLowerCase().slice(0, 60))) summary.push(paragraph);
    }
  }

  return summary.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * How many lines of text fit the space the layout actually left, measured.
 *
 * THE PROBLEM THIS SOLVES. The featured card is as tall as the column of
 * cards beside it, and that column's height is editorial: it depends on how
 * many articles the Builder selected. The deck was clamped to a fixed
 * `lg:line-clamp-6`, so on a tall row the card ran out of text long before it
 * ran out of height and the remainder showed as a blank band under the byline.
 * A fixed clamp cannot answer a question whose answer changes with the data.
 *
 * WHY MEASUREMENT RATHER THAN CSS. `-webkit-line-clamp` takes a number, not a
 * height, so no stylesheet can express "as many lines as fit". The number is
 * computed here from two things the browser already knows: the height flexbox
 * handed the text box, and the paragraph's own resolved `line-height`.
 *
 * WHY THIS CANNOT FEED BACK ON ITSELF. The observed element is the WRAPPER,
 * whose height comes from `flex-grow` and is therefore independent of how much
 * text the clamp lets through; the clamp is applied to the paragraph INSIDE it,
 * under `overflow-hidden`. Changing the clamp cannot change what is measured,
 * so the observer settles after one pass.
 *
 * Returns `undefined` below `lg`, where the stacked card has no leftover height
 * to fill and the CSS clamp should govern unchanged. `undefined` is also the
 * server-rendered value, so the markup hydrates with the CSS clamp and the
 * measured one replaces it on the client — no mismatch, and no layout jump
 * beyond the lines that appear.
 */
function useFittedClamp(
  boxRef: React.RefObject<HTMLElement | null>,
  textRef: React.RefObject<HTMLElement | null>,
  minLines: number,
  deps: ReadonlyArray<unknown>,
): number | undefined {
  const [lines, setLines] = useState<number | undefined>(undefined);

  // Layout effect: the clamp lands in the same frame as the measurement, so the
  // reader never sees the un-clamped paragraph flash at full length.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text || typeof window === 'undefined') return;

    const measure = () => {
      if (!window.matchMedia('(min-width: 1024px)').matches) {
        setLines(undefined);
        return;
      }
      const lineHeight = parseFloat(window.getComputedStyle(text).lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;

      const available = box.clientHeight;
      if (available <= 0) return;

      // A hair of tolerance: a fractional line-height can otherwise lose the
      // last line to a rounding error of a fraction of a pixel.
      const fits = Math.floor((available + 1) / lineHeight);
      setLines((previous) => {
        const next = Math.max(minLines, fits);
        return previous === next ? previous : next;
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(box);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return lines;
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

  const deckBoxRef = useRef<HTMLDivElement | null>(null);
  const deckTextRef = useRef<HTMLParagraphElement | null>(null);
  /*
    Re-measured whenever anything that can change the row's height changes: a
    different featured story, a different NUMBER of cards in the column beside
    it (the filter tabs change both), and the viewport.
  */
  const deckLines = useFittedClamp(deckBoxRef, deckTextRef, 3, [
    featuredStory?.id,
    standardStories.length,
    selectedCategory,
  ]);
  const featuredLead = featuredStory ? leadText(featuredStory) : '';

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
                THE PHOTOGRAPH IS SHOWN WHOLE. It no longer absorbs height.

                Stage 06-R made this box `lg:flex-1` with `lg:aspect-auto`, so
                it took the row's leftover height and the figure stretched with
                it. The `<img>` is `object-cover`, so every pixel of extra
                height came out of the picture: hero images are authored at
                1600x900, the box drifted anywhere between 16:10 and far taller,
                and the difference was cropped off the top and bottom. Raising
                the bound only changed how MUCH was cropped.

                A fixed `aspect-[16/9]` matches the authored ratio exactly, at
                every width, so `object-cover` has nothing to trim and the frame
                the editor chose is the frame the reader sees. `shrink-0` keeps
                it out of the flex negotiation entirely.

                Leftover height is now the text's to fill — see `featuredLead`,
                which is why that text reaches into the article body.

                One guard carried forward: this wrapper stays a BLOCK, never
                `flex`. Making it a flex container previously let the figure
                establish its own intrinsic width and produced horizontal
                overflow at 360, 390, 768 and 1024px.
              */}
              <div className="mb-4 overflow-hidden rounded-sm w-full shrink-0">
                <ImageWithCredit
                  src={featuredStory.heroImage}
                  alt={featuredStory.title}
                  credit={featuredStory.imageCredit}
                  aspectRatioClass="aspect-[16/9]"
                />
              </div>

              {/*
                THE TEXT absorbs the row's leftover height, now that it can.

                The order this arrived at matters, because the two obvious
                arrangements both fail:

                  - only the photograph grows: it is `object-cover`, so every
                    extra pixel of height is cropped off a 1600x900 original.
                    The gap closes by damaging the picture.
                  - the text grows while `deck` and `excerpt` are its only
                    source: about five lines of material for a dozen lines of
                    room, so the blank band simply moves above the byline. A
                    clamp LIMITS text; it cannot produce any.

                So the photograph keeps its authored ratio and sits out the flex
                negotiation, and this block grows — with enough text behind it
                to be worth growing, from the bounded body lead the homepage
                resolver attaches to this one slot. `useFittedClamp` then shows
                exactly as many lines as the height allows.

                `lg:min-h-0` is what lets the measured box inside be shorter
                than its own content; without it the paragraph would push the
                card taller instead of being clipped to fit.
              */}
              <div className="shrink-0 lg:grow lg:min-h-0 lg:flex lg:flex-col">
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
                  The lead text fills whatever height the row leaves over.

                  The wrapper is what grows and what is measured; the paragraph
                  inside is what gets clipped. `line-clamp-4` is the base — it
                  supplies the `-webkit-box` display, orientation and overflow
                  that `-webkit-line-clamp` needs, and it is what mobile and the
                  server-rendered markup use. The inline `WebkitLineClamp` then
                  overrides only the NUMBER, once the client has measured.

                  So a short row still reads as the design always did, and a tall
                  one — five or six cards in the column beside it — simply shows
                  more of the same text instead of a blank band.
                */}
                {featuredLead && (
                  <div ref={deckBoxRef} className="mt-3 lg:grow lg:min-h-0 overflow-hidden">
                    <p
                      ref={deckTextRef}
                      style={deckLines ? { WebkitLineClamp: deckLines } : undefined}
                      className="text-sm sm:text-base text-stone-700 font-sans leading-relaxed line-clamp-4 lg:line-clamp-6"
                    >
                      {featuredLead}
                    </p>
                  </div>
                )}
              </div>

              {/*
                Pinned to the card's bottom edge. Without `mt-auto` any height
                the blocks above failed to claim collected BELOW the byline —
                which is exactly where the reported blank band sat. It is now
                claimed above, by the text; `mt-auto` guarantees that whatever
                remains in an edge case stays above this rule rather than under
                it, so the card always ends on its byline.
              */}
              <div className="mt-6 lg:mt-auto pt-4 border-t border-stone-200 flex items-center justify-between text-xs font-sans shrink-0">
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

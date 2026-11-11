import React from 'react';
import Link from 'next/link';
import { Article } from '../../types';
import { ROUTES } from '../../config/routes';

/**
 * STAGE 08 TASK H - accessibility and crawlability correction.
 *
 * THE DEFECT, found while investigating Stage 07's Task B and reported there.
 *
 *   - Each secondary story was `<article onClick={() => onSelectArticle(story)}>`:
 *     a div-with-a-click-handler. Not focusable, not reachable by keyboard, not
 *     announced as a link by a screen reader, and carrying NO `href` - so it was
 *     invisible to crawlers and could not be opened in a new tab or
 *     middle-clicked.
 *   - The lead story's call to action was a `<button>` performing client-side
 *     navigation, with the same crawlability and new-tab consequences.
 *
 * On the homepage's most prominent element, that was up to five internal links
 * that no crawler could follow and no keyboard user could reach.
 *
 * THE FIX. Real `next/link` anchors with real hrefs, one per article:
 *
 *   - the lead CTA is an anchor styled exactly as the button was;
 *   - each secondary card is an `<article>` containing ONE anchor that wraps the
 *     whole card, so the entire card stays clickable as before.
 *
 * Deliberate choices:
 *
 *   - ONE link per article. The directive forbids duplicating the same article
 *     link unnecessarily, so the lead headline stays text (the CTA is its link)
 *     and a secondary card has a single anchor rather than separate links on its
 *     image, title and "Read" affordance. One crawlable href per article is what
 *     crawlability needs; three would add noise and three focus stops.
 *   - NO nested interactive elements. The card anchor contains only text and an
 *     image, and the "Read" affordance is a plain span.
 *   - `onSelectArticle` is GONE. It existed only to call `router.push`, which is
 *     what an anchor does natively and better. Removing it also removes
 *     `useRouter` from `EditorialHeroBlock`, reducing the client-component
 *     surface Stage 07 measured in its Task B decision.
 *   - The component no longer needs `'use client'`: with the handler gone it has
 *     no client-side behaviour at all.
 *
 * Styling, layout, hover behaviour and markup structure are otherwise
 * unchanged. Focus-visible rings are added, which paints only where a keyboard
 * user is already focused.
 */
interface EditorialHeroProps {
  leadArticle: Article;
  secondaryStories: Article[];
  /** Page Builder overrides. */
  heroImageUrl?: string;
  heroImageAlt?: string;
  kicker?: string;
  ctaText?: string;
}

export const EditorialHero: React.FC<EditorialHeroProps> = ({
  leadArticle,
  secondaryStories,
  heroImageUrl,
  heroImageAlt,
  kicker,
  ctaText,
}) => {
  const imageSrc = heroImageUrl?.trim() || leadArticle.heroImage;
  const imageAlt = heroImageUrl?.trim() ? (heroImageAlt?.trim() || leadArticle.title) : (leadArticle.imageAltText || leadArticle.title);
  return (
    <section className="relative w-full bg-[#0F1115] text-white pt-4 pb-14 border-b border-white/10 overflow-hidden">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Editorial Context Kicker */}
        <div className="flex items-center justify-between text-xs font-sans text-stone-400 pb-3 border-b border-white/10 mb-6">
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-widest text-[#D4A757]">
              {kicker?.trim() || 'Lead Editorial Feature'}
            </span>
          </div>
        </div>

        {/* Cinematic Split/Backdrop Hero Stage */}
        <div className="relative rounded-sm overflow-hidden border border-white/10 shadow-2xl bg-[#1E293B]">
          {/* Background Image Layer */}
          <div className="absolute inset-0 z-0">
            {/* D-A3: `heroImage` is optional at publication, so render the image
                only when there is one. The stage already carries the dark
                `bg-[#1E293B]` backdrop that the gradient scrim sits on, so an
                article with no hero still gets the intended look instead of a
                broken-image icon. */}
            {imageSrc?.trim() ? (
              <img
                src={imageSrc}
                alt={imageAlt}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-right md:object-center brightness-90 transform scale-100 hover:scale-[1.01] transition-transform duration-700 ease-out"
              />
            ) : null}
            {/* Cinematic Gradient Scrim: Deep dark on left/bottom for perfect typography contrast */}
            <div 
              className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-[#0F1115] via-[#0F1115]/85 to-transparent md:to-black/30"
              aria-hidden="true" 
            />
          </div>

          {/* Foreground Hero Content */}
          <div className="relative z-10 p-6 sm:p-10 md:p-14 lg:p-16 max-w-2xl lg:max-w-3xl flex flex-col justify-end min-h-[480px] sm:min-h-[540px] md:min-h-[580px]">
            {/* Category and Subtopic kicker */}
            <div className="flex items-center gap-2 text-xs font-sans mb-3 text-stone-300">
              <span className="text-[#D4A757] font-bold uppercase tracking-wider">
                {leadArticle.category}
              </span>
              <span aria-hidden="true">&middot;</span>
              <span className="text-stone-300">{leadArticle.subcategory}</span>
              <span aria-hidden="true">&middot;</span>
              <span className="text-stone-400">{leadArticle.readTime}</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-serif font-bold text-white leading-[1.15] tracking-tight text-balance">
              {leadArticle.title}
            </h1>

            {/* Deck / Summary */}
            <p className="mt-4 text-sm sm:text-base md:text-lg text-stone-200 font-sans leading-relaxed text-balance line-clamp-3 sm:line-clamp-4">
              {leadArticle.deck}
            </p>

            {/* Author Byline & CTA */}
            <div className="mt-6 pt-6 border-t border-white/15 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-xs font-sans text-stone-300">
                <div className="w-8 h-8 rounded-full bg-[#D4A757] text-[#0F1115] font-serif font-bold flex items-center justify-center">
                  {leadArticle.author.name.charAt(0)}
                </div>
                <div>
                  <span className="font-semibold text-white block">{leadArticle.author.name}</span>
                  <span className="text-stone-400 text-[11px]">{leadArticle.author.role}</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* A real anchor, styled exactly as the button was. The
                    accessible name includes the article title, so a screen
                    reader announces "Read Full Article: <title>" instead of
                    several identical "Read Full Article" links on one page. */}
                <Link
                  href={ROUTES.ARTICLE(leadArticle.slug)}
                  aria-label={`${ctaText?.trim() || 'Read Full Article'}: ${leadArticle.title}`}
                  className="inline-block px-5 py-2.5 bg-[#D4A757] hover:bg-[#C59642] text-[#0F1115] font-sans font-bold text-xs uppercase tracking-wider rounded-sm shadow-md transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F1115]"
                >
                  {ctaText?.trim() || 'Read Full Article'} &rarr;
                </Link>
              </div>
            </div>

            {/* Image Credit Tag (the article's credit does not apply to an override image) */}
            {!heroImageUrl?.trim() && leadArticle.imageCredit && (
              <div className="mt-4 text-[10px] font-sans text-stone-400 italic">
                Photo: {leadArticle.imageCredit}
              </div>
            )}
          </div>
        </div>

        {/* Secondary Editorial Stories Row */}
        {secondaryStories.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {secondaryStories.map((story) => (
            <article key={story.id} className="group">
              {/* ONE anchor wrapping the whole card. The card remains clickable
                  exactly where it was clickable before, and is now also
                  focusable, announced as a link, openable in a new tab and
                  followable by a crawler. `group` moved to the <article> so
                  every existing `group-hover:` rule still fires. */}
              <Link
                href={ROUTES.ARTICLE(story.slug)}
                className="flex flex-col sm:flex-row gap-4 items-start p-5 bg-[#1E293B]/60 hover:bg-[#1E293B] border border-white/10 rounded-sm transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A757] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F1115]"
              >
              <div className="w-full sm:w-36 h-28 shrink-0 overflow-hidden rounded-sm bg-black/40">
                {/* D-A3: see the hero stage above — the wrapper's `bg-black/40`
                    is the placeholder when a story has no hero image. */}
                {story.heroImage?.trim() ? (
                  <img
                    src={story.heroImage}
                    alt={story.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                  />
                ) : null}
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-sans text-stone-400 mb-1">
                    <span className="text-[#D4A757] font-semibold uppercase">{story.category}</span>
                    <span aria-hidden="true">&middot;</span>
                    <span>{story.readTime}</span>
                  </div>
                  {/* Stage 09 continuation — accessibility fix.
                      This was an `h3` directly after the page's only `h1` (the
                      lead story headline), with no `h2` between them, so the
                      homepage skipped a heading level and `e2e/a11y.spec.ts`
                      failed with "h1→h3". A secondary story sits one level below
                      the page headline, so `h2` is both the correct level and
                      consistent with the sibling section headings ("Latest NFR
                      Coverage"). Visual size is set by the classes, not the tag,
                      so nothing changes on screen. */}
                  <h2 className="text-base font-serif font-semibold text-white group-hover:text-[#D4A757] transition-colors leading-snug">
                    {story.title}
                  </h2>
                  <p className="mt-1 text-xs text-stone-300 line-clamp-2 font-sans leading-normal">
                    {story.deck}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-stone-400 font-sans">
                  <span>By {story.author.name}</span>
                  {/* A plain span. A nested anchor or button here would be
                      invalid HTML and would add a second focus stop for one
                      destination. aria-hidden because the wrapping link already
                      carries the accessible name. */}
                  <span aria-hidden="true" className="text-[#D4A757] group-hover:translate-x-0.5 transition-transform">Read &rarr;</span>
                </div>
              </div>
              </Link>
            </article>
          ))}
        </div>
        )}
      </div>
    </section>
  );
};

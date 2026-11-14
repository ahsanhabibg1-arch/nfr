import React from 'react';
import Link from 'next/link';
import { Article } from '../../types';
import { ImageWithCredit } from '../ImageWithCredit';
import { IMAGE_SIZES } from '../../lib/media/imageMeta';
import { ROUTES, articleUrl } from '../../config/routes';

/**
 * Card grid of PUBLISHED articles for a homepage module (Requirements v2.0 §3.1).
 * Replaces the Phase 0 static modules: cards show only persisted editorial fields
 * (headline, deck/excerpt, image + credit, read time), and an honest empty state is
 * rendered when the section has no published coverage — never placeholder "facts".
 */
interface HomeArticleFeedProps {
  articles: Article[];
  theme?: 'light' | 'dark';
  /** Section landing page linked from the empty state and footer link. */
  sectionPath: string;
  sectionName: string;
  columns?: 3 | 4;
}

export const HomeArticleFeed: React.FC<HomeArticleFeedProps> = ({
  articles,
  theme = 'light',
  sectionPath,
  sectionName,
  columns = 3,
}) => {
  const dark = theme === 'dark';

  if (articles.length === 0) {
    return (
      <div
        className={`p-8 text-center border border-dashed rounded-sm text-sm font-sans ${
          dark ? 'border-white/20 text-stone-300' : 'border-stone-300 bg-white text-stone-600'
        }`}
        data-empty-state="section-feed"
      >
        <p>No {sectionName} articles have been published yet.</p>
        <Link href={sectionPath} className={`mt-3 inline-block text-xs font-semibold ${dark ? 'text-[#D4A757]' : 'text-[#8B5E3C]'} hover:underline`}>
          Visit {sectionName} &rarr;
        </Link>
      </div>
    );
  }

  const grid = columns === 4 ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3';

  return (
    <>
      <div className={`grid grid-cols-1 ${grid} gap-6`}>
        {articles.map((article) => (
          <article
            key={article.id}
            className={`border rounded-sm overflow-hidden transition-all duration-200 group flex flex-col justify-between ${
              dark
                ? 'bg-[#0F1115] border-white/10 hover:border-[#D4A757]/60'
                : 'bg-white border-stone-300 hover:border-[#8B5E3C] hover:shadow-md'
            }`}
          >
            <div>
              <Link href={articleUrl(article)} tabIndex={-1} aria-hidden="true">
                {/* MED-01B/C — `heroImageAlt` now also honours the media-level
                    default and a deliberate empty ALT, which `||` could not
                    express (it treats '' as missing). Card-sized derivative. */}
                <ImageWithCredit
                  src={article.heroImage}
                  alt={article.heroImageAlt ?? article.imageAltText ?? article.title}
                  credit={article.imageCredit}
                  srcSet={article.heroImageSrcSet}
                  sizes={IMAGE_SIZES.card}
                  width={article.heroImageWidth}
                  height={article.heroImageHeight}
                  tone={dark ? 'dark' : 'light'}
                  aspectRatioClass="aspect-[16/10]"
                />
              </Link>
              <div className="p-5">
                {(article.subcategory || article.readTime) && (
                  <div className={`flex items-center justify-between text-[11px] font-sans mb-1.5 ${dark ? 'text-stone-400' : 'text-stone-500'}`}>
                    <span className={`font-bold uppercase tracking-wider ${dark ? 'text-[#D4A757]' : 'text-[#8B5E3C]'}`}>
                      {article.subcategory}
                    </span>
                    <span>{article.readTime}</span>
                  </div>
                )}
                <h3 className={`text-base font-serif font-bold leading-snug transition-colors ${dark ? 'text-white group-hover:text-[#D4A757]' : 'text-[#0F1115] group-hover:text-[#8B5E3C]'}`}>
                  <Link href={articleUrl(article)}>{article.title}</Link>
                </h3>
                <p className={`mt-2 text-xs font-sans leading-relaxed line-clamp-3 ${dark ? 'text-stone-300' : 'text-stone-600'}`}>
                  {article.deck || article.excerpt}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-6 text-right">
        <Link href={sectionPath} className={`text-xs font-semibold uppercase tracking-wider ${dark ? 'text-[#D4A757]' : 'text-[#8B5E3C]'} hover:underline`}>
          More from {sectionName} &rarr;
        </Link>
      </div>
    </>
  );
};

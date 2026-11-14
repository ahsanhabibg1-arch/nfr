import React from 'react';
import Link from 'next/link';
import { Article } from '../../types';
import { ImageWithCredit } from '../ImageWithCredit';
import { IMAGE_SIZES } from '../../lib/media/imageMeta';
import { ROUTES, articleUrl } from '../../config/routes';

interface RelatedArticlesProps {
  articles: Article[];
  title?: string;
  className?: string;
}

export const RelatedArticles: React.FC<RelatedArticlesProps> = ({
  articles,
  title = 'Related Championship Coverage',
  className = '',
}) => {
  if (articles.length === 0) return null;

  return (
    <section aria-labelledby="related-heading" className={`mt-14 pt-10 border-t border-stone-300 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <span className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] block mb-1">
            Further Reading
          </span>
          <h2 id="related-heading" className="text-2xl font-serif font-bold text-[#0F1115]">
            {title}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {articles.map((art) => (
          <article
            key={art.id}
            className="bg-white border border-stone-200 rounded-sm overflow-hidden hover:border-[#8B5E3C] hover:shadow-sm transition-all flex flex-col justify-between group"
          >
            <div>
              <Link href={articleUrl(art)} tabIndex={-1}>
                {/* MED-01B/C — below the fold by definition: editorial ALT,
                    card-sized derivative, lazy. */}
                <ImageWithCredit
                  src={art.heroImage}
                  alt={art.heroImageAlt ?? art.imageAltText ?? art.title}
                  credit={art.imageCredit}
                  srcSet={art.heroImageSrcSet}
                  sizes={IMAGE_SIZES.card}
                  width={art.heroImageWidth}
                  height={art.heroImageHeight}
                  aspectRatioClass="aspect-[16/10]"
                />
              </Link>

              <div className="p-4">
                <div className="flex items-center gap-2 text-[11px] font-sans text-stone-500 mb-1.5">
                  <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">{art.category}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span>{art.readTime}</span>
                </div>

                <h3 className="text-base font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">
                  <Link href={articleUrl(art)}>
                    {art.title}
                  </Link>
                </h3>

                <p className="mt-1.5 text-xs text-stone-600 font-sans leading-relaxed line-clamp-2">
                  {art.deck}
                </p>
              </div>
            </div>

            <div className="px-4 py-2.5 bg-stone-50 border-t border-stone-100 flex items-center justify-between text-[11px] font-sans text-stone-500">
              <span>{art.author.name}</span>
              <Link
                href={articleUrl(art)}
                className="text-[#8B5E3C] font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1"
              >
                Read &rarr;
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

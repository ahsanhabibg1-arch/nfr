import React from 'react';
import Link from 'next/link';
import { Article } from '../../types';
import { ImageWithCredit } from '../ImageWithCredit';
import { IMAGE_SIZES } from '../../lib/media/imageMeta';
import { ROUTES, articleUrl } from '../../config/routes';

interface EditorialArticleGridProps {
  articles: Article[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export const EditorialArticleGrid: React.FC<EditorialArticleGridProps> = ({
  articles,
  columns = 3,
  className = '',
}) => {
  const colClass = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <div className={`grid ${colClass} gap-6 ${className}`}>
      {articles.map((art) => (
        <article
          key={art.id}
          className="bg-white border border-stone-200 rounded-sm overflow-hidden hover:border-[#8B5E3C] hover:shadow-sm transition-all flex flex-col justify-between group"
        >
          <div>
            <Link href={articleUrl(art)} tabIndex={-1}>
              {/* MED-01B/C — editorial ALT (resolved server-side), card-sized
                  derivative, lazy by default. Cards are never the LCP image. */}
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

            <div className="p-5">
              <div className="flex items-center gap-2 text-[11px] font-sans text-stone-500 mb-1.5">
                <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">{art.category}</span>
                {art.articleType && (
                  <>
                    <span aria-hidden="true">&middot;</span>
                    <span className="text-[10px] uppercase font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                      {art.articleType}
                    </span>
                  </>
                )}
                <span aria-hidden="true">&middot;</span>
                <span>{art.readTime}</span>
              </div>

              <h3 className="text-lg font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">
                <Link href={articleUrl(art)}>
                  {art.title}
                </Link>
              </h3>

              <p className="mt-2 text-xs text-stone-600 font-sans leading-relaxed line-clamp-2">
                {art.deck}
              </p>
            </div>
          </div>

          <div className="px-5 py-3 bg-stone-50 border-t border-stone-100 flex items-center justify-between text-xs font-sans text-stone-500">
            <span>By {art.author.name}</span>
            <Link
              href={articleUrl(art)}
              className="text-[#8B5E3C] font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1"
            >
              Read Article &rarr;
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
};

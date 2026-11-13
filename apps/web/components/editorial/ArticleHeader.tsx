import React from 'react';
import { Article } from '../../types';
import { Breadcrumbs } from './Breadcrumbs';
import { AuthorByline } from './AuthorByline';
import { ImageWithCredit } from '../ImageWithCredit';
import { IMAGE_SIZES } from '../../lib/media/imageMeta';
import { articleCategoryCrumb } from '../../lib/seo/articleBreadcrumb';

interface ArticleHeaderProps {
  article: Article;
}

export const ArticleHeader: React.FC<ArticleHeaderProps> = ({ article }) => {
  /**
   * Stage 03 (R-3) — resolved by the shared helper, so the visible breadcrumb
   * and the JSON-LD on the same page cannot disagree. It previously fell back
   * to `/competition/` for any category outside the compiled-in five, which
   * silently pointed an administrator-created category at NFR Competition.
   */
  const crumb = articleCategoryCrumb(article);

  const breadcrumbs = [
    { label: crumb.name, path: crumb.path },
    ...(article.subcategory ? [{ label: article.subcategory }] : []),
    { label: article.title },
  ];

  return (
    <header className="mb-8 space-y-5">
      {/* Breadcrumb Navigation */}
      <Breadcrumbs items={breadcrumbs} className="mb-2" />

      {/* Meta Line: Category & Article Type Label */}
      <div className="flex items-center gap-2 text-xs font-sans text-ink-muted">
        <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">
          {article.category}
        </span>
        {article.articleType && (
          <>
            <span aria-hidden="true">&middot;</span>
            <span className="text-[11px] uppercase tracking-wider font-mono text-stone-600 bg-stone-200/60 px-2 py-0.5 rounded-xs">
              {article.articleType}
            </span>
          </>
        )}
        {article.subcategory && (
          <>
            <span aria-hidden="true">&middot;</span>
            <span>{article.subcategory}</span>
          </>
        )}
      </div>

      {/* Main Headline (H1) */}
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[#0F1115] leading-[1.18] tracking-tight text-balance">
        {article.title}
      </h1>

      {/* Secondary Editorial Deck */}
      {article.deck && (
        <p className="text-lg sm:text-xl text-stone-700 font-serif leading-relaxed text-balance">
          {article.deck}
        </p>
      )}

      {/* Editorial Excerpt Box */}
      {article.excerpt && article.excerpt !== article.deck && (
        <div className="p-4 bg-white border border-stone-200 rounded-sm text-sm text-stone-700 font-sans leading-relaxed">
          <strong className="text-stone-900 block text-xs uppercase tracking-wider mb-1 font-sans">
            Executive Summary:
          </strong>
          {article.excerpt}
        </div>
      )}

      {/* Author Byline & Timestamps */}
      <AuthorByline
        author={article.author}
        publishedAt={article.publishedAt}
        updatedAt={article.updatedAt}
        reviewedAt={article.reviewedAt}
        readTime={article.readTime}
      />

      {/*
        Featured Media — MED-01B.

        THE DEFECT. This passed `alt={article.title}` and a synthesised
        `caption={`Editorial Dispatch: ${article.title}`}`. So the ALT text an
        editor wrote in the Media Library or the article form never reached the
        page that matters most, and every hero carried a caption nobody wrote.
        The homepage had it right all along (`EditorialHero`, `HomeArticleFeed`
        both read `imageAltText`), which is what made the inconsistency easy to
        miss — and the SEO engine reported the ALT text as present because the
        DATA was there, while the HTML shipped the headline.

        THE FIX. `heroImageAlt` and `heroImageCaption` are resolved on the
        server by `lib/media/imageMeta.ts` (usage override → article → media
        default → headline, with an empty string meaning "decorative"). The
        component renders them and derives nothing itself. `?? article.title`
        remains only for an `Article` assembled outside `toArticle`; it cannot
        override a deliberate empty string, because `''` is not nullish.

        `priority` marks this as the page's LCP image, and the stored WebP
        derivatives are advertised through `srcSet`. Layout, aspect ratio and
        the credit line are unchanged.
      */}
      <div className="pt-2">
        <ImageWithCredit
          src={article.heroImage}
          alt={article.heroImageAlt ?? article.imageAltText ?? article.title}
          credit={article.imageCredit}
          caption={article.heroImageCaption ?? article.imageCaption}
          srcSet={article.heroImageSrcSet}
          sizes={IMAGE_SIZES.hero}
          width={article.heroImageWidth}
          height={article.heroImageHeight}
          priority
          aspectRatioClass="aspect-[16/9]"
        />
      </div>
    </header>
  );
};

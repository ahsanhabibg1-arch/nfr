import React from 'react';
import { Article } from '../../types';
import { Breadcrumbs } from './Breadcrumbs';
import { AuthorByline } from './AuthorByline';
import { ImageWithCredit } from '../ImageWithCredit';
import { PRIMARY_SECTIONS } from '../../config/routes';

interface ArticleHeaderProps {
  article: Article;
}

export const ArticleHeader: React.FC<ArticleHeaderProps> = ({ article }) => {
  // Find category path
  const sectionEntry = Object.values(PRIMARY_SECTIONS).find(
    (s) => s.categoryKey === article.category
  );
  const categoryPath = sectionEntry?.path || '/competition/';

  const breadcrumbs = [
    { label: article.category, path: categoryPath },
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

      {/* Featured Media */}
      <div className="pt-2">
        <ImageWithCredit
          src={article.heroImage}
          alt={article.title}
          credit={article.imageCredit}
          aspectRatioClass="aspect-[16/9]"
          caption={`Editorial Dispatch: ${article.title}`}
        />
      </div>
    </header>
  );
};

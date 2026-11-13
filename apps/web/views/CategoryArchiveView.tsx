'use client';

import React, { useState, useMemo } from 'react';
import { Breadcrumbs } from '../components/editorial/Breadcrumbs';
import { EditorialArticleGrid } from '../components/editorial/EditorialArticleGrid';
import { ArticlePagination } from '../components/editorial/ArticlePagination';
import { ContentEmptyState } from '../components/editorial/ContentEmptyState';
import { Article } from '../types';
import {
  archiveFilterOptions,
  fallbackSnapshot,
  type ArticleTypeSnapshot,
} from '../lib/content/articleTypeShape';

const PAGE_SIZE = 6;

export interface CategoryArchiveViewProps {
  articles: Article[];
  categoryName: string;
  description?: string;
  sectionPath?: string;
  /**
   * Batch 04-E — managed Article Type definitions, resolved by the server page
   * so this client view can label the filter without a browser round trip.
   * Omitted falls back to the compiled-in compatibility vocabulary.
   */
  articleTypes?: ArticleTypeSnapshot;
}

// Client view: receives the published category articles from the server page
// (DB-backed) and performs type filtering + pagination in the browser.
export const CategoryArchiveView: React.FC<CategoryArchiveViewProps> = ({
  articles,
  categoryName,
  description,
  sectionPath,
  articleTypes,
}) => {
  const [activeType, setActiveType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  /**
   * "All Types" plus exactly the types present in this category (Batch 04-A),
   * labelled from the managed definitions (Batch 04-E).
   *
   * Derived from the articles actually here, which is what keeps a deactivated
   * or archived type in the filter while its articles remain published:
   * lifecycle withdraws a type from NEW classification and never from public
   * discovery of work already published.
   */
  const typeSnapshot = useMemo<ArticleTypeSnapshot>(
    () => articleTypes ?? fallbackSnapshot(),
    [articleTypes],
  );
  const typeOptions = useMemo(
    () => [{ value: 'all', label: 'All Types' }, ...archiveFilterOptions(typeSnapshot, articles)],
    [typeSnapshot, articles],
  );

  const filteredArticles = useMemo(() => {
    if (activeType === 'all') return articles;
    return articles.filter((a) => a.articleType === activeType);
  }, [articles, activeType]);

  const totalPages = Math.ceil(filteredArticles.length / PAGE_SIZE) || 1;
  const paginatedArticles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredArticles.slice(start, start + PAGE_SIZE);
  }, [filteredArticles, currentPage]);

  const handleTypeChange = (type: string) => {
    setActiveType(type);
    setCurrentPage(1);
  };

  return (
    <div className="w-full bg-[#F7F3EA] text-[#0F1115] py-10 sm:py-14">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <Breadcrumbs
          items={[{ label: 'Archives', path: '/' }, { label: categoryName }]}
          className="mb-6"
        />

        <header className="mb-10 pb-6 border-b border-stone-300">
          <div className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">
            Editorial Collection Archive
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[#0F1115] tracking-tight">
            {categoryName}
          </h1>
          <p className="mt-3 text-sm sm:text-base text-stone-600 font-sans max-w-3xl leading-relaxed">
            {description || 'Browse all published journalism, technical breakdowns, rules guides, and event features.'}
          </p>

          <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <span className="text-[11px] font-mono text-ink-muted uppercase tracking-wider mr-1">
              Article Type:
            </span>
            {/*
              Batch 04-A — options derived from the articles actually present.

              This list used to be hardcoded as
              `['all','feature','analysis','guide','news']` — the legacy
              vocabulary. It matched the stored data by luck, and it meant an
              article an editor "corrected" to any of the 18 selectable types
              vanished from every button except "All". Deriving from the data
              makes both failure directions impossible: no option can be empty,
              and no present type can be missing (including a value the registry
              does not recognise, which is listed verbatim rather than hidden).

              The filter is category-wide, not page-wide: `articles` is the whole
              category set and pagination is applied AFTER filtering, so the
              counts a reader sees are honest.
            */}
            {typeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleTypeChange(opt.value)}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors whitespace-nowrap ${
                  activeType === opt.value
                    ? 'bg-[#0F1115] text-[#D4A757]'
                    : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </header>

        {paginatedArticles.length > 0 ? (
          <div className="space-y-10">
            {/* Full-project audit — accessibility fix (heading hierarchy).
                The grid's article cards are `h3`, and they render directly
                after this page's `h1`, so the archive skipped a level
                (h1 -> h3) on every category page. This names the listing
                region at the correct level instead of changing the shared
                grid component, which is also used under an existing heading
                elsewhere. Visually hidden: the <h1> above already labels the
                page for sighted readers, so there is no design change. */}
            <h2 className="sr-only">Articles in {categoryName}</h2>
            <EditorialArticleGrid articles={paginatedArticles} columns={3} />
            <ArticlePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={(p) => setCurrentPage(p)}
            />
          </div>
        ) : (
          <ContentEmptyState
            title={`No ${activeType !== 'all' ? activeType : ''} articles found`}
            description={`No editorial content currently matches your filter in the ${categoryName} archive.`}
            actionText="Clear Filter"
            actionLink={sectionPath || '/'}
          />
        )}
      </div>
    </div>
  );
};

export default CategoryArchiveView;

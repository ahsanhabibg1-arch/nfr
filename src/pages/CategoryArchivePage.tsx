import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ALL_ARTICLES } from '../data/mockEditorialData';
import { PRIMARY_SECTIONS } from '../config/routes';
import { Breadcrumbs } from '../components/editorial/Breadcrumbs';
import { EditorialArticleGrid } from '../components/editorial/EditorialArticleGrid';
import { ArticlePagination } from '../components/editorial/ArticlePagination';
import { ContentEmptyState } from '../components/editorial/ContentEmptyState';
import { ArticleType } from '../types';
import { useSEO } from '../utils/seo';

const PAGE_SIZE = 6;

export const CategoryArchivePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [activeType, setActiveType] = useState<'all' | ArticleType>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Match category
  const sectionMeta = useMemo(() => {
    if (!slug) return undefined;
    const clean = slug.toLowerCase();
    return Object.values(PRIMARY_SECTIONS).find(
      (s) => s.id === clean || s.categoryKey.toLowerCase().replace(/[^a-z0-9]+/g, '-') === clean
    );
  }, [slug]);

  const categoryName = sectionMeta?.categoryKey || (slug ? slug.replace(/-/g, ' ').toUpperCase() : 'Archive');

  const filteredArticles = useMemo(() => {
    let pool = ALL_ARTICLES.filter((a) => (a.workflowStatus ? a.workflowStatus === 'published' : a.status === 'published'));
    if (sectionMeta) {
      pool = pool.filter((a) => a.category === sectionMeta.categoryKey);
    }
    if (activeType !== 'all') {
      pool = pool.filter((a) => a.articleType === activeType);
    }
    return pool;
  }, [sectionMeta, activeType]);

  const totalPages = Math.ceil(filteredArticles.length / PAGE_SIZE) || 1;
  const paginatedArticles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredArticles.slice(start, start + PAGE_SIZE);
  }, [filteredArticles, currentPage]);

  useSEO({
    title: `${categoryName} Archive — Editorial Dispatches`,
    description: sectionMeta?.description || `Explore comprehensive articles, analysis, and spectator intelligence for ${categoryName}.`,
    canonicalPath: `/categories/${slug}/`,
  });

  const handleTypeChange = (type: 'all' | ArticleType) => {
    setActiveType(type);
    setCurrentPage(1);
  };

  return (
    <div className="w-full bg-[#F7F3EA] text-[#0F1115] py-10 sm:py-14">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb Navigation */}
        <Breadcrumbs
          items={[
            { label: 'Archives', path: '/' },
            { label: categoryName },
          ]}
          className="mb-6"
        />

        {/* Section Header */}
        <header className="mb-10 pb-6 border-b border-stone-300">
          <div className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">
            Editorial Collection Archive
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[#0F1115] tracking-tight">
            {categoryName}
          </h1>
          <p className="mt-3 text-sm sm:text-base text-stone-600 font-sans max-w-3xl leading-relaxed">
            {sectionMeta?.description || 'Browse all published journalism, technical breakdowns, rules guides, and event features.'}
          </p>

          {/* Type Filter Controls */}
          <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <span className="text-[11px] font-mono text-stone-500 uppercase tracking-wider mr-1">
              Article Type:
            </span>
            {(['all', 'feature', 'analysis', 'guide', 'news'] as const).map((type) => (
              <button
                key={type}
                onClick={() => handleTypeChange(type)}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors whitespace-nowrap ${
                  activeType === type
                    ? 'bg-[#0F1115] text-[#D4A757]'
                    : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                {type === 'all' ? 'All Types' : type}
              </button>
            ))}
          </div>
        </header>

        {/* Article Grid or Empty State */}
        {paginatedArticles.length > 0 ? (
          <div className="space-y-10">
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
            actionLink={sectionMeta?.path || '/'}
          />
        )}
      </div>
    </div>
  );
};

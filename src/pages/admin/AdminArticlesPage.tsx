import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminFilterBar } from '../../components/admin/AdminFilterBar';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { articleStore } from '../../data/articleStore';
import { Article, ArticleWorkflowStatus } from '../../types';
import { ROUTES } from '../../config/routes';
import { useSEO } from '../../utils/seo';
import { validateArticle } from '../../utils/seoValidator';

export const AdminArticlesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [articles, setArticles] = useState<Article[]>(articleStore.getAllArticles());
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<'all' | 'published' | 'in_review' | 'approved' | 'scheduled' | 'draft'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionNotice, setBulkActionNotice] = useState<string | null>(null);

  // Subscribe to changes in articleStore
  useEffect(() => {
    const unsubscribe = articleStore.subscribe(() => {
      setArticles(articleStore.getAllArticles());
    });
    return unsubscribe;
  }, []);

  useSEO({
    title: 'Article Management — CMS',
    description: 'NFRGuide article library, review queue, and publishing workflows.',
  });

  // Tab counts
  const counts = useMemo(() => {
    return {
      all: articles.length,
      published: articles.filter((a) => (a.workflowStatus || a.status) === 'published').length,
      in_review: articles.filter((a) => (a.workflowStatus || a.status) === 'in_review').length,
      approved: articles.filter((a) => (a.workflowStatus || a.status) === 'approved').length,
      scheduled: articles.filter((a) => (a.workflowStatus || a.status) === 'scheduled').length,
      draft: articles.filter((a) => (a.workflowStatus || a.status) === 'draft').length,
    };
  }, [articles]);

  const filteredArticles = useMemo(() => {
    return articles.filter((art) => {
      const artStatus = art.workflowStatus || art.status || 'draft';

      // Tab filter
      if (activeTab !== 'all' && artStatus !== activeTab) {
        return false;
      }

      // Search
      const matchesSearch =
        !searchQuery ||
        art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        art.author.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        art.deck.toLowerCase().includes(searchQuery.toLowerCase());

      // Category
      const matchesCategory = categoryFilter === 'all' || art.category === categoryFilter;

      // Type
      const matchesType = typeFilter === 'all' || art.articleType === typeFilter;

      return matchesSearch && matchesCategory && matchesType;
    });
  }, [articles, activeTab, searchQuery, categoryFilter, typeFilter]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredArticles.map((a) => a.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkStatusChange = (status: ArticleWorkflowStatus) => {
    let successCount = 0;
    let blockedCount = 0;

    selectedIds.forEach((id) => {
      const art = articleStore.getArticleById(id);
      if (art) {
        if (status === 'published') {
          const val = validateArticle(art);
          if (!val.canPublish) {
            blockedCount++;
            return;
          }
        }
        articleStore.saveArticle(
          { ...art, workflowStatus: status, status },
          'Bulk Manager (DEMO)',
          'Managing Editor (DEMO)',
          `Bulk updated status to ${status}`
        );
        successCount++;
      }
    });

    if (status === 'published' && blockedCount > 0) {
      setBulkActionNotice(
        `Published ${successCount} article(s). Skipped ${blockedCount} article(s) blocked by Category A (editorial) or Category B (rights/compliance) checks.`
      );
    } else {
      setBulkActionNotice(
        `Updated ${successCount} article(s) to "${status.toUpperCase()}".`
      );
    }
    setTimeout(() => setBulkActionNotice(null), 5000);
    setSelectedIds([]);
  };

  const handleBulkDelete = () => {
    selectedIds.forEach((id) => {
      articleStore.deleteArticle(id);
    });
    setBulkActionNotice(`Deleted ${selectedIds.length} article(s) from demo catalog.`);
    setTimeout(() => setBulkActionNotice(null), 4000);
    setSelectedIds([]);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        title="Article Directory &amp; Publishing Queue"
        description="Search, filter, edit, and organize all published, scheduled, and review-staged editorial dispatches."
        actions={
          <Link
            to={ROUTES.ADMIN_ARTICLE_NEW}
            className="px-4 py-2 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors shadow-xs flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Article
          </Link>
        }
      />

      {/* Workflow Tabs */}
      <AdminTabs
        tabs={[
          { id: 'all', label: 'All Articles', count: counts.all },
          { id: 'published', label: 'Published', count: counts.published },
          { id: 'in_review', label: 'In Review', count: counts.in_review },
          { id: 'approved', label: 'Approved', count: counts.approved },
          { id: 'scheduled', label: 'Scheduled', count: counts.scheduled },
          { id: 'draft', label: 'Drafts', count: counts.draft },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as any)}
      />

      {/* Filter Bar */}
      <AdminFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by title, author, or keyword..."
        dropdowns={[
          {
            id: 'category-filter',
            label: 'Category',
            value: categoryFilter,
            onChange: setCategoryFilter,
            options: [
              { label: 'All Categories', value: 'all' },
              { label: 'NFR Competition', value: 'NFR Competition' },
              { label: 'NFR Entertainment', value: 'NFR Entertainment' },
              { label: 'NFR Events & Shopping', value: 'NFR Events & Shopping' },
              { label: 'NFR Plan & Watch', value: 'NFR Plan & Watch' },
              { label: 'More Rodeo', value: 'More Rodeo' },
            ],
          },
          {
            id: 'type-filter',
            label: 'Article Type',
            value: typeFilter,
            onChange: setTypeFilter,
            options: [
              { label: 'All Types', value: 'all' },
              { label: 'Feature', value: 'feature' },
              { label: 'Analysis', value: 'analysis' },
              { label: 'Guide', value: 'guide' },
              { label: 'Event Guide', value: 'Event Guide' },
              { label: 'News', value: 'news' },
            ],
          },
        ]}
        selectedCount={selectedIds.length}
        bulkActions={
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleBulkStatusChange('in_review')}
              className="px-2.5 py-1 text-xs font-sans text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xs border border-stone-300"
            >
              Move to Review
            </button>
            <button
              onClick={() => handleBulkStatusChange('published')}
              className="px-2.5 py-1 text-xs font-sans text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xs border border-emerald-300"
            >
              Publish Selected
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-2.5 py-1 text-xs font-sans text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xs border border-rose-300"
            >
              Delete Selected
            </button>
          </div>
        }
        onReset={() => {
          setSearchQuery('');
          setCategoryFilter('all');
          setTypeFilter('all');
        }}
      />

      {bulkActionNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-sans rounded-xs flex items-center justify-between">
          <span>{bulkActionNotice}</span>
          <button onClick={() => setBulkActionNotice(null)} className="font-bold">&times;</button>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={selectedIds.length > 0 && selectedIds.length === filteredArticles.length}
                    className="rounded border-stone-300 text-[#D4A757] focus:ring-[#D4A757]"
                  />
                </th>
                <th className="py-3 px-4">Article Title &amp; Slug</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Author</th>
                <th className="py-3 px-4">Workflow Status</th>
                <th className="py-3 px-4">Published</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredArticles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-400 font-mono text-xs">
                    No articles match the selected tab and filter criteria.
                  </td>
                </tr>
              ) : (
                filteredArticles.map((art) => {
                  const isSelected = selectedIds.includes(art.id);
                  const status = (art.workflowStatus || art.status || 'draft') as ArticleWorkflowStatus;
                  return (
                    <tr
                      key={art.id}
                      className={`hover:bg-stone-50/80 transition-colors ${
                        isSelected ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRow(art.id)}
                          className="rounded border-stone-300 text-[#D4A757] focus:ring-[#D4A757]"
                        />
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <Link
                          to={ROUTES.ADMIN_ARTICLE_EDIT(art.id)}
                          className="font-serif font-bold text-stone-900 hover:text-[#8B5E3C] line-clamp-1 text-sm"
                        >
                          {art.title}
                        </Link>
                        <span className="font-mono text-[10px] text-stone-400 block mt-0.5 truncate">
                          /articles/{art.slug}/
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-semibold text-stone-700">{art.category}</span>
                        {art.subcategory && (
                          <span className="text-stone-400 block text-[10px]">{art.subcategory}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-stone-600">
                        {art.author.name}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold ${
                          status === 'published'
                            ? 'bg-emerald-100 text-emerald-800'
                            : status === 'in_review'
                            ? 'bg-amber-100 text-amber-800'
                            : status === 'approved'
                            ? 'bg-blue-100 text-blue-800'
                            : status === 'scheduled'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-stone-100 text-stone-700'
                        }`}>
                          {status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-stone-500 font-mono text-[11px]">
                        {art.publishedAt}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        <Link
                          to={ROUTES.ARTICLE(art.slug)}
                          target="_blank"
                          className="text-stone-500 hover:text-stone-900 font-medium"
                        >
                          Live View
                        </Link>
                        <Link
                          to={ROUTES.ADMIN_ARTICLE_EDIT(art.id)}
                          className="text-[#8B5E3C] hover:text-stone-900 font-bold"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

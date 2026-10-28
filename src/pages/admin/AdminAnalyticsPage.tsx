import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { SEARCH_QUERY_LOGS } from '../../data/mockAdminData';
import { ALL_ARTICLES } from '../../data/mockEditorialData';
import { SearchQueryLog } from '../../types/admin';

export const AdminAnalyticsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'content' | 'integrations'>('search');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'nfr25'>('30d');
  const [searchFilter, setSearchFilter] = useState('');
  const [showZeroOnly, setShowZeroOnly] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const filteredQueries = SEARCH_QUERY_LOGS.filter((item) => {
    const matchesText = item.query.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesZero = showZeroOnly ? item.hasZeroResults : true;
    return matchesText && matchesZero;
  });

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono animate-fade-in flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toastMessage}
        </div>
      )}

      <AdminPageHeader
        title="Analytics & Search Intelligence"
        description="Monitor reader discovery, internal query logs, content engagement, and external analytics integration status."
        breadcrumbs={[
          { label: 'Admin', path: '/admin/' },
          { label: 'Analytics & Search' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 rounded-xs text-stone-700 focus:outline-none focus:border-[#D4A757]"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days (Demo)</option>
              <option value="nfr25">NFR 2025 Championship Window</option>
            </select>
          </div>
        }
      />

      {/* Disconnected External Services Notice Banner */}
      <div className="p-4 bg-stone-900 text-stone-300 border border-stone-800 rounded-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
            <div>
              <h4 className="text-xs font-mono uppercase tracking-wider text-white font-semibold">
                Third-Party Analytics Services Architecture
              </h4>
              <p className="text-xs text-stone-400 mt-0.5">
                Google Search Console and Google Analytics 4 are not connected in Phase 0. Internal site search logging and engagement metrics below are populated from live editorial interactions and demonstration datasets.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2 py-1 text-[10px] font-mono rounded-xs bg-white/10 text-stone-300 border border-white/10">
              GSC: Not Connected
            </span>
            <span className="px-2 py-1 text-[10px] font-mono rounded-xs bg-white/10 text-stone-300 border border-white/10">
              GA4: Not Connected
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          title="Internal Search Volume"
          value="3,947"
          change="+18.4% vs last mo"
          trend="up"
          description="Total searches across public site"
        />
        <AdminStatCard
          title="Avg Organic Click-Through"
          value="48.2%"
          change="+4.1% vs benchmark"
          trend="up"
          description="Search impressions to article click"
        />
        <AdminStatCard
          title="Avg Editorial Dwell Time"
          value="4m 38s"
          change="Top in sports media"
          trend="neutral"
          description="Based on 1,400-word average length"
        />
        <AdminStatCard
          title="Zero-Result Search Queries"
          value="2"
          change="Needs editorial coverage"
          trend="down"
          description="Queries with 0 articles returned"
        />
      </div>

      <AdminTabs
        tabs={[
          { id: 'search', label: 'Internal Search Logs', count: filteredQueries.length },
          { id: 'content', label: 'Top Editorial Performance', count: ALL_ARTICLES.length },
          { id: 'integrations', label: 'External Services & APIs' },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
      />

      {/* TAB 1: SEARCH QUERIES */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Filter search queries..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
              <svg className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowZeroOnly(!showZeroOnly)}
                className={`px-3 py-1.5 text-xs font-mono rounded-xs border transition-colors ${
                  showZeroOnly
                    ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
                    : 'bg-white border-stone-300 text-stone-600 hover:bg-stone-50'
                }`}
              >
                {showZeroOnly ? 'Showing Zero-Results Only' : 'Show Zero-Results Only'}
              </button>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-xs shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5">User Query String</th>
                    <th className="px-4 py-2.5 text-right">Impressions</th>
                    <th className="px-4 py-2.5 text-right">Article Clicks</th>
                    <th className="px-4 py-2.5 text-right">CTR</th>
                    <th className="px-4 py-2.5 text-center">Results Found</th>
                    <th className="px-4 py-2.5">Last Searched</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {filteredQueries.map((item, idx) => {
                    const ctr = item.impressions > 0 ? ((item.clicks / item.impressions) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={idx} className="hover:bg-stone-50/50">
                        <td className="px-4 py-3 font-medium text-stone-900 flex items-center gap-2">
                          <span className="font-mono text-stone-500">“{item.query}”</span>
                          {item.hasZeroResults && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded-xs">
                              0 Results
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-stone-700">
                          {item.impressions.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-stone-700">
                          {item.clicks.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-stone-900">
                          {ctr}%
                        </td>
                        <td className="px-4 py-3 text-center font-mono">
                          <span className={item.hasZeroResults ? 'text-rose-600 font-bold' : 'text-stone-600'}>
                            {item.resultsCount} articles
                          </span>
                        </td>
                        <td className="px-4 py-3 text-stone-500 font-mono text-[11px]">
                          {item.lastSearched}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.hasZeroResults ? (
                            <Link
                              to="/admin/articles/new/"
                              className="inline-flex items-center gap-1 text-[11px] font-mono text-[#D4A757] hover:underline bg-[#0F1115] px-2 py-1 rounded-xs font-semibold"
                            >
                              Write Article
                            </Link>
                          ) : (
                            <button
                              onClick={() => showToast(`Generated search diagnostic report for: ${item.query}`)}
                              className="text-stone-400 hover:text-stone-800 text-[11px] font-mono underline"
                            >
                              Analyze
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONTENT ENGAGEMENT */}
      {activeTab === 'content' && (
        <div className="bg-white border border-stone-200 rounded-xs shadow-2xs overflow-hidden">
          <div className="px-4 py-3 bg-stone-50/50 border-b border-stone-200 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
              Editorial Article Engagement Rankings
            </span>
            <span className="text-[11px] text-stone-500">
              Ranked by Estimated Read Completion Rate
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Article Headline</th>
                  <th className="px-4 py-2.5">Primary Category</th>
                  <th className="px-4 py-2.5 text-right">Est. Readers</th>
                  <th className="px-4 py-2.5 text-right">Avg Dwell</th>
                  <th className="px-4 py-2.5 text-right">Completion</th>
                  <th className="px-4 py-2.5 text-right">Live View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {ALL_ARTICLES.map((art) => (
                  <tr key={art.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-medium text-stone-900 max-w-sm">
                      <Link to={`/admin/articles/${art.id}/edit/`} className="hover:underline hover:text-[#8B5E3C]">
                        {art.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-stone-100 text-stone-700 rounded-xs">
                        {art.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-stone-700">
                      {((art.wordCount || 1200) * 8 + 350).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-stone-700">
                      {art.readTime}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                      78.4%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/articles/${art.slug}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-stone-400 hover:text-stone-900 text-[11px] font-mono underline"
                      >
                        Visit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: INTEGRATIONS */}
      {activeTab === 'integrations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-sans font-bold text-sm text-stone-900">
                Google Search Console (GSC)
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-stone-100 text-stone-600 rounded-xs font-semibold">
                Not Connected
              </span>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              When production domain <code className="bg-stone-100 px-1 py-0.5 font-mono">nfrguide.com</code> DNS verification is completed, GSC will ingest XML sitemaps and provide real-time query clicks and keyword positions.
            </p>
            <div className="pt-2">
              <button
                disabled
                className="px-3 py-1.5 text-xs font-medium text-stone-400 bg-stone-100 rounded-xs cursor-not-allowed"
              >
                Connect Search Console (Phase 1)
              </button>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-sans font-bold text-sm text-stone-900">
                Google Analytics 4 (GA4)
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-stone-100 text-stone-600 rounded-xs font-semibold">
                Not Connected
              </span>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Privacy-first editorial telemetry measurement ID placeholder (<code className="bg-stone-100 px-1 py-0.5 font-mono">G-XXXXXXXXXX</code>). Cookie-consent banner and affiliate click tracking will integrate with this stream.
            </p>
            <div className="pt-2">
              <button
                disabled
                className="px-3 py-1.5 text-xs font-medium text-stone-400 bg-stone-100 rounded-xs cursor-not-allowed"
              >
                Configure GA4 Stream (Phase 1)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

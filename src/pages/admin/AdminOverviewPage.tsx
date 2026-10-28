import React from 'react';
import { Link } from 'react-router-dom';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { ADMIN_ACTIVITY_LOGS, BACKGROUND_JOBS, SEO_ISSUES } from '../../data/mockAdminData';
import { ALL_ARTICLES, RECURRING_RODEO_EVENTS } from '../../data/mockEditorialData';
import { ROUTES } from '../../config/routes';
import { useSEO } from '../../utils/seo';

export const AdminOverviewPage: React.FC = () => {
  useSEO({
    title: 'Editorial CMS Overview',
    description: 'NFRGuide.com custom editorial operations dashboard and championship newsroom metrics.',
  });

  const totalArticles = ALL_ARTICLES.length;
  const publishedArticles = ALL_ARTICLES.filter((a) => a.status !== 'draft').length;
  const criticalSEOIssues = SEO_ISSUES.filter((i) => i.severity === 'critical' || i.severity === 'warning').length;

  return (
    <div className="space-y-6">
      {/* Header with Quick Actions */}
      <AdminPageHeader
        title="Editorial Operations Overview"
        description="Championship newsroom command center: publishing queue, SEO compliance, event edition alerts, and background job health."
        badge="Live Prototype"
        actions={
          <div className="flex items-center gap-2">
            <Link
              to={ROUTES.ADMIN_ARTICLE_NEW}
              className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors"
            >
              + Create Article
            </Link>
            <Link
              to={ROUTES.ADMIN_SEO}
              className="px-3.5 py-1.5 bg-white border border-stone-300 text-stone-700 hover:text-stone-900 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors"
            >
              SEO Audit ({criticalSEOIssues} Issues)
            </Link>
          </div>
        }
      />

      {/* Primary Editorial Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <AdminStatCard
          title="Total Published"
          value={publishedArticles}
          change="+2 this week"
          changeType="positive"
          subtitle="Indexed in Phase 0 catalog"
        />
        <AdminStatCard
          title="In Review"
          value={1}
          change="Needs Editor"
          changeType="neutral"
          subtitle="Awaiting final fact check"
        />
        <AdminStatCard
          title="Scheduled"
          value={1}
          subtitle="Round 1 Preview drops Nov 15"
        />
        <AdminStatCard
          title="Draft Staging"
          value={2}
          subtitle="Author working files"
        />
        <AdminStatCard
          title="SEO Compliance"
          value="94%"
          change={`${criticalSEOIssues} action items`}
          changeType="negative"
          subtitle="Across 12-group audit"
        />
      </div>

      {/* Two-Column Operations Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Col 1-8): Editorial Review Queue & Activity Stream */}
        <div className="lg:col-span-8 space-y-6">
          {/* Editorial Review Queue */}
          <section className="bg-white border border-stone-200 rounded-sm shadow-2xs">
            <div className="p-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-serif font-bold text-stone-900">
                  Editorial Review &amp; Staging Queue
                </h3>
                <p className="text-xs text-stone-500 font-sans mt-0.5">
                  Articles undergoing author review, stock verification, or legal review.
                </p>
              </div>
              <Link
                to={ROUTES.ADMIN_ARTICLES}
                className="text-xs font-semibold text-[#8B5E3C] hover:underline font-sans"
              >
                View All Articles &rarr;
              </Link>
            </div>

            <div className="divide-y divide-stone-100">
              {ALL_ARTICLES.slice(0, 4).map((art, idx) => (
                <div key={art.id} className="p-4 hover:bg-stone-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <AdminStatusBadge status={idx === 1 ? 'In Review' : idx === 2 ? 'Scheduled' : 'Published'} />
                      <span className="text-[11px] font-sans font-semibold text-[#8B5E3C]">
                        {art.category}
                      </span>
                      <span className="text-stone-300">&middot;</span>
                      <span className="text-xs text-stone-500">{art.author.name}</span>
                    </div>
                    <h4 className="text-sm font-serif font-semibold text-stone-900 leading-snug">
                      <Link to={ROUTES.ADMIN_ARTICLE_EDIT(art.id)} className="hover:text-[#8B5E3C]">
                        {art.title}
                      </Link>
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                    <Link
                      to={ROUTES.ARTICLE(art.slug)}
                      target="_blank"
                      className="px-2.5 py-1 text-xs font-sans text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xs"
                      title="Preview public article"
                    >
                      View Live
                    </Link>
                    <Link
                      to={ROUTES.ADMIN_ARTICLE_EDIT(art.id)}
                      className="px-2.5 py-1 text-xs font-sans text-stone-900 font-semibold bg-[#F7F3EA] border border-stone-300 hover:bg-[#EDE6D6] rounded-xs"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Editorial Activity Stream */}
          <section className="bg-white border border-stone-200 rounded-sm shadow-2xs">
            <div className="p-4 border-b border-stone-200">
              <h3 className="text-sm font-serif font-bold text-stone-900">
                Recent Newsroom Activity Log
              </h3>
              <p className="text-xs text-stone-500 font-sans mt-0.5">
                Audit trail of changes made by reporters, editors, and SEO managers.
              </p>
            </div>

            <div className="divide-y divide-stone-100 p-2">
              {ADMIN_ACTIVITY_LOGS.map((act) => (
                <div key={act.id} className="p-3 text-xs font-sans flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#0F1115] text-[#D4A757] font-serif font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {act.userName.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-stone-900 font-medium leading-relaxed">
                      <strong className="text-stone-950">{act.userName}</strong> {act.action} on{' '}
                      <span className="font-semibold text-[#8B5E3C]">&ldquo;{act.entityTitle}&rdquo;</span>
                    </p>
                    <span className="text-[10px] font-mono text-stone-400 mt-1 block">
                      {act.timestamp} &middot; Entity: {act.entityType}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column (Col 9-12): Reminders & System Status */}
        <div className="lg:col-span-4 space-y-6">
          {/* Upcoming Event Edition Deadlines */}
          <section className="bg-white border border-stone-200 rounded-sm p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900 font-sans">
                Upcoming Event Editions
              </h3>
              <Link to={ROUTES.ADMIN_RODEO_COVERAGE} className="text-[11px] text-[#8B5E3C] font-semibold">
                Manage &rarr;
              </Link>
            </div>
            <div className="space-y-3">
              {RECURRING_RODEO_EVENTS.map((evt) => (
                <div key={evt.id} className="p-3 bg-[#F7F3EA] border border-stone-200 rounded-xs">
                  <div className="flex items-center justify-between text-[11px] font-sans font-semibold text-stone-800">
                    <span>{evt.name}</span>
                    <span className="text-[#8B5E3C] font-mono">{evt.currentEdition.year}</span>
                  </div>
                  <p className="text-xs text-stone-600 mt-1 font-sans">{evt.currentEdition.dates}</p>
                  <span className="text-[10px] text-stone-500 font-mono mt-1 block">
                    Purse: {evt.currentEdition.purseBenchmark}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Background Job Engine Status */}
          <section className="bg-white border border-stone-200 rounded-sm p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900 font-sans">
                Background Engine
              </h3>
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                Demonstration State
              </span>
            </div>
            <div className="space-y-2.5 text-xs font-sans">
              {BACKGROUND_JOBS.slice(0, 3).map((job) => (
                <div key={job.id} className="flex items-center justify-between py-1.5 border-b border-stone-100 last:border-0">
                  <div>
                    <span className="font-semibold text-stone-900 block">{job.name}</span>
                    <span className="text-[10px] text-stone-500 font-mono">Last run: {job.lastRun}</span>
                  </div>
                  <AdminStatusBadge status={job.status === 'completed' ? 'Passed' : 'Active'} />
                </div>
              ))}
            </div>
          </section>

          {/* Security & Access Notice */}
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-sm text-xs font-sans text-amber-900">
            <strong className="block font-semibold mb-1">Phase 0 Demo Boundary:</strong>
            <p className="text-[11px] leading-relaxed text-amber-800">
              This administrative dashboard is a client-side prototype. Real-world user authentication, role enforcement, and PostgreSQL persistence will be integrated in subsequent phases.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

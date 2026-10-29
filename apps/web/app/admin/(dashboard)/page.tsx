import Link from 'next/link';
import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission, primaryRoleLabel } from '@/lib/auth/rbac';
import { getDashboardData } from '@/lib/cms/adminQueries';
import { ROUTES } from '@/config/routes';

const STATUS_STYLE: Record<string, string> = {
  published: 'text-emerald-700', draft: 'text-stone-600', in_review: 'text-amber-700',
  approved: 'text-blue-700', scheduled: 'text-purple-700', archived: 'text-stone-400',
};

export default async function OverviewPage() {
  const user = await requireUser();
  const canViewAll = roleHasPermission(user.roles, 'article.edit.any');
  const d = await getDashboardData({ viewerId: user.id, canViewAll });

  const tiles: [string, number, string][] = [
    ['Total Articles', d.total, 'text-stone-900'],
    ['Published', d.statusCounts.published, 'text-emerald-700'],
    ['Drafts', d.statusCounts.draft, 'text-stone-600'],
    ['In Review', d.statusCounts.in_review, 'text-amber-700'],
    ['Approved', d.statusCounts.approved, 'text-blue-700'],
    ['Scheduled', d.statusCounts.scheduled, 'text-purple-700'],
    ['Archived', d.statusCounts.archived, 'text-stone-400'],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-serif font-bold text-stone-900">Editorial Overview</h1>
          <p className="text-xs font-sans text-stone-500 mt-0.5">
            Welcome back, {user.name} · {primaryRoleLabel(user.roles)}
            {d.scopedToOwn && <span className="ml-1 text-stone-400">· showing your own editorial items</span>}
          </p>
        </div>
        <Link href={ROUTES.ADMIN_ARTICLE_NEW} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs">
          + New Article
        </Link>
      </div>

      {/* Real DB-backed status metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {tiles.map(([label, value, color]) => (
          <div key={label} className="bg-white border border-stone-200 rounded-sm p-4 shadow-2xs">
            <div className={`text-2xl font-mono font-bold ${color}`}>{value}</div>
            <div className="text-[11px] font-sans uppercase tracking-wider text-stone-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending reviews — content needing attention */}
        <section className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs">
          <h2 className="text-sm font-serif font-bold text-stone-900 mb-3">Awaiting Editorial Review</h2>
          {d.pendingReviews.length === 0 ? (
            <p className="text-xs text-stone-400 font-sans">Nothing in the review queue.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {d.pendingReviews.map((a) => (
                <li key={a.id} className="py-2 flex items-center justify-between text-xs font-sans">
                  <Link href={ROUTES.ADMIN_ARTICLE_EDIT(a.id)} className="font-semibold text-stone-800 hover:text-[#8B5E3C] truncate mr-3">{a.title}</Link>
                  <span className="text-stone-400 whitespace-nowrap">{a.authorName} · {a.updatedAt}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recently updated */}
        <section className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs">
          <h2 className="text-sm font-serif font-bold text-stone-900 mb-3">Recently Updated</h2>
          <ul className="divide-y divide-stone-100">
            {d.recentlyUpdated.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between text-xs font-sans">
                <Link href={ROUTES.ADMIN_ARTICLE_EDIT(a.id)} className="font-semibold text-stone-800 hover:text-[#8B5E3C] truncate mr-3">{a.title}</Link>
                <span className={`font-mono uppercase text-[10px] ${STATUS_STYLE[a.status] ?? ''}`}>{a.status} · {a.updatedAt}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* By section */}
        <section className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs">
          <h2 className="text-sm font-serif font-bold text-stone-900 mb-3">Published by Section</h2>
          <ul className="space-y-2">
            {d.bySection.map((s) => (
              <li key={s.name} className="flex items-center gap-2 text-xs font-sans">
                <span className="w-40 shrink-0 text-stone-700">{s.name}</span>
                <span className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden"><span className="block h-2 bg-[#D4A757]" style={{ width: `${Math.min(100, s.published * 20)}%` }} /></span>
                <span className="font-mono text-stone-500 w-6 text-right">{s.published}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Recent activity (audit log) */}
        <section className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs">
          <h2 className="text-sm font-serif font-bold text-stone-900 mb-3">Recent Activity</h2>
          <ul className="divide-y divide-stone-100">
            {d.recentActivity.map((a) => (
              <li key={a.id} className="py-1.5 text-xs font-sans flex items-center justify-between gap-2">
                <span className="text-stone-700"><span className="font-mono text-[10px] text-[#8B5E3C]">{a.action}</span> · {a.actorName}</span>
                <span className="text-stone-400 whitespace-nowrap">{a.at}</span>
              </li>
            ))}
            {d.recentActivity.length === 0 && <li className="py-2 text-xs text-stone-400">No recorded activity yet.</li>}
          </ul>
        </section>
      </div>

      {/* Honest analytics state (§4) */}
      <div className="p-4 bg-stone-50 border border-dashed border-stone-300 rounded-sm text-xs font-sans text-stone-500 flex items-start gap-3">
        <span className="w-2 h-2 rounded-full bg-stone-400 mt-1" aria-hidden="true" />
        <div>
          <span className="font-semibold text-stone-700 block mb-0.5">Traffic & Search analytics: not connected</span>
          Impressions, clicks, CTR and Google Search Console data are not integrated. No simulated traffic or revenue figures are shown. All numbers above are live counts from the editorial database.
        </div>
      </div>
    </div>
  );
}

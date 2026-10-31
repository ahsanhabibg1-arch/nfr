'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminTabs } from '../../components/admin/AdminTabs';
import type {
  AnalyticsOverview,
  SearchAnalytics,
  ContentPerformanceRow,
  ContentGap,
  SearchInformedSeo,
  ProviderStatusRow,
  MetricComparison,
} from '../../lib/cms/analyticsService';
import type { AnalyticsSettings } from '../../lib/analytics/config';
import {
  updateAnalyticsConfigAction,
  setProviderConnectionAction,
  runProviderSyncAction,
  exportAnalyticsAction,
  runRetentionAction,
} from '../../app/admin/analytics-actions';

export interface AdminAnalyticsPageProps {
  days: number;
  overview: AnalyticsOverview;
  performance: { rows: ContentPerformanceRow[]; scopedToOwn: boolean };
  search: SearchAnalytics | null;
  gaps: { gaps: ContentGap[]; periodDays: number; evidenceCount: number } | null;
  seoLink: SearchInformedSeo | null;
  providers: ProviderStatusRow[];
  config: AnalyticsSettings;
  caps: { canSearch: boolean; canConfig: boolean; canProvider: boolean; canExport: boolean };
}

type TabId = 'overview' | 'search' | 'content' | 'opportunities' | 'providers';

const RANGES = [
  { v: 7, label: 'Last 7 Days' },
  { v: 30, label: 'Last 30 Days' },
  { v: 90, label: 'Last 90 Days' },
  { v: 180, label: 'Last 180 Days' },
];

function Delta({ c }: { c: MetricComparison | null }) {
  if (!c) return null;
  if (c.insufficient) return <span className="text-[11px] text-stone-400 font-mono">no prior-period data</span>;
  const up = (c.changePct ?? 0) >= 0;
  return (
    <span className={`text-[11px] font-mono ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? '+' : ''}
      {c.changePct!.toFixed(1)}% vs prev period
    </span>
  );
}

export const AdminAnalyticsPage: React.FC<AdminAnalyticsPageProps> = (props) => {
  const { overview, performance, search, gaps, seoLink, providers, config, caps, days } = props;
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('overview');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const collecting = config.collectionEnabled;

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  // ---- config form state ----
  const [form, setForm] = useState<AnalyticsSettings>(config);
  const saveConfig = () =>
    start(async () => {
      const r = await updateAnalyticsConfigAction(form);
      notify(r.ok ? 'Analytics settings saved.' : `Save failed: ${r.error}`);
      if (r.ok) router.refresh();
    });

  const exportData = () =>
    start(async () => {
      const r = await exportAnalyticsAction(days);
      if (!r.ok) return notify(`Export failed: ${r.error}`);
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nfrguide-analytics-${days}d.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('Exported aggregate analytics (JSON).');
    });

  const runRetention = () =>
    start(async () => {
      const r = await runRetentionAction();
      notify(r.ok ? `Pruned raw events older than retention (kept aggregates).` : `Failed: ${r.error}`);
      if (r.ok) router.refresh();
    });

  const num = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono flex items-center gap-2">
          {toast}
        </div>
      )}

      <AdminPageHeader
        title="Analytics & Search Intelligence"
        description="First-party content views, internal search intelligence, content-gap opportunities, and external-provider status — all from real data."
        breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Analytics & Search' }]}
        actions={
          <select
            value={days}
            onChange={(e) => router.push(`/admin/analytics/?range=${e.target.value}`)}
            className="px-3 py-1.5 text-xs font-sans font-medium bg-white border border-stone-300 rounded-xs text-stone-700 focus:outline-none focus:border-[#D4A757]"
          >
            {RANGES.map((r) => (
              <option key={r.v} value={r.v}>
                {r.label}
              </option>
            ))}
          </select>
        }
      />

      {/* Collection status — honest implemented-but-disabled state (§27) */}
      <div className={`p-4 rounded-xs border ${collecting ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${collecting ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <div>
            <h4 className="text-xs font-mono uppercase tracking-wider text-stone-900 font-semibold">
              First-party collection: {collecting ? 'ACTIVE' : 'DISABLED'}
            </h4>
            <p className="text-xs text-stone-600 mt-0.5">
              {collecting
                ? `Cookieless, no IP, no personal identifiers. Reporting time zone: ${config.displayTimeZone}. Page views are observed events, not verified unique visitors.`
                : 'The full collection pipeline is implemented but switched off pending a privacy/consent decision. Enable it under Providers & Config. No events are recorded while disabled.'}
            </p>
          </div>
        </div>
      </div>

      {/* KPI cards — real counts for the selected range */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard title="Content Views" value={num(overview.contentViews.current)} description="First-party observed views" trend="neutral" />
        <AdminStatCard title="Internal Searches" value={overview.searches ? num(overview.searches.current) : '—'} description={overview.searches ? 'Search submissions' : 'Requires search access'} trend="neutral" />
        <AdminStatCard title="Zero-Result Searches" value={overview.zeroResults ? num(overview.zeroResults.current) : '—'} description="Queries returning nothing" trend="neutral" />
        <AdminStatCard
          title="Search CTR"
          value={overview.searches && overview.searchClicks && overview.searches.current > 0 ? `${((overview.searchClicks.current / overview.searches.current) * 100).toFixed(1)}%` : '—'}
          description="Clicks ÷ searches"
          trend="neutral"
        />
      </div>

      <AdminTabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'search', label: 'Internal Search' },
          { id: 'content', label: 'Content Performance', count: performance.rows.length },
          { id: 'opportunities', label: 'Opportunities' },
          { id: 'providers', label: 'Providers & Config' },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-white border border-stone-200 rounded-xs p-3">
              <div className="text-stone-500 uppercase tracking-wider text-[10px] font-mono">Content Views</div>
              <div className="text-lg font-bold text-stone-900">{num(overview.contentViews.current)}</div>
              <Delta c={overview.contentViews} />
            </div>
            <div className="bg-white border border-stone-200 rounded-xs p-3">
              <div className="text-stone-500 uppercase tracking-wider text-[10px] font-mono">Searches</div>
              <div className="text-lg font-bold text-stone-900">{overview.searches ? num(overview.searches.current) : '—'}</div>
              <Delta c={overview.searches} />
            </div>
            <div className="bg-white border border-stone-200 rounded-xs p-3">
              <div className="text-stone-500 uppercase tracking-wider text-[10px] font-mono">Zero-Result</div>
              <div className="text-lg font-bold text-stone-900">{overview.zeroResults ? num(overview.zeroResults.current) : '—'}</div>
              <Delta c={overview.zeroResults} />
            </div>
            <div className="bg-white border border-stone-200 rounded-xs p-3">
              <div className="text-stone-500 uppercase tracking-wider text-[10px] font-mono">Search Clicks</div>
              <div className="text-lg font-bold text-stone-900">{overview.searchClicks ? num(overview.searchClicks.current) : '—'}</div>
              <Delta c={overview.searchClicks} />
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-xs overflow-hidden">
            <div className="px-4 py-3 bg-stone-50/50 border-b border-stone-200 text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
              Top Content by Observed Views{overview.scopedToOwn ? ' (your articles)' : ''}
            </div>
            {overview.topContent.length === 0 ? (
              <EmptyRow text={collecting ? 'No content views recorded in this range yet.' : 'Collection is disabled — no views recorded.'} />
            ) : (
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Content</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5 text-right">Views</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {overview.topContent.map((t) => (
                    <tr key={`${t.entityType}:${t.entityId}`} className="hover:bg-stone-50/50">
                      <td className="px-4 py-3 font-medium text-stone-900">
                        <Link href={t.url} className="hover:underline hover:text-[#8B5E3C]" target="_blank" rel="noreferrer">
                          {t.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-stone-500">{t.entityType}</td>
                      <td className="px-4 py-3 text-right font-mono text-stone-700">{num(t.views)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-[11px] text-stone-400 font-sans">{overview.observedNote}</p>
        </div>
      )}

      {/* INTERNAL SEARCH */}
      {tab === 'search' && (
        <div className="space-y-4">
          {!caps.canSearch || !search ? (
            <NoticeCard text="You do not have access to internal search intelligence (requires search.analytics.view)." />
          ) : (
            <>
              <div className="bg-white border border-stone-200 rounded-xs overflow-hidden">
                <SectionLabel text="Popular Search Terms" note={`CTR = clicks ÷ searches · avg results per query`} />
                {search.topTerms.length === 0 ? (
                  <EmptyRow text={collecting ? 'No searches recorded in this range yet.' : 'Collection is disabled — no searches recorded.'} />
                ) : (
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase">
                      <tr>
                        <th className="px-4 py-2.5">Query</th>
                        <th className="px-4 py-2.5 text-right">Searches</th>
                        <th className="px-4 py-2.5 text-right">Clicks</th>
                        <th className="px-4 py-2.5 text-right">CTR</th>
                        <th className="px-4 py-2.5 text-right">Avg Results</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {search.topTerms.map((t) => (
                        <tr key={t.term} className="hover:bg-stone-50/50">
                          <td className="px-4 py-2.5 font-mono text-stone-700">“{t.term}”</td>
                          <td className="px-4 py-2.5 text-right font-mono">{num(t.searches)}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{num(t.clicks)}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold">{t.ctrPct == null ? '—' : `${t.ctrPct.toFixed(0)}%`}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-stone-500">{t.avgResults}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-stone-200 rounded-xs overflow-hidden">
                  <SectionLabel text="Zero-Result Queries" note="editorial demand signals" />
                  {search.zeroResultTerms.length === 0 ? (
                    <EmptyRow text="No zero-result queries recorded." />
                  ) : (
                    <ul className="divide-y divide-stone-200">
                      {search.zeroResultTerms.map((z) => (
                        <li key={z.term} className="px-4 py-2.5 flex justify-between text-xs font-sans">
                          <span className="font-mono text-rose-700">“{z.term}”</span>
                          <span className="font-mono text-stone-500">{num(z.searches)} search(es)</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="bg-white border border-stone-200 rounded-xs overflow-hidden">
                  <SectionLabel text="Weak Engagement" note="searched but not clicked" />
                  {search.weakEngagement.length === 0 ? (
                    <EmptyRow text="No weak-engagement queries detected." />
                  ) : (
                    <ul className="divide-y divide-stone-200">
                      {search.weakEngagement.map((w) => (
                        <li key={w.term} className="px-4 py-2.5 flex justify-between text-xs font-sans">
                          <span className="font-mono text-stone-700">“{w.term}”</span>
                          <span className="font-mono text-stone-500">{num(w.searches)} searches · 0 clicks</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* CONTENT PERFORMANCE */}
      {tab === 'content' && (
        <div className="bg-white border border-stone-200 rounded-xs overflow-hidden">
          <SectionLabel
            text={`Editorial Performance${performance.scopedToOwn ? ' (your articles)' : ''}`}
            note="views · search clicks · open SEO issues"
          />
          {performance.rows.length === 0 ? (
            <EmptyRow text={collecting ? 'No performance data in this range yet.' : 'Collection is disabled — no performance data recorded.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Content</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5 text-right">Views</th>
                    <th className="px-4 py-2.5 text-right">Search Clicks</th>
                    <th className="px-4 py-2.5 text-right">Open SEO</th>
                    <th className="px-4 py-2.5 text-right">Age (d)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {performance.rows.map((r) => (
                    <tr key={`${r.entityType}:${r.entityId}`} className="hover:bg-stone-50/50">
                      <td className="px-4 py-3 font-medium text-stone-900 max-w-sm">
                        <Link href={r.url} target="_blank" rel="noreferrer" className="hover:underline hover:text-[#8B5E3C]">
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-stone-500">{r.entityType}</td>
                      <td className="px-4 py-3 text-right font-mono">{num(r.views)}</td>
                      <td className="px-4 py-3 text-right font-mono">{num(r.searchClicks)}</td>
                      <td className="px-4 py-3 text-right font-mono">{r.seoOpenIssues > 0 ? <span className="text-amber-700 font-bold">{r.seoOpenIssues}</span> : '0'}</td>
                      <td className="px-4 py-3 text-right font-mono text-stone-500">{r.ageDays ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* OPPORTUNITIES */}
      {tab === 'opportunities' && (
        <div className="space-y-4">
          {!caps.canSearch || !gaps ? (
            <NoticeCard text="Content-gap intelligence requires search.analytics.view." />
          ) : (
            <>
              <div className="bg-white border border-stone-200 rounded-xs overflow-hidden">
                <SectionLabel text="Search Content Gaps" note={`real evidence · last ${gaps.periodDays} days · ${num(gaps.evidenceCount)} searches observed`} />
                {gaps.gaps.length === 0 ? (
                  <EmptyRow text={collecting ? 'No content-gap evidence yet. Gaps appear from real zero-result searches.' : 'Collection is disabled — no search evidence to analyze.'} />
                ) : (
                  <ul className="divide-y divide-stone-200">
                    {gaps.gaps.map((g) => (
                      <li key={g.term} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm text-stone-900">“{g.term}”</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-xs ${g.missingCoverage ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                            {g.missingCoverage ? 'MISSING COVERAGE' : 'COVERAGE EXISTS'}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 mt-1">{g.suggestedAction}</p>
                        <p className="text-[11px] text-stone-400 mt-0.5">{g.evidence}</p>
                        {g.existingCoverage.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {g.existingCoverage.map((c) => (
                              <Link key={c.url} href={c.url} target="_blank" rel="noreferrer" className="text-[11px] text-[#8B5E3C] underline">
                                {c.title}
                              </Link>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {seoLink && (
                <div className="bg-white border border-stone-200 rounded-xs overflow-hidden">
                  <SectionLabel text="Search-Informed SEO" note="advisory — the 37 SEO rules are unchanged" />
                  {seoLink.highDemandIncompleteMeta.length === 0 ? (
                    <EmptyRow text="No articles with both search demand and open SEO findings in this window." />
                  ) : (
                    <ul className="divide-y divide-stone-200">
                      {seoLink.highDemandIncompleteMeta.map((a) => (
                        <li key={a.articleId} className="px-4 py-2.5 flex items-center justify-between text-xs font-sans">
                          <Link href={a.url} target="_blank" rel="noreferrer" className="font-medium text-stone-900 hover:underline hover:text-[#8B5E3C]">
                            {a.title}
                          </Link>
                          <span className="font-mono text-stone-500">
                            {num(a.searchClicks)} clicks · {a.openFindings} open SEO
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="px-4 py-2 text-[11px] text-stone-400 border-t border-stone-100">{seoLink.note}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* PROVIDERS & CONFIG */}
      {tab === 'providers' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.map((p) => (
              <div key={p.provider} className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-sans font-bold text-sm text-stone-900">{p.displayName}</h4>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold ${p.live ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>
                    {p.state === 'not_connected' ? 'Not Connected' : p.state.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">{p.kind}</p>
                <p className="text-[11px] text-stone-500 leading-relaxed">{p.detail}</p>
                <p className="text-[11px] text-stone-400 font-mono">Required env: {p.requiredEnv.join(', ')}</p>
                {caps.canProvider && (
                  <ProviderControls provider={p.provider} propertyRef={p.propertyRef} onDone={notify} onRefresh={() => router.refresh()} />
                )}
              </div>
            ))}
          </div>

          <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-4">
            <h4 className="font-sans font-bold text-sm text-stone-900">Data Collection & Privacy</h4>
            {!caps.canConfig ? (
              <p className="text-xs text-stone-500">Collection is {collecting ? 'active' : 'disabled'}. Only an Administrator can change these privacy-sensitive settings.</p>
            ) : (
              <div className="space-y-3 text-xs">
                <Toggle label="Enable first-party collection (master switch)" checked={form.collectionEnabled} onChange={(v) => setForm({ ...form, collectionEnabled: v })} />
                <Toggle label="Internal search logging" checked={form.searchLoggingEnabled} onChange={(v) => setForm({ ...form, searchLoggingEnabled: v })} />
                <Toggle label="Content-view logging" checked={form.contentViewEnabled} onChange={(v) => setForm({ ...form, contentViewEnabled: v })} />
                <Toggle label="Redact emails / numbers in stored queries" checked={form.redactQueries} onChange={(v) => setForm({ ...form, redactQueries: v })} />
                <label className="flex items-center gap-2">
                  <span className="w-48 text-stone-600">Raw-event retention (days)</span>
                  <input
                    type="number"
                    min={7}
                    max={400}
                    value={form.retentionDays}
                    onChange={(e) => setForm({ ...form, retentionDays: Number(e.target.value) })}
                    className="w-24 px-2 py-1 border border-stone-300 rounded-xs font-mono"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-48 text-stone-600">Reporting time zone</span>
                  <input
                    type="text"
                    value={form.displayTimeZone}
                    onChange={(e) => setForm({ ...form, displayTimeZone: e.target.value })}
                    className="w-40 px-2 py-1 border border-stone-300 rounded-xs font-mono"
                  />
                </label>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={saveConfig} disabled={pending} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] rounded-xs font-mono font-semibold disabled:opacity-50">
                    Save Settings
                  </button>
                  <button onClick={runRetention} disabled={pending} className="px-3 py-1.5 border border-stone-300 rounded-xs font-mono text-stone-600 hover:bg-stone-50 disabled:opacity-50">
                    Run Retention Prune
                  </button>
                </div>
              </div>
            )}
          </div>

          {caps.canExport && (
            <div className="bg-white border border-stone-200 rounded-xs p-5 flex items-center justify-between">
              <div>
                <h4 className="font-sans font-bold text-sm text-stone-900">Export</h4>
                <p className="text-xs text-stone-500">Download aggregate analytics (JSON) for the selected {days}-day range.</p>
              </div>
              <button onClick={exportData} disabled={pending} className="px-3 py-1.5 border border-stone-300 rounded-xs font-mono text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50">
                Export JSON
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function SectionLabel({ text, note }: { text: string; note?: string }) {
  return (
    <div className="px-4 py-3 bg-stone-50/50 border-b border-stone-200 flex items-center justify-between">
      <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">{text}</span>
      {note && <span className="text-[11px] text-stone-400">{note}</span>}
    </div>
  );
}
function EmptyRow({ text }: { text: string }) {
  return <div className="px-4 py-10 text-center text-xs text-stone-400 font-sans">{text}</div>;
}
function NoticeCard({ text }: { text: string }) {
  return <div className="bg-stone-50 border border-stone-200 rounded-xs p-6 text-center text-xs text-stone-500 font-sans">{text}</div>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#0F1115]" />
      <span className="text-stone-700">{label}</span>
    </label>
  );
}

function ProviderControls({
  provider,
  propertyRef,
  onDone,
  onRefresh,
}: {
  provider: string;
  propertyRef: string | null;
  onDone: (m: string) => void;
  onRefresh: () => void;
}) {
  const [ref, setRef] = useState(propertyRef ?? '');
  const [pending, start] = useTransition();
  return (
    <div className="pt-2 border-t border-stone-100 space-y-2">
      <input
        type="text"
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="Reference label (e.g. property id / site URL) — not a credential"
        className="w-full px-2 py-1 text-[11px] border border-stone-300 rounded-xs font-mono"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            start(async () => {
              const r = await setProviderConnectionAction(provider as never, { propertyRef: ref || null, enabled: !!ref });
              onDone(r.ok ? 'Saved provider reference.' : `Failed: ${r.error}`);
              if (r.ok) onRefresh();
            })
          }
          disabled={pending}
          className="px-2.5 py-1 text-[11px] font-mono border border-stone-300 rounded-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          Save Reference
        </button>
        <button
          onClick={() =>
            start(async () => {
              const r = await runProviderSyncAction(provider as never);
              onDone(r.ok ? r.message : `Failed: ${r.error}`);
              if (r.ok) onRefresh();
            })
          }
          disabled={pending}
          className="px-2.5 py-1 text-[11px] font-mono border border-stone-300 rounded-xs text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          Attempt Sync
        </button>
      </div>
    </div>
  );
}

export default AdminAnalyticsPage;

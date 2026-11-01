'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import type { SystemSettings, OperationalStatus, AuditResult } from '../../lib/cms/settingsService';
import { updateSiteIdentityAction, updateEditorialDefaultsAction, updateRodeoDefaultsAction } from '../../app/admin/settings-actions';

export interface AdminSettingsPageProps {
  settings: SystemSettings;
  operational: OperationalStatus;
  audit: AuditResult;
  auditFilters: { action?: string; actorId?: string; page: number };
}

type Tab = 'identity' | 'editorial' | 'rodeo' | 'operational' | 'audit';
const inputCls = 'w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]';
const labelCls = 'block text-xs font-mono uppercase text-stone-500 font-medium mb-1';

export const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({ settings, operational, audit, auditFilters }) => {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('identity');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const save = (p: Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await p; notify(r.ok ? 'Settings saved' : `Failed: ${r.error}`); if (r.ok) router.refresh(); });

  const [identity, setIdentity] = useState(settings.siteIdentity);
  const [editorial, setEditorial] = useState(settings.editorial);
  const [rodeo, setRodeo] = useState(settings.rodeo);

  return (
    <div className="space-y-6">
      {toast && <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">{toast}</div>}

      <AdminPageHeader title="System Settings" description="Typed, validated site configuration. Domain settings (SEO, Analytics, Monetization) stay owned by their modules; security-critical values are not editable here." breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'System Settings' }]} />

      <AdminTabs
        tabs={[{ id: 'identity', label: 'Site Identity' }, { id: 'editorial', label: 'Editorial Defaults' }, { id: 'rodeo', label: 'Rodeo Defaults' }, { id: 'operational', label: 'Operational' }, { id: 'audit', label: 'Audit Log', count: audit.total }]}
        activeTab={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'identity' && (
        <div className="bg-white border border-stone-200 rounded-xs p-6 max-w-3xl space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelCls}>Site name</label><input className={inputCls} value={identity.siteName} onChange={(e) => setIdentity({ ...identity, siteName: e.target.value })} /></div>
            <div><label className={labelCls}>Contact email</label><input className={inputCls} value={identity.contactEmail ?? ''} onChange={(e) => setIdentity({ ...identity, contactEmail: e.target.value })} /></div>
            <div className="md:col-span-2"><label className={labelCls}>Tagline</label><input className={inputCls} value={identity.tagline} onChange={(e) => setIdentity({ ...identity, tagline: e.target.value })} /></div>
            <div className="md:col-span-2"><label className={labelCls}>Description</label><textarea rows={2} className={inputCls} value={identity.description} onChange={(e) => setIdentity({ ...identity, description: e.target.value })} /></div>
            <div><label className={labelCls}>Editorial email</label><input className={inputCls} value={identity.editorialEmail ?? ''} onChange={(e) => setIdentity({ ...identity, editorialEmail: e.target.value })} /></div>
            <div><label className={labelCls}>Twitter/X URL</label><input className={inputCls} value={identity.twitterUrl ?? ''} onChange={(e) => setIdentity({ ...identity, twitterUrl: e.target.value })} /></div>
            <div><label className={labelCls}>Facebook URL</label><input className={inputCls} value={identity.facebookUrl ?? ''} onChange={(e) => setIdentity({ ...identity, facebookUrl: e.target.value })} /></div>
            <div><label className={labelCls}>Instagram URL</label><input className={inputCls} value={identity.instagramUrl ?? ''} onChange={(e) => setIdentity({ ...identity, instagramUrl: e.target.value })} /></div>
          </div>
          <p className="text-[11px] text-stone-400">URLs/emails are validated; HTML is rejected. Branding/logo changes remain owner-approved.</p>
          <button disabled={pending} onClick={() => save(updateSiteIdentityAction(identity))} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save Site Identity</button>
        </div>
      )}

      {tab === 'editorial' && (
        <div className="bg-white border border-stone-200 rounded-xs p-6 max-w-3xl space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelCls}>Default article status</label><select className={inputCls} value={editorial.defaultArticleStatus} onChange={(e) => setEditorial({ ...editorial, defaultArticleStatus: e.target.value as typeof editorial.defaultArticleStatus })}><option value="DRAFT">Draft</option><option value="IN_REVIEW">In Review</option></select></div>
            <div><label className={labelCls}>Editorial time zone</label><input className={inputCls} value={editorial.editorialTimeZone} onChange={(e) => setEditorial({ ...editorial, editorialTimeZone: e.target.value })} /></div>
            <div><label className={labelCls}>Words per minute</label><input type="number" className={inputCls} value={editorial.wordsPerMinute} onChange={(e) => setEditorial({ ...editorial, wordsPerMinute: Number(e.target.value) })} /></div>
            <div><label className={labelCls}>In-depth word count</label><input type="number" className={inputCls} value={editorial.inDepthWordCount} onChange={(e) => setEditorial({ ...editorial, inDepthWordCount: Number(e.target.value) })} /></div>
            <div className="md:col-span-2"><label className={labelCls}>Excerpt guidance</label><input className={inputCls} value={editorial.excerptGuidance} onChange={(e) => setEditorial({ ...editorial, excerptGuidance: e.target.value })} /></div>
            <div className="md:col-span-2"><label className={labelCls}>Attribution guidance</label><input className={inputCls} value={editorial.attributionGuidance} onChange={(e) => setEditorial({ ...editorial, attributionGuidance: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[#0F1115]" checked={editorial.sourceVerificationReminder} onChange={(e) => setEditorial({ ...editorial, sourceVerificationReminder: e.target.checked })} /><span>Show source-verification reminder in the editor</span></label>
          <p className="text-[11px] text-stone-400">These are defaults/guidance only; they do not bypass editorial review or publishing permissions, and the eight-field editor is unchanged.</p>
          <button disabled={pending} onClick={() => save(updateEditorialDefaultsAction(editorial))} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save Editorial Defaults</button>
        </div>
      )}

      {tab === 'rodeo' && (
        <div className="bg-white border border-stone-200 rounded-xs p-6 max-w-3xl space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelCls}>Date display</label><select className={inputCls} value={rodeo.dateDisplay} onChange={(e) => setRodeo({ ...rodeo, dateDisplay: e.target.value as typeof rodeo.dateDisplay })}><option value="absolute">Absolute</option><option value="relative">Relative</option></select></div>
            <div><label className={labelCls}>Event status presentation</label><select className={inputCls} value={rodeo.eventStatusPresentation} onChange={(e) => setRodeo({ ...rodeo, eventStatusPresentation: e.target.value as typeof rodeo.eventStatusPresentation })}><option value="badge">Badge</option><option value="text">Text</option></select></div>
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[#0F1115]" checked={rodeo.showVenue} onChange={(e) => setRodeo({ ...rodeo, showVenue: e.target.checked })} /><span>Show venue on event/edition cards</span></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[#0F1115]" checked={rodeo.editionSourceReminder} onChange={(e) => setRodeo({ ...rodeo, editionSourceReminder: e.target.checked })} /><span>Remind editors to re-verify edition sources each year</span></label>
          <p className="text-[11px] text-stone-400">Display preferences only. Event-vs-edition separation is preserved; edition-specific data is never auto-carried to future editions.</p>
          <button disabled={pending} onClick={() => save(updateRodeoDefaultsAction(rodeo))} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save Rodeo Defaults</button>
        </div>
      )}

      {tab === 'operational' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-2 text-xs">
            <h4 className="font-sans font-bold text-sm text-stone-900 mb-1">Application</h4>
            <Row k="Environment" v={operational.environment} />
            <Row k="Version" v={operational.appVersion} />
            <Row k="Commit" v={operational.commit} />
            <Row k="Database" v={operational.database.connected ? 'connected' : 'unreachable'} ok={operational.database.connected} />
            <Row k="Migrations applied" v={operational.database.migrationsApplied?.toString() ?? '—'} />
          </div>
          <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-2 text-xs">
            <h4 className="font-sans font-bold text-sm text-stone-900 mb-1">Module status</h4>
            <Row k="Media storage" v={operational.mediaStorageProvider} />
            <Row k="Analytics collection" v={operational.analyticsCollection ? 'enabled' : 'disabled'} />
            <Row k="Ad serving" v={operational.adServing ? 'enabled' : 'disabled'} />
            <Row k="Click tracking" v={operational.clickTracking ? 'enabled' : 'disabled'} />
            <div className="pt-2 flex gap-3 text-[11px]"><Link href="/admin/analytics/" className="text-[#8B5E3C] underline">Analytics</Link><Link href="/admin/monetization/" className="text-[#8B5E3C] underline">Monetization</Link><Link href="/admin/seo/" className="text-[#8B5E3C] underline">SEO</Link></div>
          </div>
          <div className="md:col-span-2 bg-stone-900 text-stone-300 border border-stone-800 rounded-xs p-4 text-xs">{operational.securityNote}</div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-3">
          <form method="get" className="flex flex-wrap gap-2 text-xs">
            <input name="action" defaultValue={auditFilters.action ?? ''} placeholder="Filter action (e.g. team.roles)…" className="px-3 py-1.5 border border-stone-300 rounded-xs bg-white w-64" />
            <input name="actorId" defaultValue={auditFilters.actorId ?? ''} placeholder="Actor id…" className="px-3 py-1.5 border border-stone-300 rounded-xs bg-white w-48" />
            <button type="submit" className="px-3 py-1.5 bg-stone-800 text-white rounded-xs font-mono">Filter</button>
          </form>
          <div className="bg-white border border-stone-200 rounded-xs overflow-x-auto">
            {audit.rows.length === 0 ? <div className="px-4 py-10 text-center text-xs text-stone-400">No audit entries match.</div> : (
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase"><tr><th className="px-4 py-2.5">Time (UTC)</th><th className="px-4 py-2.5">Actor</th><th className="px-4 py-2.5">Action</th><th className="px-4 py-2.5">Entity</th><th className="px-4 py-2.5">Detail</th></tr></thead>
                <tbody className="divide-y divide-stone-200">
                  {audit.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-stone-50/50">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-stone-500">{r.createdAt.slice(0, 19).replace('T', ' ')}</td>
                      <td className="px-4 py-2.5">{r.actorName ?? <span className="text-stone-400">system</span>}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px]">{r.action}</td>
                      <td className="px-4 py-2.5 text-stone-500">{r.entityType}</td>
                      <td className="px-4 py-2.5 text-stone-500 font-mono text-[11px] max-w-[260px] truncate">{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-stone-500">Page {audit.page} of {audit.totalPages} · {audit.total} entries</span>
            <div className="flex gap-2">
              {audit.page > 1 && <Link href={`/admin/settings/?action=${encodeURIComponent(auditFilters.action ?? '')}&page=${audit.page - 1}`} className="px-3 py-1.5 border border-stone-300 rounded-xs bg-white">← Prev</Link>}
              {audit.page < audit.totalPages && <Link href={`/admin/settings/?action=${encodeURIComponent(auditFilters.action ?? '')}&page=${audit.page + 1}`} className="px-3 py-1.5 border border-stone-300 rounded-xs bg-white">Next →</Link>}
            </div>
          </div>
          <p className="text-[11px] text-stone-400">Audit history is read-only and cannot be edited or deleted from the UI.</p>
        </div>
      )}
    </div>
  );
};

function Row({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className="flex justify-between py-1 border-b border-stone-100 font-mono">
      <span className="text-stone-500">{k}</span>
      <span className={`font-bold ${ok === false ? 'text-rose-700' : ok === true ? 'text-emerald-700' : 'text-stone-800'}`}>{v}</span>
    </div>
  );
}

export default AdminSettingsPage;

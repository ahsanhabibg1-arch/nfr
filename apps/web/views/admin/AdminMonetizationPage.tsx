'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminModal } from '../../components/admin/AdminModal';
import type { MonetizationDashboard, ComplianceFinding } from '../../lib/cms/monetizationService';
import * as actions from '../../app/admin/monetization-actions';

interface PartnerRow { id: string; name: string; website: string | null; category: string; programType: string | null; isActive: boolean; verificationStatus: string; complianceNotes: string | null; _count?: { links: number; associations: number } }
interface LinkRow { id: string; label: string; merchantUrl: string; trackingUrl: string | null; category: string; rel: string; isActive: boolean; status: string; partnerId: string; partner?: { name: string; isActive: boolean }; _count?: { placements: number } }
interface AdRow { id: string; slot: string; name: string; pageScope: string; device: string; priority: number; enabled: boolean }
interface DiscRow { id: string; key: string; scope: string; label: string; body: string; enabled: boolean }
interface SponsoredRow { id: string; sponsorName: string; disclosureLabel: string; isActive: boolean; article?: { title: string; slug: string }; partner?: { name: string } | null }

export interface AdminMonetizationPageProps {
  dashboard: MonetizationDashboard;
  partners: PartnerRow[];
  links: LinkRow[];
  adPlacements: AdRow[];
  disclosures: DiscRow[];
  sponsored: SponsoredRow[];
  compliance: ComplianceFinding[];
  caps: { partner: boolean; link: boolean; placement: boolean; disclosure: boolean; config: boolean; report: boolean };
}

type Tab = 'overview' | 'partners' | 'links' | 'ads' | 'disclosures' | 'sponsored' | 'compliance' | 'config';
const CATEGORIES = ['STREAMING', 'TICKETS', 'TRAVEL', 'APPAREL', 'BOOTS', 'ACCESSORIES', 'EQUIPMENT', 'OTHER'];
const RELS = ['SPONSORED_NOFOLLOW', 'SPONSORED', 'NOFOLLOW', 'UGC'];
const AD_SLOTS = ['HOMEPAGE', 'ARTICLE_HEADER', 'ARTICLE_INCONTENT', 'ARTICLE_FOOTER', 'CATEGORY', 'RODEO_EVENT', 'SIDEBAR'];

export const AdminMonetizationPage: React.FC<AdminMonetizationPageProps> = (props) => {
  const { dashboard, partners, links, adPlacements, disclosures, sponsored, compliance, caps } = props;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const act = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => { const r = await p; notify(r.ok ? okMsg : `Failed: ${r.error}`); if (r.ok) router.refresh(); });

  const [partnerModal, setPartnerModal] = useState(false);
  const [linkModal, setLinkModal] = useState(false);

  return (
    <div className="space-y-6">
      {toast && <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">{toast}</div>}

      <AdminPageHeader
        title="Monetization & Commercial Operations"
        description="Database-backed affiliate partners, link registry, ad placements, disclosures and sponsored content. No revenue, commission, availability or AdSense approval is fabricated."
        breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Monetization' }]}
      />

      {/* Honest external status */}
      <div className="p-4 bg-stone-900 text-stone-300 border border-stone-800 rounded-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dashboard.settings.adsenseEnabled ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <p className="text-xs text-stone-400">
            External ad serving is <strong className="text-white">{dashboard.settings.adsenseEnabled ? 'ENABLED' : 'DISABLED'}</strong> and outbound click tracking is <strong className="text-white">{dashboard.settings.clickTrackingEnabled ? 'ENABLED' : 'DISABLED'}</strong>. No AdSense script is injected in this build; revenue/earnings are never shown.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-1 text-[10px] font-mono rounded-xs bg-white/10 border border-white/10">AdSense: {dashboard.settings.adsensePublisherId ? 'Configured' : 'Not configured'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard title="Partners" value={`${dashboard.partners.active}/${dashboard.partners.total}`} description={`${dashboard.partners.pendingVerification} pending verification`} trend="neutral" />
        <AdminStatCard title="Affiliate Links" value={`${dashboard.links.active}/${dashboard.links.total}`} description={`${dashboard.links.inactive} inactive`} trend="neutral" />
        <AdminStatCard title="Active Placements" value={dashboard.placements.active.toString()} description={`${dashboard.placements.total} total`} trend="neutral" />
        <AdminStatCard title="Outbound Clicks (30d)" value={dashboard.clicks.last30d === null ? 'Not tracked' : dashboard.clicks.last30d.toLocaleString()} description={dashboard.clicks.trackingEnabled ? 'Click tracking on' : 'Tracking disabled'} trend="neutral" />
      </div>

      <AdminTabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'partners', label: 'Partners', count: partners.length },
          { id: 'links', label: 'Affiliate Links', count: links.length },
          { id: 'ads', label: 'Ad Placements', count: adPlacements.length },
          { id: 'disclosures', label: 'Disclosures', count: disclosures.length },
          { id: 'sponsored', label: 'Sponsored', count: sponsored.length },
          ...(caps.report ? [{ id: 'compliance', label: 'Compliance', count: compliance.length }] : []),
          { id: 'config', label: 'Config' },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
          <h4 className="font-sans font-bold text-sm text-stone-900">Monetization Readiness</h4>
          <ul className="space-y-1.5">
            {dashboard.readiness.map((r) => (
              <li key={r.label} className="flex items-center gap-2 text-xs font-sans">
                <span className={`w-2 h-2 rounded-full ${r.ok ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                <span className={r.ok ? 'text-stone-800' : 'text-stone-500'}>{r.label}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-stone-400 pt-2 border-t border-stone-100">No revenue, earnings, RPM, CPC, conversion or commission figures are shown — those require authorized provider connections that are not configured.</p>
        </div>
      )}

      {/* PARTNERS */}
      {tab === 'partners' && (
        <Section title={`Affiliate Partners (${partners.length})`} action={caps.partner && <AddBtn onClick={() => setPartnerModal(true)} label="Add Partner" />}>
          {partners.length === 0 ? <Empty text="No partners yet. Add verified commercial partners — none are pre-populated." /> : (
            <Table head={['Partner', 'Category', 'Verification', 'Links', 'Status', 'Actions']}>
              {partners.map((p) => (
                <tr key={p.id} className="hover:bg-stone-50/50">
                  <td className="px-4 py-3 font-semibold text-stone-900">{p.name}{p.website && <span className="block text-[11px] font-normal text-stone-500 font-mono truncate max-w-[220px]">{p.website}</span>}</td>
                  <td className="px-4 py-3"><Badge>{p.category}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={p.verificationStatus === 'VERIFIED' ? 'emerald' : 'stone'}>{p.verificationStatus}</Badge></td>
                  <td className="px-4 py-3 text-center font-mono">{p._count?.links ?? 0}</td>
                  <td className="px-4 py-3"><Badge tone={p.isActive ? 'emerald' : 'stone'}>{p.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge></td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {caps.partner && p.verificationStatus !== 'VERIFIED' && <ActBtn disabled={pending} onClick={() => act(actions.setPartnerVerificationAction(p.id, 'VERIFIED'), 'Partner verified')}>Verify</ActBtn>}
                    {caps.partner && <ActBtn disabled={pending} onClick={() => act(actions.setPartnerActiveAction(p.id, !p.isActive), 'Partner updated')}>{p.isActive ? 'Deactivate' : 'Activate'}</ActBtn>}
                    {caps.partner && <ActBtn disabled={pending} danger onClick={() => act(actions.deletePartnerAction(p.id), 'Partner deleted')}>Delete</ActBtn>}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      )}

      {/* LINKS */}
      {tab === 'links' && (
        <Section title={`Affiliate Link Registry (${links.length})`} action={caps.link && <AddBtn onClick={() => setLinkModal(true)} label="Add Link" />}>
          {links.length === 0 ? <Empty text="No affiliate links yet." /> : (
            <Table head={['Label', 'Partner', 'Category', 'Rel', 'Destination', 'Status', 'Actions']}>
              {links.map((l) => (
                <tr key={l.id} className="hover:bg-stone-50/50">
                  <td className="px-4 py-3 font-medium text-stone-900">{l.label}</td>
                  <td className="px-4 py-3 text-stone-600">{l.partner?.name}</td>
                  <td className="px-4 py-3"><Badge>{l.category}</Badge></td>
                  <td className="px-4 py-3 font-mono text-[10px]">{l.rel.toLowerCase().replace('_', ' ')}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-stone-500 max-w-[200px] truncate">{l.trackingUrl || l.merchantUrl}</td>
                  <td className="px-4 py-3"><Badge tone={l.isActive ? 'emerald' : 'stone'}>{l.isActive ? 'ACTIVE' : l.status}</Badge></td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {caps.link && <ActBtn disabled={pending} onClick={() => act(actions.setLinkActiveAction(l.id, !l.isActive), 'Link updated')}>{l.isActive ? 'Deactivate' : 'Activate'}</ActBtn>}
                    {caps.link && <ActBtn disabled={pending} danger onClick={() => act(actions.deleteLinkAction(l.id), 'Link deleted')}>Delete</ActBtn>}
                    <a href={`/go/${l.id}/`} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-stone-400 underline hover:text-stone-700">Test /go</a>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      )}

      {/* AD PLACEMENTS */}
      {tab === 'ads' && (
        <Section title={`Ad Placements (${adPlacements.length})`} action={caps.placement && <AdCreate onDone={notify} onRefresh={() => router.refresh()} />}>
          <p className="px-4 py-2 text-[11px] text-stone-500">External serving is disabled by default. Enabling a placement only reserves labeled space; no AdSense script is injected without owner approval.</p>
          {adPlacements.length === 0 ? <Empty text="No ad placements configured." /> : (
            <Table head={['Slot', 'Name', 'Scope', 'Device', 'Enabled', 'Actions']}>
              {adPlacements.map((a) => (
                <tr key={a.id} className="hover:bg-stone-50/50">
                  <td className="px-4 py-3 font-mono text-[11px]">{a.slot}</td>
                  <td className="px-4 py-3 font-medium text-stone-900">{a.name}</td>
                  <td className="px-4 py-3">{a.pageScope}</td>
                  <td className="px-4 py-3">{a.device}</td>
                  <td className="px-4 py-3"><Badge tone={a.enabled ? 'emerald' : 'stone'}>{a.enabled ? 'ENABLED' : 'DISABLED'}</Badge></td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {caps.placement && <ActBtn disabled={pending} onClick={() => act(actions.setAdPlacementEnabledAction(a.id, !a.enabled), 'Placement updated')}>{a.enabled ? 'Disable' : 'Enable'}</ActBtn>}
                    {caps.placement && <ActBtn disabled={pending} danger onClick={() => act(actions.deleteAdPlacementAction(a.id), 'Placement deleted')}>Delete</ActBtn>}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      )}

      {/* DISCLOSURES */}
      {tab === 'disclosures' && (
        <div className="space-y-4">
          <Section title={`Disclosure Policies (${disclosures.length})`}>
            {disclosures.length === 0 ? <Empty text="No disclosure policies yet. Add at least an 'article-affiliate' and a site disclosure." /> : (
              <Table head={['Key', 'Scope', 'Label', 'Enabled']}>
                {disclosures.map((d) => (
                  <tr key={d.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-mono text-[11px]">{d.key}</td>
                    <td className="px-4 py-3">{d.scope}</td>
                    <td className="px-4 py-3">{d.label}</td>
                    <td className="px-4 py-3"><Badge tone={d.enabled ? 'emerald' : 'stone'}>{d.enabled ? 'ON' : 'OFF'}</Badge></td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
          {caps.disclosure && <DisclosureForm onDone={notify} onRefresh={() => router.refresh()} />}
        </div>
      )}

      {/* SPONSORED */}
      {tab === 'sponsored' && (
        <div className="space-y-4">
          <Section title={`Sponsored Content (${sponsored.length})`}>
            {sponsored.length === 0 ? <Empty text="No sponsored relationships. Ordinary articles that merely discuss a service are NOT sponsored." /> : (
              <Table head={['Article', 'Sponsor', 'Label', 'Status', 'Actions']}>
                {sponsored.map((s) => (
                  <tr key={s.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-medium text-stone-900">{s.article ? <Link href={`/articles/${s.article.slug}/`} className="hover:underline">{s.article.title}</Link> : '—'}</td>
                    <td className="px-4 py-3">{s.sponsorName}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">{s.disclosureLabel}</td>
                    <td className="px-4 py-3"><Badge tone={s.isActive ? 'emerald' : 'stone'}>{s.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge></td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      {caps.disclosure && <ActBtn disabled={pending} onClick={() => act(actions.setSponsoredActiveAction(s.id, !s.isActive), 'Updated')}>{s.isActive ? 'Deactivate' : 'Activate'}</ActBtn>}
                      {caps.disclosure && <ActBtn disabled={pending} danger onClick={() => act(actions.deleteSponsoredAction(s.id), 'Deleted')}>Delete</ActBtn>}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
          {caps.disclosure && <SponsoredForm onDone={notify} onRefresh={() => router.refresh()} />}
        </div>
      )}

      {/* COMPLIANCE */}
      {tab === 'compliance' && caps.report && (
        <Section title={`Commercial Compliance (${compliance.length})`}>
          <p className="px-4 py-2 text-[11px] text-stone-500">Advisory, read-only checks derived from real data — distinct from the SEO Intelligence rules, which are unchanged.</p>
          {compliance.length === 0 ? <Empty text="No commercial-compliance issues detected." /> : (
            <ul className="divide-y divide-stone-200">
              {compliance.map((f, i) => (
                <li key={i} className="px-4 py-3 flex items-start gap-3 text-xs font-sans">
                  <Badge tone={f.severity === 'high' ? 'rose' : f.severity === 'medium' ? 'amber' : 'stone'}>{f.severity}</Badge>
                  <div><p className="text-stone-800">{f.message}</p><p className="text-[11px] font-mono text-stone-400">{f.code} · {f.entity}</p></div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* CONFIG */}
      {tab === 'config' && <ConfigForm settings={dashboard.settings} canConfig={caps.config} onDone={notify} onRefresh={() => router.refresh()} />}

      {/* MODALS */}
      {partnerModal && <PartnerModal onClose={() => setPartnerModal(false)} onDone={notify} onRefresh={() => router.refresh()} />}
      {linkModal && <LinkModal partners={partners} onClose={() => setLinkModal(false)} onDone={notify} onRefresh={() => router.refresh()} />}
    </div>
  );
};

// ---------- small presentational helpers ----------
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xs overflow-hidden">
      <div className="px-4 py-3 bg-stone-50/50 border-b border-stone-200 flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">{title}</span>
        {action}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-left text-xs font-sans">
      <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase tracking-wider">
        <tr>{head.map((h, i) => <th key={i} className={`px-4 py-2.5 ${i === head.length - 1 ? 'text-right' : ''}`}>{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-stone-200">{children}</tbody>
    </table>
  );
}
function Empty({ text }: { text: string }) { return <div className="px-4 py-10 text-center text-xs text-stone-400 font-sans">{text}</div>; }
function Badge({ children, tone = 'stone' }: { children: React.ReactNode; tone?: 'stone' | 'emerald' | 'amber' | 'rose' }) {
  const c = { stone: 'bg-stone-100 text-stone-700', emerald: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800', rose: 'bg-rose-100 text-rose-800' }[tone];
  return <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold ${c}`}>{children}</span>;
}
function ActBtn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className={`text-[11px] font-mono underline disabled:opacity-40 ${danger ? 'text-rose-600 hover:text-rose-800' : 'text-stone-500 hover:text-stone-900'}`}>{children}</button>;
}
function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return <button onClick={onClick} className="px-3 py-1.5 text-xs font-sans font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs">{label}</button>;
}
const inputCls = 'w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]';
const labelCls = 'block text-xs font-mono uppercase text-stone-500 font-medium mb-1';

// ---------- forms ----------
function PartnerModal({ onClose, onDone, onRefresh }: { onClose: () => void; onDone: (m: string) => void; onRefresh: () => void }) {
  const [f, setF] = useState({ name: '', website: '', category: 'OTHER', programType: '' });
  const [pending, start] = useTransition();
  return (
    <AdminModal isOpen title="Register Commercial Partner" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await actions.createPartnerAction({ name: f.name, website: f.website || null, category: f.category as never, programType: f.programType || null }); onDone(r.ok ? 'Partner created (unverified, inactive)' : `Failed: ${r.error}`); if (r.ok) { onRefresh(); onClose(); } }); }} className="space-y-3">
        <div><label className={labelCls}>Partner name</label><input className={inputCls} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className={labelCls}>Official website (https)</label><input className={inputCls} value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://partner.example.com" /></div>
        <div><label className={labelCls}>Category</label><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className={labelCls}>Program type (optional)</label><input className={inputCls} value={f.programType} onChange={(e) => setF({ ...f, programType: e.target.value })} /></div>
        <p className="text-[11px] text-stone-500 font-mono bg-stone-50 border border-stone-200 p-2 rounded-xs">New partners start UNVERIFIED and INACTIVE. Verify with evidence before activating; never claim official status without it.</p>
        <div className="flex justify-end gap-2 pt-2 border-t border-stone-200"><button type="button" onClick={onClose} className="px-4 py-2 text-xs text-stone-600">Cancel</button><button type="submit" disabled={pending} className="px-4 py-2 text-xs font-semibold text-white bg-[#0F1115] rounded-xs disabled:opacity-50">Create</button></div>
      </form>
    </AdminModal>
  );
}
function LinkModal({ partners, onClose, onDone, onRefresh }: { partners: PartnerRow[]; onClose: () => void; onDone: (m: string) => void; onRefresh: () => void }) {
  const [f, setF] = useState({ partnerId: partners[0]?.id ?? '', label: '', merchantUrl: '', trackingUrl: '', category: 'OTHER', rel: 'SPONSORED_NOFOLLOW', editorialContext: '' });
  const [pending, start] = useTransition();
  return (
    <AdminModal isOpen title="Add Affiliate Link" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await actions.createLinkAction({ partnerId: f.partnerId, label: f.label, merchantUrl: f.merchantUrl, trackingUrl: f.trackingUrl || null, category: f.category as never, rel: f.rel as never, editorialContext: f.editorialContext || null }); onDone(r.ok ? 'Link created (draft, inactive)' : `Failed: ${r.error}`); if (r.ok) { onRefresh(); onClose(); } }); }} className="space-y-3">
        <div><label className={labelCls}>Partner</label><select className={inputCls} required value={f.partnerId} onChange={(e) => setF({ ...f, partnerId: e.target.value })}>{partners.length === 0 ? <option value="">No partners — add one first</option> : partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label className={labelCls}>Label</label><input className={inputCls} required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        <div><label className={labelCls}>Merchant URL (https)</label><input className={inputCls} required value={f.merchantUrl} onChange={(e) => setF({ ...f, merchantUrl: e.target.value })} placeholder="https://merchant.example.com/product" /></div>
        <div><label className={labelCls}>Tracking URL (optional)</label><input className={inputCls} value={f.trackingUrl} onChange={(e) => setF({ ...f, trackingUrl: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Category</label><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className={labelCls}>Rel policy</label><select className={inputCls} value={f.rel} onChange={(e) => setF({ ...f, rel: e.target.value })}>{RELS.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div><label className={labelCls}>Editorial context (optional)</label><input className={inputCls} value={f.editorialContext} onChange={(e) => setF({ ...f, editorialContext: e.target.value })} /></div>
        <div className="flex justify-end gap-2 pt-2 border-t border-stone-200"><button type="button" onClick={onClose} className="px-4 py-2 text-xs text-stone-600">Cancel</button><button type="submit" disabled={pending || partners.length === 0} className="px-4 py-2 text-xs font-semibold text-white bg-[#0F1115] rounded-xs disabled:opacity-50">Create</button></div>
      </form>
    </AdminModal>
  );
}
function AdCreate({ onDone, onRefresh }: { onDone: (m: string) => void; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ slot: 'ARTICLE_INCONTENT', name: '', pageScope: 'article', device: 'all' });
  const [pending, start] = useTransition();
  if (!open) return <AddBtn onClick={() => setOpen(true)} label="Add Placement" />;
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await actions.createAdPlacementAction({ slot: f.slot as never, name: f.name, pageScope: f.pageScope as never, device: f.device as never }); onDone(r.ok ? 'Ad placement created (disabled)' : `Failed: ${r.error}`); if (r.ok) { onRefresh(); setOpen(false); } }); }} className="flex flex-wrap items-end gap-2">
      <select className={`${inputCls} w-auto`} value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })}>{AD_SLOTS.map((s) => <option key={s}>{s}</option>)}</select>
      <input className={`${inputCls} w-40`} placeholder="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <select className={`${inputCls} w-auto`} value={f.pageScope} onChange={(e) => setF({ ...f, pageScope: e.target.value })}>{['home', 'article', 'category', 'rodeo_event', 'global'].map((s) => <option key={s}>{s}</option>)}</select>
      <button type="submit" disabled={pending} className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0F1115] rounded-xs disabled:opacity-50">Create</button>
    </form>
  );
}
function DisclosureForm({ onDone, onRefresh }: { onDone: (m: string) => void; onRefresh: () => void }) {
  const [f, setF] = useState({ key: 'article-affiliate', scope: 'article', label: 'Commercial Disclosure', body: '' });
  const [pending, start] = useTransition();
  return (
    <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
      <h4 className="font-sans font-bold text-sm text-stone-900">Add / update disclosure policy</h4>
      <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await actions.upsertDisclosureAction({ key: f.key, scope: f.scope as never, label: f.label, body: f.body }); onDone(r.ok ? 'Disclosure saved' : `Failed: ${r.error}`); if (r.ok) onRefresh(); }); }} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div><label className={labelCls}>Key</label><input className={inputCls} required value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} /></div>
          <div><label className={labelCls}>Scope</label><select className={inputCls} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>{['site', 'article', 'callout', 'sponsored', 'ad', 'partner'].map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label className={labelCls}>Label</label><input className={inputCls} required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        </div>
        <div><label className={labelCls}>Body</label><textarea rows={3} className={inputCls} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <button type="submit" disabled={pending} className="px-4 py-2 text-xs font-semibold text-white bg-[#0F1115] rounded-xs disabled:opacity-50">Save Disclosure</button>
      </form>
    </div>
  );
}
function SponsoredForm({ onDone, onRefresh }: { onDone: (m: string) => void; onRefresh: () => void }) {
  const [f, setF] = useState({ articleId: '', sponsorName: '', disclosureLabel: 'Sponsored' });
  const [pending, start] = useTransition();
  return (
    <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
      <h4 className="font-sans font-bold text-sm text-stone-900">Classify sponsored content</h4>
      <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await actions.createSponsoredAction({ articleId: f.articleId, sponsorName: f.sponsorName, disclosureLabel: f.disclosureLabel }); onDone(r.ok ? 'Sponsorship created (inactive)' : `Failed: ${r.error}`); if (r.ok) onRefresh(); }); }} className="flex flex-wrap items-end gap-2">
        <div><label className={labelCls}>Article ID</label><input className={`${inputCls} w-64`} required value={f.articleId} onChange={(e) => setF({ ...f, articleId: e.target.value })} /></div>
        <div><label className={labelCls}>Sponsor</label><input className={`${inputCls} w-48`} required value={f.sponsorName} onChange={(e) => setF({ ...f, sponsorName: e.target.value })} /></div>
        <div><label className={labelCls}>Label</label><input className={`${inputCls} w-32`} value={f.disclosureLabel} onChange={(e) => setF({ ...f, disclosureLabel: e.target.value })} /></div>
        <button type="submit" disabled={pending} className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0F1115] rounded-xs disabled:opacity-50">Create</button>
      </form>
    </div>
  );
}
function ConfigForm({ settings, canConfig, onDone, onRefresh }: { settings: MonetizationDashboard['settings']; canConfig: boolean; onDone: (m: string) => void; onRefresh: () => void }) {
  const [f, setF] = useState(settings);
  const [pending, start] = useTransition();
  return (
    <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-4">
      <h4 className="font-sans font-bold text-sm text-stone-900">Monetization Configuration</h4>
      {!canConfig ? <p className="text-xs text-stone-500">Only an Administrator can change these settings.</p> : (
        <div className="space-y-3 text-xs">
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#0F1115]" checked={f.adsenseEnabled} onChange={(e) => setF({ ...f, adsenseEnabled: e.target.checked })} /><span>Enable AdSense placements (reserves labeled space; still no script injected this batch)</span></label>
          <label className="flex items-center gap-2"><span className="w-40 text-stone-600">AdSense publisher id</span><input className={`${inputCls} w-64`} value={f.adsensePublisherId ?? ''} onChange={(e) => setF({ ...f, adsensePublisherId: e.target.value || null })} placeholder="ca-pub-… (only if authorized)" /></label>
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#0F1115]" checked={f.clickTrackingEnabled} onChange={(e) => setF({ ...f, clickTrackingEnabled: e.target.checked })} /><span>Enable outbound click tracking (also requires analytics collection on)</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#0F1115]" checked={f.siteDisclosureEnabled} onChange={(e) => setF({ ...f, siteDisclosureEnabled: e.target.checked })} /><span>Show site-wide affiliate disclosure</span></label>
          <button onClick={() => start(async () => { const r = await actions.updateMonetizationConfigAction(f); onDone(r.ok ? 'Settings saved' : `Failed: ${r.error}`); if (r.ok) onRefresh(); })} disabled={pending} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] rounded-xs font-mono font-semibold disabled:opacity-50">Save Settings</button>
        </div>
      )}
    </div>
  );
}

export default AdminMonetizationPage;

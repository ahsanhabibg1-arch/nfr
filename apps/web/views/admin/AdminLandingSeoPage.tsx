'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LandingEntityType } from '@prisma/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import type { LandingEntityGroup, LandingDetail } from '../../lib/cms/landingAdminService';
import {
  upsertEntitySeoAction,
  createFaqAction,
  updateFaqAction,
  deleteFaqAction,
  setFaqEnabledAction,
  reorderFaqsAction,
} from '../../app/admin/landing-seo-actions';
import { updateDisciplineAction } from '../../app/admin/rodeo-actions';

export interface AdminLandingSeoPageProps {
  groups: LandingEntityGroup[];
  selected: LandingDetail | null;
}

export const AdminLandingSeoPage: React.FC<AdminLandingSeoPageProps> = ({ groups, selected }) => {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  return (
    <div className="space-y-6">
      {toast && <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">{toast}</div>}
      <AdminPageHeader
        title="Landing-Page SEO & FAQ"
        description="Editor-controlled SEO overrides, editorial intros and FAQs for rodeo hubs, events, editions, disciplines, categories, venues and competitors. Empty fields fall back to the page's derived metadata."
        breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Landing SEO & FAQ' }]}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Entity picker */}
        <aside className="space-y-4">
          {groups.map((g) => (
            <div key={g.type} className="bg-white border border-stone-200 rounded-xs overflow-hidden">
              <div className="px-3 py-2 bg-stone-50/50 border-b border-stone-200 text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold">{g.label} ({g.items.length})</div>
              <ul className="max-h-64 overflow-y-auto divide-y divide-stone-100">
                {g.items.length === 0 && <li className="px-3 py-2 text-xs text-stone-400">None</li>}
                {g.items.map((it) => {
                  const active = selected?.entityType === it.entityType && selected?.entityId === it.entityId;
                  return (
                    <li key={it.entityId}>
                      <Link href={`/admin/landing-seo/?type=${it.entityType}&id=${encodeURIComponent(it.entityId)}`} className={`block px-3 py-2 text-xs ${active ? 'bg-[#1E293B] text-[#D4A757] font-semibold' : 'text-stone-700 hover:bg-stone-50'}`}>
                        <span className="block truncate">{it.label}</span>
                        <span className="text-[10px] font-mono text-stone-400">{it.hasSeo ? (it.noindex ? 'seo·noindex' : 'seo') : 'no-seo'} · {it.faqCount} faq</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        {/* Editor */}
        <section>
          {!selected ? (
            <div className="bg-stone-50 border border-stone-200 rounded-xs p-8 text-center text-sm text-stone-500">Select an entity on the left to edit its SEO and FAQs.</div>
          ) : (
            <LandingEditor key={`${selected.entityType}:${selected.entityId}`} detail={selected} notify={notify} refresh={() => router.refresh()} />
          )}
        </section>
      </div>
    </div>
  );
};

const inputCls = 'w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]';
const labelCls = 'block text-[11px] font-mono uppercase text-stone-500 font-medium mb-1';

function LandingEditor({ detail, notify, refresh }: { detail: LandingDetail; notify: (m: string) => void; refresh: () => void }) {
  const [pending, start] = useTransition();
  const [seo, setSeo] = useState({
    seoTitle: detail.seo?.seoTitle ?? '',
    metaDescription: detail.seo?.metaDescription ?? '',
    canonicalOverride: detail.seo?.canonicalOverride ?? '',
    ogImage: detail.seo?.ogImage ?? '',
    noindex: detail.seo?.noindex ?? false,
    intro: detail.seo?.intro ?? '',
  });
  const et = detail.entityType as LandingEntityType;
  const disabled = !detail.canEdit;

  const saveSeo = () => start(async () => {
    const r = await upsertEntitySeoAction(et, detail.entityId, {
      seoTitle: seo.seoTitle || null, metaDescription: seo.metaDescription || null,
      canonicalOverride: seo.canonicalOverride || null, ogImage: seo.ogImage || null,
      noindex: seo.noindex, intro: seo.intro || null,
    });
    notify(r.ok ? 'SEO saved.' : `Failed: ${r.error}`);
    if (r.ok) refresh();
  });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-sans font-bold text-sm text-stone-900">{detail.label} <span className="text-[11px] font-mono text-stone-400">({detail.entityType})</span></h3>
          <Link href={detail.publicUrl} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-[#8B5E3C] underline">View page ↗</Link>
        </div>
        {!detail.canEdit && <p className="text-[11px] text-amber-700">You can view this entity but lack the permission to edit it.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className={labelCls}>SEO title</label><input className={inputCls} disabled={disabled} value={seo.seoTitle} onChange={(e) => setSeo({ ...seo, seoTitle: e.target.value })} placeholder="(falls back to derived title)" /></div>
          <div><label className={labelCls}>OG / social image URL</label><input className={inputCls} disabled={disabled} value={seo.ogImage} onChange={(e) => setSeo({ ...seo, ogImage: e.target.value })} /></div>
          <div className="md:col-span-2"><label className={labelCls}>Meta description</label><textarea rows={2} className={inputCls} disabled={disabled} value={seo.metaDescription} onChange={(e) => setSeo({ ...seo, metaDescription: e.target.value })} placeholder="(falls back to derived description)" /></div>
          <div className="md:col-span-2"><label className={labelCls}>Canonical override (path or same-site URL)</label><input className={inputCls} disabled={disabled} value={seo.canonicalOverride} onChange={(e) => setSeo({ ...seo, canonicalOverride: e.target.value })} placeholder="/rodeo-events/… (optional)" /></div>
          <div className="md:col-span-2"><label className={labelCls}>Editorial intro (plain text)</label><textarea rows={4} className={inputCls} disabled={disabled} value={seo.intro} onChange={(e) => setSeo({ ...seo, intro: e.target.value })} /></div>
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[#0F1115]" disabled={disabled} checked={seo.noindex} onChange={(e) => setSeo({ ...seo, noindex: e.target.checked })} /><span>noindex this page (cannot force-index a thin/unpublished entity — only adds restriction)</span></label>
        <button onClick={saveSeo} disabled={pending || disabled} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save SEO</button>
      </div>

      {detail.disciplineFields && <DisciplineFields detail={detail} notify={notify} refresh={refresh} />}

      <FaqManager detail={detail} notify={notify} refresh={refresh} />
    </div>
  );
}

function DisciplineFields({ detail, notify, refresh }: { detail: LandingDetail; notify: (m: string) => void; refresh: () => void }) {
  const d = detail.disciplineFields!;
  const [pending, start] = useTransition();
  const [f, setF] = useState({ shortName: d.shortName ?? '', category: d.category ?? '', tagline: d.tagline ?? '', summary: d.summary });
  const disabled = !detail.canEdit;
  return (
    <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
      <h3 className="font-sans font-bold text-sm text-stone-900">Discipline details <span className="text-[11px] font-mono text-stone-400">(deep guide content is preserved and edited separately)</span></h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className={labelCls}>Short name</label><input className={inputCls} disabled={disabled} value={f.shortName} onChange={(e) => setF({ ...f, shortName: e.target.value })} /></div>
        <div><label className={labelCls}>Category</label><select className={inputCls} disabled={disabled} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">—</option><option value="Roughstock">Roughstock</option><option value="Timed Event">Timed Event</option></select></div>
        <div className="md:col-span-2"><label className={labelCls}>Tagline</label><input className={inputCls} disabled={disabled} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></div>
        <div className="md:col-span-2"><label className={labelCls}>Summary</label><textarea rows={3} className={inputCls} disabled={disabled} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div>
      </div>
      <button
        onClick={() => start(async () => {
          const r = await updateDisciplineAction(detail.entityId, { shortName: f.shortName || undefined, category: (f.category || undefined) as 'Roughstock' | 'Timed Event' | undefined, tagline: f.tagline || undefined, summary: f.summary });
          notify(r.ok ? 'Discipline saved.' : `Failed: ${r.error}`);
          if (r.ok) refresh();
        })}
        disabled={pending || disabled || f.summary.trim().length < 1}
        className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50"
      >Save Discipline</button>
    </div>
  );
}

function FaqManager({ detail, notify, refresh }: { detail: LandingDetail; notify: (m: string) => void; refresh: () => void }) {
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const et = detail.entityType as LandingEntityType;
  const disabled = !detail.canEdit;
  const faqs = detail.faqs;

  const add = () => start(async () => {
    const r = await createFaqAction(et, detail.entityId, { question: q, answer: a });
    notify(r.ok ? 'FAQ added.' : `Failed: ${r.error}`);
    if (r.ok) { setQ(''); setA(''); refresh(); }
  });
  const move = (idx: number, dir: -1 | 1) => start(async () => {
    const ids = faqs.map((f) => f.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    const r = await reorderFaqsAction(et, detail.entityId, ids);
    notify(r.ok ? 'Reordered.' : `Failed: ${r.error}`);
    if (r.ok) refresh();
  });

  return (
    <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
      <h3 className="font-sans font-bold text-sm text-stone-900">FAQs ({faqs.length})</h3>
      {faqs.length === 0 && <p className="text-xs text-stone-400">No FAQs yet.</p>}
      <ul className="divide-y divide-stone-200">
        {faqs.map((f, i) => (
          <li key={f.id} className="py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-900">{f.question} {!f.enabled && <span className="text-[10px] font-mono text-amber-700">(disabled)</span>}</p>
                <p className="text-xs text-stone-600 line-clamp-2">{f.answer}</p>
              </div>
              {!disabled && (
                <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono">
                  <button onClick={() => move(i, -1)} disabled={pending || i === 0} className="text-stone-500 disabled:opacity-30">↑</button>
                  <button onClick={() => move(i, 1)} disabled={pending || i === faqs.length - 1} className="text-stone-500 disabled:opacity-30">↓</button>
                  <button onClick={() => start(async () => { const r = await setFaqEnabledAction(f.id, !f.enabled); notify(r.ok ? 'Updated.' : `Failed: ${r.error}`); if (r.ok) refresh(); })} disabled={pending} className="text-stone-500 underline">{f.enabled ? 'disable' : 'enable'}</button>
                  <button onClick={() => start(async () => { const r = await deleteFaqAction(f.id); notify(r.ok ? 'Deleted.' : `Failed: ${r.error}`); if (r.ok) refresh(); })} disabled={pending} className="text-rose-600 underline">delete</button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="pt-3 border-t border-stone-200 space-y-2">
          <input className={inputCls} placeholder="New question" value={q} onChange={(e) => setQ(e.target.value)} />
          <textarea rows={2} className={inputCls} placeholder="Answer (plain text)" value={a} onChange={(e) => setA(e.target.value)} />
          <button onClick={add} disabled={pending || q.trim().length < 3 || a.trim().length < 3} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Add FAQ</button>
        </div>
      )}
    </div>
  );
}

export default AdminLandingSeoPage;

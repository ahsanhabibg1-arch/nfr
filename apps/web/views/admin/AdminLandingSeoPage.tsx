'use client';

import React, { useId, useState, useTransition } from 'react';
import { SITE_URL } from '../../lib/seo';
import { normalizeSameSiteCanonical } from '../../lib/seo/canonical';
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
import { MediaPickerModal } from '../../components/admin/editor/MediaPickerModal';
import {
  DISCIPLINE_CLASSIFICATIONS,
  DISCIPLINE_CLASSIFICATION_HELP,
  isDisciplineClassification,
} from '../../lib/content/disciplineClassifications';

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

/**
 * Stage 09 Task H — the canonical a landing page will actually emit, computed by
 * the SAME normalizer the server uses to validate on save and to render
 * (`resolveCanonical` → `normalizeSameSiteCanonical`). A blank override means
 * the page is self-canonical; a value the normalizer rejects is refused on save,
 * so the editor is told before pressing Save rather than after.
 */
export function effectiveLandingCanonical(
  override: string,
  publicPath: string,
  siteUrl: string = SITE_URL,
): { url: string; source: 'self' | 'override' | 'invalid' } {
  const self = normalizeSameSiteCanonical(publicPath, siteUrl) ?? `${siteUrl}${publicPath}`;
  if (!override.trim()) return { url: self, source: 'self' };
  const resolved = normalizeSameSiteCanonical(override, siteUrl);
  return resolved ? { url: resolved, source: 'override' } : { url: self, source: 'invalid' };
}

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
    // Stage 09 Task H: SEO fields have no draft step — the save revalidates the
    // public site, so say so rather than implying a staged change.
    notify(r.ok ? 'SEO saved — now live on the public page (SEO fields have no draft step).' : `Failed: ${r.error}`);
    if (r.ok) refresh();
  });

  const fid = useId();
  const canonical = effectiveLandingCanonical(seo.canonicalOverride, detail.publicUrl);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-sans font-bold text-sm text-stone-900">{detail.label} <span className="text-[11px] font-mono text-stone-400">({detail.entityType})</span></h3>
          <Link href={detail.publicUrl} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-[#8B5E3C] underline">View page ↗</Link>
        </div>
        {!detail.canEdit && <p className="text-[11px] text-amber-700">You can view this entity but lack the permission to edit it.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Stage 09 Task H: every label is programmatically associated (htmlFor/id),
              and maxLength mirrors the server's Zod bounds in entitySeoService. */}
          <div><label htmlFor={`${fid}-title`} className={labelCls}>SEO title</label><input id={`${fid}-title`} maxLength={160} className={inputCls} disabled={disabled} value={seo.seoTitle} onChange={(e) => setSeo({ ...seo, seoTitle: e.target.value })} placeholder="(falls back to derived title)" /></div>
          <div><label htmlFor={`${fid}-og`} className={labelCls}>OG / social image URL</label><input id={`${fid}-og`} maxLength={500} className={inputCls} disabled={disabled} value={seo.ogImage} onChange={(e) => setSeo({ ...seo, ogImage: e.target.value })} /></div>
          <div className="md:col-span-2"><label htmlFor={`${fid}-desc`} className={labelCls}>Meta description</label><textarea id={`${fid}-desc`} maxLength={320} rows={2} className={inputCls} disabled={disabled} value={seo.metaDescription} onChange={(e) => setSeo({ ...seo, metaDescription: e.target.value })} placeholder="(falls back to derived description)" /></div>
          <div className="md:col-span-2">
            <label htmlFor={`${fid}-canonical`} className={labelCls}>Canonical override (path or same-site URL)</label>
            <input id={`${fid}-canonical`} maxLength={500} aria-describedby={`${fid}-canonical-effective`} aria-invalid={canonical.source === 'invalid'} className={inputCls} disabled={disabled} value={seo.canonicalOverride} onChange={(e) => setSeo({ ...seo, canonicalOverride: e.target.value })} placeholder="/rodeo-events/… (optional)" />
            <p id={`${fid}-canonical-effective`} className={`mt-1 text-[11px] font-mono break-all ${canonical.source === 'invalid' ? 'text-rose-700' : 'text-stone-500'}`} data-testid="landing-effective-canonical">
              {canonical.source === 'invalid'
                ? 'This value is off-site or malformed and will be refused on save. '
                : ''}
              Effective canonical: {canonical.url} ({canonical.source === 'override' ? 'override' : 'self'})
            </p>
          </div>
          <div className="md:col-span-2"><label htmlFor={`${fid}-intro`} className={labelCls}>Editorial intro (plain text)</label><textarea id={`${fid}-intro`} maxLength={4000} rows={4} className={inputCls} disabled={disabled} value={seo.intro} onChange={(e) => setSeo({ ...seo, intro: e.target.value })} /></div>
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[#0F1115]" disabled={disabled} checked={seo.noindex} onChange={(e) => setSeo({ ...seo, noindex: e.target.checked })} /><span>noindex this page — renders <code>noindex, follow</code> and removes it from the sitemap (cannot force-index a thin/unpublished entity — only adds restriction)</span></label>
        <p className="text-[11px] text-stone-500">SEO fields have no draft step: saving applies them to the public page immediately.</p>
        <button onClick={saveSeo} disabled={pending || disabled} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save SEO</button>
      </div>

      {detail.disciplineFields && <DisciplineFields detail={detail} notify={notify} refresh={refresh} />}

      <FaqManager detail={detail} notify={notify} refresh={refresh} />
    </div>
  );
}

/**
 * Issue 03 — reorderable list editors.
 *
 * Order in the array IS the public display order, so "reorder" is just a swap
 * and the save path needs no sort key. Both editors keep an explicitly empty
 * list distinguishable from an untouched one, because `[]` means "the editor
 * removed every entry" and must reach the server as a real value.
 */
function listControls<T>(items: T[], set: (next: T[]) => void, i: number, disabled: boolean) {
  const move = (to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[i], next[to]] = [next[to], next[i]];
    set(next);
  };
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button type="button" aria-label="Move up" title="Move up" disabled={disabled || i === 0} onClick={() => move(i - 1)} className="px-1.5 py-0.5 text-[11px] border border-stone-300 rounded-xs disabled:opacity-30">↑</button>
      <button type="button" aria-label="Move down" title="Move down" disabled={disabled || i === items.length - 1} onClick={() => move(i + 1)} className="px-1.5 py-0.5 text-[11px] border border-stone-300 rounded-xs disabled:opacity-30">↓</button>
      <button type="button" aria-label="Remove" title="Remove" disabled={disabled} onClick={() => set(items.filter((_, j) => j !== i))} className="px-1.5 py-0.5 text-[11px] border border-rose-300 text-rose-600 rounded-xs disabled:opacity-30">✕</button>
    </div>
  );
}

function StringList({ label, help, items, set, disabled, rows = 2 }: {
  label: string; help?: string; items: string[]; set: (n: string[]) => void; disabled: boolean; rows?: number;
}) {
  return (
    <div className="space-y-2">
      <label className={labelCls}>{label} <span className="text-stone-400">({items.length})</span></label>
      {help && <p className="text-[11px] text-stone-500 -mt-1">{help}</p>}
      {items.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          <textarea rows={rows} className={inputCls} disabled={disabled} value={v}
            aria-label={`${label} entry ${i + 1}`}
            onChange={(e) => { const n = [...items]; n[i] = e.target.value; set(n); }} />
          {listControls(items, set, i, disabled)}
        </div>
      ))}
      <button type="button" disabled={disabled} onClick={() => set([...items, ''])} className="px-2.5 py-1 text-[11px] border border-stone-300 rounded-xs disabled:opacity-40">+ Add</button>
    </div>
  );
}

function PairList({ label, help, aLabel, bLabel, items, set, disabled }: {
  label: string; help?: string; aLabel: string; bLabel: string;
  items: { a: string; b: string }[]; set: (n: { a: string; b: string }[]) => void; disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className={labelCls}>{label} <span className="text-stone-400">({items.length})</span></label>
      {help && <p className="text-[11px] text-stone-500 -mt-1">{help}</p>}
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2 p-2 border border-stone-200 rounded-xs bg-stone-50/60">
          <div className="flex-1 space-y-1.5">
            <input className={inputCls} disabled={disabled} placeholder={aLabel} aria-label={`${label} ${aLabel} ${i + 1}`}
              value={it.a} onChange={(e) => { const n = [...items]; n[i] = { ...it, a: e.target.value }; set(n); }} />
            <textarea rows={2} className={inputCls} disabled={disabled} placeholder={bLabel} aria-label={`${label} ${bLabel} ${i + 1}`}
              value={it.b} onChange={(e) => { const n = [...items]; n[i] = { ...it, b: e.target.value }; set(n); }} />
          </div>
          {listControls(items, set, i, disabled)}
        </div>
      ))}
      <button type="button" disabled={disabled} onClick={() => set([...items, { a: '', b: '' }])} className="px-2.5 py-1 text-[11px] border border-stone-300 rounded-xs disabled:opacity-40">+ Add</button>
    </div>
  );
}

/**
 * Issue 03 — the discipline editor.
 *
 * Previously four fields, with a note that "deep guide content is preserved and
 * edited separately". It was preserved and it was not editable anywhere: the
 * public page renders thirteen content fields and eleven had no owner.
 *
 * Empty strings are dropped on save (`|| undefined`) for the three fields whose
 * pre-existing contract is "absent clears it", and sent as-is for the guide,
 * where the server merges key by key. Blank list rows are stripped before
 * sending so an accidental "+ Add" cannot fail validation.
 */
function DisciplineFields({ detail, notify, refresh }: { detail: LandingDetail; notify: (m: string) => void; refresh: () => void }) {
  const d = detail.disciplineFields!;
  const g = d.guide ?? {};
  const [pending, start] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [f, setF] = useState({
    name: d.name,
    shortName: d.shortName ?? '',
    category: d.category ?? '',
    /** Batch 05 — the managed reference, preferred over the legacy text. */
    classificationId: d.classificationId ?? '',
    tagline: d.tagline ?? '',
    summary: d.summary,
    image: d.image ?? '',
    imageCredit: d.imageCredit ?? '',
    introduction: g.introduction ?? '',
    competitionFormat: g.competitionFormat ?? '',
    stockProfile: g.stockProfile ?? '',
    historicBenchmark: g.historicBenchmark ?? '',
  });
  const [scoring, setScoring] = useState<{ a: string; b: string }[]>(
    (g.scoringBreakdown ?? []).map((s) => ({ a: s.title, b: s.description })),
  );
  const [rules, setRules] = useState<string[]>(g.rulesHighlights ?? []);
  const [terms, setTerms] = useState<{ a: string; b: string }[]>(
    (g.terminology ?? []).map((t) => ({ a: t.term, b: t.definition })),
  );
  const [tips, setTips] = useState<string[]>(g.beginnerTips ?? []);
  const disabled = !detail.canEdit;
  /** Empty when the managed classification table is absent on this environment. */
  const classificationOptions = d.classificationOptions ?? [];

  const save = () => start(async () => {
    const clean = (s: string) => s.trim();
    const r = await updateDisciplineAction(detail.entityId, {
      // Pre-existing contract: absent clears these three.
      shortName: f.shortName || undefined,
      /**
       * Batch 05 — a managed reference when the vocabulary is available, the
       * legacy text otherwise.
       *
       * `classificationId: null` is sent explicitly when the editor chose "—"
       * while managed options exist, because for this field `undefined` means
       * "clear" on the legacy column but "leave unchanged" on the reference.
       * Without the explicit null, clearing the select would leave the old
       * reference in place and the form would appear not to save.
       */
      ...(classificationOptions.length > 0
        ? { classificationId: f.classificationId || null }
        : { category: isDisciplineClassification(f.category) ? f.category : undefined }),
      tagline: f.tagline || undefined,
      summary: f.summary,
      // Issue 03: absent leaves these unchanged, so they are always sent.
      name: clean(f.name),
      image: clean(f.image),
      imageCredit: clean(f.imageCredit),
      guide: {
        introduction: clean(f.introduction),
        competitionFormat: clean(f.competitionFormat),
        stockProfile: clean(f.stockProfile),
        historicBenchmark: clean(f.historicBenchmark),
        scoringBreakdown: scoring.filter((s) => clean(s.a) && clean(s.b)).map((s) => ({ title: clean(s.a), description: clean(s.b) })),
        rulesHighlights: rules.map(clean).filter(Boolean),
        terminology: terms.filter((t) => clean(t.a) && clean(t.b)).map((t) => ({ term: clean(t.a), definition: clean(t.b) })),
        beginnerTips: tips.map(clean).filter(Boolean),
      },
    });
    notify(r.ok ? 'Discipline saved.' : `Failed: ${r.error}`);
    if (r.ok) refresh();
  });

  return (
    <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-5">
      <h3 className="font-sans font-bold text-sm text-stone-900">Discipline content
        <span className="ml-2 text-[11px] font-mono text-stone-400">everything the public guide page renders</span>
      </h3>

      {/* ---- Identity ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className={labelCls}>Name</label><input className={inputCls} disabled={disabled} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className={labelCls}>Short name</label><input className={inputCls} disabled={disabled} value={f.shortName} onChange={(e) => setF({ ...f, shortName: e.target.value })} /></div>
        <div>
          <label className={labelCls}>Classification</label>
          {/*
            The managed vocabulary when it is available, the compatibility pair
            when it is not. The options already include this discipline's
            CURRENT classification even if it was deactivated, so an existing
            assignment is never silently dropped by rendering an empty select.
          */}
          {classificationOptions.length > 0 ? (
            <select className={inputCls} disabled={disabled} value={f.classificationId} onChange={(e) => setF({ ...f, classificationId: e.target.value })}>
              <option value="">—</option>
              {classificationOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <select className={inputCls} disabled={disabled} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="">—</option>
              {DISCIPLINE_CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {/*
            Issue 03 §4 — these two are a deliberate FIXED classification of how
            a rodeo event is contested, not the site's five navigation sections.
            The public Competition section filters on exactly these values, so
            renaming or extending them changes a reader-facing filter and needs
            an owner decision, not an editor's.
          */}
          {/* One wording, shared with Add Discipline in Rodeo Coverage. */}
          <p className="text-[11px] text-stone-500 mt-1">{DISCIPLINE_CLASSIFICATION_HELP}</p>
        </div>
        <div><label className={labelCls}>Tagline</label><input className={inputCls} disabled={disabled} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></div>
        <div className="md:col-span-2"><label className={labelCls}>Summary</label><textarea rows={3} className={inputCls} disabled={disabled} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div>
        <div className="md:col-span-2"><label className={labelCls}>Editorial introduction</label><textarea rows={4} className={inputCls} disabled={disabled} value={f.introduction} onChange={(e) => setF({ ...f, introduction: e.target.value })} /></div>
      </div>

      {/* ---- Hero image ---- */}
      <div className="space-y-2 pt-1 border-t border-stone-100">
        <label className={labelCls}>Hero image</label>
        <div className="flex items-start gap-2">
          <input className={inputCls} disabled={disabled} value={f.image} placeholder="/api/media/… or /assets/images/…" onChange={(e) => setF({ ...f, image: e.target.value })} />
          <button type="button" disabled={disabled} onClick={() => setPickerOpen(true)} className="px-2.5 py-1.5 text-[11px] border border-stone-300 rounded-xs whitespace-nowrap disabled:opacity-40">Media Library…</button>
        </div>
        <div><label className={labelCls}>Image credit</label><input className={inputCls} disabled={disabled} value={f.imageCredit} onChange={(e) => setF({ ...f, imageCredit: e.target.value })} /></div>
        {/*
          ALT text and caption deliberately have NO field here. For a Media
          Library asset they live on the asset itself and are shared by every
          page that uses it (MED-01B), so duplicating them per discipline would
          create a second source of truth that silently drifts. Edit them in the
          Media Library; the public page reads them from there.
        */}
        <p className="text-[11px] text-stone-500">
          ALT text and caption come from the asset in the <Link href="/admin/media/" className="underline">Media Library</Link>,
          so one description serves every page that uses the image. A non-library URL has no ALT and the
          discipline name is used as a fallback.
        </p>
      </div>

      {/* ---- Championship format ---- */}
      <div className="grid grid-cols-1 gap-3 pt-1 border-t border-stone-100">
        <div><label className={labelCls}>Competition format</label><textarea rows={4} className={inputCls} disabled={disabled} value={f.competitionFormat} onChange={(e) => setF({ ...f, competitionFormat: e.target.value })} /></div>
        <div><label className={labelCls}>Livestock profile</label><textarea rows={3} className={inputCls} disabled={disabled} value={f.stockProfile} onChange={(e) => setF({ ...f, stockProfile: e.target.value })} /></div>
        <div><label className={labelCls}>Historical benchmark</label><textarea rows={3} className={inputCls} disabled={disabled} value={f.historicBenchmark} onChange={(e) => setF({ ...f, historicBenchmark: e.target.value })} /></div>
      </div>

      {/* ---- Scoring, rules, terminology, tips ---- */}
      <div className="space-y-5 pt-1 border-t border-stone-100">
        <PairList label="Scoring criteria" aLabel="Criterion" bLabel="How it is judged" items={scoring} set={setScoring} disabled={disabled}
          help="Shown in order on the public page. Both fields are required for a row to be saved." />
        <StringList label="Rules highlights" items={rules} set={setRules} disabled={disabled} help="One rule per entry, in display order." />
        <PairList label="Terminology" aLabel="Term" bLabel="Definition" items={terms} set={setTerms} disabled={disabled} />
        <StringList label="Spectator tips" items={tips} set={setTips} disabled={disabled} help="Beginner guidance, in display order." />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={save} disabled={pending || disabled || f.summary.trim().length < 1 || f.name.trim().length < 1}
          className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save Discipline</button>
        <span className="text-[11px] text-stone-500">
          The public URL is changed separately (Rodeo Coverage → Disciplines), which also records a redirect
          from the old path. SEO title, meta description and FAQs are the panels above and below.
        </span>
      </div>

      {pickerOpen && (
        <MediaPickerModal
          isOpen
          onClose={() => setPickerOpen(false)}
          onSelect={(m) => {
            // Credit is taken from the asset only when the field is empty, so an
            // editor's own attribution is never silently replaced.
            setF((prev) => ({ ...prev, image: m.url, imageCredit: prev.imageCredit || m.credit || '' }));
            setPickerOpen(false);
          }}
        />
      )}
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

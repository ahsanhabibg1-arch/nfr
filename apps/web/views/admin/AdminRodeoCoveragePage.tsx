'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminModal } from '../../components/admin/AdminModal';
import type { HubRow, EventRow, EditionRow, VenueRow, DisciplineRef } from '../../lib/cms/rodeoService';
import {
  createHubAction, updateHubAction,
  createEventAction, updateEventAction,
  createEditionAction, updateEditionAction,
  createVenueAction, updateVenueAction,
  createDisciplineAction,
  archiveEntityAction, reactivateEntityAction,
  inspectDependenciesAction, transferDependencyAction, permanentDeleteAction, changeSlugAction,
} from '../../app/admin/rodeo-actions';
import type { RodeoEntityKind } from '../../lib/cms/rodeoService';
import type { DependencySnapshot } from '../../lib/cms/rodeoDependencies';
import { normalizeSlug, slugShapeError } from '../../lib/cms/slugRules';
import {
  DISCIPLINE_CLASSIFICATIONS,
  DISCIPLINE_CLASSIFICATION_HELP,
  isDisciplineClassification,
} from '../../lib/content/disciplineClassifications';
import type { ClassificationRow, PublicClassification } from '../../lib/cms/disciplineClassificationService';
import {
  createClassificationAction, updateClassificationAction,
  setClassificationActiveAction, reorderClassificationsAction,
  deleteClassificationAction, bootstrapClassificationsAction,
} from '../../app/admin/discipline-classification-actions';

/**
 * The id order produced by moving row `i` one step in `dir`.
 *
 * Reorder sends the WHOLE order rather than a single index, so the server never
 * has to infer neighbours from a stale view.
 */
function moveId(rows: { id: string }[], i: number, dir: -1 | 1): string[] {
  const ids = rows.map((r) => r.id);
  const j = i + dir;
  if (j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

interface Props {
  hubs: HubRow[]; events: EventRow[]; editions: EditionRow[]; venues: VenueRow[]; disciplines: DisciplineRef[];
  eventOptions: { id: string; name: string }[]; venueOptions: { id: string; name: string }[];
  canManage: boolean;
  /** Batch 05 — managed classifications, all states; the tab filters them. */
  classifications?: ClassificationRow[];
  /** Offered for a NEW assignment (active only). */
  assignableClassifications?: PublicClassification[];
  /**
   * `'absent'` means the table does not exist (migration not applied) and
   * `'not-initialised'` that it exists but holds no rows. In both cases the tab
   * says so and the discipline form falls back to the compatibility vocabulary,
   * rather than offering an empty dropdown.
   */
  classificationState?: 'database' | 'not-initialised' | 'absent';
}

type Tab = 'hubs' | 'events' | 'editions' | 'venues' | 'disciplines' | 'classifications';
const btn = 'px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs';
const inp = 'w-full p-2 bg-stone-50 border border-stone-200 rounded-xs';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-1';
const th = 'py-2.5 px-4';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div><label className={lbl}>{label}</label>{children}</div>
);

export const AdminRodeoCoveragePage: React.FC<Props> = ({
  hubs, events, editions, venues, disciplines, eventOptions, venueOptions, canManage,
  classifications = [], assignableClassifications = [], classificationState = 'absent',
}) => {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('hubs');
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 6000); };
  const run = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    startTransition(async () => { const r = await p; flash(r.ok ? okMsg : r.error || 'Error'); if (r.ok) router.refresh(); });

  // modal state: which entity + edit id
  const [modal, setModal] = useState<null | Tab>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [hub, setHub] = useState({ title: '', region: '', circuitType: '', description: '' });
  const [ev, setEv] = useState({ name: '', location: '', status: '', organizerName: '', description: '', isFlagship: false });
  const [ed, setEd] = useState({ eventId: '', editionSlug: '', label: '', year: '', purseBenchmark: '', venueId: '' });
  const [ven, setVen] = useState({ name: '', city: '', state: '', country: '' });
  const [disc, setDisc] = useState({ name: '', summary: '', shortName: '', category: '', classificationId: '', tagline: '' });

  /**
   * Batch 05 — classification tab state.
   *
   * `value` is shown but not editable when editing: it is the immutable machine
   * identity, and the form must not suggest otherwise.
   */
  const [cls, setCls] = useState({ name: '', pluralName: '', description: '', sortOrder: '' });
  const [clsEditId, setClsEditId] = useState<string | null>(null);
  const [clsShowInactive, setClsShowInactive] = useState(false);
  const openClsCreate = () => {
    setClsEditId(null);
    setCls({ name: '', pluralName: '', description: '', sortOrder: '' });
    setModal('classifications');
  };
  const openClsEdit = (c: ClassificationRow) => {
    setClsEditId(c.id);
    setCls({
      name: c.name,
      pluralName: c.pluralName ?? '',
      description: c.description ?? '',
      sortOrder: String(c.sortOrder),
    });
    setModal('classifications');
  };
  const submitCls = () => {
    const payload = {
      name: cls.name,
      pluralName: cls.pluralName || undefined,
      description: cls.description || undefined,
      sortOrder: cls.sortOrder === '' ? undefined : Number(cls.sortOrder),
    };
    run(
      clsEditId ? updateClassificationAction(clsEditId, payload) : createClassificationAction(payload),
      clsEditId ? 'Classification updated.' : 'Classification created.',
    );
    setModal(null);
  };
  const visibleCls = classifications.filter((c) => clsShowInactive || c.active);

  /**
   * Lifecycle filter + free-text search.
   *
   * Filtering happens in the browser because every Rodeo Coverage list is small
   * (seven disciplines, single-digit hubs and events) and already fully loaded
   * by the server component. If any of these grows past a page or two this
   * belongs in the query instead — noted in the report rather than pre-built.
   */
  const [lifecycle, setLifecycle] = useState<'active' | 'archived' | 'all'>('active');
  const [query, setQuery] = useState('');

  const visible = <T extends { archivedAt: Date | null }>(rows: T[], text: (r: T) => string): T[] => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const archived = !!r.archivedAt;
      if (lifecycle === 'active' && archived) return false;
      if (lifecycle === 'archived' && !archived) return false;
      return !q || text(r).toLowerCase().includes(q);
    });
  };

  // Delete is never a dead end: it opens a dependency dialog instead of being
  // disabled, so the operator can always see WHY and what to do about it.
  const [del, setDel] = useState<null | { kind: RodeoEntityKind; id: string; label: string }>(null);
  const [snapshot, setSnapshot] = useState<DependencySnapshot | null>(null);
  const [destinations, setDestinations] = useState<{ id: string; label: string }[]>([]);
  const [destId, setDestId] = useState('');
  const [loadingDeps, setLoadingDeps] = useState(false);

  const openDelete = (kind: RodeoEntityKind, id: string, label: string) => {
    setDel({ kind, id, label });
    setSnapshot(null);
    setDestinations([]);
    setDestId('');
    setLoadingDeps(true);
    startTransition(async () => {
      const r = await inspectDependenciesAction(kind, id);
      setLoadingDeps(false);
      if (r.ok) { setSnapshot(r.snapshot); setDestinations(r.destinations); setDestId(r.destinations[0]?.id ?? ''); }
      else flash(r.error || 'Could not load dependencies.');
    });
  };

  const refreshSnapshot = (kind: RodeoEntityKind, id: string) => startTransition(async () => {
    const r = await inspectDependenciesAction(kind, id);
    if (r.ok) { setSnapshot(r.snapshot); setDestinations(r.destinations); }
  });

  const doTransfer = (groupKey: string) => {
    if (!del || !destId) return;
    startTransition(async () => {
      const r = await transferDependencyAction(del.kind, del.id, groupKey, destId);
      if (r.ok) { flash(`Moved ${r.moved}, merged ${r.skipped} duplicate(s).`); refreshSnapshot(del.kind, del.id); router.refresh(); }
      else flash(r.error || 'Transfer failed.');
    });
  };

  const doPermanentDelete = () => {
    if (!del) return;
    startTransition(async () => {
      const r = await permanentDeleteAction(del.kind, del.id);
      if (r.ok) { flash('Permanently deleted.'); setDel(null); router.refresh(); }
      else flash(r.error || 'Delete failed.');
    });
  };

  const setLifecycleState = (kind: RodeoEntityKind, id: string, archive: boolean) =>
    run(archive ? archiveEntityAction(kind, id) : reactivateEntityAction(kind, id),
      archive ? 'Archived — removed from public listings; its URL still works as noindex.' : 'Reactivated.');

  /**
   * Slug editor.
   *
   * This replaced a `window.prompt`, which worked but could not show the
   * resulting public URL, could not explain that the old one becomes a
   * permanent redirect, and offered no validation until the server rejected it.
   * Changing a slug breaks a live URL, so the operator needs to see exactly
   * what they are about to do before they do it.
   */
  const [slugEdit, setSlugEdit] = useState<null | {
    kind: RodeoEntityKind; id: string; label: string; typeLabel: string;
    current: string; prefix: string;
  }>(null);
  const [slugDraft, setSlugDraft] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);

  const openSlug = (
    kind: RodeoEntityKind, id: string, label: string, typeLabel: string, current: string, prefix: string,
  ) => {
    setSlugEdit({ kind, id, label, typeLabel, current, prefix });
    setSlugDraft(current);
    setSlugError(null);
  };

  // Live preview uses the SAME normaliser the server applies, so what the
  // operator sees is what gets stored.
  const slugPreview = normalizeSlug(slugDraft);
  const slugLocalError = slugShapeError(slugPreview);
  const slugUnchanged = !!slugEdit && slugPreview === slugEdit.current;

  const saveSlug = () => {
    if (!slugEdit || slugLocalError || slugUnchanged) return;
    setSlugError(null);
    startTransition(async () => {
      const r = await changeSlugAction(slugEdit.kind, slugEdit.id, slugPreview);
      if (r.ok) {
        // Only report success on an actual success — and say what moved.
        flash(`Slug changed. ${r.oldPath} now permanently redirects to ${r.newPath}.`);
        setSlugEdit(null);
        router.refresh();
      } else {
        // Keep the operator's input so they can correct it.
        setSlugError(r.error || 'Slug change failed.');
      }
    });
  };

  const openHub = (h?: HubRow) => { setEditId(h?.id ?? null); setHub({ title: h?.title ?? '', region: h?.region ?? '', circuitType: h?.circuitType ?? '', description: '' }); setModal('hubs'); };
  const openEvent = (e?: EventRow) => { setEditId(e?.id ?? null); setEv({ name: e?.name ?? '', location: e?.location ?? '', status: e?.status ?? '', organizerName: '', description: '', isFlagship: e?.isFlagship ?? false }); setModal('events'); };
  const openEdition = (e?: EditionRow) => { setEditId(e?.id ?? null); setEd({ eventId: e?.eventId ?? (eventOptions[0]?.id ?? ''), editionSlug: e?.editionSlug ?? '', label: e?.label ?? '', year: e?.year ? String(e.year) : '', purseBenchmark: e?.purseBenchmark ?? '', venueId: '' }); setModal('editions'); };
  const openVenue = (v?: VenueRow) => { setEditId(v?.id ?? null); setVen({ name: v?.name ?? '', city: v?.city ?? '', state: v?.state ?? '', country: '' }); setModal('venues'); };
  /**
   * Create only. A discipline's descriptive copy, SEO and FAQ are edited in
   * Landing SEO, which already owns that editor — building a second one here
   * would be exactly the duplicate-editor problem this audit set out to avoid.
   */
  const openDiscipline = () => { setEditId(null); setDisc({ name: '', summary: '', shortName: '', category: '', classificationId: '', tagline: '' }); setModal('disciplines'); };
  const close = () => { setModal(null); setEditId(null); };

  const save = () => startTransition(async () => {
    let r: { ok: boolean; error?: string };
    if (modal === 'hubs') r = editId ? await updateHubAction(editId, hub) : await createHubAction(hub);
    else if (modal === 'events') r = editId ? await updateEventAction(editId, ev) : await createEventAction(ev);
    else if (modal === 'editions') {
      const base = { label: ed.label, year: ed.year ? Number(ed.year) : undefined, purseBenchmark: ed.purseBenchmark || undefined, venueId: ed.venueId || undefined };
      r = editId ? await updateEditionAction(editId, base) : await createEditionAction({ eventId: ed.eventId, editionSlug: ed.editionSlug, ...base });
    } else if (modal === 'venues') r = editId ? await updateVenueAction(editId, ven) : await createVenueAction(ven);
    else if (modal === 'disciplines') {
      r = await createDisciplineAction({
        name: disc.name,
        summary: disc.summary,
        shortName: disc.shortName || undefined,
        /**
         * Whichever route the dropdown above actually used. A managed id is
         * preferred and sent alone; the legacy text is narrowed by the shared
         * guard rather than asserted with a cast, so blank (the "—" option)
         * sends nothing and only a real classification is sent.
         */
        ...(disc.classificationId
          ? { classificationId: disc.classificationId }
          : { category: isDisciplineClassification(disc.category) ? disc.category : undefined }),
        tagline: disc.tagline || undefined,
      });
    } else return;
    if (r.ok) { close(); flash('Saved.'); router.refresh(); } else flash(r.error || 'Error');
  });

  const tabs = [
    { id: 'hubs', label: 'Hubs', count: hubs.length },
    { id: 'events', label: 'Recurring Events', count: events.length },
    { id: 'editions', label: 'Editions', count: editions.length },
    { id: 'venues', label: 'Venues', count: venues.length },
    { id: 'disciplines', label: 'Disciplines', count: disciplines.length },
    { id: 'classifications', label: 'Classifications', count: classifications.filter((c) => c.active).length },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Rodeo Coverage" description="Hubs, recurring events and their annual editions, venues and disciplines. A recurring event is the stable identity; an edition is one year's occurrence. Entities referenced by articles cannot be deleted." actions={<a href="/admin/landing-seo/" className="px-3.5 py-1.5 text-xs font-sans font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs">Landing SEO &amp; FAQ →</a>} />
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs">{notice}</div>}
      {!canManage && <div className="p-3 bg-stone-50 border border-stone-200 text-stone-600 text-xs rounded-xs">You have read-only access to rodeo coverage. Editing requires the <code>rodeo.manage</code> permission.</div>}
      <AdminTabs tabs={tabs} activeTab={tab} onChange={(t) => setTab(t as Tab)} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="rodeo-search">Search</label>
        <input
          id="rodeo-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or slug…"
          className="px-3 py-1.5 text-xs border border-stone-300 rounded-xs min-w-[220px]"
        />
        <div className="flex rounded-xs overflow-hidden border border-stone-300" role="group" aria-label="Lifecycle filter">
          {(['active', 'archived', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setLifecycle(f)}
              aria-pressed={lifecycle === f}
              className={`px-3 py-1.5 text-xs capitalize ${lifecycle === f ? 'bg-[#0F1115] text-[#D4A757] font-semibold' : 'bg-white text-stone-600'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {tab === 'hubs' && (
        <div className="space-y-3">
          {canManage && <button onClick={() => openHub()} className={btn}>+ Add Hub</button>}
          <Table head={['Title', 'Slug', 'Status', 'Region', 'Articles', '']}>
            {visible(hubs, (h) => `${h.title} ${h.slug}`).map((h) => (
              <tr key={h.id} className="hover:bg-stone-50/60">
                <td className={`${th} font-semibold text-stone-900`}>{h.title}</td>
                <td className={`${th} font-mono text-[11px] text-stone-500`}>{h.slug}</td>
                <td className={th}><StatusBadge archivedAt={h.archivedAt} /></td>
                <td className={`${th} text-stone-600`}>{h.region || '—'}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{h.articleCount}</td>
                <Actions
                  canManage={canManage}
                  archived={!!h.archivedAt}
                  onEdit={() => openHub(h)}
                  onSlug={() => openSlug('hub', h.id, h.title, 'Hub', h.slug, '/rodeo-events/')}
                  onLifecycle={() => setLifecycleState('hub', h.id, !h.archivedAt)}
                  onDelete={() => openDelete('hub', h.id, h.title)}
                />
              </tr>
            ))}
          </Table>
        </div>
      )}

      {tab === 'events' && (
        <div className="space-y-3">
          {canManage && <button onClick={() => openEvent()} className={btn}>+ Add Recurring Event</button>}
          <Table head={['Event', 'Location', 'Status', 'Editions', 'Articles', '']}>
            {visible(events, (e) => `${e.name} ${e.slug} ${e.location ?? ''}`).map((e) => (
              <tr key={e.id} className="hover:bg-stone-50/60">
                <td className={`${th} font-semibold text-stone-900`}>{e.name}{e.isFlagship && <span className="ml-2 text-[9px] font-mono text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">FLAGSHIP</span>}</td>
                <td className={`${th} text-stone-600`}>{e.location || '—'}</td>
                <td className={`${th} text-stone-600`}>{e.status || '—'}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{e.editionCount}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{e.articleCount}</td>
                <Actions
                  canManage={canManage}
                  archived={!!e.archivedAt}
                  onEdit={() => openEvent(e)}
                  onSlug={() => openSlug('event', e.id, e.name, 'Recurring event', e.slug, '/rodeo-events/')}
                  onLifecycle={() => setLifecycleState('event', e.id, !e.archivedAt)}
                  onDelete={() => openDelete('event', e.id, e.name)}
                />
              </tr>
            ))}
          </Table>
          <p className="text-[11px] text-stone-400">Deleting a recurring event is blocked while it still has editions or is referenced by articles — remove those first.</p>
        </div>
      )}

      {tab === 'editions' && (
        <div className="space-y-3">
          {canManage && eventOptions.length > 0 && <button onClick={() => openEdition()} className={btn}>+ Add Edition</button>}
          {eventOptions.length === 0 && <p className="text-xs text-stone-500">Create a recurring event first — editions belong to an event.</p>}
          <Table head={['Event', 'Edition', 'Year', 'Venue', 'Purse note (internal)', 'Articles', '']}>
            {visible(editions, (e) => `${e.eventName} ${e.label} ${e.editionSlug}`).map((e) => (
              <tr key={e.id} className="hover:bg-stone-50/60">
                <td className={`${th} font-semibold text-stone-900`}>{e.eventName}</td>
                <td className={`${th} text-stone-700`}>{e.label} <span className="font-mono text-[10px] text-stone-400">{e.editionSlug}</span></td>
                <td className={`${th} text-stone-600`}>{e.year ?? '—'}</td>
                <td className={`${th} text-stone-600`}>{e.venueName || '—'}</td>
                <td className={`${th} text-stone-600`}>{e.purseBenchmark || '—'}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{e.articleCount}</td>
                <Actions
                  canManage={canManage}
                  archived={!!e.archivedAt}
                  onEdit={() => openEdition(e)}
                  onSlug={() => openSlug('edition', e.id, `${e.eventName} — ${e.label}`, 'Edition', e.editionSlug, `/rodeo-events/${e.eventSlug}/`)}
                  onLifecycle={() => setLifecycleState('edition', e.id, !e.archivedAt)}
                  onDelete={() => openDelete('edition', e.id, `${e.eventName} — ${e.label}`)}
                />
              </tr>
            ))}
          </Table>
        </div>
      )}

      {tab === 'venues' && (
        <div className="space-y-3">
          {canManage && <button onClick={() => openVenue()} className={btn}>+ Add Venue</button>}
          <Table head={['Venue', 'City', 'State', 'Editions', '']}>
            {visible(venues, (v) => `${v.name} ${v.slug} ${v.city ?? ''}`).map((v) => (
              <tr key={v.id} className="hover:bg-stone-50/60">
                <td className={`${th} font-semibold text-stone-900`}>{v.name}</td>
                <td className={`${th} text-stone-600`}>{v.city || '—'}</td>
                <td className={`${th} text-stone-600`}>{v.state || '—'}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{v.editionCount}</td>
                <Actions
                  canManage={canManage}
                  archived={!!v.archivedAt}
                  onEdit={() => openVenue(v)}
                  onSlug={() => openSlug('venue', v.id, v.name, 'Venue', v.slug, '/venues/')}
                  onLifecycle={() => setLifecycleState('venue', v.id, !v.archivedAt)}
                  onDelete={() => openDelete('venue', v.id, v.name)}
                />
              </tr>
            ))}
          </Table>
        </div>
      )}

      {tab === 'disciplines' && (
        <div className="space-y-3">
          {canManage && <button onClick={() => openDiscipline()} className={btn}>+ Add Discipline</button>}
          <Table head={['Discipline', 'Slug', 'Articles', 'References', '']}>
            {visible(disciplines, (d) => `${d.name} ${d.slug}`).map((d) => (
              <tr key={d.id} className="hover:bg-stone-50/60">
                <td className={`${th} font-semibold text-stone-900`}>{d.name}</td>
                <td className={`${th} font-mono text-[11px] text-stone-500`}>{d.slug}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{d.articleCount}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{d.dependencyCount}</td>
                {/*
                  Delete is offered only when the service would actually allow it.
                  `dependencyCount` sums articles, competitors, event links,
                  results, sessions and standings — every relation that blocks a
                  delete — so the button never promises an operation the backend
                  refuses, and the reason is shown instead.
                */}
                <Actions
                  canManage={canManage}
                  archived={!!d.archivedAt}
                  onEdit={() => { window.location.href = `/admin/landing-seo/?type=DISCIPLINE&id=${d.id}`; }}
                  onSlug={() => openSlug('discipline', d.id, d.name, 'Discipline', d.slug, '/disciplines/')}
                  onLifecycle={() => setLifecycleState('discipline', d.id, !d.archivedAt)}
                  onDelete={() => openDelete('discipline', d.id, d.name)}
                />
              </tr>
            ))}
          </Table>
          <p className="text-[11px] text-stone-400">
            Editing a discipline&rsquo;s descriptive copy, SEO and FAQ happens in Landing SEO, which owns the full
            editor &mdash; Edit opens it there rather than duplicating it here. The seven foundational disciplines can
            be deleted once nothing references them, but note that a re-run of the database seed recreates them.
          </p>
        </div>
      )}

      {tab === 'classifications' && (
        <div className="space-y-3">
          <p className="text-[11px] text-stone-500 max-w-3xl">
            How a discipline is <strong>contested</strong> &mdash; Roughstock (judged rides on bucking stock) or
            Timed Event (fastest time). These are <em>not</em> the five editorial sections in Editorial
            Organization: those organise <strong>articles</strong>, these classify <strong>disciplines</strong>.
            The public Competition page filters readers on whatever is listed here.
          </p>

          {classificationState === 'absent' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xs p-3 text-[11px] text-amber-900 space-y-1">
              <p><strong>The managed classification table does not exist yet.</strong> This environment is still
                running on the two compatibility definitions (Roughstock, Timed Event), which is exactly how it
                behaved before this feature &mdash; nothing is broken, and nothing here is editable.</p>
              <p className="font-mono">Apply migration 20261113200000_add_managed_discipline_classification, then reload.</p>
            </div>
          )}

          {classificationState === 'not-initialised' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xs p-3 text-[11px] text-amber-900 space-y-2">
              <p><strong>The registry is empty.</strong> The table exists but holds no classifications, so the
                application is using the two compatibility definitions. Initialising creates them as real records
                and attaches the disciplines that already carry the matching text.</p>
              {canManage && (
                <button onClick={() => run(bootstrapClassificationsAction(true), 'Classifications initialised.')} className={btn}>
                  Initialise from the existing values
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-stone-600">
              <input type="checkbox" checked={clsShowInactive} onChange={(e) => setClsShowInactive(e.target.checked)} />
              Show inactive
            </label>
            {canManage && classificationState === 'database' && (
              <button onClick={openClsCreate} className={`${btn} ml-auto`}>+ Add Classification</button>
            )}
          </div>

          <Table head={['Identity', 'Name', 'Public filter label', 'Order', 'State', 'Disciplines', '']}>
            {visibleCls.map((c, i) => (
              <tr key={c.id} className={`hover:bg-stone-50/60 ${c.active ? '' : 'opacity-60'}`}>
                <td className={`${th} font-mono text-[11px] text-stone-700`}>{c.value}</td>
                <td className={`${th} font-semibold text-stone-900`}>{c.name}</td>
                <td className={`${th} text-stone-600`}>{c.pluralName?.trim() || c.name}</td>
                <td className={`${th} text-stone-600`}>{c.sortOrder}</td>
                <td className={th}>
                  {c.active
                    ? <span className="text-[9px] font-mono px-1 rounded border bg-emerald-50 border-emerald-200 text-emerald-700">ACTIVE</span>
                    : <span className="text-[9px] font-mono px-1 rounded border bg-amber-50 border-amber-200 text-amber-700">INACTIVE</span>}
                </td>
                <td className={`${th} text-right font-mono text-stone-600`}>{c.disciplineCount}</td>
                <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                  {canManage ? <>
                    <button onClick={() => openClsEdit(c)} className="text-[#8B5E3C] hover:underline font-bold">Edit</button>
                    <button
                      onClick={() => run(setClassificationActiveAction(c.id, !c.active), c.active ? 'Withdrawn from new assignment.' : 'Offered for new assignment.')}
                      className="text-stone-600 hover:underline"
                    >
                      {c.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => run(reorderClassificationsAction(moveId(visibleCls, i, -1)), 'Order updated.')}
                      disabled={i === 0}
                      className="text-stone-500 hover:underline disabled:opacity-30"
                      title="Move up"
                    >↑</button>
                    <button
                      onClick={() => run(reorderClassificationsAction(moveId(visibleCls, i, 1)), 'Order updated.')}
                      disabled={i === visibleCls.length - 1}
                      className="text-stone-500 hover:underline disabled:opacity-30"
                      title="Move down"
                    >↓</button>
                    {/*
                      Offered only when nothing references it. The service
                      re-counts and refuses otherwise, and PostgreSQL's
                      ON DELETE RESTRICT refuses it a second time, so the button
                      never promises an operation the backend would reject.
                    */}
                    {c.disciplineCount === 0 && (
                      <button
                        onClick={() => { if (confirm(`Delete "${c.name}" permanently? Deactivating keeps it out of new assignment without removing the record.`)) run(deleteClassificationAction(c.id), 'Classification deleted.'); }}
                        className="text-rose-600 hover:underline"
                      >Delete</button>
                    )}
                  </> : <span className="text-stone-400">read-only</span>}
                </td>
              </tr>
            ))}
          </Table>
          <p className="text-[11px] text-stone-400">
            The <span className="font-mono">Identity</span> column is the permanent machine value. It is set once and
            cannot be edited, which is what lets a classification be renamed without orphaning the disciplines that
            use it. A classification still used by a discipline cannot be deleted &mdash; deactivate it instead.
          </p>
        </div>
      )}

      {modal === 'classifications' && (
        <AdminModal
          isOpen
          onClose={() => setModal(null)}
          title={clsEditId ? 'Edit Classification' : 'Add Classification'}
          footerActions={<ModalFooter onClose={() => setModal(null)} onSave={submitCls} pending={isPending} />}
        >
          {/*
            These fields use explicit `htmlFor`/`id` rather than the local
            `Field` helper, which renders a bare <label> with no association —
            so its inputs have no accessible name and cannot be found by their
            visible label. The helper is used by the older modals and is left
            alone here; the new dialog is built associated from the start.
          */}
          <div className="space-y-3 text-xs font-sans">
            <div>
              <label className={lbl} htmlFor="cls-name">Name</label>
              <input id="cls-name" value={cls.name} onChange={(e) => setCls({ ...cls, name: e.target.value })} className={inp} />
            </div>
            {clsEditId ? (
              <p className="text-[11px] text-stone-500">
                The permanent identity cannot be changed. Renaming here updates every surface that displays this
                classification; the disciplines using it are unaffected.
              </p>
            ) : (
              <p className="text-[11px] text-stone-500">
                The permanent machine identity is taken from the name at creation and can never be changed
                afterwards, so choose the name carefully.
              </p>
            )}
            <div>
              <label className={lbl} htmlFor="cls-plural">Public filter label (optional)</label>
              <input
                id="cls-plural"
                value={cls.pluralName}
                onChange={(e) => setCls({ ...cls, pluralName: e.target.value })}
                className={inp}
                placeholder="Plural wording for the Competition filter, e.g. Timed Events"
              />
            </div>
            <div>
              <label className={lbl} htmlFor="cls-description">Description (optional)</label>
              <textarea id="cls-description" rows={2} value={cls.description} onChange={(e) => setCls({ ...cls, description: e.target.value })} className={inp} />
            </div>
            <div>
              <label className={lbl} htmlFor="cls-order">Display order (optional)</label>
              <input id="cls-order" type="number" min={0} value={cls.sortOrder} onChange={(e) => setCls({ ...cls, sortOrder: e.target.value })} className={inp} />
            </div>
          </div>
        </AdminModal>
      )}

      {modal === 'hubs' && (
        <AdminModal isOpen onClose={close} title={editId ? 'Edit Hub' : 'Add Hub'} footerActions={<ModalFooter onClose={close} onSave={save} pending={isPending} />}>
          <div className="space-y-3 text-xs font-sans">
            <Field label="Title"><input value={hub.title} onChange={(e) => setHub({ ...hub, title: e.target.value })} className={inp} /></Field>
            <Field label="Region"><input value={hub.region} onChange={(e) => setHub({ ...hub, region: e.target.value })} className={inp} /></Field>
            <Field label="Circuit type"><input value={hub.circuitType} onChange={(e) => setHub({ ...hub, circuitType: e.target.value })} className={inp} /></Field>
            <Field label="Description"><textarea rows={2} value={hub.description} onChange={(e) => setHub({ ...hub, description: e.target.value })} className={inp} /></Field>
          </div>
        </AdminModal>
      )}

      {modal === 'events' && (
        <AdminModal isOpen onClose={close} title={editId ? 'Edit Recurring Event' : 'Add Recurring Event'} footerActions={<ModalFooter onClose={close} onSave={save} pending={isPending} />}>
          <div className="space-y-3 text-xs font-sans">
            <Field label="Name"><input value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} className={inp} /></Field>
            <Field label="Location"><input value={ev.location} onChange={(e) => setEv({ ...ev, location: e.target.value })} className={inp} /></Field>
            <Field label="Status"><input value={ev.status} onChange={(e) => setEv({ ...ev, status: e.target.value })} placeholder="e.g. Active, Historical" className={inp} /></Field>
            <Field label="Organizer"><input value={ev.organizerName} onChange={(e) => setEv({ ...ev, organizerName: e.target.value })} className={inp} /></Field>
            <Field label="Description"><textarea rows={2} value={ev.description} onChange={(e) => setEv({ ...ev, description: e.target.value })} className={inp} /></Field>
            <label className="flex items-center gap-2"><input type="checkbox" checked={ev.isFlagship} onChange={(e) => setEv({ ...ev, isFlagship: e.target.checked })} /> <span className="text-stone-700">Flagship event</span></label>
          </div>
        </AdminModal>
      )}

      {modal === 'editions' && (
        <AdminModal isOpen onClose={close} title={editId ? 'Edit Edition' : 'Add Edition'} footerActions={<ModalFooter onClose={close} onSave={save} pending={isPending} />}>
          <div className="space-y-3 text-xs font-sans">
            {!editId && (
              <>
                <Field label="Recurring event"><select value={ed.eventId} onChange={(e) => setEd({ ...ed, eventId: e.target.value })} className={inp}>{eventOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
                <Field label="Edition slug (unique per event, e.g. 2025)"><input value={ed.editionSlug} onChange={(e) => setEd({ ...ed, editionSlug: e.target.value })} className={inp} /></Field>
              </>
            )}
            <Field label="Label"><input value={ed.label} onChange={(e) => setEd({ ...ed, label: e.target.value })} placeholder="e.g. 2025 National Finals Rodeo" className={inp} /></Field>
            <Field label="Year"><input type="number" value={ed.year} onChange={(e) => setEd({ ...ed, year: e.target.value })} className="w-32 p-2 bg-stone-50 border border-stone-200 rounded-xs" /></Field>
            <Field label="Venue"><select value={ed.venueId} onChange={(e) => setEd({ ...ed, venueId: e.target.value })} className={inp}><option value="">— none —</option>{venueOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
            <Field label="Purse note (internal — never shown publicly)"><input value={ed.purseBenchmark} onChange={(e) => setEd({ ...ed, purseBenchmark: e.target.value })} placeholder="Internal note with source, if known" className={inp} /></Field>
            <p className="text-[10px] text-stone-400">Admin-only. This note is not displayed on public pages, metadata or structured data.</p>
          </div>
        </AdminModal>
      )}

      {modal === 'venues' && (
        <AdminModal isOpen onClose={close} title={editId ? 'Edit Venue' : 'Add Venue'} footerActions={<ModalFooter onClose={close} onSave={save} pending={isPending} />}>
          <div className="space-y-3 text-xs font-sans">
            <Field label="Name"><input value={ven.name} onChange={(e) => setVen({ ...ven, name: e.target.value })} className={inp} /></Field>
            <Field label="City"><input value={ven.city} onChange={(e) => setVen({ ...ven, city: e.target.value })} className={inp} /></Field>
            <Field label="State"><input value={ven.state} onChange={(e) => setVen({ ...ven, state: e.target.value })} className={inp} /></Field>
            <Field label="Country"><input value={ven.country} onChange={(e) => setVen({ ...ven, country: e.target.value })} className={inp} /></Field>
          </div>
        </AdminModal>
      )}

      {slugEdit && (
        <AdminModal
          isOpen
          onClose={() => setSlugEdit(null)}
          title="Change URL slug"
          subtitle={`${slugEdit.typeLabel} · ${slugEdit.label}`}
          footerActions={
            <div className="flex gap-2">
              <button onClick={() => setSlugEdit(null)} className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs">Cancel</button>
              <button
                onClick={saveSlug}
                disabled={isPending || !!slugLocalError || slugUnchanged}
                title={slugUnchanged ? 'This is already the current slug' : slugLocalError ?? undefined}
                className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-40"
              >
                Save slug
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-xs font-sans">
            <div>
              <span className={lbl}>Current public URL</span>
              <p className="font-mono text-[11px] text-stone-600 break-all">{slugEdit.prefix}{slugEdit.current}/</p>
            </div>

            <div>
              <label className={lbl} htmlFor="slug-input">New slug</label>
              <input
                id="slug-input"
                autoFocus
                value={slugDraft}
                onChange={(e) => { setSlugDraft(e.target.value); setSlugError(null); }}
                className={inp}
                aria-describedby="slug-preview slug-feedback"
                aria-invalid={!!slugLocalError || !!slugError}
              />
            </div>

            <p id="slug-preview" className="text-[11px] text-stone-600">
              New public URL:{' '}
              <span className="font-mono text-stone-800 break-all">
                {slugEdit.prefix}{slugPreview || '…'}/
              </span>
            </p>

            <div id="slug-feedback" aria-live="polite" className="space-y-1">
              {slugLocalError && <p className="text-rose-700">{slugLocalError}</p>}
              {slugUnchanged && !slugLocalError && <p className="text-stone-500">This is already the current slug.</p>}
              {slugError && <p className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xs">{slugError}</p>}
            </div>

            {!slugLocalError && !slugUnchanged && (
              <p className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xs leading-relaxed">
                This changes a live public URL. The old address
                {' '}<span className="font-mono">{slugEdit.prefix}{slugEdit.current}/</span>{' '}
                will keep working as a permanent (HTTP 308) redirect to the new one, and existing
                redirects are re-pointed so visitors never take more than one hop.
                {slugEdit.typeLabel === 'Recurring event' && ' Every edition URL under this event is redirected too.'}
              </p>
            )}

            <p className="text-[11px] text-stone-500">
              Renaming the {slugEdit.typeLabel.toLowerCase()} itself never changes its slug — the two are edited
              independently, so a title fix cannot move a published URL by accident.
            </p>
          </div>
        </AdminModal>
      )}

      {/*
        Dependency-resolution dialog.

        Three states, and the operator is never left guessing which they are in:
        loading, blocked-with-options, or ready to delete. Historical groups are
        shown with their reason and NO transfer control, because offering one
        would imply the records could be moved — they cannot, and the service
        refuses it regardless of what this dialog renders.
      */}
      {del && (
        <AdminModal
          isOpen
          onClose={() => setDel(null)}
          title={`Delete “${del.label}”`}
          footerActions={
            <div className="flex gap-2">
              <button onClick={() => setDel(null)} className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs">Cancel</button>
              <button
                onClick={doPermanentDelete}
                disabled={isPending || !snapshot || !snapshot.deletable}
                title={snapshot && !snapshot.deletable ? 'Resolve the dependencies above first' : undefined}
                className="px-3.5 py-1.5 bg-rose-700 text-white text-xs font-semibold rounded-xs disabled:opacity-40"
              >
                Permanently delete
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-xs font-sans">
            {loadingDeps && <p className="text-stone-500">Checking what depends on this record…</p>}

            {snapshot && (
              <>
                <p className="text-stone-600">
                  <span className="font-mono text-[11px] text-stone-500">{snapshot.kind}</span>
                  {snapshot.slug && <> · <span className="font-mono text-[11px] text-stone-500">{snapshot.slug}</span></>}
                </p>

                {snapshot.deletable ? (
                  <p className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xs">
                    Nothing depends on this record. Permanent deletion cannot be undone.
                  </p>
                ) : (
                  <p className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xs">
                    {snapshot.blockingCount} linked record(s) must be resolved before this can be deleted.
                  </p>
                )}

                {snapshot.groups.map((g) => (
                  <div key={g.key} className="border border-stone-200 rounded-xs p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-800">{g.label}</span>
                      <span className="font-mono text-[11px] text-stone-500">{g.count}</span>
                    </div>
                    <p className="text-[11px] text-stone-500 leading-relaxed">{g.reason}</p>

                    {g.classification === 'historical' ? (
                      <p className="text-[11px] font-semibold text-rose-700">Cannot be transferred.</p>
                    ) : destinations.length === 0 ? (
                      <p className="text-[11px] text-stone-500">
                        No other record of this type exists to move these to — create one first.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`dest-${g.key}`}>Destination</label>
                        <select
                          id={`dest-${g.key}`}
                          value={destId}
                          onChange={(ev) => setDestId(ev.target.value)}
                          className="px-2 py-1 text-xs border border-stone-300 rounded-xs max-w-[260px]"
                        >
                          {destinations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                        </select>
                        <button
                          onClick={() => doTransfer(g.key)}
                          disabled={isPending || !destId}
                          className="px-3 py-1 bg-[#0F1115] text-[#D4A757] text-[11px] font-semibold rounded-xs disabled:opacity-50"
                        >
                          {g.classification === 'conditional' ? 'Confirm & transfer' : 'Transfer'}
                        </button>
                        {g.classification === 'conditional' && (
                          <span className="text-[11px] text-amber-700">Requires your confirmation of the premise above.</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </AdminModal>
      )}

      {modal === 'disciplines' && (
        <AdminModal isOpen onClose={close} title="Add Discipline" footerActions={<ModalFooter onClose={close} onSave={save} pending={isPending} />}>
          <div className="space-y-3 text-xs font-sans">
            <Field label="Name">
              <input value={disc.name} onChange={(e) => setDisc({ ...disc, name: e.target.value })} className={inp} />
            </Field>
            <p className="text-[11px] text-stone-500">
              The public URL is derived from the name and cannot be changed afterwards, so choose it carefully:
              {' '}<code className="font-mono">/disciplines/{disc.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || '…'}/</code>
            </p>
            <Field label="Summary">
              <textarea rows={3} value={disc.summary} onChange={(e) => setDisc({ ...disc, summary: e.target.value })} className={inp} />
            </Field>
            <Field label="Short name (optional)">
              <input value={disc.shortName} onChange={(e) => setDisc({ ...disc, shortName: e.target.value })} className={inp} />
            </Field>
            {/*
              Labelled "Classification", not "Category". The field writes
              `Discipline.category`, which is how the event is CONTESTED — it is
              unrelated to the five editorial Category rows managed in Editorial
              Organization, and calling both "Category" is what made the two
              look like one setting. The database field keeps its name; only the
              visible label and the help text changed.
            */}
            {/*
              Batch 05 — the managed vocabulary when it is available, the
              compatibility pair when it is not.

              Two code paths rather than one because they send different fields:
              a managed row is sent as `classificationId` (a real reference that
              survives a rename), while the fallback can only send the legacy
              `category` text. Offering an EMPTY dropdown when the migration has
              not been applied would make an existing, working field look broken.
            */}
            <Field label="Classification (optional)">
              {classificationState === 'database' && assignableClassifications.length > 0 ? (
                <select value={disc.classificationId} onChange={(e) => setDisc({ ...disc, classificationId: e.target.value })} className={inp}>
                  <option value="">—</option>
                  {assignableClassifications.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <select value={disc.category} onChange={(e) => setDisc({ ...disc, category: e.target.value })} className={inp}>
                  <option value="">—</option>
                  {DISCIPLINE_CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </Field>
            <p className="text-[11px] text-stone-500">{DISCIPLINE_CLASSIFICATION_HELP}</p>
            <Field label="Tagline (optional)">
              <input value={disc.tagline} onChange={(e) => setDisc({ ...disc, tagline: e.target.value })} className={inp} />
            </Field>
            <p className="text-[11px] text-stone-500">
              Guide content is not created here. Add the evergreen guide, SEO and FAQ in Landing SEO once the
              discipline exists.
            </p>
          </div>
        </AdminModal>
      )}
    </div>
  );
};

const Table: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto">
    <table className="w-full text-left text-xs font-sans">
      <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px] tracking-wider">{head.map((h, i) => <th key={i} className={`py-2.5 px-4 ${i >= head.length - 1 || ['Articles', 'Editions'].includes(h) ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-stone-100">{children}</tbody>
    </table>
  </div>
);

/**
 * Row actions.
 *
 * Delete is ALWAYS offered to an authorised operator — never disabled with a
 * "locked" label. Clicking it opens the dependency dialog, which is where the
 * operator finds out what is in the way and what can be moved. A disabled
 * button tells them they cannot proceed; this tells them how.
 */
const Actions: React.FC<{
  canManage: boolean;
  archived: boolean;
  onEdit: () => void;
  onSlug: () => void;
  onLifecycle: () => void;
  onDelete: () => void;
}> = ({ canManage, archived, onEdit, onSlug, onLifecycle, onDelete }) => (
  <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
    {canManage ? <>
      <button onClick={onEdit} className="text-[#8B5E3C] hover:underline font-bold">Edit</button>
      <button onClick={onSlug} className="text-stone-600 hover:underline" title="Change the public URL slug">Slug</button>
      <button onClick={onLifecycle} className="text-stone-600 hover:underline">
        {archived ? 'Reactivate' : 'Archive'}
      </button>
      <button onClick={onDelete} className="text-rose-600 hover:underline">Delete</button>
    </> : <span className="text-stone-400">read-only</span>}
  </td>
);

const StatusBadge: React.FC<{ archivedAt: Date | null }> = ({ archivedAt }) => (
  archivedAt
    ? <span className="px-1.5 py-0.5 text-[10px] font-mono uppercase bg-amber-100 text-amber-800 rounded-xs" title={`Archived ${new Date(archivedAt).toISOString().slice(0, 10)}`}>Archived</span>
    : <span className="px-1.5 py-0.5 text-[10px] font-mono uppercase bg-emerald-50 text-emerald-700 rounded-xs">Active</span>
);

const ModalFooter: React.FC<{ onClose: () => void; onSave: () => void; pending: boolean }> = ({ onClose, onSave, pending }) => (
  <div className="flex gap-2">
    <button onClick={onClose} className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs">Cancel</button>
    <button onClick={onSave} disabled={pending} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save</button>
  </div>
);

export default AdminRodeoCoveragePage;

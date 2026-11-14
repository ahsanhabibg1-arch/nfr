'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminModal } from '../../components/admin/AdminModal';
import type { CategoryRow, TagRow, AuthorRow, SubcategoryRow } from '../../lib/cms/taxonomyService';
import type { ArticleTypeRow } from '../../lib/cms/articleTypeService';
import type { ArticleSchemaTypeName } from '../../lib/content/articleTypeShape';
import {
  createCategoryAction, updateCategoryAction, deleteCategoryAction,
  createTagAction, updateTagAction, deleteTagAction,
  createAuthorAction, updateAuthorAction, deleteAuthorAction,
  createSubcategoryAction, updateSubcategoryAction,
  setSubcategoryArchivedAction, deleteSubcategoryAction,
} from '../../app/admin/taxonomy-actions';
import {
  createArticleTypeAction, updateArticleTypeMetadataAction,
  setArticleTypeSelectableAction, setArticleTypeArchivedAction,
  setArticleTypeEvergreenAction, setArticleTypeSchemaTypeAction,
  deleteArticleTypeAction, bootstrapArticleTypesAction,
} from '../../app/admin/article-type-actions';

/** Batch 04-E — one audit entry, as the server page shapes it. */
export interface ArticleTypeAuditEntry {
  at: Date | string;
  action: string;
  detail: string | null;
  actorName: string | null;
}

interface Props {
  categories: CategoryRow[]; tags: TagRow[]; authors: AuthorRow[];
  /** Batch 04-B — includes archived rows; the tab filters them client-side. */
  subcategories: SubcategoryRow[];
  canTaxonomy: boolean; canAuthors: boolean;
  /** Batch 04-E — managed Article Types, all lifecycles; filtered client-side. */
  articleTypes?: ArticleTypeRow[];
  articleTypeAudit?: ArticleTypeAuditEntry[];
  /**
   * `'fallback'` means the table holds no rows and the application is running
   * on the in-repository compatibility definitions. The tab says so rather than
   * presenting an empty list as "no article types".
   */
  articleTypeSource?: 'database' | 'fallback';
  /**
   * Batch 04-E.2 — compatibility definitions the managed registry is missing.
   * Non-empty means a PARTIALLY initialised registry, which is a different
   * state from "not initialised" and needs saying out loud: article types that
   * ought to exist do not, and anything relying on them is running on the
   * compiled-in fallback for those values alone.
   */
  articleTypeMissing?: string[];
  /** Create / label / order / activate / archive / delete. */
  canArticleTypes?: boolean;
  /** Evergreen eligibility (`seo.config`). */
  canArticleTypeSeo?: boolean;
  /** Article vs NewsArticle, and the bootstrap (`system.config`). */
  canArticleTypeSchema?: boolean;
}

export const AdminEditorialOrgPage: React.FC<Props> = ({
  categories, tags, authors, subcategories, canTaxonomy, canAuthors,
  articleTypes = [], articleTypeAudit = [], articleTypeSource = 'fallback', articleTypeMissing = [],
  canArticleTypes = false, canArticleTypeSeo = false, canArticleTypeSchema = false,
}) => {
  const router = useRouter();
  const [tab, setTab] = useState<'categories' | 'subcategories' | 'articleTypes' | 'tags' | 'authors'>('categories');
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 5000); };
  const run = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string) => startTransition(async () => { const r = await p; flash(r.ok ? okMsg : r.error || 'Error'); if (r.ok) router.refresh(); });

  // Category modal
  const [catModal, setCatModal] = useState(false);
  const [catId, setCatId] = useState<string | null>(null);
  const [catForm, setCatForm] = useState({ name: '', description: '', sortOrder: 99 });
  const openCat = (c?: CategoryRow) => { setCatId(c?.id ?? null); setCatForm({ name: c?.name ?? '', description: c?.description ?? '', sortOrder: c?.sortOrder ?? 99 }); setCatModal(true); };
  const saveCat = () => startTransition(async () => {
    const r = catId ? await updateCategoryAction(catId, catForm) : await createCategoryAction(catForm);
    if (r.ok) { setCatModal(false); flash('Category saved.'); router.refresh(); } else flash(r.error);
  });

  // Author modal
  const [authModal, setAuthModal] = useState(false);
  const [authId, setAuthId] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState({ name: '', role: '', bio: '', credentials: '' });
  const openAuth = (a?: AuthorRow) => { setAuthId(a?.id ?? null); setAuthForm({ name: a?.name ?? '', role: a?.role ?? '', bio: '', credentials: '' }); setAuthModal(true); };
  const saveAuth = () => startTransition(async () => {
    const r = authId ? await updateAuthorAction(authId, authForm) : await createAuthorAction(authForm);
    if (r.ok) { setAuthModal(false); flash('Author saved.'); router.refresh(); } else flash(r.error);
  });

  /**
   * Batch 04-B — Subcategory modal and filters.
   *
   * `sortOrder` is sent only when the operator edited it, so creating leaves
   * the service to append at the end of its section.
   */
  const [subModal, setSubModal] = useState(false);
  const [subId, setSubId] = useState<string | null>(null);
  const [subForm, setSubForm] = useState({ categoryId: '', name: '', slug: '', description: '', summary: '', image: '', imageCredit: '', guide: '', sortOrder: '' });
  const [subFilter, setSubFilter] = useState<{ categoryId: string; q: string; showArchived: boolean }>({ categoryId: '', q: '', showArchived: false });
  const openSub = (s?: SubcategoryRow) => {
    setSubId(s?.id ?? null);
    setSubForm({
      categoryId: s?.categoryId ?? subFilter.categoryId ?? '',
      name: s?.name ?? '', slug: s?.slug ?? '', description: s?.description ?? '',
      summary: s?.summary ?? '', image: s?.image ?? '', imageCredit: s?.imageCredit ?? '',
      // One paragraph per line, which is also how it is stored.
      guide: (s?.guide ?? []).join(String.fromCharCode(10)),
      sortOrder: s ? String(s.sortOrder) : '',
    });
    setSubModal(true);
  };
  const saveSub = () => startTransition(async () => {
    const payload = {
      categoryId: subForm.categoryId,
      name: subForm.name,
      slug: subForm.slug.trim() || undefined,
      description: subForm.description.trim() || undefined,
      summary: subForm.summary.trim() || undefined,
      image: subForm.image.trim() || undefined,
      imageCredit: subForm.imageCredit.trim() || undefined,
      guide: subForm.guide.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean),
      sortOrder: subForm.sortOrder.trim() === '' ? undefined : Number(subForm.sortOrder),
    };
    const r = subId ? await updateSubcategoryAction(subId, payload) : await createSubcategoryAction(payload);
    if (r.ok) { setSubModal(false); flash('Subcategory saved.'); router.refresh(); } else flash(r.error);
  });
  const visibleSubs = subcategories.filter((s) =>
    (!subFilter.categoryId || s.categoryId === subFilter.categoryId) &&
    (subFilter.showArchived ? true : !s.archivedAt) &&
    (!subFilter.q.trim() ||
      s.name.toLowerCase().includes(subFilter.q.trim().toLowerCase()) ||
      s.slug.toLowerCase().includes(subFilter.q.trim().toLowerCase())),
  );

  /**
   * Batch 04-E — Article Type state.
   *
   * Create takes the permanent `value` and the display `label`; edit takes only
   * the display fields, because the value is immutable and the form must not
   * suggest otherwise. Evergreen and the structured-data classification are not
   * in this form at all: each is a separately-permitted act performed from the
   * row, with its own confirmation.
   */
  const [atModal, setAtModal] = useState<'create' | 'edit' | null>(null);
  const [atId, setAtId] = useState<string | null>(null);
  const [atForm, setAtForm] = useState({ value: '', label: '', description: '', sortOrder: '', selectable: true });
  const [atFilter, setAtFilter] = useState({ q: '', showRetired: true });

  const openAtCreate = () => {
    setAtId(null);
    setAtForm({ value: '', label: '', description: '', sortOrder: '', selectable: true });
    setAtModal('create');
  };
  const openAtEdit = (t: ArticleTypeRow) => {
    setAtId(t.id);
    setAtForm({ value: t.value, label: t.label, description: t.description ?? '', sortOrder: String(t.sortOrder), selectable: t.selectable });
    setAtModal('edit');
  };
  const saveAt = () => startTransition(async () => {
    const sortOrder = atForm.sortOrder.trim() === '' ? undefined : Number(atForm.sortOrder);
    const r = atId
      ? await updateArticleTypeMetadataAction(atId, {
          label: atForm.label,
          description: atForm.description.trim() || undefined,
          sortOrder,
        })
      : await createArticleTypeAction({
          value: atForm.value,
          label: atForm.label.trim() || atForm.value,
          description: atForm.description.trim() || undefined,
          sortOrder,
          selectable: atForm.selectable,
        });
    if (r.ok) { setAtModal(null); flash('Article type saved.'); router.refresh(); } else flash(r.error);
  });

  const visibleAt = articleTypes.filter((t) => {
    const retired = !t.selectable || !!t.archivedAt;
    if (retired && !atFilter.showRetired) return false;
    const q = atFilter.q.trim().toLowerCase();
    if (!q) return true;
    return t.value.toLowerCase().includes(q) || t.label.toLowerCase().includes(q);
  });

  const atStateBadge = (t: ArticleTypeRow) => {
    if (t.archivedAt) return <span className="text-[9px] font-mono px-1 rounded border bg-stone-100 border-stone-300 text-stone-500">ARCHIVED</span>;
    if (!t.selectable) return <span className="text-[9px] font-mono px-1 rounded border bg-amber-50 border-amber-200 text-amber-700">INACTIVE</span>;
    return <span className="text-[9px] font-mono px-1 rounded border bg-emerald-50 border-emerald-200 text-emerald-700">SELECTABLE</span>;
  };

  const [newTag, setNewTag] = useState('');
  /**
   * Stage 03 (G-03) — inline tag rename. The service updates the row, so every
   * article association survives; delete-and-recreate would have dropped them.
   */
  const renameTag = (id: string, current: string) => {
    const next = prompt(`Rename the tag "${current}" to:`, current);
    if (next === null) return;
    const clean = next.trim();
    if (!clean || clean === current) return;
    run(updateTagAction(id, clean), 'Tag renamed. Article associations are unchanged.');
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Editorial Organization" description="Database-backed categories, tags and author bylines. The five primary sections are protected foundational records." />
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs">{notice}</div>}
      <AdminTabs tabs={[{ id: 'categories', label: 'Categories', count: categories.length }, { id: 'subcategories', label: 'Subcategories', count: subcategories.filter((s) => !s.archivedAt).length }, { id: 'articleTypes', label: 'Article Types', count: articleTypes.filter((t) => t.selectable && !t.archivedAt).length }, { id: 'tags', label: 'Tags', count: tags.length }, { id: 'authors', label: 'Author Bylines', count: authors.length }]} activeTab={tab} onChange={(t) => setTab(t as typeof tab)} />

      {tab === 'categories' && (
        <div className="space-y-3">
          {canTaxonomy && <button onClick={() => openCat()} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">+ Add Category</button>}
          <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px] tracking-wider"><th className="py-2.5 px-4">Name</th><th className="py-2.5 px-4">Slug</th><th className="py-2.5 px-4">Order</th><th className="py-2.5 px-4 text-right">Articles</th><th className="py-2.5 px-4 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-stone-50/60">
                    <td className="py-2.5 px-4 font-semibold text-stone-900">{c.name}{c.protected && <span className="ml-2 text-[9px] font-mono text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">PRIMARY</span>}</td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-stone-500">{c.slug}</td>
                    <td className="py-2.5 px-4 text-stone-600">{c.sortOrder}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-stone-600">{c.articleCount}</td>
                    <td className="py-2.5 px-4 text-right space-x-2">
                      {canTaxonomy ? <>
                        <button onClick={() => openCat(c)} className="text-[#8B5E3C] hover:underline font-bold">Edit</button>
                        {!c.protected && c.articleCount === 0 && <button onClick={() => run(deleteCategoryAction(c.id), 'Category deleted.')} className="text-rose-600 hover:underline">Delete</button>}
                      </> : <span className="text-stone-400">read-only</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'subcategories' && (
        <div className="space-y-3">
          {/*
            Batch 04-B — the managed second level, inside the SAME taxonomy
            screen as Categories and Tags. A subcategory belongs to exactly one
            primary section, and the database enforces that an article can only
            use one from its own section (composite foreign key).
          */}
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="sub-filter-section" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Primary section</label>
              <select id="sub-filter-section" value={subFilter.categoryId} onChange={(e) => setSubFilter({ ...subFilter, categoryId: e.target.value })} className="text-xs p-2 bg-white border border-stone-200 rounded-xs">
                <option value="">All sections</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="sub-filter-q" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Search</label>
              <input id="sub-filter-q" value={subFilter.q} onChange={(e) => setSubFilter({ ...subFilter, q: e.target.value })} placeholder="name or slug…" className="text-xs p-2 bg-white border border-stone-200 rounded-xs w-48" />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-stone-600 pb-2">
              <input type="checkbox" checked={subFilter.showArchived} onChange={(e) => setSubFilter({ ...subFilter, showArchived: e.target.checked })} />
              Show archived
            </label>
            {canTaxonomy && <button onClick={() => openSub()} className="ml-auto px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">+ Add Subcategory</button>}
          </div>

          <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px] tracking-wider"><th className="py-2.5 px-4">Primary section</th><th className="py-2.5 px-4">Name</th><th className="py-2.5 px-4">Slug</th><th className="py-2.5 px-4">Order</th><th className="py-2.5 px-4">State</th><th className="py-2.5 px-4 text-right">Articles</th><th className="py-2.5 px-4 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {visibleSubs.map((s) => (
                  <tr key={s.id} className={`hover:bg-stone-50/60 ${s.archivedAt ? 'opacity-60' : ''}`}>
                    <td className="py-2.5 px-4 text-stone-600">{s.categoryName}</td>
                    <td className="py-2.5 px-4 font-semibold text-stone-900">{s.name}</td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-stone-500">{s.slug}</td>
                    <td className="py-2.5 px-4 text-stone-600">{s.sortOrder}</td>
                    <td className="py-2.5 px-4">
                      {s.archivedAt
                        ? <span className="text-[9px] font-mono px-1 rounded border bg-stone-100 border-stone-300 text-ink-muted">ARCHIVED</span>
                        : <span className="text-[9px] font-mono px-1 rounded border bg-emerald-50 border-emerald-200 text-emerald-700">ACTIVE</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-stone-600">{s.articleCount}</td>
                    <td className="py-2.5 px-4 text-right space-x-2">
                      {canTaxonomy ? <>
                        <button onClick={() => openSub(s)} className="text-[#8B5E3C] hover:underline font-bold">Edit</button>
                        <button onClick={() => run(setSubcategoryArchivedAction(s.id, !s.archivedAt), s.archivedAt ? 'Subcategory reactivated.' : 'Subcategory archived.')} className="text-stone-600 hover:underline">
                          {s.archivedAt ? 'Reactivate' : 'Archive'}
                        </button>
                        {/* Delete is offered only when nothing references it; the
                            service and the foreign key both refuse otherwise. */}
                        {s.articleCount === 0 && (
                          <button onClick={() => { if (confirm(`Delete "${s.name}"? Archiving keeps it out of new assignments without removing it.`)) run(deleteSubcategoryAction(s.id), 'Subcategory deleted.'); }} className="text-rose-600 hover:underline">Delete</button>
                        )}
                      </> : <span className="text-stone-400">read-only</span>}
                    </td>
                  </tr>
                ))}
                {visibleSubs.length === 0 && (
                  <tr><td colSpan={7} className="py-6 px-4 text-center text-stone-400">
                    {subcategories.length === 0
                      ? 'No subcategories yet. Add one to give a primary section a curated second level.'
                      : 'No subcategories match these filters.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-stone-500">
            Archiving keeps existing article links and only withdraws the subcategory from new assignment.
            A subcategory cannot be deleted, or moved to another section, while any article uses it.
            Existing articles keep their older free-text labels until an approved mapping is performed.
          </p>
        </div>
      )}

      {tab === 'articleTypes' && (
        <div className="space-y-3">
          {/*
            Batch 04-E — the managed Article Type vocabulary.

            It sits in this screen, beside Categories and Subcategories, because
            this is where editorial organisation is administered. What makes it
            different from its neighbours is that two of its settings change
            what the PUBLIC site asserts about work that is already published,
            so those two are permissioned separately and confirmed separately.
          */}
          {articleTypeSource === 'fallback' && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xs space-y-2">
              <p>
                <strong>The managed registry is not initialised.</strong> The site is running on the
                23 compatibility definitions compiled into this release, which is exactly how it
                behaved before this feature — nothing is broken, and nothing here is editable yet.
              </p>
              {canArticleTypeSchema ? (
                <button
                  onClick={() => run(bootstrapArticleTypesAction(true), 'Registry initialised from the compatibility definitions.')}
                  className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs"
                >
                  Initialise registry (23 definitions)
                </button>
              ) : (
                <p className="text-[11px]">Initialising it requires Super Admin.</p>
              )}
            </div>
          )}

          {articleTypeSource === 'database' && articleTypeMissing.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xs space-y-2">
              <p>
                <strong>The managed registry is incomplete.</strong> {articleTypeMissing.length} of the
                23 definitions this release ships with are missing, so anything that asks about them is
                answered from the compiled-in fallback rather than from managed configuration:
              </p>
              <p className="font-mono text-[11px] break-words">{articleTypeMissing.join(' · ')}</p>
              <p>
                This happens if a definition was removed, or if an initialisation run did not finish.
                Re-running the bootstrap adds only what is missing and changes nothing that already
                exists.
              </p>
              {canArticleTypeSchema ? (
                <button
                  onClick={() => run(bootstrapArticleTypesAction(true), 'Missing definitions restored.')}
                  className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs"
                >
                  Restore missing definitions
                </button>
              ) : (
                <p className="text-[11px]">Restoring them requires Super Admin.</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="at-filter-q" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Search</label>
              <input id="at-filter-q" value={atFilter.q} onChange={(e) => setAtFilter({ ...atFilter, q: e.target.value })} placeholder="value or label…" className="text-xs p-2 bg-white border border-stone-200 rounded-xs w-56" />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-stone-600 pb-2">
              <input type="checkbox" checked={atFilter.showRetired} onChange={(e) => setAtFilter({ ...atFilter, showRetired: e.target.checked })} />
              Show inactive &amp; archived
            </label>
            {canArticleTypes && articleTypeSource === 'database' && (
              <button onClick={openAtCreate} className="ml-auto px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">+ Add Article Type</button>
            )}
          </div>

          <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-4">Stored value</th>
                <th className="py-2.5 px-4">Label</th>
                <th className="py-2.5 px-4">Order</th>
                <th className="py-2.5 px-4">State</th>
                <th className="py-2.5 px-4">Evergreen</th>
                <th className="py-2.5 px-4">Structured data</th>
                <th className="py-2.5 px-4 text-right">Articles</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-stone-100">
                {visibleAt.map((t) => (
                  <tr key={t.id} className={`hover:bg-stone-50/60 ${t.archivedAt ? 'opacity-60' : ''}`}>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-stone-700">{t.value}</td>
                    <td className="py-2.5 px-4 font-semibold text-stone-900">{t.label}</td>
                    <td className="py-2.5 px-4 text-stone-600">{t.sortOrder}</td>
                    <td className="py-2.5 px-4">{atStateBadge(t)}</td>
                    <td className="py-2.5 px-4">
                      {/* `seo.config`, not `articletype.manage`: this changes which
                          published articles the evergreen surface may show. */}
                      {canArticleTypeSeo ? (
                        <button
                          onClick={() => {
                            const next = !t.evergreen;
                            const warn = next
                              ? `Mark "${t.value}" evergreen? Published articles of this type become eligible for the evergreen surface at the next revalidation.`
                              : `Remove "${t.value}" from evergreen? Its articles stop appearing on the evergreen surface. They stay published.`;
                            if (confirm(warn)) run(setArticleTypeEvergreenAction(t.id, next), 'Evergreen eligibility updated.');
                          }}
                          className={t.evergreen ? 'text-emerald-700 font-bold hover:underline' : 'text-stone-500 hover:underline'}
                        >
                          {t.evergreen ? 'Yes' : 'No'}
                        </button>
                      ) : (
                        <span className={t.evergreen ? 'text-emerald-700 font-bold' : 'text-stone-400'}>{t.evergreen ? 'Yes' : 'No'}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {/* `system.config` (Super Admin): this is the `@type` emitted in
                          every published article's JSON-LD. */}
                      {canArticleTypeSchema ? (
                        <select
                          aria-label={`Structured-data classification for ${t.value}`}
                          value={t.schemaType}
                          onChange={(e) => {
                            const next = e.target.value as ArticleSchemaTypeName;
                            if (next === t.schemaType) return;
                            if (confirm(`Change "${t.value}" to ${next}? Every published article of this type will declare schema.org ${next} to search engines after revalidation.`)) {
                              run(setArticleTypeSchemaTypeAction(t.id, next), 'Structured-data classification updated.');
                            } else {
                              router.refresh();
                            }
                          }}
                          className="text-[11px] p-1 bg-stone-50 border border-stone-200 rounded-xs font-mono"
                        >
                          <option value="Article">Article</option>
                          <option value="NewsArticle">NewsArticle</option>
                        </select>
                      ) : (
                        <span className="font-mono text-[11px] text-stone-600">{t.schemaType}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-stone-600">{t.articleCount}</td>
                    <td className="py-2.5 px-4 text-right space-x-2">
                      {canArticleTypes ? <>
                        <button onClick={() => openAtEdit(t)} className="text-[#8B5E3C] hover:underline font-bold">Edit</button>
                        <button
                          onClick={() => run(setArticleTypeSelectableAction(t.id, !t.selectable), t.selectable ? 'Withdrawn from new classification.' : 'Offered for new classification.')}
                          className="text-stone-600 hover:underline"
                        >
                          {t.selectable ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => run(setArticleTypeArchivedAction(t.id, !t.archivedAt), t.archivedAt ? 'Article type reactivated.' : 'Article type archived.')}
                          className="text-stone-600 hover:underline"
                        >
                          {t.archivedAt ? 'Unarchive' : 'Archive'}
                        </button>
                        {/* Offered only when nothing stores the value; the service
                            re-counts and refuses otherwise. */}
                        {t.articleCount === 0 && (
                          <button
                            onClick={() => { if (confirm(`Delete "${t.value}" permanently? Deactivating keeps it out of new classification without removing the definition.`)) run(deleteArticleTypeAction(t.id), 'Article type deleted.'); }}
                            className="text-rose-600 hover:underline"
                          >
                            Delete
                          </button>
                        )}
                      </> : <span className="text-stone-400">read-only</span>}
                    </td>
                  </tr>
                ))}
                {visibleAt.length === 0 && (
                  <tr><td colSpan={8} className="py-6 px-4 text-center text-stone-400">
                    {articleTypes.length === 0
                      ? 'No managed article types yet — initialise the registry above.'
                      : 'No article types match these filters.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-stone-500 space-y-1">
            <p>
              <strong>The stored value is permanent.</strong> It is what every article of this type
              holds, so it is never renamed — edit the label instead. A type with articles cannot be
              deleted; deactivate or archive it and those articles keep their type and stay published.
            </p>
            <p>
              <strong>Deactivating affects new work only.</strong> It removes the type from the
              editor&apos;s dropdown. Existing articles remain editable and keep appearing in their
              archive filters.
            </p>
            <p>
              <strong>Two settings change public SEO output.</strong> Evergreen eligibility requires
              SEO configuration rights; the Article / NewsArticle classification requires Super Admin.
              Both take effect at the next revalidation of the affected pages — no deployment needed.
            </p>
          </div>

          {articleTypeAudit.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-sm">
              <h4 className="px-4 py-2 border-b border-stone-100 text-[10px] font-mono uppercase tracking-wider text-stone-500">
                Recent article type changes
              </h4>
              <ul className="divide-y divide-stone-100">
                {articleTypeAudit.map((e, i) => (
                  <li key={i} className="px-4 py-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                    <span className="font-mono text-stone-500">{new Date(e.at).toISOString().replace('T', ' ').slice(0, 16)}</span>
                    <span className="font-semibold text-stone-800">{e.action.replace(/^articleType\./, '')}</span>
                    {e.detail && <span className="text-stone-600">{e.detail}</span>}
                    <span className="text-stone-400 ml-auto">{e.actorName ?? 'system'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'tags' && (
        <div className="space-y-3">
          {canTaxonomy && (
            <form onSubmit={(e) => { e.preventDefault(); if (newTag.trim()) { run(createTagAction(newTag.trim()), 'Tag added.'); setNewTag(''); } }} className="flex gap-2">
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag name…" className="text-xs p-2 bg-stone-50 border border-stone-200 rounded-xs" />
              <button className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">Add Tag</button>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5 text-xs font-mono bg-white border border-stone-200 px-2.5 py-1 rounded-xs">
                #{t.name} <span className="text-stone-400">({t.articleCount})</span>
                {canTaxonomy && (
                  <>
                    <button onClick={() => renameTag(t.id, t.name)} title={`Rename ${t.name}`} aria-label={`Rename tag ${t.name}`} className="text-[#8B5E3C] hover:underline font-semibold">Rename</button>
                    <button onClick={() => run(deleteTagAction(t.id), 'Tag deleted.')} title={`Delete ${t.name}`} aria-label={`Delete tag ${t.name}`} className="text-stone-400 hover:text-rose-600">&times;</button>
                  </>
                )}
              </span>
            ))}
            {tags.length === 0 && <span className="text-xs text-stone-400">No tags yet.</span>}
          </div>
        </div>
      )}

      {tab === 'authors' && (
        <div className="space-y-3">
          {canAuthors && <button onClick={() => openAuth()} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">+ Add Author Byline</button>}
          <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px] tracking-wider"><th className="py-2.5 px-4">Byline</th><th className="py-2.5 px-4">Role</th><th className="py-2.5 px-4 text-right">Articles</th><th className="py-2.5 px-4 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {authors.map((a) => (
                  <tr key={a.id} className="hover:bg-stone-50/60">
                    <td className="py-2.5 px-4 font-semibold text-stone-900">{a.name}</td>
                    <td className="py-2.5 px-4 text-stone-600">{a.role}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-stone-600">{a.articleCount}</td>
                    <td className="py-2.5 px-4 text-right space-x-2">
                      {canAuthors ? <>
                        <button onClick={() => openAuth(a)} className="text-[#8B5E3C] hover:underline font-bold">Edit</button>
                        {a.articleCount === 0 && <button onClick={() => run(deleteAuthorAction(a.id), 'Author deleted.')} className="text-rose-600 hover:underline">Delete</button>}
                      </> : <span className="text-stone-400">read-only</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-stone-400">Author bylines are public editorial identities and are distinct from CMS login users. Email addresses are never shown publicly.</p>
        </div>
      )}

      {catModal && (
        <AdminModal isOpen onClose={() => setCatModal(false)} title={catId ? 'Edit Category' : 'Add Category'}
          footerActions={<div className="flex gap-2"><button onClick={() => setCatModal(false)} className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs">Cancel</button><button onClick={saveCat} disabled={isPending} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save</button></div>}>
          <div className="space-y-3 text-xs font-sans">
            <div><label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Name</label><input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
            <div><label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Description</label><textarea rows={2} value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
            <div><label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Sort order</label><input type="number" value={catForm.sortOrder} onChange={(e) => setCatForm({ ...catForm, sortOrder: Number(e.target.value) })} className="w-24 p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
          </div>
        </AdminModal>
      )}

      {subModal && (
        <AdminModal isOpen onClose={() => setSubModal(false)} title={subId ? 'Edit Subcategory' : 'Add Subcategory'}
          footerActions={<div className="flex gap-2"><button onClick={() => setSubModal(false)} className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs">Cancel</button><button onClick={saveSub} disabled={isPending || !subForm.categoryId || !subForm.name.trim()} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save</button></div>}>
          <div className="space-y-3 text-xs font-sans">
            <div>
              <label htmlFor="sub-section" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Primary section</label>
              <select id="sub-section" value={subForm.categoryId} onChange={(e) => setSubForm({ ...subForm, categoryId: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs">
                <option value="">Choose a section…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {/* A section change on an in-use subcategory is refused by both the
                  service and the database, so the reason is stated up front. */}
              <p className="text-[10px] text-stone-500 mt-1">
                A subcategory belongs to one section. It cannot be moved once articles use it.
              </p>
            </div>
            <div><label htmlFor="sub-name" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Name</label><input id="sub-name" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
            <div>
              <label htmlFor="sub-slug" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Slug (optional)</label>
              <input id="sub-slug" value={subForm.slug} onChange={(e) => setSubForm({ ...subForm, slug: e.target.value })} placeholder="derived from the name" className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs font-mono" />
              <p className="text-[10px] text-stone-500 mt-1">
                Lowercase letters, numbers and single hyphens. <strong>This is the public URL</strong> —
                the archive is served at <span className="font-mono">/{subForm.slug || 'slug'}/</span> and its
                articles at <span className="font-mono">/{subForm.slug || 'slug'}/article-slug/</span>.
                It must be unique across <em>every</em> section, and it cannot be the name of an existing page
                (<span className="font-mono">search</span>, <span className="font-mono">venues</span>,
                <span className="font-mono">competition</span>&hellip;). Changing it moves every article inside
                it; the old URLs keep working through a permanent redirect.
              </p>
            </div>
            <div><label htmlFor="sub-desc" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Description</label><textarea id="sub-desc" rows={2} value={subForm.description} onChange={(e) => setSubForm({ ...subForm, description: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
            {/*
              Landing-page content. A subcategory archive is a public entity
              page, so these are what a reader sees above the article list.
            */}
            <div className="pt-3 mt-1 border-t border-stone-200">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#8B5E3C] mb-2">Landing page</p>
              <label htmlFor="sub-summary" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Summary</label>
              <textarea id="sub-summary" rows={2} value={subForm.summary} onChange={(e) => setSubForm({ ...subForm, summary: e.target.value })} placeholder="One or two sentences under the headline, also used as the meta description." className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" />
            </div>
            <div><label htmlFor="sub-image" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Hero image URL</label><input id="sub-image" value={subForm.image} onChange={(e) => setSubForm({ ...subForm, image: e.target.value })} placeholder="/api/media/..." className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs font-mono" /></div>
            <div><label htmlFor="sub-credit" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Image credit</label><input id="sub-credit" value={subForm.imageCredit} onChange={(e) => setSubForm({ ...subForm, imageCredit: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
            <div>
              <label htmlFor="sub-guide" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Guide</label>
              <textarea id="sub-guide" rows={4} value={subForm.guide} onChange={(e) => setSubForm({ ...subForm, guide: e.target.value })} placeholder="One paragraph per line." className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" />
              <p className="text-[10px] text-stone-500 mt-1">One paragraph per line, shown above the coverage list. Up to 12.</p>
            </div>
            <div><label htmlFor="sub-order" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Sort order</label><input id="sub-order" type="number" min={0} value={subForm.sortOrder} onChange={(e) => setSubForm({ ...subForm, sortOrder: e.target.value })} placeholder="append" className="w-24 p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
          </div>
        </AdminModal>
      )}

      {atModal && (
        <AdminModal isOpen onClose={() => setAtModal(null)} title={atModal === 'edit' ? 'Edit Article Type' : 'Add Article Type'}
          footerActions={<div className="flex gap-2"><button onClick={() => setAtModal(null)} className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs">Cancel</button><button onClick={saveAt} disabled={isPending || (atModal === 'create' ? !atForm.value.trim() : !atForm.label.trim())} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save</button></div>}>
          <div className="space-y-3 text-xs font-sans">
            <div>
              <label htmlFor="at-value" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Stored value</label>
              <input
                id="at-value"
                value={atForm.value}
                readOnly={atModal === 'edit'}
                onChange={(e) => setAtForm({ ...atForm, value: e.target.value })}
                placeholder="Results &amp; Standings"
                className={`w-full p-2 border border-stone-200 rounded-xs font-mono ${atModal === 'edit' ? 'bg-stone-100 text-stone-500 cursor-not-allowed' : 'bg-stone-50'}`}
              />
              {/* Stated before it is typed, not after it is refused: the value is
                  the permanent identity written onto every article of this type. */}
              <p className="text-[10px] text-stone-500 mt-1">
                {atModal === 'edit'
                  ? 'Permanent. This is what every article of this type stores, so it cannot be changed — edit the label below instead.'
                  : 'Permanent once saved. Write it as readers would see it (Title Case, like “Results & Standings”). Two types cannot differ only by letter case.'}
              </p>
            </div>
            <div>
              <label htmlFor="at-label" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Display label</label>
              <input id="at-label" value={atForm.label} onChange={(e) => setAtForm({ ...atForm, label: e.target.value })} placeholder="defaults to the stored value" className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" />
              <p className="text-[10px] text-stone-500 mt-1">Shown in the editor, the archive filter and the article kicker. Safe to change at any time.</p>
            </div>
            <div>
              <label htmlFor="at-desc" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Description</label>
              <textarea id="at-desc" rows={2} value={atForm.description} onChange={(e) => setAtForm({ ...atForm, description: e.target.value })} placeholder="When should an editor choose this type?" className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" />
            </div>
            <div><label htmlFor="at-order" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Sort order</label><input id="at-order" type="number" min={0} value={atForm.sortOrder} onChange={(e) => setAtForm({ ...atForm, sortOrder: e.target.value })} placeholder="append" className="w-24 p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
            {atModal === 'create' && (
              <>
                <label className="flex items-center gap-2 text-[11px] text-stone-700">
                  <input type="checkbox" checked={atForm.selectable} onChange={(e) => setAtForm({ ...atForm, selectable: e.target.checked })} />
                  Offer this type in the editor immediately
                </label>
                <p className="text-[10px] text-stone-500">
                  A new type starts <strong>not evergreen</strong> and classified <strong>Article</strong>.
                  Changing either is a separate, separately-permitted step from the list — so a new type
                  cannot be made to declare <code>NewsArticle</code> in one action.
                </p>
              </>
            )}
          </div>
        </AdminModal>
      )}

      {authModal && (
        <AdminModal isOpen onClose={() => setAuthModal(false)} title={authId ? 'Edit Author Byline' : 'Add Author Byline'}
          footerActions={<div className="flex gap-2"><button onClick={() => setAuthModal(false)} className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs">Cancel</button><button onClick={saveAuth} disabled={isPending} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save</button></div>}>
          <div className="space-y-3 text-xs font-sans">
            <div><label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Name</label><input value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
            <div><label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Role / Title</label><input value={authForm.role} onChange={(e) => setAuthForm({ ...authForm, role: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
            <div><label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Bio</label><textarea rows={2} value={authForm.bio} onChange={(e) => setAuthForm({ ...authForm, bio: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
            <div><label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Credentials</label><input value={authForm.credentials} onChange={(e) => setAuthForm({ ...authForm, credentials: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
          </div>
        </AdminModal>
      )}
    </div>
  );
};

export default AdminEditorialOrgPage;

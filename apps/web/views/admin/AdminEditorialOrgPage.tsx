'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminModal } from '../../components/admin/AdminModal';
import type { CategoryRow, TagRow, AuthorRow } from '../../lib/cms/taxonomyService';
import {
  createCategoryAction, updateCategoryAction, deleteCategoryAction,
  createTagAction, deleteTagAction,
  createAuthorAction, updateAuthorAction, deleteAuthorAction,
} from '../../app/admin/taxonomy-actions';

interface Props {
  categories: CategoryRow[]; tags: TagRow[]; authors: AuthorRow[];
  canTaxonomy: boolean; canAuthors: boolean;
}

export const AdminEditorialOrgPage: React.FC<Props> = ({ categories, tags, authors, canTaxonomy, canAuthors }) => {
  const router = useRouter();
  const [tab, setTab] = useState<'categories' | 'tags' | 'authors'>('categories');
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

  const [newTag, setNewTag] = useState('');

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Editorial Organization" description="Database-backed categories, tags and author bylines. The five primary sections are protected foundational records." />
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs">{notice}</div>}
      <AdminTabs tabs={[{ id: 'categories', label: 'Categories', count: categories.length }, { id: 'tags', label: 'Tags', count: tags.length }, { id: 'authors', label: 'Author Bylines', count: authors.length }]} activeTab={tab} onChange={(t) => setTab(t as typeof tab)} />

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
                {canTaxonomy && <button onClick={() => run(deleteTagAction(t.id), 'Tag deleted.')} className="text-stone-400 hover:text-rose-600">&times;</button>}
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

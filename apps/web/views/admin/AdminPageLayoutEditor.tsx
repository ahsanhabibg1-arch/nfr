'use client';

import React, { useState, useTransition, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { SectionSlot, PropDef, BlockCategory, SelectOption } from '@/lib/cms/sectionRegistry';
import { saveDraftAction, publishLayoutAction, resetDraftAction, restoreDefaultsAction, schedulePublishAction, cancelScheduleAction, listFeaturedCandidatesAction, resolveArticleDetailsAction, listRevisionsAction, restoreRevisionAction, type FeaturedPickerItem, type RevisionRow } from '@/app/admin/page-layout-actions';
import { MediaPickerModal, type SelectedMediaData } from '@/components/admin/editor/MediaPickerModal';

interface SectionDef {
  type: string;
  label: string;
  description?: string;
  category: BlockCategory;
  icon?: string;
  required?: boolean;
  maxInstances?: number;
  duplicatable?: boolean;
  defaultProps: Record<string, unknown>;
  editableProps: PropDef[];
}

interface LayoutRow {
  pageKey: string;
  draftSections: SectionSlot[];
  publishedAt: string | null;
  scheduledAt: string | null;
}

interface Props {
  layouts: LayoutRow[];
  registries: Record<string, SectionDef[]>;
  canManage: boolean;
  knownPageKeys: { key: string; label: string }[];
}

function resolveFamily(key: string): string {
  if (key === 'homepage') return 'homepage';
  if (key.startsWith('section:')) return 'section-landing';
  if (key.startsWith('template:')) return 'detail-template';
  if (key.startsWith('directory:')) return 'directory';
  return 'homepage';
}

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildDefaultSlotsFromRegistry(defs: SectionDef[]): SectionSlot[] {
  const seen = new Set<string>();
  return defs
    .filter((d) => { if (seen.has(d.type)) return false; seen.add(d.type); return true; })
    .map((d, i) => ({
      id: genId(),
      sectionType: d.type,
      visible: true,
      order: i,
      props: { ...d.defaultProps },
    }));
}

function effectiveSlots(layout: LayoutRow | undefined, registry: SectionDef[]): SectionSlot[] {
  if (layout && Array.isArray(layout.draftSections) && layout.draftSections.length > 0) {
    return layout.draftSections.map((s) => ({ ...s, id: s.id || genId() }));
  }
  return buildDefaultSlotsFromRegistry(registry);
}

function getUniqueBlockTypes(defs: SectionDef[]): SectionDef[] {
  const seen = new Set<string>();
  return defs.filter((d) => { if (seen.has(d.type)) return false; seen.add(d.type); return true; });
}

function countInstances(slots: SectionSlot[], type: string): number {
  return slots.filter((s) => s.sectionType === type).length;
}

const CATEGORY_LABELS: Record<BlockCategory, string> = {
  hero: 'Hero',
  content: 'Content',
  editorial: 'Editorial',
  rodeo: 'Rodeo',
  directory: 'Directory',
  cta: 'Call to Action',
  info: 'Information',
  layout: 'Layout',
  media: 'Media',
};

const CATEGORY_ORDER: BlockCategory[] = ['hero', 'editorial', 'content', 'rodeo', 'info', 'cta', 'directory', 'media', 'layout'];

type PropTab = 'content' | 'style' | 'layout' | 'advanced' | 'seo';
const PROP_TABS: { id: PropTab; label: string }[] = [
  { id: 'content', label: 'Content' },
  { id: 'style', label: 'Style' },
  { id: 'layout', label: 'Layout' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'seo', label: 'SEO' },
];

const FeaturedPickerLoader: React.FC<{
  ids: string[];
  loadRecent: () => void;
  resolveArticles: (ids: string[]) => void;
  children: React.ReactNode;
}> = ({ ids, loadRecent, resolveArticles, children }) => {
  useEffect(() => { loadRecent(); }, [loadRecent]);
  useEffect(() => { if (ids.length) resolveArticles(ids); }, [ids.join(','), resolveArticles]);
  return <>{children}</>;
};

export const AdminPageLayoutEditor: React.FC<Props> = ({ layouts, registries, canManage, knownPageKeys }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ text: string; type: 'ok' | 'error' } | null>(null);
  const flash = (text: string, type: 'ok' | 'error' = 'ok') => { setNotice({ text, type }); setTimeout(() => setNotice(null), 6000); };

  const [activeKey, setActiveKey] = useState<string>(knownPageKeys[0]?.key ?? 'homepage');
  const layout = layouts.find((l) => l.pageKey === activeKey);
  const familyKey = resolveFamily(activeKey);
  const registry = registries[familyKey] ?? [];
  const uniqueBlocks = getUniqueBlockTypes(registry);
  const initialSlots = effectiveSlots(layout, registry);
  const [slots, setSlots] = useState<SectionSlot[]>(initialSlots);
  const [dirty, setDirty] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const savedRef = useRef(JSON.stringify(layout?.draftSections ?? []));
  const [mediaPicker, setMediaPicker] = useState<{ blockId: string; propKey: string } | null>(null);
  const [featuredSearch, setFeaturedSearch] = useState('');
  const [featuredResults, setFeaturedResults] = useState<FeaturedPickerItem[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [featuredRecent, setFeaturedRecent] = useState<FeaturedPickerItem[]>([]);
  const [featuredRecentLoaded, setFeaturedRecentLoaded] = useState(false);
  const [resolvedArticles, setResolvedArticles] = useState<Map<string, FeaturedPickerItem>>(new Map());
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addCategoryFilter, setAddCategoryFilter] = useState<BlockCategory | 'all'>('all');
  const [propTab, setPropTab] = useState<PropTab>('content');
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragItemId = useRef<string | null>(null);

  const selectedSlot = slots.find((s) => s.id === selectedBlockId);
  const selectedDef = selectedSlot ? uniqueBlocks.find((d) => d.type === selectedSlot.sectionType) ?? registry.find((d) => d.type === selectedSlot.sectionType) : null;

  const searchFeatured = async (q: string) => {
    setFeaturedLoading(true);
    const r = await listFeaturedCandidatesAction(q, 'article');
    if (r.ok) setFeaturedResults(r.items);
    setFeaturedLoading(false);
  };

  const loadRecentArticles = useCallback(async () => {
    if (featuredRecentLoaded) return;
    setFeaturedRecentLoaded(true);
    const r = await listFeaturedCandidatesAction('', 'article');
    if (r.ok) setFeaturedRecent(r.items);
  }, [featuredRecentLoaded]);

  const resolveSelectedArticles = useCallback(async (ids: string[]) => {
    const missing = ids.filter((id) => !resolvedArticles.has(id));
    if (!missing.length) return;
    const r = await resolveArticleDetailsAction(missing);
    if (r.ok) {
      setResolvedArticles((prev) => {
        const next = new Map(prev);
        for (const item of r.items) next.set(item.id, item);
        return next;
      });
    }
  }, [resolvedArticles]);

  const updateSlots = useCallback((fn: (prev: SectionSlot[]) => SectionSlot[]) => {
    setSlots((prev) => {
      const next = fn(prev);
      setDirty(JSON.stringify(next) !== savedRef.current);
      return next;
    });
  }, []);

  const selectPage = (key: string) => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setActiveKey(key);
    const l = layouts.find((x) => x.pageKey === key);
    const fk = resolveFamily(key);
    const reg = registries[fk] ?? [];
    const s = effectiveSlots(l, reg);
    setSlots(s);
    savedRef.current = JSON.stringify(l?.draftSections ?? []);
    setDirty(!l || !l.draftSections.length);
    setSelectedBlockId(null);
    setShowAddPanel(false);
  };

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /* ── Block management ────────────────────────────────────────── */

  const addBlock = (def: SectionDef) => {
    if (def.maxInstances && countInstances(slots, def.type) >= def.maxInstances) {
      flash(`Maximum ${def.maxInstances} instance(s) of "${def.label}" allowed.`, 'error');
      return;
    }
    const newSlot: SectionSlot = {
      id: genId(),
      sectionType: def.type,
      visible: true,
      order: slots.length,
      props: { ...def.defaultProps },
    };
    updateSlots((prev) => [...prev, newSlot].map((s, i) => ({ ...s, order: i })));
    setSelectedBlockId(newSlot.id);
    setShowAddPanel(false);
    flash(`Added "${def.label}".`);
  };

  const duplicateBlock = (blockId: string) => {
    const slot = slots.find((s) => s.id === blockId);
    if (!slot) return;
    const def = uniqueBlocks.find((d) => d.type === slot.sectionType);
    if (!def?.duplicatable) { flash('This block cannot be duplicated.', 'error'); return; }
    if (def.maxInstances && countInstances(slots, slot.sectionType) >= def.maxInstances) {
      flash(`Maximum ${def.maxInstances} instance(s) of "${def.label}" reached.`, 'error');
      return;
    }
    const idx = slots.findIndex((s) => s.id === blockId);
    const copy: SectionSlot = { ...slot, id: genId(), props: { ...slot.props } };
    updateSlots((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next.map((s, i) => ({ ...s, order: i }));
    });
    setSelectedBlockId(copy.id);
    flash(`Duplicated "${def.label}".`);
  };

  const removeBlock = (blockId: string) => {
    const slot = slots.find((s) => s.id === blockId);
    if (!slot) return;
    const def = uniqueBlocks.find((d) => d.type === slot.sectionType);
    if (def?.required) { flash('Required blocks cannot be removed.', 'error'); return; }
    if (!window.confirm(`Remove "${def?.label ?? slot.sectionType}"? This cannot be undone.`)) return;
    updateSlots((prev) => prev.filter((s) => s.id !== blockId).map((s, i) => ({ ...s, order: i })));
    if (selectedBlockId === blockId) setSelectedBlockId(null);
    flash('Block removed.');
  };

  const toggleVisible = (blockId: string) => {
    const slot = slots.find((s) => s.id === blockId);
    if (!slot) return;
    const def = uniqueBlocks.find((d) => d.type === slot.sectionType);
    if (def?.required) { flash('Required blocks cannot be hidden.', 'error'); return; }
    updateSlots((prev) => prev.map((s) => s.id === blockId ? { ...s, visible: !s.visible } : s));
  };

  const moveBlock = (blockId: string, direction: 'up' | 'down') => {
    const idx = slots.findIndex((s) => s.id === blockId);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx >= slots.length - 1) return;
    updateSlots((prev) => {
      const next = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  };

  /* ── Drag and drop ───────────────────────────────────────────── */

  const handleDragStart = (e: React.DragEvent, blockId: string) => {
    dragItemId.current = blockId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', blockId);
  };

  const handleDragOver = (e: React.DragEvent, blockId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== blockId) setDragOverId(blockId);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const fromId = dragItemId.current;
    if (!fromId || fromId === targetId) return;
    updateSlots((prev) => {
      const fromIdx = prev.findIndex((s) => s.id === fromId);
      const toIdx = prev.findIndex((s) => s.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next.map((s, i) => ({ ...s, order: i }));
    });
    dragItemId.current = null;
  };

  const handleDragEnd = () => { setDragOverId(null); dragItemId.current = null; };

  /* ── Prop updates ────────────────────────────────────────────── */

  const updateProp = (blockId: string, key: string, value: string | number | boolean) => {
    updateSlots((prev) => prev.map((s) =>
      s.id === blockId ? { ...s, props: { ...s.props, [key]: value } } : s,
    ));
  };

  /* ── Actions ─────────────────────────────────────────────────── */

  const saveDraft = () => startTransition(async () => {
    const r = await saveDraftAction(activeKey, slots);
    if (r.ok) {
      savedRef.current = JSON.stringify(slots);
      setDirty(false);
      flash('Draft saved.');
      router.refresh();
    } else flash(r.error || 'Error saving draft.', 'error');
  });

  const publish = () => {
    if (!window.confirm('Publish this layout? It will immediately affect the public website.')) return;
    startTransition(async () => {
      const r = await publishLayoutAction(activeKey);
      flash(r.ok ? 'Published — live on the public site.' : r.error || 'Error', r.ok ? 'ok' : 'error');
      if (r.ok) router.refresh();
    });
  };

  const resetDraft = () => {
    if (!window.confirm('Reset the draft to the currently published version?')) return;
    startTransition(async () => {
      const r = await resetDraftAction(activeKey);
      if (r.ok) { flash('Draft reset to published version.'); router.refresh(); }
      else flash(r.error || 'Error', 'error');
    });
  };

  const restoreDefaults = () => {
    if (!window.confirm('Restore all sections to factory defaults?')) return;
    startTransition(async () => {
      const r = await restoreDefaultsAction(activeKey);
      if (r.ok) { flash('Defaults restored.'); router.refresh(); }
      else flash(r.error || 'Error', 'error');
    });
  };

  /* ── Scheduling ──────────────────────────────────────────────── */

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleInput, setScheduleInput] = useState('');

  const openScheduleModal = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 60 - now.getTimezoneOffset() % 60);
    const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setScheduleInput(layout?.scheduledAt ? new Date(new Date(layout.scheduledAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : iso);
    setShowScheduleModal(true);
  };

  const confirmSchedule = () => {
    const dt = new Date(scheduleInput);
    if (isNaN(dt.getTime()) || dt.getTime() <= Date.now()) { flash('Please select a future date and time.', 'error'); return; }
    setShowScheduleModal(false);
    startTransition(async () => {
      const r = await schedulePublishAction(activeKey, dt.toISOString());
      flash(r.ok ? `Scheduled for ${dt.toLocaleString()}.` : r.error || 'Error scheduling.', r.ok ? 'ok' : 'error');
      if (r.ok) router.refresh();
    });
  };

  const cancelScheduleHandler = () => {
    if (!window.confirm('Cancel the scheduled publication? The current public layout will remain unchanged.')) return;
    startTransition(async () => {
      const r = await cancelScheduleAction(activeKey);
      flash(r.ok ? 'Schedule cancelled.' : r.error || 'Error', r.ok ? 'ok' : 'error');
      if (r.ok) router.refresh();
    });
  };

  /* ── Revision History ─────────────────────────────────────────── */

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [confirmRestoreRevId, setConfirmRestoreRevId] = useState<string | null>(null);

  const openHistory = async () => {
    setShowHistoryModal(true);
    setRevisionsLoading(true);
    setConfirmRestoreRevId(null);
    const r = await listRevisionsAction(activeKey);
    if (r.ok) setRevisions(r.revisions);
    else flash(r.error || 'Failed to load revisions.', 'error');
    setRevisionsLoading(false);
  };

  const confirmRestore = (revId: string) => setConfirmRestoreRevId(revId);

  const executeRestore = (revId: string) => {
    setShowHistoryModal(false);
    setConfirmRestoreRevId(null);
    startTransition(async () => {
      const r = await restoreRevisionAction(activeKey, revId);
      if (r.ok) {
        flash('Revision restored to draft. Review and publish when ready.');
        router.refresh();
      } else flash(r.error || 'Failed to restore revision.', 'error');
    });
  };

  const onMediaSelect = (media: SelectedMediaData) => {
    if (!mediaPicker) return;
    updateProp(mediaPicker.blockId, mediaPicker.propKey, media.url);
    if (media.altText) updateProp(mediaPicker.blockId, mediaPicker.propKey.replace(/Url$|$/, 'Alt'), media.altText);
    if (media.credit) updateProp(mediaPicker.blockId, mediaPicker.propKey.replace(/Url$|$/, 'Credit'), media.credit);
    setMediaPicker(null);
  };

  /* ── Render prop field ───────────────────────────────────────── */

  const renderPropField = (blockId: string, prop: PropDef) => {
    const slot = slots.find((s) => s.id === blockId);
    if (!slot) return null;
    const val = slot.props[prop.key];
    const strVal = val === undefined || val === null ? '' : String(val);

    if (prop.type === 'number') {
      return (
        <div key={prop.key} className="space-y-1">
          <label className="text-[10px] font-mono uppercase text-stone-500">{prop.label}</label>
          <input type="number" value={strVal} min={0} max={prop.max ?? 99}
            onChange={(e) => updateProp(blockId, prop.key, Number(e.target.value))}
            className="w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs" />
          {prop.helpText && <p className="text-[10px] text-stone-400">{prop.helpText}</p>}
        </div>
      );
    }

    if (prop.type === 'boolean') {
      return (
        <div key={prop.key} className="flex items-center gap-2">
          <input type="checkbox" checked={!!val} onChange={(e) => updateProp(blockId, prop.key, e.target.checked)}
            className="rounded border-stone-300" />
          <label className="text-xs text-stone-700">{prop.label}</label>
        </div>
      );
    }

    if (prop.type === 'select') {
      return (
        <div key={prop.key} className="space-y-1">
          <label className="text-[10px] font-mono uppercase text-stone-500">{prop.label}</label>
          <select value={strVal} onChange={(e) => updateProp(blockId, prop.key, e.target.value)}
            className="w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs">
            {(prop.options ?? []).map((opt: SelectOption) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );
    }

    if (prop.type === 'textarea' || prop.type === 'richtext') {
      return (
        <div key={prop.key} className="space-y-1">
          <label className="text-[10px] font-mono uppercase text-stone-500">{prop.label}</label>
          <textarea value={strVal} rows={3}
            onChange={(e) => updateProp(blockId, prop.key, e.target.value)}
            className="w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs resize-y" />
        </div>
      );
    }

    if (prop.type === 'featured') {
      const ids = typeof strVal === 'string' && strVal.length > 0 ? strVal.split(',').filter(Boolean) : [];
      const addArticle = (id: string) => {
        updateProp(blockId, prop.key, [...ids, id].join(','));
        setFeaturedResults([]);
        setFeaturedSearch('');
      };
      const removeArticle = (i: number) => {
        updateProp(blockId, prop.key, ids.filter((_, j) => j !== i).join(','));
      };
      const moveUp = (i: number) => {
        const next = [...ids]; [next[i - 1], next[i]] = [next[i], next[i - 1]];
        updateProp(blockId, prop.key, next.join(','));
      };
      const candidateList = featuredSearch.trim() ? featuredResults : featuredRecent;
      const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      return (
        <FeaturedPickerLoader ids={ids} loadRecent={loadRecentArticles} resolveArticles={resolveSelectedArticles}>
          <div key={prop.key} className="space-y-2">
            <label className="text-[10px] font-mono uppercase text-stone-500">{prop.label}</label>
            {prop.helpText && <p className="text-[10px] text-stone-400">{prop.helpText}</p>}
            {/* ── Selected articles (rich cards) ── */}
            {ids.length > 0 && (
              <div className="space-y-1.5">
                {ids.map((id, i) => {
                  const info = resolvedArticles.get(id);
                  return (
                    <div key={id} className="flex items-start gap-2 bg-stone-50 border border-stone-200 rounded p-2 group">
                      {info?.imageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={info.imageUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-stone-800 truncate">{info?.title ?? id.slice(0, 12) + '…'}</div>
                        {info?.publishedAt && <div className="text-[9px] text-stone-400">{fmtDate(info.publishedAt)}</div>}
                      </div>
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 flex-shrink-0">
                        {i > 0 && <button type="button" onClick={() => moveUp(i)} className="text-stone-400 hover:text-stone-700 text-[11px]" title="Move up">&uarr;</button>}
                        <button type="button" onClick={() => removeArticle(i)} className="text-rose-500 hover:text-rose-700 text-[11px]" title="Remove">&times;</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* ── Search bar ── */}
            <div className="flex items-center gap-2">
              <input type="text" value={featuredSearch}
                onChange={(e) => { setFeaturedSearch(e.target.value); if (!e.target.value.trim()) setFeaturedResults([]); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchFeatured(featuredSearch); } }}
                placeholder="Search or pick from recent…" className="flex-1 p-1.5 bg-stone-50 border border-stone-200 rounded text-xs" />
              {featuredSearch.trim() && (
                <button type="button" onClick={() => searchFeatured(featuredSearch)} disabled={featuredLoading}
                  className="px-2 py-1.5 border border-stone-300 rounded text-[10px]">{featuredLoading ? '…' : 'Search'}</button>
              )}
            </div>
            {/* ── Candidate list (search results or recent) ── */}
            {candidateList.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-stone-200 rounded bg-white">
                <div className="px-2 py-1 text-[9px] font-mono uppercase text-stone-400 bg-stone-50 border-b border-stone-100 sticky top-0">
                  {featuredSearch.trim() ? 'Search results' : 'Recent articles — click to add'}
                </div>
                {candidateList.filter((r) => !ids.includes(r.id)).map((r) => (
                  <button key={r.id} type="button" onClick={() => addArticle(r.id)}
                    className="w-full text-left px-2 py-1.5 hover:bg-amber-50/50 flex items-center gap-2 border-b border-stone-50 last:border-0 transition-colors">
                    {r.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={r.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded bg-stone-100 flex items-center justify-center text-[9px] text-stone-400 flex-shrink-0">No img</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-stone-800 truncate">{r.title}</div>
                      <div className="text-[9px] text-stone-400 truncate">{fmtDate(r.publishedAt)}{r.excerpt ? ` · ${r.excerpt}` : ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </FeaturedPickerLoader>
      );
    }

    if (prop.type === 'image') {
      return (
        <div key={prop.key} className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase text-stone-500">{prop.label}</label>
          {strVal ? (
            <div className="relative group rounded border border-stone-200 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={strVal} alt="Preview" className="w-full h-24 object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button type="button" onClick={() => setMediaPicker({ blockId, propKey: prop.key })}
                  className="px-2.5 py-1 bg-white text-stone-800 text-[10px] font-semibold rounded shadow">Change</button>
                <button type="button" onClick={() => updateProp(blockId, prop.key, '')}
                  className="px-2.5 py-1 bg-rose-600 text-white text-[10px] font-semibold rounded shadow">Remove</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setMediaPicker({ blockId, propKey: prop.key })}
              className="w-full h-16 border-2 border-dashed border-stone-200 rounded flex items-center justify-center gap-2 text-stone-400 hover:border-[#D4A757] hover:text-[#D4A757] transition-colors">
              <span className="text-lg">+</span>
              <span className="text-[11px]">Select Image</span>
            </button>
          )}
          {prop.helpText && <p className="text-[10px] text-stone-400">{prop.helpText}</p>}
        </div>
      );
    }

    if (prop.type === 'color') {
      return (
        <div key={prop.key} className="space-y-1">
          <label className="text-[10px] font-mono uppercase text-stone-500">{prop.label}</label>
          <input type="color" value={strVal || '#000000'} onChange={(e) => updateProp(blockId, prop.key, e.target.value)}
            className="w-10 h-8 rounded border border-stone-200 cursor-pointer" />
        </div>
      );
    }

    return (
      <div key={prop.key} className="space-y-1">
        <label className="text-[10px] font-mono uppercase text-stone-500">{prop.label}</label>
        <input type={prop.type === 'url' ? 'url' : 'text'} value={strVal}
          placeholder={prop.type === 'url' ? 'https://... or /path/' : ''}
          onChange={(e) => updateProp(blockId, prop.key, e.target.value)}
          className="w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs" />
      </div>
    );
  };

  /* ── Available categories for the add panel ──────────────────── */
  const categoriesInFamily = (() => {
    const cats = new Set<BlockCategory>();
    for (const d of uniqueBlocks) cats.add(d.category);
    return CATEGORY_ORDER.filter((c) => cats.has(c));
  })();

  const filteredAddBlocks = addCategoryFilter === 'all'
    ? uniqueBlocks
    : uniqueBlocks.filter((d) => d.category === addCategoryFilter);

  /* ── Props grouped by tab ────────────────────────────────────── */
  const propsForTab = (tab: PropTab): PropDef[] => {
    if (!selectedDef) return [];
    if (tab === 'content') {
      return selectedDef.editableProps.filter((p) => !p.tab || p.tab === 'content');
    }
    return selectedDef.editableProps.filter((p) => p.tab === tab);
  };

  const tabsWithContent = PROP_TABS.filter((t) => propsForTab(t.id).length > 0);

  /* ── Render ──────────────────────────────────────────────────── */

  return (
    <div className="space-y-3">
      {notice && (
        <div className={`p-3 text-xs rounded border ${notice.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {notice.text}
        </div>
      )}
      {!canManage && <div className="p-3 bg-stone-50 border border-stone-200 text-stone-600 text-xs rounded">Read-only. Managing page layouts requires <code>system.config</code>.</div>}

      {/* ── Top bar: page selector + actions ─────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-[10px] font-mono uppercase text-stone-500">Page</label>
        <select value={activeKey} onChange={(e) => selectPage(e.target.value)} className="p-1.5 bg-stone-50 border border-stone-200 rounded text-xs">
          {knownPageKeys.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        {layout?.publishedAt && <span className="text-[10px] text-emerald-600">Published: {new Date(layout.publishedAt).toLocaleDateString()}</span>}
        {layout?.scheduledAt && <span className="text-[10px] text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded">Scheduled: {new Date(layout.scheduledAt).toLocaleString()}</span>}
        {!layout && <span className="text-[10px] text-sky-600">Showing defaults — save draft to persist</span>}
        {layout && !layout.publishedAt && !layout.scheduledAt && <span className="text-[10px] text-amber-600">Draft saved — not yet published</span>}
        {dirty && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">Unsaved changes</span>}
      </div>

      {/* ── Three-panel builder ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 min-h-[500px]">

        {/* ── Left: Canvas (block list) ─────────────────────────── */}
        <div className="bg-white border border-stone-200 rounded overflow-hidden">
          <div className="bg-stone-50 px-4 py-2 border-b border-stone-200 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">Page Canvas</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-stone-400">{slots.length} blocks</span>
              {canManage && (
                <button onClick={() => { setShowAddPanel(!showAddPanel); setSelectedBlockId(null); }}
                  className="px-2.5 py-1 bg-[#0F1115] text-[#D4A757] text-[10px] font-semibold rounded">
                  + Add Section
                </button>
              )}
            </div>
          </div>

          {/* ── Add Section panel (overlay) ─────────────────────── */}
          {showAddPanel && canManage && (
            <div className="border-b border-stone-200 bg-stone-50/80 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-stone-800">Add a Block</h4>
                <button onClick={() => setShowAddPanel(false)} className="text-stone-400 hover:text-stone-600 text-xs">Close</button>
              </div>
              <div className="flex gap-1 mb-3 flex-wrap">
                <button onClick={() => setAddCategoryFilter('all')}
                  className={`px-2 py-0.5 text-[10px] rounded border ${addCategoryFilter === 'all' ? 'bg-[#0F1115] text-[#D4A757] border-[#0F1115]' : 'border-stone-300 text-stone-600 hover:bg-stone-100'}`}>
                  All
                </button>
                {categoriesInFamily.map((cat) => (
                  <button key={cat} onClick={() => setAddCategoryFilter(cat)}
                    className={`px-2 py-0.5 text-[10px] rounded border ${addCategoryFilter === cat ? 'bg-[#0F1115] text-[#D4A757] border-[#0F1115]' : 'border-stone-300 text-stone-600 hover:bg-stone-100'}`}>
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredAddBlocks.map((def) => {
                  const atLimit = def.maxInstances ? countInstances(slots, def.type) >= def.maxInstances : false;
                  return (
                    <button key={def.type} onClick={() => !atLimit && addBlock(def)} disabled={atLimit}
                      className={`p-3 rounded border text-left transition-colors ${atLimit ? 'opacity-40 cursor-not-allowed border-stone-200 bg-stone-50' : 'border-stone-200 bg-white hover:border-[#D4A757] hover:bg-amber-50/30'}`}>
                      <div className="text-xs font-semibold text-stone-800 truncate">{def.label}</div>
                      {def.description && <div className="text-[10px] text-stone-500 mt-0.5 line-clamp-2">{def.description}</div>}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] font-mono text-stone-400 uppercase bg-stone-100 px-1 rounded">{def.category}</span>
                        {def.maxInstances && (
                          <span className="text-[9px] text-stone-400">{countInstances(slots, def.type)}/{def.maxInstances}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Block list (canvas) ─────────────────────────────── */}
          <div className="divide-y divide-stone-100">
            {slots.length === 0 && (
              <div className="py-8 px-4 text-stone-400 text-center text-xs">No blocks. Click &ldquo;Add Section&rdquo; or &ldquo;Restore Defaults&rdquo; to get started.</div>
            )}
            {slots.map((slot, idx) => {
              const def = uniqueBlocks.find((d) => d.type === slot.sectionType) ?? registry.find((d) => d.type === slot.sectionType);
              const isSelected = slot.id === selectedBlockId;
              const isDragOver = slot.id === dragOverId;
              return (
                <div
                  key={slot.id}
                  draggable={canManage}
                  onDragStart={(e) => handleDragStart(e, slot.id)}
                  onDragOver={(e) => handleDragOver(e, slot.id)}
                  onDrop={(e) => handleDrop(e, slot.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => { if (canManage) { setSelectedBlockId(isSelected ? null : slot.id); setShowAddPanel(false); setPropTab('content'); } }}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all select-none
                    ${!slot.visible ? 'opacity-40' : ''}
                    ${isSelected ? 'bg-amber-50 border-l-2 border-l-[#D4A757]' : 'hover:bg-stone-50/60 border-l-2 border-l-transparent'}
                    ${isDragOver ? 'bg-sky-50 border-t-2 border-t-sky-400' : ''}`}
                >
                  {canManage && (
                    <span className="text-stone-300 cursor-grab text-xs" title="Drag to reorder">&#x2807;</span>
                  )}
                  <span className="text-[10px] font-mono text-stone-400 w-5">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-stone-900 truncate">{def?.label ?? slot.sectionType}</span>
                      {def?.required && <span className="text-[8px] font-mono text-sky-700 bg-sky-50 border border-sky-200 px-1 rounded">REQ</span>}
                      {def?.duplicatable && <span className="text-[8px] font-mono text-violet-600 bg-violet-50 border border-violet-200 px-1 rounded">DUP</span>}
                    </div>
                    {def?.description && <div className="text-[10px] text-stone-400 truncate">{def.description}</div>}
                  </div>
                  <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${slot.visible ? 'text-emerald-700 bg-emerald-50' : 'text-stone-400 bg-stone-100'}`}>
                    {slot.visible ? 'Visible' : 'Hidden'}
                  </span>
                  {canManage && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => moveBlock(slot.id, 'up')} disabled={idx === 0} className="text-stone-400 hover:text-stone-700 text-[11px] disabled:opacity-20" title="Move up">&uarr;</button>
                      <button onClick={() => moveBlock(slot.id, 'down')} disabled={idx === slots.length - 1} className="text-stone-400 hover:text-stone-700 text-[11px] disabled:opacity-20" title="Move down">&darr;</button>
                      <button onClick={() => toggleVisible(slot.id)} className="text-stone-400 hover:text-stone-700 text-[10px]" title={slot.visible ? 'Hide' : 'Show'}>
                        {slot.visible ? '◉' : '◎'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: Properties panel ───────────────────────────── */}
        <div className="bg-white border border-stone-200 rounded overflow-hidden flex flex-col">
          <div className="bg-stone-50 px-4 py-2 border-b border-stone-200 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">Properties</h3>
            {selectedSlot && <span className="text-[9px] text-stone-400">{selectedSlot.id.slice(0, 8)}</span>}
          </div>
          {!selectedSlot && (
            <div className="p-6 text-center">
              <div className="text-stone-300 text-2xl mb-2">&#9998;</div>
              <div className="text-xs text-stone-400">Click a block to edit</div>
            </div>
          )}
          {selectedSlot && selectedDef && canManage && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Compact block header */}
              <div className="px-4 py-2.5 border-b border-stone-100 bg-gradient-to-r from-stone-50/50 to-white">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-stone-900">{selectedDef.label}</span>
                  <span className="text-[8px] font-mono uppercase bg-stone-100 text-stone-500 px-1 rounded">{selectedDef.category}</span>
                </div>
                {selectedDef.description && <div className="text-[10px] text-stone-400 mt-0.5 line-clamp-1">{selectedDef.description}</div>}
                <div className="flex items-center gap-3 mt-1.5">
                  {selectedDef.duplicatable && (
                    <button onClick={() => duplicateBlock(selectedSlot.id)}
                      className="text-[10px] text-violet-600 hover:underline">Duplicate</button>
                  )}
                  {!selectedDef.required && (
                    <button onClick={() => removeBlock(selectedSlot.id)}
                      className="text-[10px] text-rose-600 hover:underline">Remove</button>
                  )}
                  <button onClick={() => toggleVisible(selectedSlot.id)}
                    className={`text-[10px] ${selectedSlot.visible ? 'text-emerald-600' : 'text-stone-400'} hover:underline`}>
                    {selectedSlot.visible ? 'Visible' : 'Hidden'}
                  </button>
                </div>
              </div>

              {/* Tab bar */}
              {tabsWithContent.length > 1 && (
                <div className="flex border-b border-stone-100 px-3 bg-stone-50/30">
                  {tabsWithContent.map((t) => (
                    <button key={t.id} onClick={() => setPropTab(t.id)}
                      className={`px-2.5 py-1.5 text-[10px] font-semibold border-b-2 transition-colors ${propTab === t.id ? 'border-[#D4A757] text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-600'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Props for active tab */}
              <div className="px-4 py-3 space-y-3 overflow-y-auto flex-1">
                {propsForTab(propTab).length === 0 && (
                  <div className="text-[10px] text-stone-400 italic">No editable properties on this tab.</div>
                )}
                {propsForTab(propTab).map((p) => renderPropField(selectedSlot.id, p))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Action buttons ──────────────────────────────────────── */}
      {canManage && (
        <div className="flex items-center gap-3 pt-1 flex-wrap">
          <button onClick={saveDraft} disabled={isPending || !dirty} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded disabled:opacity-50">Save Draft</button>
          <button onClick={publish} disabled={isPending || !layout} className="px-3.5 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded disabled:opacity-50">Publish</button>
          <button onClick={openScheduleModal} disabled={isPending || !layout} className="px-3.5 py-1.5 bg-violet-700 text-white text-xs font-semibold rounded disabled:opacity-50">{layout?.scheduledAt ? 'Reschedule' : 'Schedule'}</button>
          {layout?.scheduledAt && <button onClick={cancelScheduleHandler} disabled={isPending} className="text-xs text-violet-600 hover:underline">Cancel schedule</button>}
          <a href={`/admin/website/preview?pageKey=${encodeURIComponent(activeKey)}`} target="_blank" rel="noopener noreferrer"
            className={`px-3.5 py-1.5 border border-stone-300 text-xs font-semibold rounded text-stone-700 hover:bg-stone-50 ${!layout ? 'pointer-events-none opacity-30' : ''}`}>
            Preview Draft
          </a>
          <button onClick={openHistory} disabled={isPending || !layout} className="px-3.5 py-1.5 border border-stone-300 text-xs font-semibold rounded text-stone-700 hover:bg-stone-50 disabled:opacity-30">History</button>
          <button onClick={resetDraft} disabled={isPending || !layout?.publishedAt} className="text-xs text-stone-500 hover:underline disabled:opacity-30">Reset to published</button>
          <button onClick={restoreDefaults} disabled={isPending} className="text-xs text-amber-700 hover:underline">Restore defaults</button>
        </div>
      )}

      <p className="text-[11px] text-stone-400">Click a block to edit properties. Drag blocks to reorder. Use &ldquo;Add Section&rdquo; to insert new blocks.</p>
      {mediaPicker && (
        <MediaPickerModal
          isOpen={!!mediaPicker}
          onClose={() => setMediaPicker(null)}
          onSelect={onMediaSelect}
        />
      )}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowHistoryModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">Revision History</h3>
              <button onClick={() => setShowHistoryModal(false)} className="text-stone-400 hover:text-stone-600 text-xs">Close</button>
            </div>
            <p className="text-xs text-stone-500">Each publish creates a snapshot. Restoring replaces the current draft — review and publish manually.</p>
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded">
              {revisionsLoading && <div className="p-6 text-center text-xs text-stone-400">Loading...</div>}
              {!revisionsLoading && revisions.length === 0 && <div className="p-6 text-center text-xs text-stone-400">No revisions yet. Publish this layout to create the first revision.</div>}
              {!revisionsLoading && revisions.map((r) => (
                <div key={r.id} className="px-4 py-3 hover:bg-stone-50/60 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-900">Revision #{r.revisionNo}</span>
                    <span className="text-[10px] font-mono text-stone-400">{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="text-[11px] text-stone-600 mt-0.5">{r.actorName} &middot; {r.summary}</div>
                  {confirmRestoreRevId === r.id ? (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs space-y-2">
                      <p className="text-amber-800">Restore revision #{r.revisionNo}? This will replace the current draft. You can review and publish it manually.</p>
                      <div className="flex items-center gap-2">
                        <button onClick={() => executeRestore(r.id)} className="px-3 py-1 bg-[#0F1115] text-[#D4A757] text-[10px] font-semibold rounded">Yes, Restore</button>
                        <button onClick={() => setConfirmRestoreRevId(null)} className="text-[10px] text-stone-500 hover:underline">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => confirmRestore(r.id)} className="mt-1.5 text-[10px] text-[#D4A757] hover:underline">Restore this revision</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowScheduleModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-stone-900">Schedule Publication</h3>
            <p className="text-xs text-stone-500">The current draft will be snapshotted and published automatically at the selected time.</p>
            <div>
              <label className="text-[10px] font-mono uppercase text-stone-500 block mb-1">Publish at</label>
              <input type="datetime-local" value={scheduleInput} onChange={(e) => setScheduleInput(e.target.value)}
                className="w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs" />
            </div>
            {layout?.scheduledAt && (
              <p className="text-[10px] text-violet-600">Currently scheduled: {new Date(layout.scheduledAt).toLocaleString()}</p>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button onClick={confirmSchedule} disabled={isPending} className="px-4 py-1.5 bg-violet-700 text-white text-xs font-semibold rounded disabled:opacity-50">
                {layout?.scheduledAt ? 'Update Schedule' : 'Schedule'}
              </button>
              <button onClick={() => setShowScheduleModal(false)} className="text-xs text-stone-500 hover:underline">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPageLayoutEditor;

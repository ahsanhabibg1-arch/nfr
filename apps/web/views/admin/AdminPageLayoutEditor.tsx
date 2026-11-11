'use client';

import React, { useState, useTransition, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { SectionSlot, PropDef, BlockCategory, SelectOption } from '@/lib/cms/sectionRegistry';
import { resolveMaxInstances, defaultSlotId } from '@/lib/cms/sectionRegistry';
import { SimplePropField, PropFieldShell, unmetDependency, propFieldIds, describedBy } from './PropField';
import { saveDraftAction, publishLayoutAction, resetDraftAction, restoreDefaultsAction, schedulePublishAction, cancelScheduleAction, listFeaturedCandidatesAction, resolveArticleDetailsAction, listRevisionsAction, restoreRevisionAction, type FeaturedPickerItem, type RevisionRow } from '@/app/admin/page-layout-actions';
import { MediaPickerModal, type SelectedMediaData } from '@/components/admin/editor/MediaPickerModal';
import { BuilderCanvas, canvasTokenAfterSave, type DeviceMode } from './BuilderCanvas';
import {
  getPageCapability, classifyBlockSupport, BLOCK_SUPPORT_LABELS, BLOCK_SUPPORT_HELP,
  PAGE_COMPOSITION_LABELS, type BlockSupport,
} from '@/lib/cms/pageCapability';
import { describeContentSource } from '@/lib/cms/contentSourceSummary';

interface SectionDef {
  type: string;
  label: string;
  description?: string;
  category: BlockCategory;
  icon?: string;
  required?: boolean;
  maxInstances?: number;
  duplicatable?: boolean;
  /**
   * Stage 06: previously absent from this interface, and absent from the server
   * payload that fills it, so the editor could not tell a retired block from a
   * live one — see the comment on `addableBlockTypes` below.
   */
  retired?: boolean;
  /** Stage 07: per-family instance caps, so the shown cap is the enforced one. */
  familyLimits?: Record<string, number>;
  /** Stage 07: families where the block is offered but not seeded into defaults. */
  excludeFromDefaultsIn?: string[];
  /** Stage 07 Task F: content comes from authoritative CMS queries, not slot props. */
  systemContent?: boolean;
  /** Stage 07: which owner decision retired this block. */
  retiredBy?: string;
  defaultProps: Record<string, unknown>;
  editableProps: PropDef[];
}

/** Badge colours per support level — keyed off the shared classification. */
const SUPPORT_BADGE_CLASS: Record<BlockSupport, string> = {
  canvas: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'server-composed': 'text-sky-700 bg-sky-50 border-sky-200',
  'resolver-flag': 'text-sky-700 bg-sky-50 border-sky-200',
  system: 'text-stone-500 bg-stone-100 border-stone-200',
  retired: 'text-amber-700 bg-amber-50 border-amber-200',
  unsupported: 'text-rose-700 bg-rose-50 border-rose-200',
};

interface LayoutRow {
  pageKey: string;
  draftSections: SectionSlot[];
  publishedAt: string | null;
  scheduledAt: string | null;
  /**
   * The optimistic-concurrency token (Stage 08 Task B, KD-09).
   *
   * Before Stage 08 this interface had no version field and the server payload
   * did not send one, so the editor was structurally incapable of telling the
   * server which version it had loaded. Two operators on one page meant last
   * write wins, silently.
   */
  version: number;
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

/**
 * The editor's local copy of the default layout.
 *
 * It MUST agree with the server's `buildDefaultSlots` — same filtering, same
 * dedupe, same ids — because the canvas renders the server's computation while
 * the tree renders this one. Stage 06 made default ids deterministic via
 * `defaultSlotId(family, type)` precisely so the two agree before a draft has
 * been saved; using `genId()` here again would re-break click-to-select on
 * every page that has no stored layout.
 */
function buildDefaultSlotsFromRegistry(defs: SectionDef[], family: string): SectionSlot[] {
  const seen = new Set<string>();
  return defs
    // Retired blocks are never placed in a default layout (Stage 05 D-11, Stage 07 D-02).
    .filter((d) => !d.retired)
    /**
     * Stage 07 Task E. MUST mirror the server's `buildDefaultSlots`, which
     * applies the same filter. Omitting it here would make the tree list the
     * four approved detail appendage blocks (and the directory rich-text block)
     * as if the page already contained them, while the canvas — rendering the
     * server's computation — showed none of them. Stage 06 established that a
     * tree/canvas disagreement does not merely look wrong: it silently breaks
     * click-to-select, because the ids no longer match.
     */
    .filter((d) => !d.excludeFromDefaultsIn?.includes(family))
    .filter((d) => { if (seen.has(d.type)) return false; seen.add(d.type); return true; })
    .map((d, i) => ({
      id: defaultSlotId(family, d.type),
      sectionType: d.type,
      visible: true,
      order: i,
      props: { ...d.defaultProps },
    }));
}

function effectiveSlots(layout: LayoutRow | undefined, registry: SectionDef[], family: string): SectionSlot[] {
  if (layout && Array.isArray(layout.draftSections) && layout.draftSections.length > 0) {
    return layout.draftSections.map((s) => ({ ...s, id: s.id || genId() }));
  }
  return buildDefaultSlotsFromRegistry(registry, family);
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
  /** All unique definitions — used to LABEL a stored slot, retired ones included. */
  const uniqueBlocks = getUniqueBlockTypes(registry);
  /**
   * What the "Add a Block" panel may offer.
   *
   * STAGE 05 OVERCLAIM, CORRECTED HERE. The Stage 05 report stated that an
   * admin "cannot add" the retired newsletter block. The service-level helper
   * `getAvailableBlockTypes` does exclude it, and the Stage 05 test asserted
   * that function — but `app/admin/(dashboard)/website/page.tsx` builds the
   * editor's registry from the RAW `HOMEPAGE_SECTIONS` array, never calling
   * that helper. So the block was still listed in the real Admin UI, the server
   * accepted it (retired types stay saveable by design), and it then rendered
   * nothing. The claim was true of the service and false of the product.
   *
   * Two changes close it: the server now passes `retired` through, and the
   * panel filters on it here. `tests/stage06-retired-block-ui.test.ts` asserts
   * the editor's own payload shape, not the helper, so the UI is what is proven.
   */
  const addableBlocks = uniqueBlocks.filter((d) => !d.retired);
  const initialSlots = effectiveSlots(layout, registry, familyKey);
  const [slots, setSlots] = useState<SectionSlot[]>(initialSlots);
  /**
   * Stage 06 fix. This was `useState(false)`, while `selectPage` sets
   * `setDirty(!l || !l.draftSections.length)` when the operator switches pages.
   * So on FIRST load of a page with no stored layout the top bar said "Showing
   * defaults — save draft to persist" and the Save Draft button, which is
   * disabled unless `dirty`, was greyed out. The editor instructed an action it
   * had disabled. Initialising from the same rule `selectPage` already uses
   * makes the two paths agree: unsaved registry defaults count as unsaved work.
   */
  const [dirty, setDirty] = useState(!layout || !layout.draftSections.length);
  /**
   * The version this editor loaded (Stage 08 Task B).
   *
   * A page with no stored row has no version yet; 0 is sent, and the service
   * treats a first save as a create. After every successful write the server
   * returns the new version and this is advanced, so consecutive saves from one
   * editor never self-conflict.
   */
  /**
   * Has the OPERATOR actually edited this page? (Stage 08 Task I.)
   *
   * Distinct from `dirty` on purpose. `dirty` starts TRUE for a page with no
   * stored layout, so Save Draft is enabled for unsaved registry defaults —
   * that is a deliberate Stage 06 fix and it stays. But it meant the
   * "You have unsaved changes. Discard them?" prompt fired on the FIRST page
   * switch of every session, before the operator had touched anything, because
   * every page starts with no stored layout.
   *
   * A confirmation that cries wolf is one an operator learns to dismiss, which
   * is exactly how real unsaved work eventually gets lost. So the prompt and
   * the `beforeunload` guard now key off `touched`, which only an actual edit
   * sets, while Save enablement keeps keying off `dirty`.
   *
   * Found by browser verification: the Stage 07 spec's page switch was being
   * silently cancelled by this prompt, and had only ever passed because a
   * leftover PageLayout row made `dirty` false.
   */
  const [touched, setTouched] = useState(false);
  const [loadedVersion, setLoadedVersion] = useState<number>(layout?.version ?? 0);
  /**
   * Set when the server rejects a save as stale. While it is set the editor
   * shows a persistent banner with a reload path, because a transient toast is
   * not an adequate response to "your work was not saved" (Task B requirement 3).
   */
  const [conflict, setConflict] = useState<{ currentVersion: number; lastEditedBy: string | null; lastEditedAt: string | null } | null>(null);
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

  /* ── Stage 06: canvas state ──────────────────────────────────── */
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  /** Bumped only after a save the server confirmed, so the canvas never
   *  reloads into content the database does not hold. */
  const [canvasRefreshToken, setCanvasRefreshToken] = useState(0);

  const capability = getPageCapability(activeKey);

  const selectedSlot = slots.find((s) => s.id === selectedBlockId);
  const selectedDef = selectedSlot ? uniqueBlocks.find((d) => d.type === selectedSlot.sectionType) ?? registry.find((d) => d.type === selectedSlot.sectionType) : null;

  /** Support level for a stored slot, from the shared classification. */
  const supportFor = useCallback((sectionType: string): BlockSupport => {
    const hasDefinition = registry.some((d) => d.type === sectionType);
    return classifyBlockSupport(sectionType, hasDefinition);
  }, [registry]);

  /**
   * Selection handler shared by the tree and the canvas, so both directions go
   * through one path and cannot drift (Stage 06 Task 4). Stable identity
   * matters: `BuilderCanvas` holds it in a message listener.
   */
  const selectBlock = useCallback((slotId: string | null) => {
    setSelectedBlockId(slotId);
    if (slotId) {
      setShowAddPanel(false);
      setPropTab('content');
    }
  }, []);

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
      // Every path that changes the layout goes through here, so this is the
      // one place that needs to record that the operator has edited something.
      setTouched(JSON.stringify(next) !== savedRef.current);
      return next;
    });
  }, []);

  const selectPage = (key: string) => {
    if (touched && !window.confirm('You have unsaved changes. Discard them?')) return;
    setActiveKey(key);
    const l = layouts.find((x) => x.pageKey === key);
    const fk = resolveFamily(key);
    const reg = registries[fk] ?? [];
    const s = effectiveSlots(l, reg, fk);
    setSlots(s);
    savedRef.current = JSON.stringify(l?.draftSections ?? []);
    setDirty(!l || !l.draftSections.length);
    setTouched(false);
    setLoadedVersion(l?.version ?? 0);
    setConflict(null);
    setSelectedBlockId(null);
    setShowAddPanel(false);
  };

  useEffect(() => {
    // `touched`, not `dirty`: see the comment on `touched`. Warning about
    // unsaved work the operator never created trains them to ignore the warning.
    if (!touched) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [touched]);

  /* ── Block management ────────────────────────────────────────── */

  const addBlock = (def: SectionDef) => {
    // Family-aware (Stage 04 Task B): a shared block can carry a stricter cap on
    // this family, and that is the cap the server enforces — so the message the
    // admin sees must be the same number.
    const maxForFamily = resolveMaxInstances(def, familyKey);
    if (maxForFamily !== undefined && countInstances(slots, def.type) >= maxForFamily) {
      flash(`Maximum ${maxForFamily} instance(s) of "${def.label}" allowed on this page.`, 'error');
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
    const maxForFamily = resolveMaxInstances(def, familyKey);
    if (maxForFamily !== undefined && countInstances(slots, slot.sectionType) >= maxForFamily) {
      flash(`Maximum ${maxForFamily} instance(s) of "${def.label}" reached on this page.`, 'error');
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
    const r = await saveDraftAction(activeKey, slots, loadedVersion);
    // Refresh the canvas ONLY on a confirmed save (Stage 06 Task 6). A failed
    // save leaves the canvas showing the last good draft, so the panel never
    // implies a change was stored when it was not. The rule lives in
    // `canvasTokenAfterSave` so it can be asserted directly.
    setCanvasRefreshToken((n) => canvasTokenAfterSave(r, n));
    if (r.ok) {
      savedRef.current = JSON.stringify(slots);
      setDirty(false);
      setTouched(false);
      setConflict(null);
      // Advance the token to what the server just stored, so a second save
      // from this same editor is not rejected as stale.
      if (typeof r.version === 'number') setLoadedVersion(r.version);
      flash('Draft saved.');
      router.refresh();
    } else if (r.code === 'conflict') {
      /**
       * Stage 08 Task B requirement 3 + Task I.
       *
       * The editor's unsaved work is DELIBERATELY left in place. Discarding it
       * would turn a recoverable conflict into data loss, which is the opposite
       * of the requirement. The banner explains what happened and offers the
       * reload explicitly, so losing the edits is always the operator's choice.
       */
      const d = (r.details ?? {}) as { currentVersion?: number; lastEditedBy?: string | null; lastEditedAt?: string | null };
      setConflict({
        currentVersion: d.currentVersion ?? 0,
        lastEditedBy: d.lastEditedBy ?? null,
        lastEditedAt: d.lastEditedAt ?? null,
      });
      flash('Not saved — this page was changed by someone else.', 'error');
    } else flash(r.error || 'Error saving draft.', 'error');
  });

  /**
   * Discard local edits and reload the server's current draft (Task I).
   *
   * The only route out of a conflict that cannot itself lose data silently: it
   * is behind an explicit confirmation, and it is the operator who decides.
   */
  const reloadAfterConflict = () => {
    if (!window.confirm('Reload the current version? Your unsaved changes on this page will be discarded.')) return;
    setConflict(null);
    setDirty(false);
    setTouched(false);
    router.refresh();
  };

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

  /* ── Shared field chrome (Stage 04 Task A) ───────────────────────
   * `helpText` previously rendered in only 3 of 9 property-editor branches, so
   * a declared help string on a `text` prop — the type `quick-access.kicker`
   * uses — never reached the DOM. These helpers are the single place help text
   * and field/description association are produced, so every type inherits
   * them and no branch can silently omit one. Rendered once per field.
   */

  /* ── Render prop field ───────────────────────────────────────── */

  const renderPropField = (blockId: string, prop: PropDef) => {
    const slot = slots.find((s) => s.id === blockId);
    if (!slot) return null;
    const val = slot.props[prop.key];
    const strVal = val === undefined || val === null ? '' : String(val);
    const defForSlot = registry.find((d) => d.type === slot.sectionType);
    const unmet = unmetDependency(slot, prop, defForSlot);

    // Everything except the two picker-backed types is rendered by the shared
    // field component, so label / help text / ARIA association are produced in
    // exactly one place (Stage 04 Task A).
    if (prop.type !== 'featured' && prop.type !== 'image') {
      return (
        <SimplePropField
          key={prop.key}
          blockId={blockId}
          slot={slot}
          prop={prop}
          def={defForSlot}
          onChange={(key, value) => updateProp(blockId, key, value)}
        />
      );
    }

    const { id } = propFieldIds(blockId, prop.key);
    const help = prop.helpText || unmet ? (
      <p id={propFieldIds(blockId, prop.key).helpId} className="text-[10px] text-stone-400 leading-snug">
        {prop.helpText}
        {prop.helpText && unmet ? ' ' : null}
        {unmet ? <span className="text-amber-600">{unmet}</span> : null}
      </p>
    ) : null;
    const described = describedBy(blockId, prop, unmet);

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
            {help}
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
          {help}
        </div>
      );
    }

    if (prop.type === 'color') {
      return (
        <div key={prop.key} className="space-y-1">
          <label htmlFor={id} className="text-[10px] font-mono uppercase text-stone-500">{prop.label}</label>
          <input id={id} type="color" value={strVal || '#000000'} aria-describedby={described}
            onChange={(e) => updateProp(blockId, prop.key, e.target.value)}
            className="w-10 h-8 rounded border border-stone-200 cursor-pointer" />
          {help}
        </div>
      );
    }

    // text / url fallback — the branch `quick-access.kicker` uses, and the one
    // that previously dropped its declared help text entirely.
    return (
      <div key={prop.key} className="space-y-1">
        <label htmlFor={id} className="text-[10px] font-mono uppercase text-stone-500">{prop.label}</label>
        <input id={id} type={prop.type === 'url' ? 'url' : 'text'} value={strVal}
          placeholder={prop.type === 'url' ? 'https://... or /path/' : ''}
          aria-describedby={described}
          onChange={(e) => updateProp(blockId, prop.key, e.target.value)}
          className="w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs" />
        {help}
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
    ? addableBlocks
    : addableBlocks.filter((d) => d.category === addCategoryFilter);

  /* ── Keyboard navigation for the structure tree (Stage 06 Task 10) ──
   * The tree was previously a list of divs with an onClick and no keyboard
   * path at all, so the Builder could not be operated without a mouse. Arrow
   * keys move the selection, Enter/Space confirm it, and Home/End jump.
   */
  const treeKeyDown = (e: React.KeyboardEvent, slotId: string, idx: number) => {
    const focusAt = (i: number) => {
      const next = slots[i];
      if (!next) return;
      selectBlock(next.id);
      document.getElementById(`tree-item-${next.id}`)?.focus();
    };
    if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(idx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(idx - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
    else if (e.key === 'End') { e.preventDefault(); focusAt(slots.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBlock(slotId); }
    else if (canManage && e.altKey && e.key === 'ArrowRight') { e.preventDefault(); moveBlock(slotId, 'down'); }
    else if (canManage && e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); moveBlock(slotId, 'up'); }
  };

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

      {/* ── Page capability notice (Stage 06 Task 7) ─────────────────
       * Shown for every page so the Builder never implies a level of control
       * it does not have — in particular that editing a block could change a
       * detail template's structured body or a directory's generated list.
       */}
      <div
        className={`rounded border px-3 py-2 text-[11px] ${
          capability.level === 'composed'
            ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
            : 'border-sky-200 bg-sky-50/60 text-sky-900'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-current/20 bg-white/60 px-1.5 py-0.5 font-mono text-[9px] uppercase">
            {PAGE_COMPOSITION_LABELS[capability.level]}
          </span>
          <span className="font-medium">{capability.summary}</span>
        </div>
        {capability.fixed.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-4 opacity-80">
            {capability.fixed.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}
      </div>

      {/* ── Three-panel builder (Stage 06) ───────────────────────────
       * Structure · Canvas · Inspector. Stacks to one column below `xl`, and
       * the canvas keeps its own internal scroll, so the Admin stays usable on
       * a narrow screen instead of forcing a horizontal page scroll.
       */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_340px]">

        {/* ── Left: Page structure ──────────────────────────────── */}
        <div className="flex max-h-[80vh] flex-col overflow-hidden rounded border border-stone-200 bg-white">
          <div className="border-b border-stone-200 bg-stone-50 px-3 py-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">Page Structure</h3>
              <span className="text-[10px] text-stone-400">{slots.length} blocks</span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[9px] uppercase text-stone-400" title={activeKey}>
              {activeKey} · {familyKey}
            </div>
            {canManage && (
              <button onClick={() => { setShowAddPanel(!showAddPanel); selectBlock(null); }}
                aria-expanded={showAddPanel}
                className="mt-2 w-full rounded bg-[#0F1115] px-2.5 py-1 text-[10px] font-semibold text-[#D4A757]">
                + Add Section
              </button>
            )}
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
                  // Stage 07: the cap SHOWN must be the cap ENFORCED. This read
                  // `def.maxInstances` directly, so a per-family limit was
                  // displayed and gated wrong and only caught on save.
                  const capForFamily = resolveMaxInstances(def, familyKey);
                  const atLimit = capForFamily !== undefined && countInstances(slots, def.type) >= capForFamily;
                  return (
                    <button key={def.type} onClick={() => !atLimit && addBlock(def)} disabled={atLimit}
                      className={`p-3 rounded border text-left transition-colors ${atLimit ? 'opacity-40 cursor-not-allowed border-stone-200 bg-stone-50' : 'border-stone-200 bg-white hover:border-[#D4A757] hover:bg-amber-50/30'}`}>
                      <div className="text-xs font-semibold text-stone-800 truncate">{def.label}</div>
                      {def.description && <div className="text-[10px] text-stone-500 mt-0.5 line-clamp-2">{def.description}</div>}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] font-mono text-stone-400 uppercase bg-stone-100 px-1 rounded">{def.category}</span>
                        {capForFamily !== undefined && (
                          <span className="text-[9px] text-stone-400">{countInstances(slots, def.type)}/{capForFamily}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Structure tree ──────────────────────────────────── */}
          <div role="tree" aria-label="Page sections" className="min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto">
            {slots.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-stone-400">No blocks. Click &ldquo;Add Section&rdquo; or &ldquo;Restore Defaults&rdquo; to get started.</div>
            )}
            {slots.map((slot, idx) => {
              const def = uniqueBlocks.find((d) => d.type === slot.sectionType) ?? registry.find((d) => d.type === slot.sectionType);
              const isSelected = slot.id === selectedBlockId;
              const isDragOver = slot.id === dragOverId;
              const support = supportFor(slot.sectionType);
              return (
                <div
                  key={slot.id}
                  id={`tree-item-${slot.id}`}
                  role="treeitem"
                  aria-selected={isSelected}
                  aria-level={1}
                  tabIndex={isSelected || (!selectedBlockId && idx === 0) ? 0 : -1}
                  title={BLOCK_SUPPORT_HELP[support]}
                  draggable={canManage}
                  onDragStart={(e) => handleDragStart(e, slot.id)}
                  onDragOver={(e) => handleDragOver(e, slot.id)}
                  onDrop={(e) => handleDrop(e, slot.id)}
                  onDragEnd={handleDragEnd}
                  onKeyDown={(e) => treeKeyDown(e, slot.id, idx)}
                  onClick={() => selectBlock(isSelected ? null : slot.id)}
                  className={`cursor-pointer select-none px-3 py-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4A757]
                    ${!slot.visible ? 'opacity-50' : ''}
                    ${isSelected ? 'border-l-2 border-l-[#D4A757] bg-amber-50' : 'border-l-2 border-l-transparent hover:bg-stone-50/60'}
                    ${isDragOver ? 'border-t-2 border-t-sky-400 bg-sky-50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {canManage && (
                      <span className="mt-0.5 cursor-grab text-xs text-stone-300" title="Drag to reorder" aria-hidden="true">&#x2807;</span>
                    )}
                    <span className="mt-0.5 w-4 font-mono text-[10px] text-stone-400">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-stone-900">{def?.label ?? slot.sectionType}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className={`rounded border px-1 font-mono text-[8px] uppercase ${SUPPORT_BADGE_CLASS[support]}`}>
                          {BLOCK_SUPPORT_LABELS[support]}
                        </span>
                        {def?.required && <span className="rounded border border-sky-200 bg-sky-50 px-1 font-mono text-[8px] text-sky-700">REQ</span>}
                        <span className={`rounded px-1 font-mono text-[8px] uppercase ${slot.visible ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>
                          {slot.visible ? 'Shown' : 'Hidden'}
                        </span>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex flex-col items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => moveBlock(slot.id, 'up')} disabled={idx === 0}
                          aria-label={`Move ${def?.label ?? slot.sectionType} up`}
                          className="text-[11px] text-stone-400 hover:text-stone-700 disabled:opacity-20">&uarr;</button>
                        <button onClick={() => moveBlock(slot.id, 'down')} disabled={idx === slots.length - 1}
                          aria-label={`Move ${def?.label ?? slot.sectionType} down`}
                          className="text-[11px] text-stone-400 hover:text-stone-700 disabled:opacity-20">&darr;</button>
                        <button onClick={() => toggleVisible(slot.id)}
                          aria-label={`${slot.visible ? 'Hide' : 'Show'} ${def?.label ?? slot.sectionType}`}
                          className="text-[10px] text-stone-400 hover:text-stone-700">{slot.visible ? '◉' : '◎'}</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="border-t border-stone-100 px-3 py-1.5 text-[9px] leading-snug text-stone-400">
            Arrow keys move between sections · Enter selects · Alt+Arrow reorders
          </p>
        </div>

        {/* ── Centre: the real draft page ───────────────────────── */}
        <BuilderCanvas
          pageKey={activeKey}
          selectedBlockId={selectedBlockId}
          onSelectBlock={selectBlock}
          refreshToken={canvasRefreshToken}
          stale={dirty}
          deviceMode={deviceMode}
          onDeviceModeChange={setDeviceMode}
        />

        {/* ── Right: Property inspector ─────────────────────────── */}
        <div className="flex max-h-[80vh] flex-col overflow-hidden rounded border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">Properties</h3>
            {selectedSlot && <span className="text-[9px] text-stone-400">{selectedSlot.id.slice(0, 8)}</span>}
          </div>
          {/* Announces selection changes for screen-reader users, since the
              visible cue is an outline in another document (the canvas). */}
          <p aria-live="polite" className="sr-only">
            {selectedSlot
              ? `Selected ${selectedDef?.label ?? selectedSlot.sectionType}, section ${slots.findIndex((s) => s.id === selectedSlot.id) + 1} of ${slots.length}`
              : 'No section selected'}
          </p>
          {!selectedSlot && (
            <div className="p-6 text-center">
              <div className="mb-2 text-2xl text-stone-300">&#9998;</div>
              <div className="text-xs text-stone-400">Select a section in the tree, or click one on the canvas.</div>
            </div>
          )}
          {selectedSlot && (() => {
            const support = supportFor(selectedSlot.sectionType);
            if (support === 'canvas') return null;
            return (
              <div className={`border-b px-4 py-2 text-[10px] leading-snug ${SUPPORT_BADGE_CLASS[support]}`}>
                <span className="font-semibold">{BLOCK_SUPPORT_LABELS[support]}.</span>{' '}
                {BLOCK_SUPPORT_HELP[support]}
                {selectedDef?.retiredBy && (
                  <span className="ml-1 font-mono opacity-70">({selectedDef.retiredBy})</span>
                )}
              </div>
            );
          })()}
          {/**
            * Stage 07 Task F — where this block's CONTENT comes from.
            *
            * The support badge answers "can I edit this block"; it does not
            * answer "where does what I see come from". For the directory
            * listing those are different questions: the block is fully
            * canvas-editable, and yet none of the entries in it are the
            * operator's to choose. Saying so is the difference between a
            * Builder that explains itself and one that invites an operator to
            * hunt for a control that does not exist.
            */}
          {selectedSlot && selectedDef?.systemContent && (
            <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-[10px] leading-snug text-sky-800">
              <span className="font-semibold">Content comes from the database.</span>{' '}
              The entries, search, filters and pagination in this block are generated from live records. You control
              where it sits on the page and its layout options — not what it lists.
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
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {/* ── Content Source inspector (Stage 06 Task 8) ──────
                 * Describes what the raw `featuredIds` / `articleCount` fields
                 * will actually produce, using the resolvers' own readers so
                 * the wording cannot disagree with the rendered page.
                 */}
                {propTab === 'content' && (() => {
                  const cs = describeContentSource(selectedSlot.sectionType, selectedSlot.props, selectedDef);
                  if (!cs.configurable) return null;
                  return (
                    <div data-testid="content-source-summary" className="rounded border border-stone-200 bg-stone-50/70 px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded border border-stone-300 bg-white px-1 font-mono text-[8px] uppercase text-stone-500">
                          {cs.mode}
                        </span>
                        <span className="text-[10px] font-mono uppercase text-stone-400">Content source</span>
                      </div>
                      <p className="mt-1 text-[11px] font-medium leading-snug text-stone-800">{cs.headline}</p>
                      {cs.notes.length > 0 && (
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-snug text-stone-500">
                          {cs.notes.map((n) => <li key={n}>{n}</li>)}
                        </ul>
                      )}
                    </div>
                  );
                })()}
                {propsForTab(propTab).length === 0 && (
                  <div className="text-[10px] italic text-stone-400">No editable properties on this tab.</div>
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

      {/**
        * SAVE-CONFLICT BANNER (Stage 08 Tasks B + I).
        *
        * Persistent, not a toast. A toast that says "your work was not saved"
        * and then disappears is worse than no message, because the operator
        * carries on editing a draft the server has already rejected.
        *
        * The unsaved edits are still in the editor. Reloading is offered, never
        * performed automatically, so discarding them is always a decision the
        * operator makes with the facts in front of them.
        */}
      {conflict && (
        <div
          role="alert"
          /* A stable hook: `role="alert"` alone also matches the success toast
             and Next's route announcer, which made the browser assertions
             ambiguous. */
          data-nfr-conflict="1"
          className="rounded border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-900"
        >
          <p className="font-semibold">Not saved — someone else changed this page.</p>
          <p className="mt-1 leading-relaxed">
            You opened version {loadedVersion}; the stored version is now {conflict.currentVersion}
            {conflict.lastEditedBy ? <> , last edited by <strong className="font-semibold">{conflict.lastEditedBy}</strong></> : null}
            {conflict.lastEditedAt ? <> at {new Date(conflict.lastEditedAt).toLocaleString()}</> : null}.
            {' '}Your changes are still here on screen and have <strong className="font-semibold">not</strong> been
            stored. Reload to get the current version, then re-apply what you need.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={reloadAfterConflict}
              className="rounded bg-rose-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-rose-800"
            >
              Reload current version
            </button>
            <button onClick={() => setConflict(null)} className="text-[11px] text-rose-700 underline">
              Keep editing without reloading
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-stone-400">
        Select a section in the tree or click it on the canvas. Drag tree items to reorder. The canvas shows the last
        saved draft — <strong className="font-semibold text-stone-500">Save Draft</strong> to update it. Publishing is a
        separate, explicit step.
      </p>
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

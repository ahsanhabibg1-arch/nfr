'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Article, ArticleWorkflowStatus, PrimarySection, ContentBlock, SourceReference, DisclosureType, ArticleRevision } from '../../types';
import { ROUTES } from '../../config/routes';
/**
 * Batch 04-E — the managed Article Type definitions arrive as a SNAPSHOT prop.
 *
 * This is a client component, so it cannot read the database, and §11 forbids
 * fetching the list from the browser. The two server pages that render this
 * shell resolve the snapshot and pass it down; when they do not (an older
 * caller, a test), `fallbackSnapshot()` supplies the compiled-in compatibility
 * vocabulary, which is exactly what this control offered before 04-E.
 */
import {
  fallbackSnapshot,
  assignableTypes,
  findType,
  labelIn,
  type ArticleTypeSnapshot,
} from '../../lib/content/articleTypeShape';

/** Database-backed author bylines supplied by the server (Batch 16) — replaces the Phase-0 mock map. */
export interface AuthorOption { id: string; name: string; role: string }
import { validateArticle } from '../../utils/seoValidator';
import { saveArticleAction, transitionArticleAction, restoreRevisionAction } from '../../app/admin/article-actions';
import { useUnsavedChangesWarning } from '../../lib/hooks/useUnsavedChangesWarning';
import type { ArticleInput } from '../../lib/cms/articleService';
import { RichBlockEditor } from '../../components/admin/editor/RichBlockEditor';
import { RichTextBodyEditor } from '../../components/admin/editor/RichTextBodyEditor';
import { SearchAppearancePreview } from '../../components/admin/editor/SearchAppearancePreview';
import { productionCanonicalUrl } from '../../lib/seo/canonical';
import { SeoAssistantPanel } from '../../components/admin/editor/SeoAssistantPanel';
import { RevisionHistoryModal } from '../../components/admin/editor/RevisionHistoryModal';
import { RodeoRelationshipsPanel, RodeoRelationshipsData } from '../../components/admin/editor/RodeoRelationshipsPanel';
import { ArticleSourcesPanel } from '../../components/admin/editor/ArticleSourcesPanel';
import { MediaPickerModal, SelectedMediaData } from '../../components/admin/editor/MediaPickerModal';
import { ArticleDraftPreview } from '../../components/admin/editor/ArticleDraftPreview';
import { EMPTY_RELATIONSHIP_OPTIONS, NEW_SOURCE_ID_PREFIX, type ArticleRelationshipOptions, type SourceDirectoryOption } from '../../lib/cms/relationshipTypes';

/** Stage 02 (H-01) — a managed Category, as the server page supplies it. */
export interface CategoryOption { id: string; name: string; slug: string }

/**
 * Batch 04-A — the local Article Type list has been removed.
 *
 * It was one of six independent vocabularies for a single free-text column, and
 * it matched none of the 11 stored values. The editor stopped keeping its own
 * list and read the one authoritative registry instead — the same one the write
 * validator, the archive filter, the evergreen query and the JSON-LD check use,
 * so the dropdown could no longer disagree with the rest of the application.
 *
 * Batch 04-E — that single source is now the MANAGED registry in the database,
 * resolved by the server page and handed to this client component as the
 * `articleTypes` snapshot prop. The guarantee is unchanged and the mechanism is
 * the same: one source, no local list.
 */

/**
 * Stage 02 (H-01) — the FALLBACK section list, not the source of truth.
 *
 * This array used to be rendered straight into the Primary Section dropdown, so
 * a category an administrator created was invisible to the editor and could
 * never be assigned: the CMS could make a record the CMS could not use. The
 * dropdown now renders the `categories` prop, which the two editor server pages
 * resolve from `listCategories()`.
 *
 * It stays as the fallback for a caller that supplies no categories (a test, an
 * older entry point), so the control is never empty. The server has always
 * validated by database lookup — `resolveCategoryId` — so this list has never
 * been a security or integrity boundary, only a UI restriction.
 */
/**
 * The four jobs an author does in this editor, in the order they do them.
 *
 * Each one groups fields that were previously interleaved down a single long
 * two-column form, where writing a paragraph and clearing the publication gate
 * sat side by side.
 */
export type EditorArea = 'writing' | 'setup' | 'seo' | 'review';

export const EDITOR_AREAS: { key: EditorArea; label: string }[] = [
  { key: 'writing', label: 'Writing' },
  { key: 'setup', label: 'Article Setup' },
  { key: 'seo', label: 'SEO & Media' },
  { key: 'review', label: 'Review & Publish' },
];

/**
 * Which area owns each field a validation finding can point at.
 *
 * The anchors are the validator's own (`FIELD_META` in `utils/seoValidator.ts`),
 * so this is a map between two existing vocabularies rather than a new one.
 * An anchor that is not listed — including the empty anchor the validator uses
 * for a finding with no single field — counts against Review & Publish, which
 * is where the complete report is shown. That default is deliberate: an
 * uncounted finding would be a finding an author is never told about.
 */
const ANCHOR_AREA: Record<string, EditorArea> = {
  'field-01-headline': 'writing',
  'field-03-excerpt': 'writing',
  'field-04-body': 'writing',
  'field-05-seotitle': 'seo',
  'field-06-metadesc': 'seo',
  'field-07-imageseotitle': 'seo',
  'field-08-imagealt': 'seo',
  'editor-rights-status': 'seo',
  'editor-sources': 'seo',
  'editor-relationships': 'setup',
  'editor-disclosure': 'setup',
  'editor-slug': 'review',
  'editor-workflow-state': 'review',
};

const FALLBACK_SECTIONS: PrimarySection[] = [
  'NFR Competition',
  'NFR Entertainment',
  'NFR Events & Shopping',
  'NFR Plan & Watch',
  'More Rodeo',
];

export interface EditorPermissions {
  canSubmit: boolean;
  canReview: boolean;
  canApprove: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  canDelete: boolean;
  canEditAny: boolean;
}

interface AdminArticleEditorShellProps {
  initialArticle?: Article;
  initialVersion?: number;
  initialRevisions?: ArticleRevision[];
  permissions: EditorPermissions;
  actorName: string;
  authors?: AuthorOption[];
  /** Database-backed discipline / hub / event / edition choices (loaded server-side). */
  relationshipOptions?: ArticleRelationshipOptions;
  /** The real Source directory (DB) for "attach existing source". */
  sourceDirectory?: SourceDirectoryOption[];
  /** Batch 04-E — managed Article Type definitions, resolved server-side. */
  articleTypes?: ArticleTypeSnapshot;
  /**
   * Stage 02 (H-01) — the managed categories, resolved server-side. Omitted
   * falls back to the five foundational section names.
   */
  categories?: CategoryOption[];
}

export const AdminArticleEditorShell: React.FC<AdminArticleEditorShellProps> = ({
  initialArticle,
  initialVersion,
  initialRevisions = [],
  permissions,
  actorName,
  authors = [],
  relationshipOptions = EMPTY_RELATIONSHIP_OPTIONS,
  sourceDirectory = [],
  articleTypes,
  categories,
}) => {
  /**
   * Resolved once per render. `useMemo` so the fallback is not rebuilt on every
   * keystroke in the editor — this component re-renders constantly.
   */
  const typeSnapshot = useMemo<ArticleTypeSnapshot>(
    () => articleTypes ?? fallbackSnapshot(),
    [articleTypes],
  );
  const offeredTypes = useMemo(() => assignableTypes(typeSnapshot), [typeSnapshot]);
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const isNew = !id;

  // Initial article is loaded server-side (DB) and passed in as a prop.
  const existingArticle = initialArticle;
  /**
   * Stage 02 (H-01) — section names offered by the dropdown.
   *
   * Managed categories when the server supplied them, the five foundational
   * names otherwise. The article's CURRENT value is appended when it is not in
   * the list, so an article classified under a category that was later renamed
   * or removed still shows what it actually stores instead of reading as
   * unclassified — the same rule the Article Type selector follows.
   */
  const sectionOptions = useMemo<string[]>(() => {
    const base = categories?.length ? categories.map((c) => c.name) : [...FALLBACK_SECTIONS];
    const current = existingArticle?.category;
    return current && !base.includes(current) ? [...base, current] : base;
  }, [categories, existingArticle?.category]);
  const [version, setVersion] = useState<number | undefined>(initialVersion);
  const [saving, setSaving] = useState(false);

  // Exact 8 primary fields state
  const [title, setTitle] = useState(existingArticle?.title || '');
  const [deck, setDeck] = useState(existingArticle?.deck || '');
  const [excerpt, setExcerpt] = useState(existingArticle?.excerpt || '');
  // New articles start with a genuinely empty body (no Phase 0 demo blocks). Existing
  // articles preserve their saved structured body.
  const [blocks, setBlocks] = useState<ContentBlock[]>(existingArticle?.structuredBody || []);
  /**
   * Which body view is showing. `rich` is the default because ordinary writing
   * is the common case; `blocks` is one click away for structured editorial
   * elements. Both operate on `blocks` above, so this is a view preference and
   * never a content decision.
   */
  const [bodyMode, setBodyMode] = useState<'rich' | 'blocks'>('rich');
  const [seoTitle, setSeoTitle] = useState(existingArticle?.seo?.title || '');
  const [isSeoTitleCustom, setIsSeoTitleCustom] = useState(Boolean(existingArticle?.seo?.title));
  const [metaDescription, setMetaDescription] = useState(existingArticle?.seo?.description || '');
  // No fabricated image SEO title / alt for new articles (empty; author fills them in).
  const [imageSeoTitle, setImageSeoTitle] = useState(existingArticle?.imageSeoTitle || '');
  const [imageAltText, setImageAltText] = useState(existingArticle?.imageAltText || '');

  // Secondary metadata state. New articles start empty; the slug auto-derives from the
  // title as the author types (see effect below). Existing articles preserve their values.
  const [slug, setSlug] = useState(existingArticle?.slug || '');
  const [isSlugCustom, setIsSlugCustom] = useState(Boolean(existingArticle?.slug));
  // Stage 02 (H-01): a plain string — the valid set is managed in the database.
  const [category, setCategory] = useState<string>(existingArticle?.category || '');
  /**
   * Batch 04-B - the MANAGED subcategory id, plus the legacy label kept as
   * read-only context.
   *
   * `legacySubcategory` is the raw stored text; `existingArticle.subcategory`
   * already resolves `managed ?? legacy` in `toArticle`, so it is NOT the right
   * source for the legacy line.
   */
  const [subcategoryId, setSubcategoryId] = useState<string>(existingArticle?.subcategoryRef?.id ?? '');
  const legacySubcategory = existingArticle?.legacySubcategory ?? '';
  /** Set when a section change forced the subcategory to be cleared. */
  const [sectionChangeNotice, setSectionChangeNotice] = useState<string | null>(null);
  // Batch 04-E: a plain string — the valid set is managed in the database, so a
  // compiled-in union would reject types an administrator has created.
  const [articleType, setArticleType] = useState<string>(existingArticle?.articleType || '');
  const [workflowStatus, setWorkflowStatus] = useState<ArticleWorkflowStatus>(
    (existingArticle?.workflowStatus || existingArticle?.status || 'draft') as ArticleWorkflowStatus
  );
  // No preselected demo author — unselected for new articles. For an existing article,
  // resolve its saved byline to the matching database author id (else leave unselected,
  // preserving the legacy byline text as a review signal — see legacyBylineName below).
  const [authorKey, setAuthorKey] = useState<string>(() => {
    const name = existingArticle?.author?.name;
    if (!name) return '';
    return authors.find((a) => a.name === name)?.id || '';
  });
  // A saved byline that doesn't match any current database author (legacy string) — shown
  // as an editorial review warning rather than silently reassigned.
  const legacyBylineName = existingArticle?.author?.name && !authors.some((a) => a.name === existingArticle.author?.name) ? existingArticle.author?.name : null;
  const [reviewerName, setReviewerName] = useState(existingArticle?.reviewerName || '');
  // Read-only: scheduling is unavailable (Batch A, D8); kept to label legacy SCHEDULED rows.
  const [scheduledAt] = useState(existingArticle?.scheduledAt || '');
  // No preselected featured image / caption / credit for new articles.
  const [heroImage, setHeroImage] = useState(existingArticle?.heroImage || '');
  const [imageCredit, setImageCredit] = useState(existingArticle?.imageCredit || '');
  const [imageCaption, setImageCaption] = useState(existingArticle?.imageCaption || '');
  // Safe default for a new article is 'Unresolved' (never claim ownership by default).
  const [imageRightsStatus, setImageRightsStatus] = useState<'Staff Photo' | 'Editorial Pool' | 'PRCA Archive' | 'Licensed Creative' | 'Unresolved'>(
    existingArticle?.imageRightsStatus || 'Unresolved'
  );

  // Tags & Disclosures — no sample tags on a new article.
  const [tags, setTags] = useState<string[]>(existingArticle?.tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [disclosure, setDisclosure] = useState<DisclosureType>(existingArticle?.disclosure || 'editorial-independent');
  const [disclosureNote, setDisclosureNote] = useState(existingArticle?.disclosureNote || '');

  // Entity Relationships
  const [relationships, setRelationships] = useState<RodeoRelationshipsData>({
    disciplineIds: existingArticle?.associatedDisciplineIds || (existingArticle?.associatedDisciplineId ? [existingArticle.associatedDisciplineId] : []),
    hubIds: existingArticle?.associatedHubIds || (existingArticle?.associatedHubId ? [existingArticle.associatedHubId] : []),
    eventIds: existingArticle?.associatedEventIds || (existingArticle?.associatedEventId ? [existingArticle.associatedEventId] : []),
    editionIds: existingArticle?.associatedEditionIds || [],
  });

  // Sources
  const [sources, setSources] = useState<SourceReference[]>(existingArticle?.sources || []);

  // UI state
  const [isDirty, setIsDirty] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [validationGateOpen, setValidationGateOpen] = useState(false);
  const [seoLastCheckedAt, setSeoLastCheckedAt] = useState<number | null>(null);

  /**
   * Which of the four editor areas is on screen.
   *
   * WHY AREAS, AND WHY THEY ARE HIDDEN RATHER THAN UNMOUNTED.
   *
   * The editor carries every field an article has — headline through rights
   * status — and presenting them as one long two-column form meant an author
   * writing a paragraph was looking at the publication gate, and an editor
   * checking the gate was scrolling past the body. The four areas group the
   * same fields by the job being done.
   *
   * Each area is a `hidden` wrapper around the EXISTING panels: nothing is
   * conditionally rendered. That matters for correctness, not tidiness — React
   * would discard the state of an unmounted field, so switching area would
   * silently reset whatever had been typed in another one. With `hidden`, every
   * field stays mounted, every value stays in state, and the save path sends
   * exactly what it sent before this change.
   */
  const [area, setArea] = useState<EditorArea>('writing');

  // Warn on browser refresh / tab close while there are unsaved edits (Batch 20 §2).
  // Cleared automatically once a successful save sets isDirty=false; preserved on
  // validation / concurrency conflicts (those keep isDirty=true).
  useUnsavedChangesWarning(isDirty);

  // Mark dirty on edits
  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

  // Sync slug from title only if new and unedited manually
  useEffect(() => {
    if (isNew && !existingArticle && !isSlugCustom && title) {
      const generated = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setSlug(generated);
    }
  }, [title, isNew, existingArticle, isSlugCustom]);

  // Sync SEO Title if untouched
  useEffect(() => {
    if (!isSeoTitleCustom && title) {
      setSeoTitle(title);
    }
  }, [title, isSeoTitleCustom]);

  // Current article snapshot for validation & preview
  const currentArticleSnapshot: Article = useMemo(() => {
    // Database-backed byline: resolve the selected author id to its real record; an
    // unselected author stays empty (never auto-fills a demo author).
    const selectedAuthorObj = authors.find((a) => a.id === authorKey);
    const author = {
      name: selectedAuthorObj?.name || legacyBylineName || '',
      role: selectedAuthorObj?.role || '',
      credentials: undefined,
      editorialBeat: undefined,
      bio: undefined,
    };

    return {
      id: id || 'new-article-id',
      slug,
      title: title || 'Untitled Editorial Dispatch',
      headline: title,
      deck,
      excerpt,
      content: blocks.filter((b) => b.type === 'paragraph').map((b: any) => b.text),
      structuredBody: blocks,
      category,
      subcategoryId: subcategoryId || null,
      articleType,
      status: workflowStatus,
      workflowStatus,
      readTime: `${Math.max(1, Math.ceil(blocks.reduce((acc, b: any) => acc + (b.text || '').split(/\s+/).length, 0) / 225))} min read`,
      author,
      reviewerName,
      publishedAt: existingArticle?.publishedAt || 'December 2026',
      updatedAt: 'Just now',
      scheduledAt: workflowStatus === 'scheduled' ? scheduledAt : undefined,
      heroImage,
      imageCredit,
      imageRightsStatus,
      imageSeoTitle,
      imageAltText,
      imageCaption,
      tags,
      sources,
      associatedDisciplineIds: relationships.disciplineIds,
      associatedHubIds: relationships.hubIds,
      associatedEventIds: relationships.eventIds,
      associatedEditionIds: relationships.editionIds,
      seo: {
        title: seoTitle || title,
        description: metaDescription || excerpt || deck,
        // Stage 09 Task H: the shared constant, not a host literal (the server
        // recomputes this on save; this copy only feeds the live validator/preview).
        canonicalUrl: productionCanonicalUrl(`/articles/${slug}/`),
        ogImage: heroImage,
      },
      disclosure,
      disclosureNote,
    };
  }, [
    id,
    slug,
    title,
    deck,
    excerpt,
    blocks,
    category,
    subcategoryId,
    articleType,
    workflowStatus,
    authorKey,
    reviewerName,
    scheduledAt,
    heroImage,
    imageCredit,
    imageRightsStatus,
    imageSeoTitle,
    imageAltText,
    imageCaption,
    tags,
    sources,
    relationships,
    seoTitle,
    metaDescription,
    disclosure,
    disclosureNote,
    existingArticle,
  ]);

  // Validation report (reactive: always reflects the current unsaved editor content).
  const validationReport = useMemo(() => {
    return validateArticle(currentArticleSnapshot);
  }, [currentArticleSnapshot]);

  /**
   * How many things in each area still want attention.
   *
   * Only BLOCKERS and COMPLIANCE findings are counted, not warnings: the badge
   * has to mean "this will stop publication", or it becomes background noise an
   * author learns to ignore. The counts come from the same `validateArticle`
   * report the Review area shows, so a badge can never disagree with the report
   * it is summarising.
   */
  const areaAttention = useMemo<Record<EditorArea, number>>(() => {
    const counts: Record<EditorArea, number> = { writing: 0, setup: 0, seo: 0, review: 0 };
    for (const f of [...validationReport.blockers, ...validationReport.compliance]) {
      counts[ANCHOR_AREA[f.fieldAnchor] ?? 'review'] += 1;
    }
    return counts;
  }, [validationReport]);

  // Scroll to and focus the editor field a finding refers to ("Go to Field").
  const goToField = (anchor: string) => {
    if (!anchor || typeof document === 'undefined') return;
    const el = document.getElementById(anchor);
    if (!el) return;

    const reveal = () => {
      const target = document.getElementById(anchor);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        // Focus after the smooth scroll settles so the caret lands in view.
        window.setTimeout(() => target.focus({ preventScroll: true }), 350);
      }
    };

    /**
     * THE AREA HAS TO BE OPENED BEFORE THE FIELD CAN BE REACHED.
     *
     * A finding about the image ALT text is actionable from the Review area,
     * but the field itself lives in SEO & Media — and `scrollIntoView` on a
     * `hidden` element does nothing at all, so without this the button would
     * look broken while reporting success.
     *
     * The area is read from the field's own wrapper rather than from a
     * finding-to-area table, so it cannot go stale: moving a panel between
     * areas moves its findings with it, automatically.
     */
    const host = el.closest('[data-editor-area]') as HTMLElement | null;
    const owner = host?.dataset.editorArea as EditorArea | undefined;
    if (owner && owner !== area) {
      setArea(owner);
      // Two frames: one for React to commit the new area, one for the browser
      // to lay the revealed panel out before it is scrolled to.
      window.requestAnimationFrame(() => window.requestAnimationFrame(reveal));
      return;
    }
    reveal();
  };

  // "Check SEO": re-stamp the review time and jump to the first blocking finding. Validation
  // is already continuous, so this NEVER saves or publishes — it only re-surfaces results.
  const handleCheckSeo = () => {
    setSeoLastCheckedAt(Date.now());
    const firstBlocking = [...validationReport.blockers, ...validationReport.compliance][0];
    if (firstBlocking?.fieldAnchor) goToField(firstBlocking.fieldAnchor);
  };


  const showNotification = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3500);
  };

  // Tag helper
  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(newTagInput.trim())) {
        setTags([...tags, newTagInput.trim()]);
        markDirty();
      }
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (t: string) => {
    setTags(tags.filter((item) => item !== t));
    markDirty();
  };

  // Media Picker Handler
  const handleMediaSelected = (media: SelectedMediaData) => {
    setHeroImage(media.url);
    setImageSeoTitle(media.seoTitle);
    setImageAltText(media.altText);
    setImageCaption(media.caption);
    setImageCredit(media.credit);
    setImageRightsStatus(media.rightsStatus);
    markDirty();
    showNotification('Applied featured imagery & verified rights');
  };

  // Byline sent on save: the selected database author, or (when editing a legacy article
  // with an unmatched byline and no new selection) the preserved legacy name — never a demo author.
  const picked = authors.find((a) => a.id === authorKey);
  const selectedAuthor = picked ?? (legacyBylineName ? { name: legacyBylineName, role: existingArticle?.author?.role || 'Staff Writer' } : { name: '', role: '' });

  const buildInput = (): ArticleInput => ({
    id: id || undefined,
    expectedVersion: version,
    slug,
    title,
    deck,
    excerpt,
    blocks,
    seoTitle,
    metaDescription,
    imageSeoTitle,
    imageAltText,
    subcategoryId: subcategoryId || null,
    articleType,
    categoryName: category,
    authorName: selectedAuthor.name,
    authorRole: selectedAuthor.role,
    reviewerName,
    heroImage,
    imageCredit,
    imageCaption,
    imageRightsStatus,
    disclosure,
    disclosureNote,
    tags,
    takeaways: existingArticle?.takeaways ?? [],
    // Directory sources (and ones already linked) carry their DB id so the server links the
    // existing row instead of creating or overwriting one; `new-` ids are typed-in sources.
    sources: sources.map((s) => ({
      ...(s.id.startsWith(NEW_SOURCE_ID_PREFIX) ? {} : { sourceId: s.id }),
      title: s.title, url: s.url || '', publisher: s.publisher, note: s.note,
    })),
    disciplineIds: relationships.disciplineIds,
    hubIds: relationships.hubIds,
    eventIds: relationships.eventIds,
    editionIds: relationships.editionIds,
  });

  // Persist to the database via an authenticated Server Action.
  const handleSaveDraft = async () => {
    if (saving) return;
    setSaving(true);
    const res = await saveArticleAction(buildInput());
    setSaving(false);
    if (!res.ok) {
      showNotification(res.error);
      return;
    }
    setVersion(res.version);
    setIsDirty(false);
    showNotification('Saved to the database.');
    if (isNew) router.replace(`/admin/articles/${res.id}/edit/`);
  };

  // Server-validated, RBAC-enforced workflow transition.
  const handleWorkflowTransition = async (targetStatus: ArticleWorkflowStatus) => {
    if (isNew || !id) {
      showNotification('Save the article before changing its workflow state.');
      return;
    }
    if (isDirty) {
      showNotification('Save your content changes before changing the workflow state.');
      return;
    }
    setSaving(true);
    const res = await transitionArticleAction(
      id,
      targetStatus.toUpperCase(),
      version,
      targetStatus === 'scheduled' ? scheduledAt : undefined,
    );
    setSaving(false);
    if (!res.ok) {
      if (res.code === 'validation') setValidationGateOpen(true);
      showNotification(res.error);
      return;
    }
    setWorkflowStatus(targetStatus);
    setVersion(res.version);
    showNotification(`Workflow state updated to "${targetStatus.toUpperCase()}"`);
    router.refresh();
  };

  // Restore a prior revision (authenticated, RBAC-enforced).
  const handleRestoreRevision = async (revisionId: string) => {
    if (!id) return;
    const res = await restoreRevisionAction(id, revisionId);
    if (!res.ok) {
      showNotification(res.error);
      return;
    }
    setVersion(res.version);
    showNotification('Revision restored. Reloading…');
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-2xl text-xs font-mono animate-fade-in flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {saveToast}
        </div>
      )}

      {/* TOP HEADER CONTROLS */}
      <div className="bg-white border border-stone-200 rounded-sm p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Navigation and Document ID */}
        <div className="flex items-center gap-3">
          <Link
            href={ROUTES.ADMIN_ARTICLES}
            className="text-xs font-sans text-stone-600 hover:text-stone-900 font-semibold inline-flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Articles Directory
          </Link>
          <span className="text-stone-300">|</span>
          <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">
            {isNew ? 'New Article Composer' : `Document ID: ${id}`}
          </span>
          {isDirty && (
            <span
              // Named so the save state can be observed unambiguously. The
              // success toast hides itself after 3.5 s, which makes it useless
              // as a signal; this badge reflects `isDirty` and therefore the
              // actual outcome of a save.
              data-testid="editor-dirty-badge"
              role="status"
              className="text-[10px] font-mono px-2 py-0.5 bg-amber-100 text-amber-800 rounded-xs font-bold animate-pulse"
            >
              Unsaved Changes
            </span>
          )}
        </div>

        {/* Right: Role Switcher & Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Authenticated acting user — real server-enforced permissions, not a simulator */}
          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 px-2 py-1 rounded-xs text-[11px] font-sans text-ink-muted">
            <span>Editing as</span>
            <span className="font-semibold text-stone-900">{actorName}</span>
          </div>

          {/* Revision History */}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="px-3 py-1.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold rounded-xs transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Revisions
          </button>

          {/* Editorial Preview */}
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="px-3 py-1.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold rounded-xs transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5 text-[#8B5E3C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview Draft
          </button>

          {/* Save Draft Button */}
          <button
            type="button"
            onClick={() => handleSaveDraft()}
            disabled={saving}
            className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-900 text-xs font-bold rounded-xs transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : isNew ? 'Create Draft' : 'Save Draft'}
          </button>

          {/* Primary State-Driven Action (gated by real server-enforced permissions) */}
          {workflowStatus === 'draft' && (
            <button
              type="button"
              onClick={() => handleWorkflowTransition('in_review')}
              disabled={!permissions.canSubmit || saving || isNew}
              className="px-4 py-1.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-bold uppercase tracking-wider rounded-xs transition-colors shadow-xs disabled:opacity-50"
            >
              Submit for Review
            </button>
          )}

          {workflowStatus === 'in_review' && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleWorkflowTransition('draft')}
                disabled={!permissions.canReview || saving}
                className="px-3 py-1.5 bg-rose-50 border border-rose-300 text-rose-800 hover:bg-rose-100 text-xs font-bold rounded-xs disabled:opacity-50"
              >
                Request Changes
              </button>
              <button
                type="button"
                onClick={() => handleWorkflowTransition('approved')}
                disabled={!permissions.canApprove || saving}
                className="px-4 py-1.5 bg-emerald-800 text-white hover:bg-emerald-900 text-xs font-bold uppercase tracking-wider rounded-xs disabled:opacity-50"
              >
                Approve Article
              </button>
            </div>
          )}

          {workflowStatus === 'approved' && (
            <div className="flex items-center gap-1.5">
              {/* No Schedule action: scheduled publishing is not available yet (Batch A, D8). */}
              <button
                type="button"
                onClick={() => handleWorkflowTransition('published')}
                disabled={!permissions.canPublish || saving}
                className="px-4 py-1.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-bold uppercase tracking-wider rounded-xs shadow-xs disabled:opacity-50"
              >
                Publish Now
              </button>
            </div>
          )}

          {workflowStatus === 'scheduled' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-amber-800" data-testid="manual-publish-required">
                Manual publish required
              </span>
              <button
                type="button"
                onClick={() => handleWorkflowTransition('approved')}
                disabled={!permissions.canSchedule || saving}
                className="px-3 py-1.5 bg-stone-100 border border-stone-300 text-stone-700 text-xs font-bold rounded-xs disabled:opacity-50"
              >
                Unschedule
              </button>
              <button
                type="button"
                onClick={() => handleWorkflowTransition('published')}
                disabled={!permissions.canPublish || saving}
                className="px-4 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-bold uppercase tracking-wider rounded-xs disabled:opacity-50"
              >
                Publish Immediately
              </button>
            </div>
          )}

          {workflowStatus === 'published' && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleWorkflowTransition('draft')}
                disabled={!permissions.canPublish || saving}
                className="px-3 py-1.5 bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold rounded-xs disabled:opacity-50"
              >
                Unpublish to Draft
              </button>
              <button
                type="button"
                onClick={() => handleWorkflowTransition('archived')}
                disabled={!permissions.canPublish || saving}
                className="px-3 py-1.5 bg-stone-100 text-stone-700 text-xs font-bold rounded-xs disabled:opacity-50"
              >
                Archive
              </button>
            </div>
          )}

          {workflowStatus === 'archived' && (
            <button
              type="button"
              onClick={() => handleWorkflowTransition('draft')}
              disabled={!permissions.canEditAny || saving}
              className="px-4 py-1.5 bg-white border border-stone-300 text-stone-900 text-xs font-bold rounded-xs disabled:opacity-50"
            >
              Restore to Draft
            </button>
          )}
        </div>
      </div>

      {/* Validation Blocker Banner if publication blocked */}
      {validationGateOpen && !validationReport.canPublish && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-sm text-xs font-sans text-rose-900 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between font-bold text-sm">
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Publication Gate Blocked ({validationReport.blockers.length + validationReport.compliance.length} issues)
            </span>
            <button
              type="button"
              onClick={() => setValidationGateOpen(false)}
              className="text-ink-muted hover:text-stone-900"
            >
              &times;
            </button>
          </div>
          <p className="text-stone-700">
            Editorial policy requires all Category A and Category B requirements to be resolved before pushing to live reader distribution:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-rose-800 font-mono text-[11px]">
            {validationReport.blockers.map((b) => (
              <li key={b.id}>
                <strong>[Editorial Blocker]</strong> {b.message} &mdash; <em>{b.remediation}</em>
              </li>
            ))}
            {validationReport.compliance.map((c) => (
              <li key={c.id}>
                <strong>[Compliance Blocker]</strong> {c.message} &mdash; <em>{c.remediation}</em>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        FOUR EDITOR AREAS.

        A real tab set: `role="tablist"` with one `role="tabpanel"` below, so a
        screen-reader user is told how many areas there are, which one is
        current, and can move between them with the arrow keys — which a row of
        styled buttons would not do.

        The badge on an area counts the things still wanting attention in it, so
        an author does not have to open each one to find out whether it needs
        them.
      */}
      <div
        role="tablist"
        aria-label="Editor areas"
        data-testid="editor-areas"
        className="flex flex-wrap gap-1 bg-white border border-stone-200 rounded-sm p-1.5 shadow-2xs"
        onKeyDown={(e) => {
          const order = EDITOR_AREAS.map((a) => a.key);
          const at = order.indexOf(area);
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const next = e.key === 'ArrowRight' ? at + 1 : at - 1;
            const key = order[(next + order.length) % order.length];
            setArea(key);
            document.getElementById(`editor-area-tab-${key}`)?.focus();
          }
        }}
      >
        {EDITOR_AREAS.map((a) => {
          const attention = areaAttention[a.key];
          return (
            <button
              key={a.key}
              type="button"
              role="tab"
              id={`editor-area-tab-${a.key}`}
              aria-selected={area === a.key}
              aria-controls="editor-workspace"
              // Only the current tab is in the tab order; the arrow keys move
              // between them, which is the expected behaviour for a tab set.
              tabIndex={area === a.key ? 0 : -1}
              data-testid={`editor-area-tab-${a.key}`}
              onClick={() => setArea(a.key)}
              className={`px-3 py-2 text-xs font-sans font-semibold rounded-xs transition-colors inline-flex items-center gap-2 ${
                area === a.key
                  ? 'bg-[#0F1115] text-[#D4A757]'
                  : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              <span>{a.label}</span>
              {attention > 0 && (
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full ${
                    area === a.key ? 'bg-[#D4A757] text-[#0F1115]' : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {attention}
                  <span className="sr-only"> item{attention === 1 ? '' : 's'} needing attention</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* MAIN TWO-COLUMN WORKSPACE: 8-COL FORM + 4-COL INSPECTOR */}
      <div
        id="editor-workspace"
        role="tabpanel"
        aria-labelledby={`editor-area-tab-${area}`}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        {/* ======================================================== */}
        {/* LEFT COLUMN: EXACT 8 PRIMARY FIELDS IN REQUIRED ORDER */}
        {/* ======================================================== */}
        <div
          className={area === 'writing' ? 'lg:col-span-12 space-y-6' : area === 'seo' ? 'lg:col-span-8 space-y-6' : 'hidden'}
        >
          <div className="bg-white border border-stone-200 rounded-sm p-6 shadow-2xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <span className="text-xs font-mono uppercase tracking-wider text-ink-muted font-bold">
                Primary Editorial Fields (01 &ndash; 08)
              </span>
              <span className="text-[11px] font-mono text-ink-muted">
                Exact Editorial Sequence Preserved
              </span>
            </div>

            <div data-editor-area="writing" hidden={area !== 'writing'} className="space-y-6">
            {/* FIELD 01 — MAIN HEADLINE (H1) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-sans text-stone-600 mb-1">
                <label htmlFor="field-01-headline" className="font-bold text-stone-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span>Field 01 &mdash; Main Headline (H1)</span>
                  <span className="text-required font-mono">*Required</span>
                </label>
                <span className={`font-mono text-[11px] ${
                  title.length > 70 ? 'text-amber-600 font-semibold' : 'text-ink-muted'
                }`}>
                  {title.length} chars &bull; {title.length >= 35 && title.length <= 70 ? 'Optimal' : title.length > 70 ? 'Approaching SERP truncation' : 'Too short'}
                </span>
              </div>
              <input
                id="field-01-headline"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markDirty();
                }}
                placeholder="Enter compelling, authoritative championship headline..."
                className="w-full text-xl sm:text-2xl font-serif font-black text-stone-900 p-3 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none focus:border-[#D4A757] transition-all"
              />
              {!title.trim() && (
                <p className="text-[11px] text-rose-600 font-mono pt-0.5">
                  Validation error: Main Headline is mandatory.
                </p>
              )}
            </div>

            {/* FIELD 02 — SECONDARY EDITORIAL DECK */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-sans text-stone-600 mb-1">
                <label htmlFor="field-02-deck" className="font-semibold text-stone-800 uppercase tracking-wider text-[11px]">
                  Field 02 &mdash; Secondary Editorial Deck
                </label>
                <span className="text-[11px] font-mono text-ink-muted">Optional Context</span>
              </div>
              <textarea
                id="field-02-deck"
                rows={2}
                value={deck}
                onChange={(e) => {
                  setDeck(e.target.value);
                  markDirty();
                }}
                placeholder="1–2 sentence editorial premise expanding upon the headline without repeating the excerpt..."
                className="w-full text-xs sm:text-sm font-sans text-stone-800 p-3 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none focus:border-[#D4A757] transition-all"
              />
            </div>

            {/* FIELD 03 — EDITORIAL EXCERPT / SUMMARY */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-sans text-stone-600 mb-1">
                <label htmlFor="field-03-excerpt" className="font-bold text-stone-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span>Field 03 &mdash; Editorial Excerpt / Summary</span>
                  <span className="text-required font-mono">*Required</span>
                </label>
                <span className={`font-mono text-[11px] ${
                  excerpt.length >= 100 && excerpt.length <= 220 ? 'text-emerald-700 font-semibold' : 'text-ink-muted'
                }`}>
                  {excerpt.length} chars (Target: 100&ndash;220)
                </span>
              </div>
              <textarea
                id="field-03-excerpt"
                rows={2}
                value={excerpt}
                onChange={(e) => {
                  setExcerpt(e.target.value);
                  markDirty();
                }}
                placeholder="Concise summary used for article cards, archive feeds, and syndicate discovery..."
                className="w-full text-xs sm:text-sm font-sans text-stone-800 p-3 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none focus:border-[#D4A757] transition-all"
              />
              {!excerpt.trim() && (
                <p className="text-[11px] text-rose-600 font-mono pt-0.5">
                  Validation blocker: Required before publication.
                </p>
              )}
            </div>

            {/* FIELD 04 — ARTICLE BODY */}
            <div id="field-04-body" className="space-y-2 pt-2 border-t border-stone-100" tabIndex={-1}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="font-bold text-stone-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5 font-sans">
                  <span>Field 04 &mdash; Article Body</span>
                  <span className="text-required font-mono">*Required</span>
                </label>

                {/*
                  TWO VIEWS OVER ONE MODEL, not two models.

                  Write is a continuous rich-text surface for prose. Blocks is
                  the existing structured composer, kept because tables,
                  callouts, images, citations and disclosures carry required
                  editorial metadata (alt text, credit, publisher, variant) that
                  the SEO and rights gates check, and those forms are where it
                  is captured.

                  Both edit the same `blocks` state. Switching performs no
                  conversion beyond the adapter round trip, which
                  `tests/article-richtext-adapter.test.ts` proves lossless for
                  every stored article — including block types the rich-text
                  document cannot represent, which travel through it untouched.
                */}
                <div
                  role="group"
                  aria-label="Body editing mode"
                  className="flex items-center rounded-xs border border-stone-200 overflow-hidden"
                >
                  {([
                    ['rich', 'Write', 'Continuous rich-text writing with formatting'],
                    ['blocks', 'Blocks', 'Structured block composer for tables, callouts, images and citations'],
                  ] as const).map(([mode, label, hint]) => (
                    <button
                      key={mode}
                      type="button"
                      title={hint}
                      aria-pressed={bodyMode === mode}
                      onClick={() => setBodyMode(mode)}
                      className={`px-3 py-1 text-[11px] font-sans font-semibold ${
                        bodyMode === mode ? 'bg-[#0F1115] text-[#D4A757]' : 'bg-white text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {bodyMode === 'rich' ? (
                <>
                  <RichTextBodyEditor
                    blocks={blocks}
                    onChange={(nextBlocks) => {
                      setBlocks(nextBlocks);
                      markDirty();
                    }}
                  />
                  <p className="text-[11px] text-stone-500 font-sans">
                    Tables, callouts, images, citations and disclosures appear here as locked cards that keep their
                    content exactly as saved. Switch to <strong>Blocks</strong> to add or edit one.
                  </p>
                </>
              ) : (
                <RichBlockEditor
                  blocks={blocks}
                  onChange={(nextBlocks) => {
                    setBlocks(nextBlocks);
                    markDirty();
                  }}
                  // A formatted block is read-only here; this is how an author
                  // gets to the surface that can edit it without losing marks.
                  onEditInWrite={() => setBodyMode('rich')}
                />
              )}
            </div>

            </div>
            <div data-editor-area="seo" hidden={area !== 'seo'} className="space-y-6">
            {/* FIELD 05 — SEO TITLE */}
            <div className="space-y-1 pt-4 border-t border-stone-100">
              <div className="flex items-center justify-between text-xs font-sans text-stone-600 mb-1">
                <label htmlFor="field-05-seotitle" className="font-bold text-stone-900 uppercase tracking-wider text-[11px]">
                  Field 05 &mdash; SEO Title
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-muted">
                    {seoTitle.length} chars (Target: 35&ndash;65)
                  </span>
                  {isSeoTitleCustom && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSeoTitleCustom(false);
                        setSeoTitle(title);
                        markDirty();
                      }}
                      className="inline-flex items-center min-h-6 px-1 text-[10px] font-mono text-[#8B5E3C] hover:underline"
                    >
                      Reset to Headline
                    </button>
                  )}
                </div>
              </div>
              <input
                id="field-05-seotitle"
                type="text"
                value={seoTitle}
                onChange={(e) => {
                  setSeoTitle(e.target.value);
                  setIsSeoTitleCustom(true);
                  markDirty();
                }}
                placeholder="Google SERP display title..."
                className="w-full text-xs sm:text-sm font-sans text-stone-800 p-2.5 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none focus:border-[#D4A757] transition-all"
              />
              <p className="text-[11px] text-ink-muted font-sans">
                Independently editable title tag. Editing this field does not overwrite the H1 headline.
              </p>
            </div>

            {/* FIELD 06 — META DESCRIPTION */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-sans text-stone-600 mb-1">
                <label htmlFor="field-06-metadesc" className="font-bold text-stone-900 uppercase tracking-wider text-[11px]">
                  Field 06 &mdash; Meta Description
                </label>
                <span className={`font-mono text-[11px] ${
                  metaDescription.length >= 110 && metaDescription.length <= 165 ? 'text-emerald-700 font-semibold' : 'text-ink-muted'
                }`}>
                  {metaDescription.length} chars (Target: 110&ndash;165)
                </span>
              </div>
              <textarea
                id="field-06-metadesc"
                rows={2}
                value={metaDescription}
                onChange={(e) => {
                  setMetaDescription(e.target.value);
                  markDirty();
                }}
                placeholder="Direct answer summary displayed in search snippets..."
                className="w-full text-xs sm:text-sm font-sans text-stone-800 p-2.5 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none focus:border-[#D4A757] transition-all"
              />
            </div>

            {/* FIELD 07 — IMAGE SEO TITLE */}
            <div className="space-y-1 pt-2">
              <div className="flex items-center justify-between text-xs font-sans text-stone-600 mb-1">
                <label htmlFor="field-07-imageseotitle" className="font-bold text-stone-900 uppercase tracking-wider text-[11px]">
                  Field 07 &mdash; Image SEO Title
                </label>
                <span className="text-[11px] font-mono text-ink-muted">Media Indexing</span>
              </div>
              <input
                id="field-07-imageseotitle"
                type="text"
                value={imageSeoTitle}
                onChange={(e) => {
                  setImageSeoTitle(e.target.value);
                  markDirty();
                }}
                placeholder="e.g. Bareback Rider Chute Exit at Thomas & Mack Center"
                className="w-full text-xs sm:text-sm font-sans text-stone-800 p-2.5 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none focus:border-[#D4A757] transition-all"
              />
            </div>

            {/* FIELD 08 — IMAGE ALT TEXT */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-sans text-stone-600 mb-1">
                <label htmlFor="field-08-imagealt" className="font-bold text-stone-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span>Field 08 &mdash; Image ALT Text</span>
                  <span className="text-required font-mono">*Required</span>
                </label>
                <span className="text-[11px] font-mono text-ink-muted">Accessibility &bull; No Keyword Stuffing</span>
              </div>
              <textarea
                id="field-08-imagealt"
                rows={2}
                value={imageAltText}
                onChange={(e) => {
                  setImageAltText(e.target.value);
                  markDirty();
                }}
                placeholder="Contextual, descriptive visual explanation for screen readers..."
                className="w-full text-xs sm:text-sm font-sans text-stone-800 p-2.5 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none focus:border-[#D4A757] transition-all"
              />
              {!imageAltText.trim() && (
                <p className="text-[11px] text-rose-600 font-mono pt-0.5">
                  Compliance blocker: Contextual ALT text is required for informative featured imagery.
                </p>
              )}
            </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: SECONDARY INSPECTOR PANELS */}
        {/* Independent scroll (Batch 25 UX): the inspector sticks below the 64px topbar and
            scrolls within its own area, so the SEO Assistant / gates stay in view while the
            author scrolls the editorial fields on the left. Stacks normally on mobile. */}
        {/* ======================================================== */}
        {/* Outer grid item stretches to the (tall) row height so the inner sticky wrapper has
            room to stick; inner wrapper pins below the 64px topbar and scrolls independently. */}
        <div
          className={
            /*
              The inspector column holds three of the four areas, so it takes the
              full width when the writing column is not beside it — otherwise
              Article Setup and Review would be squeezed into a third of the page
              with two thirds blank.
            */
            area === 'writing'
              ? 'hidden'
              : area === 'seo'
                ? 'lg:col-span-4 lg:self-stretch'
                : 'lg:col-span-12'
          }
        >
        <div data-testid="editor-inspector" className="space-y-6 font-sans text-xs lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1 editor-inspector-scroll">
          <div data-editor-area="review" hidden={area !== 'review'} className="space-y-6">
          {/* PANEL 1: WORKFLOW & PUBLISHING CONTROLS */}
          <div className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h4 className="font-serif font-bold text-stone-900 text-sm">
                Workflow State
              </h4>
              <span className={`px-2 py-0.5 font-mono uppercase text-[10px] font-bold rounded-xs ${
                workflowStatus === 'published'
                  ? 'bg-emerald-100 text-emerald-800'
                  : workflowStatus === 'in_review'
                  ? 'bg-amber-100 text-amber-800'
                  : workflowStatus === 'approved'
                  ? 'bg-blue-100 text-blue-800'
                  : workflowStatus === 'scheduled'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-stone-100 text-stone-700'
              }`}>
                {workflowStatus}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="editor-workflow-state" className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Change Workflow State
                </label>
                <select id="editor-workflow-state"
                  value={workflowStatus}
                  onChange={(e) => handleWorkflowTransition(e.target.value as ArticleWorkflowStatus)}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs font-sans text-stone-800 focus:outline-none focus:border-[#D4A757]"
                >
                  <option value="draft">Draft (Working State)</option>
                  <option value="in_review">In Review (Editorial Desk)</option>
                  <option value="approved">Approved (Ready to Publish)</option>
                  {/* Not selectable: scheduled publishing is unavailable. Shown only to label legacy rows. */}
                  {workflowStatus === 'scheduled' && (
                    <option value="scheduled" disabled>Scheduled — manual publish required</option>
                  )}
                  <option value="published">Published (Live Distribution)</option>
                  <option value="archived">Archived (Deprecate)</option>
                </select>
              </div>

              {workflowStatus === 'scheduled' && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xs space-y-1 text-[11px] text-amber-950" role="note">
                  <strong className="block font-bold">Manual publish required</strong>
                  <p>
                    Scheduled publishing is not available yet, so this article will not publish automatically
                    {scheduledAt ? ` at its recorded time (${scheduledAt})` : ''}. Publish it manually when ready, or unschedule it.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="editor-reviewer" className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Assigned Reviewer
                </label>
                <input id="editor-reviewer"
                  type="text"
                  value={reviewerName}
                  onChange={(e) => {
                    setReviewerName(e.target.value);
                    markDirty();
                  }}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800"
                />
              </div>

              {/* URL Slug & Publishing Path Inspector */}
              <div className="pt-3 border-t border-stone-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                    URL Slug &amp; Route Path
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const generated = title
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/(^-|-$)/g, '');
                      setSlug(generated);
                      setIsSlugCustom(false);
                      markDirty();
                      showNotification('Re-synchronized slug with headline');
                    }}
                    className="text-[10px] text-[#8B5E3C] hover:underline font-mono"
                    title="Regenerate slug from current headline"
                  >
                    Sync with Headline
                  </button>
                </div>
                <div className="flex items-center bg-stone-50 border border-stone-200 rounded-xs px-2 py-1 focus-within:border-[#D4A757] focus-within:bg-white transition-all">
                  <span className="text-ink-muted font-mono text-[11px] select-none">/articles/</span>
                  <input
                    id="editor-slug"
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      const clean = e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, '');
                      setSlug(clean);
                      setIsSlugCustom(true);
                      markDirty();
                    }}
                    className="w-full text-xs font-mono text-stone-900 bg-transparent focus:outline-none px-1"
                    placeholder="clean-article-slug"
                  />
                  <span className="text-ink-muted font-mono text-[11px] select-none">/</span>
                </div>
                {slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && (
                  <p className="text-[10px] text-rose-600 font-mono">
                    Slug must use lowercase letters, numbers, and hyphens without trailing/leading dashes.
                  </p>
                )}
                <div className="text-[10px] font-mono text-ink-muted truncate pt-0.5">
                  Canonical: {productionCanonicalUrl(`/articles/${slug}/`)}
                </div>
              </div>
            </div>
          </div>

          {/* PANEL 2: VALIDATION GATES & SEO QUALITY ENGINE */}
          <div className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h4 className="font-serif font-bold text-stone-900 text-sm">
                Quality &amp; SEO Gates
              </h4>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-bold ${
                validationReport.score >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {/* A checklist pass count, not an SEO score (Requirements §8.1). */}
                {validationReport.passedChecks} of {validationReport.totalChecks} checks passed
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs py-1 border-b border-stone-100">
                <span className="text-ink-muted">Category A &mdash; Editorial Blockers:</span>
                <span className={`font-mono font-bold ${
                  validationReport.blockers.length === 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {validationReport.blockers.length === 0 ? '0 Blockers (Pass)' : `${validationReport.blockers.length} Blocker(s)`}
                </span>
              </div>

              <div className="flex justify-between text-xs py-1 border-b border-stone-100">
                <span className="text-ink-muted">Category B &mdash; Rights &amp; Safety:</span>
                <span className={`font-mono font-bold ${
                  validationReport.compliance.length === 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {validationReport.compliance.length === 0 ? '0 Issues (Pass)' : `${validationReport.compliance.length} Issue(s)`}
                </span>
              </div>

              <div className="flex justify-between text-xs py-1 border-b border-stone-100">
                <span className="text-ink-muted">Category C &mdash; SEO Warnings:</span>
                <span className="font-mono text-amber-700 font-bold">
                  {validationReport.warnings.length} Warning(s)
                </span>
              </div>

              <div className="flex justify-between text-xs py-1">
                <span className="text-ink-muted">Ready for Live Publication:</span>
                <span className={`font-mono font-bold ${
                  validationReport.canPublish ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {validationReport.canPublish ? 'ELIGIBLE' : 'BLOCKED'}
                </span>
              </div>
            </div>

            {(!validationReport.canPublish || validationReport.warnings.length > 0) && (
              <button
                type="button"
                onClick={() => setValidationGateOpen(!validationGateOpen)}
                className="w-full mt-2 py-1.5 text-xs font-mono text-[#8B5E3C] bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xs transition-colors"
              >
                {validationGateOpen ? 'Hide Validation Findings' : 'Inspect All Validation Findings'}
              </button>
            )}
          </div>

          </div>
          <div data-editor-area="seo" hidden={area !== 'seo'} className="space-y-6">
          {/* PANEL 2b: DETAILED SEO ASSISTANT (Batch 25) — renders the full validateArticle output */}
          <SeoAssistantPanel
            report={validationReport}
            isDirty={isDirty}
            lastCheckedAt={seoLastCheckedAt}
            onCheck={handleCheckSeo}
            onGoToField={goToField}
          />

          </div>
          <div data-editor-area="setup" hidden={area !== 'setup'} className="space-y-6">
          {/* PANEL 3: ARTICLE CLASSIFICATION & BYLINE */}
          <div className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs space-y-4">
            <h4 className="font-serif font-bold text-stone-900 text-sm pb-2 border-b border-stone-100">
              Classification &amp; Metadata
            </h4>

            <div className="space-y-3">
              <div>
                <label htmlFor="editor-article-type" className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Article Type
                </label>
                <select id="editor-article-type"
                  value={articleType}
                  onChange={(e) => {
                    setArticleType(e.target.value);
                    markDirty();
                  }}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800"
                >
                  {/*
                    Batch 04-A — a stored LEGACY value must be visible, not blank.

                    THE DEFECT. The options were the 18 Title-Case typologies,
                    while all 11 published articles store a lowercase legacy
                    value (`guide`, `analysis`, `feature`). A select whose
                    `value` matches no `<option>` renders as if nothing were
                    chosen, so every existing article looked unclassified. The
                    state still held the real value, so an untouched save
                    preserved it — but the control invited an editor to "fix" a
                    field that was not broken, and once touched the original
                    value could never be chosen again.

                    THE FIX. When the current value is a recognised legacy type
                    it is rendered as its own option, clearly marked, and stays
                    selected. It is deliberately NOT added to the general list:
                    legacy values stay preservable but are not offered for new
                    classification. Nothing is silently converted — `guide`
                    never becomes `Event Guide`.
                  */}
                  {/*
                    Batch 04-E — the same rule, now over MANAGED definitions.

                    The current value is rendered as its own option whenever it
                    is not among the offered ones. That one condition covers
                    every case the 04-A legacy check covered and the three
                    04-E adds: a type an administrator deactivated, one they
                    archived, and a value the registry does not define at all
                    (which can only happen if a row was removed by hand).

                    It is deliberately NOT added to the offered list: those
                    values stay preservable but are never offered for new
                    classification, and nothing is silently converted —
                    `guide` never becomes `Event Guide`. The server enforces
                    the same rule in `saveArticle`, which is the boundary; this
                    is only what the editor sees.
                  */}
                  <option value="">Select article type…</option>
                  {articleType !== '' && !offeredTypes.some((t) => t.value === articleType) && (
                    <option value={articleType}>
                      {labelIn(typeSnapshot, articleType)}
                      {findType(typeSnapshot, articleType)
                        ? ' — no longer offered'
                        : ' — unrecognised'}
                    </option>
                  )}
                  {offeredTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="editor-primary-section" className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Primary Section
                </label>
                <select id="editor-primary-section"
                  value={category}
                  onChange={(e) => {
                    /**
                     * Batch 04-B - a subcategory belongs to ONE section, so a
                     * section change cannot silently keep an incompatible one.
                     * It is cleared here and the editor is told explicitly;
                     * saving it anyway would be refused by the service and by
                     * the composite foreign key, so a silent carry-over would
                     * only produce a confusing error later.
                     */
                    const next = e.target.value;
                    if (subcategoryId && next !== category) {
                      const cleared = (relationshipOptions.subcategoriesBySection[category] ?? [])
                        .find((o) => o.id === subcategoryId)?.label;
                      setSubcategoryId('');
                      setSectionChangeNotice(
                        cleared
                          ? 'Subcategory "' + cleared + '" was cleared: it belongs to ' + category + '. Choose one from ' + (next || 'the new section') + '.'
                          : 'The subcategory was cleared because it belongs to the previous section.',
                      );
                    } else {
                      setSectionChangeNotice(null);
                    }
                    setCategory(next);
                    markDirty();
                  }}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800"
                >
                  {/*
                    Stage 02 (H-01) — rendered from the MANAGED categories the
                    server page resolved, so a category an administrator creates
                    appears here without a code change. The article's current
                    value is included even when it is no longer in the list, so
                    nothing reads as unclassified and nothing is silently
                    converted.
                  */}
                  <option value="">Select primary section…</option>
                  {sectionOptions.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div>

              {/*
                Batch 04-B - managed Subcategory selector.

                THE DEFECT IT REPLACES. This was a free-text box whose
                placeholder offered three unrelated examples - one of them
                ("Roughstock") a Discipline classification, not a subcategory.
                Eleven articles produced eleven distinct one-off labels, so the
                field grouped nothing.

                Options come from the server, already filtered to ACTIVE
                subcategories of the selected section, so an archived one cannot
                be newly assigned and a cross-section one is never offered. The
                legacy label is shown read-only underneath: it is preserved in
                the database, no backfill has run, and the public page still
                falls back to it.
              */}
              <div>
                <label htmlFor="editor-subcategory" className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Subcategory
                </label>
                {(() => {
                  const options = relationshipOptions.subcategoriesBySection[category] ?? [];
                  // An article may point at an ARCHIVED subcategory. It is not in
                  // `options`, so it is added here - otherwise saving an
                  // unrelated field would silently drop the classification.
                  const current = existingArticle?.subcategoryRef;
                  const archivedCurrent =
                    current && current.id === subcategoryId && !options.some((o) => o.id === current.id)
                      ? current
                      : null;
                  return (
                    <>
                      <select id="editor-subcategory"
                        value={subcategoryId}
                        disabled={!category}
                        onChange={(e) => { setSubcategoryId(e.target.value); setSectionChangeNotice(null); markDirty(); }}
                        className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800 disabled:opacity-60"
                      >
                        <option value="">No subcategory</option>
                        {archivedCurrent && (
                          <option value={archivedCurrent.id}>{archivedCurrent.name} (archived)</option>
                        )}
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                      {!category && (
                        <p className="mt-1 text-[11px] text-stone-500">Choose a primary section first.</p>
                      )}
                      {category && options.length === 0 && !archivedCurrent && (
                        <p className="mt-1 text-[11px] text-stone-500">
                          {category} has no subcategories yet - add them in Editorial Organization.
                        </p>
                      )}
                      {sectionChangeNotice && (
                        <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xs px-2 py-1">
                          {sectionChangeNotice}
                        </p>
                      )}
                      {legacySubcategory && (
                        <p className="mt-1 text-[11px] text-stone-500">
                          Previous free-text label: <span className="font-mono text-stone-600">{legacySubcategory}</span>
                          {' '}- kept on the record and still shown publicly until a managed subcategory is chosen.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

              <div>
                <label htmlFor="editor-author-byline" className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Author Byline
                </label>
                <select id="editor-author-byline"
                  value={authorKey}
                  onChange={(e) => {
                    setAuthorKey(e.target.value);
                    markDirty();
                  }}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800"
                >
                  <option value="">{authors.length ? 'Select author…' : 'No authors — add one in Organization & Taxonomy'}</option>
                  {authors.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} &bull; {a.role}</option>
                  ))}
                </select>
                {legacyBylineName && !authorKey && (
                  <p className="text-[11px] text-amber-700 font-mono mt-1">Legacy byline “{legacyBylineName}” — preserved on save. Pick a database author to update it.</p>
                )}
              </div>

              {/* Tags Input */}
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Taxonomy Tags
                </label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 text-[10px] font-mono bg-stone-100 text-stone-800 px-2 py-0.5 rounded-xs"
                    >
                      #{t}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="text-ink-muted hover:text-rose-600"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Type tag and hit Enter..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  className="w-full p-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xs"
                />
              </div>

              {/* Commercial Disclosures */}
              <div className="pt-2 border-t border-stone-100">
                <label htmlFor="editor-disclosure" className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Monetization Disclosure
                </label>
                <select id="editor-disclosure"
                  value={disclosure}
                  onChange={(e) => {
                    setDisclosure(e.target.value as DisclosureType);
                    markDirty();
                  }}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800"
                >
                  <option value="editorial-independent">Editorial Independent (Standard)</option>
                  <option value="affiliate">Affiliate Partner Links Contained</option>
                  <option value="sponsored">Sponsored / Commercial Feature</option>
                </select>
                {disclosure !== 'editorial-independent' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Disclosure Notice (e.g. Partnered with South Point)..."
                      value={disclosureNote}
                      onChange={(e) => {
                        setDisclosureNote(e.target.value);
                        markDirty();
                      }}
                      className="w-full p-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xs text-stone-800"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          </div>
          <div data-editor-area="seo" hidden={area !== 'seo'} className="space-y-6">
          {/* PANEL 4: FEATURED MEDIA & RIGHTS INSPECTOR */}
          <div className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h4 className="font-serif font-bold text-stone-900 text-sm">
                Featured Photography
              </h4>
              <button
                type="button"
                onClick={() => setMediaPickerOpen(true)}
                className="text-xs font-mono text-[#D4A757] hover:underline bg-[#0F1115] px-2.5 py-1 rounded-xs"
              >
                Change Media
              </button>
            </div>

            <div className="space-y-3">
              <div className="aspect-16/10 bg-stone-900 rounded-xs overflow-hidden border border-stone-300 relative">
                {heroImage ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={heroImage} alt={imageAltText || title} className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono px-1.5 py-0.5 bg-black/70 text-white rounded-xs">Rights: {imageRightsStatus}</span>
                  </>
                ) : (
                  <button type="button" onClick={() => setMediaPickerOpen(true)} className="w-full h-full flex flex-col items-center justify-center gap-2 text-ink-inverse-muted hover:text-stone-200 bg-stone-800/60">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="text-[11px] font-mono">No featured image — click to choose</span>
                  </button>
                )}
              </div>

              <div>
                <label htmlFor="editor-rights-status" className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Usage Rights Status
                </label>
                <select id="editor-rights-status"
                  value={imageRightsStatus}
                  onChange={(e) => {
                    setImageRightsStatus(e.target.value as any);
                    markDirty();
                  }}
                  className={`w-full p-2 border rounded-xs text-xs font-mono font-semibold ${
                    imageRightsStatus === 'Unresolved'
                      ? 'border-rose-400 bg-rose-50 text-rose-800'
                      : 'border-stone-200 bg-stone-50 text-stone-800'
                  }`}
                >
                  <option value="Staff Photo">Staff Photo (NFRGuide Owned)</option>
                  <option value="Editorial Pool">Editorial Pool (PRCA Media Pool)</option>
                  <option value="PRCA Archive">PRCA Archive (Historic Press Pass)</option>
                  <option value="Licensed Creative">Licensed Creative (Licensed Licensee)</option>
                  <option value="Unresolved">Unresolved (BLOCKS PUBLICATION)</option>
                </select>
                {imageRightsStatus === 'Unresolved' && (
                  <p className="text-[11px] text-rose-600 font-mono mt-1">
                    Unresolved rights violate publication gatekeeper rules.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="editor-image-credit" className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Photographer / Agency Credit
                </label>
                <input id="editor-image-credit"
                  type="text"
                  value={imageCredit}
                  onChange={(e) => {
                    setImageCredit(e.target.value);
                    markDirty();
                  }}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800 font-mono text-[11px]"
                />
              </div>

              <div>
                <label htmlFor="editor-image-caption" className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Caption
                </label>
                <input id="editor-image-caption"
                  type="text"
                  value={imageCaption}
                  onChange={(e) => {
                    setImageCaption(e.target.value);
                    markDirty();
                  }}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800"
                />
              </div>
            </div>
          </div>

          </div>
          <div data-editor-area="setup" hidden={area !== 'setup'} className="space-y-6">
          {/* PANEL 5: RODEO ENTITY RELATIONSHIPS */}
          <div id="editor-relationships" tabIndex={-1} className="scroll-mt-20">
            <RodeoRelationshipsPanel
              relationships={relationships}
              options={relationshipOptions}
              onChange={(nextRel) => {
                setRelationships(nextRel);
                markDirty();
              }}
            />
          </div>

          </div>
          <div data-editor-area="seo" hidden={area !== 'seo'} className="space-y-6">
          {/* PANEL 6: SOURCES & EVIDENCE CITATIONS */}
          <div id="editor-sources" tabIndex={-1} className="scroll-mt-20">
            <ArticleSourcesPanel
              sources={sources}
              directory={sourceDirectory}
              onChange={(nextSources) => {
                setSources(nextSources);
                markDirty();
              }}
            />
          </div>

          {/* PANEL 7: SEARCH APPEARANCE PREVIEW */}
          <SearchAppearancePreview
            article={currentArticleSnapshot}
            slug={slug}
            storedRobots={existingArticle?.seo?.robots}
            workflowStatus={workflowStatus}
          />
          </div>
        </div>
        </div>
      </div>

      {/* MODAL 1: MEDIA LIBRARY PICKER */}
      {mediaPickerOpen && (
        <MediaPickerModal
          isOpen={true}
          onClose={() => setMediaPickerOpen(false)}
          onSelect={handleMediaSelected}
        />
      )}

      {/* MODAL 2: REVISION HISTORY */}
      {historyOpen && (
        <RevisionHistoryModal
          isOpen={true}
          onClose={() => setHistoryOpen(false)}
          revisions={initialRevisions}
          currentArticle={currentArticleSnapshot}
          onRestore={handleRestoreRevision}
        />
      )}

      {/* MODAL 3: FULL EDITORIAL PREVIEW */}
      {previewOpen && (
        <ArticleDraftPreview
          article={currentArticleSnapshot}
          articleTypes={typeSnapshot}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
};

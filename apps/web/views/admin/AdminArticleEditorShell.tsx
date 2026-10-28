'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Article, ArticleWorkflowStatus, ArticleType, PrimarySection, ContentBlock, SourceReference, DisclosureType } from '../../types';
import { AdminRole } from '../../types/admin';
import { articleStore } from '../../data/articleStore';
import { AUTHORS } from '../../data/mockEditorialData';
import { ROUTES } from '../../config/routes';
import { validateArticle } from '../../utils/seoValidator';
import { RichBlockEditor } from '../../components/admin/editor/RichBlockEditor';
import { SearchAppearancePreview } from '../../components/admin/editor/SearchAppearancePreview';
import { RevisionHistoryModal } from '../../components/admin/editor/RevisionHistoryModal';
import { RodeoRelationshipsPanel, RodeoRelationshipsData } from '../../components/admin/editor/RodeoRelationshipsPanel';
import { ArticleSourcesPanel } from '../../components/admin/editor/ArticleSourcesPanel';
import { MediaPickerModal, SelectedMediaData } from '../../components/admin/editor/MediaPickerModal';
import { ArticleDraftPreview } from '../../components/admin/editor/ArticleDraftPreview';

const ALL_ARTICLE_TYPES: ArticleType[] = [
  'News',
  'Event Update',
  'Event Guide',
  'Schedule',
  'Results & Standings',
  'How to Watch',
  'Preview',
  'Competitor Profile',
  'Rules & Format',
  'History',
  'Records & Past Winners',
  'Entertainment Guide',
  'Ticket Guide',
  'Venue Guide',
  'Travel Guide',
  'Product Buying Guide',
  'Product Review',
  'General Information',
];

const PRIMARY_SECTIONS: PrimarySection[] = [
  'NFR Competition',
  'NFR Entertainment',
  'NFR Events & Shopping',
  'NFR Plan & Watch',
  'More Rodeo',
];

export const AdminArticleEditorShell: React.FC = () => {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const isNew = !id;

  // Retrieve initial article from store
  const existingArticle = id ? articleStore.getArticleById(id) : undefined;

  // Role simulator state (UI prototype)
  const [actingRole, setActingRole] = useState<AdminRole>('Editor');

  // Exact 8 primary fields state
  const [title, setTitle] = useState(existingArticle?.title || '');
  const [deck, setDeck] = useState(existingArticle?.deck || '');
  const [excerpt, setExcerpt] = useState(existingArticle?.excerpt || '');
  const [blocks, setBlocks] = useState<ContentBlock[]>(
    existingArticle?.structuredBody || [
      {
        type: 'paragraph',
        text: 'Inside the neon corridor of the Thomas & Mack Center, the championship air carries the sharp scent of damp sand and anticipation.',
        isDropCap: true,
      },
      {
        type: 'heading',
        level: 2,
        text: 'The Anatomy of the 8-Second Whistle',
      },
      {
        type: 'paragraph',
        text: 'Judges award up to 50 points to the rider for balance and spurring cadence, and up to 50 points to the bucking animal for kick height and raw velocity.',
      },
    ]
  );
  const [seoTitle, setSeoTitle] = useState(existingArticle?.seo?.title || '');
  const [isSeoTitleCustom, setIsSeoTitleCustom] = useState(Boolean(existingArticle?.seo?.title));
  const [metaDescription, setMetaDescription] = useState(existingArticle?.seo?.description || '');
  const [imageSeoTitle, setImageSeoTitle] = useState(
    existingArticle?.imageSeoTitle || `${existingArticle?.title || 'Championship Rodeo'} — Featured Action Photography`
  );
  const [imageAltText, setImageAltText] = useState(
    existingArticle?.imageAltText || (existingArticle?.title ? `Action photograph illustrating ${existingArticle.title}` : '')
  );

  // Secondary metadata state
  const [slug, setSlug] = useState(
    existingArticle?.slug ||
      (existingArticle?.title
        ? existingArticle.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        : 'new-editorial-dispatch')
  );
  const [isSlugCustom, setIsSlugCustom] = useState(Boolean(existingArticle?.slug));
  const [category, setCategory] = useState<PrimarySection>(existingArticle?.category || 'NFR Competition');
  const [subcategory, setSubcategory] = useState(existingArticle?.subcategory || 'Roughstock');
  const [articleType, setArticleType] = useState<ArticleType>(existingArticle?.articleType || 'Event Guide');
  const [workflowStatus, setWorkflowStatus] = useState<ArticleWorkflowStatus>(
    (existingArticle?.workflowStatus || existingArticle?.status || 'draft') as ArticleWorkflowStatus
  );
  const [authorKey, setAuthorKey] = useState<string>('clayton');
  const [reviewerName, setReviewerName] = useState(existingArticle?.reviewerName || 'Elena Morales');
  const [scheduledAt, setScheduledAt] = useState(existingArticle?.scheduledAt || '');
  const [heroImage, setHeroImage] = useState(
    existingArticle?.heroImage || '/assets/images/hero_bull_riding_1793166440262.jpg'
  );
  const [imageCredit, setImageCredit] = useState(existingArticle?.imageCredit || 'Editorial Staff Archives / NFRGuide');
  const [imageCaption, setImageCaption] = useState(existingArticle?.imageCaption || 'Championship action inside the arena.');
  const [imageRightsStatus, setImageRightsStatus] = useState<'Staff Photo' | 'Editorial Pool' | 'PRCA Archive' | 'Licensed Creative' | 'Unresolved'>(
    existingArticle?.imageRightsStatus || 'Staff Photo'
  );

  // Tags & Disclosures
  const [tags, setTags] = useState<string[]>(existingArticle?.tags || ['NFR 2026', 'Roughstock', 'Judicial Scoring']);
  const [newTagInput, setNewTagInput] = useState('');
  const [disclosure, setDisclosure] = useState<DisclosureType>(existingArticle?.disclosure || 'editorial-independent');
  const [disclosureNote, setDisclosureNote] = useState(existingArticle?.disclosureNote || '');

  // Entity Relationships
  const [relationships, setRelationships] = useState<RodeoRelationshipsData>({
    disciplineIds: existingArticle?.associatedDisciplineIds || (existingArticle?.associatedDisciplineId ? [existingArticle.associatedDisciplineId] : []),
    hubIds: existingArticle?.associatedHubIds || (existingArticle?.associatedHubId ? [existingArticle.associatedHubId] : ['las-vegas-nfr']),
    eventIds: existingArticle?.associatedEventIds || (existingArticle?.associatedEventId ? [existingArticle.associatedEventId] : ['nfr-championship']),
    editionIds: existingArticle?.associatedEditionIds || ['nfr-2026'],
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
    const selectedAuthorObj = (AUTHORS as any)[authorKey] || AUTHORS.clayton;
    const author = {
      name: selectedAuthorObj.name,
      role: selectedAuthorObj.role,
      credentials: selectedAuthorObj.credentials,
      editorialBeat: selectedAuthorObj.editorialBeat,
      bio: selectedAuthorObj.bio,
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
      subcategory,
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
        canonicalUrl: `https://nfrguide.com/articles/${slug}/`,
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
    subcategory,
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

  // Validation report
  const validationReport = useMemo(() => {
    return validateArticle(currentArticleSnapshot);
  }, [currentArticleSnapshot]);


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

  // State Machine Transitions
  const handleWorkflowTransition = (targetStatus: ArticleWorkflowStatus): boolean => {
    // Check permission rules for simulated role
    if (targetStatus === 'published' && actingRole === 'Author') {
      showNotification('Authors cannot publish directly. Submit for review instead.');
      return false;
    }

    // Publication Gatekeeper: Check Blockers & Compliance
    if (targetStatus === 'published') {
      if (!validationReport.canPublish) {
        setValidationGateOpen(true);
        showNotification('Publication blocked by unresolved Category A or B findings.');
        return false;
      }
    }

    setWorkflowStatus(targetStatus);
    markDirty();
    showNotification(`Workflow state updated to "${targetStatus.toUpperCase()}"`);
    return true;
  };

  // Save Draft to Store
  const handleSaveDraft = (summary: string = 'Saved working draft in this demo session') => {
    const targetId = id || articleStore.generateNextArticleId();
    const articleToSave: Article = {
      ...currentArticleSnapshot,
      id: targetId,
    };

    articleStore.saveArticle(articleToSave, 'Current Editor', actingRole, summary);
    setIsDirty(false);
    showNotification('Saved in this demo session.');

    if (isNew) {
      router.replace(`/admin/articles/${targetId}/edit/`);
    }
  };

  // Handle Restore Revision
  const handleRestoreRevision = (revisionId: string) => {
    if (!id) return;
    const restored = articleStore.restoreRevision(id, revisionId);
    if (restored) {
      setTitle(restored.title || '');
      setDeck(restored.deck || '');
      setExcerpt(restored.excerpt || '');
      setBlocks(restored.structuredBody || []);
      setWorkflowStatus((restored.workflowStatus || restored.status || 'draft') as ArticleWorkflowStatus);
      setSeoTitle(restored.seo?.title || '');
      setMetaDescription(restored.seo?.description || '');
      showNotification('Restored revision into editor');
    }
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
          <span className="text-xs font-mono uppercase tracking-wider text-stone-500">
            {isNew ? 'New Article Composer' : `Document ID: ${id}`}
          </span>
          {isDirty && (
            <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-100 text-amber-800 rounded-xs font-bold animate-pulse">
              Unsaved Changes
            </span>
          )}
        </div>

        {/* Right: Role Switcher & Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Role Simulator Switcher */}
          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 px-2 py-1 rounded-xs text-[11px] font-sans">
            <span className="text-stone-500">Role:</span>
            <select
              value={actingRole}
              onChange={(e) => setActingRole(e.target.value as AdminRole)}
              className="bg-transparent font-semibold text-stone-900 focus:outline-none"
              title="Simulate editorial permissions"
            >
              <option value="Super Admin">Super Admin</option>
              <option value="Administrator">Administrator</option>
              <option value="Editor">Editor</option>
              <option value="Author">Author</option>
              <option value="SEO Manager">SEO Manager</option>
            </select>
          </div>

          {/* Revision History */}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="px-3 py-1.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold rounded-xs transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-900 text-xs font-bold rounded-xs transition-colors"
          >
            Save Draft
          </button>

          {/* Primary State-Driven Action */}
          {workflowStatus === 'draft' && (
            <button
              type="button"
              onClick={() => handleWorkflowTransition('in_review')}
              className="px-4 py-1.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-bold uppercase tracking-wider rounded-xs transition-colors shadow-xs"
            >
              Submit for Review
            </button>
          )}

          {workflowStatus === 'in_review' && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleWorkflowTransition('draft')}
                className="px-3 py-1.5 bg-rose-50 border border-rose-300 text-rose-800 hover:bg-rose-100 text-xs font-bold rounded-xs"
              >
                Request Changes
              </button>
              <button
                type="button"
                onClick={() => handleWorkflowTransition('approved')}
                className="px-4 py-1.5 bg-emerald-800 text-white hover:bg-emerald-900 text-xs font-bold uppercase tracking-wider rounded-xs"
              >
                Approve Article
              </button>
            </div>
          )}

          {workflowStatus === 'approved' && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleWorkflowTransition('scheduled')}
                className="px-3 py-1.5 bg-white border border-stone-300 text-stone-800 hover:bg-stone-50 text-xs font-bold rounded-xs"
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={() => {
                  const success = handleWorkflowTransition('published');
                  if (success) {
                    handleSaveDraft('Published article to live publication catalog');
                  }
                }}
                disabled={actingRole === 'Author'}
                className="px-4 py-1.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-bold uppercase tracking-wider rounded-xs shadow-xs disabled:opacity-50"
              >
                Publish Now
              </button>
            </div>
          )}

          {workflowStatus === 'scheduled' && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleWorkflowTransition('approved')}
                className="px-3 py-1.5 bg-stone-100 border border-stone-300 text-stone-700 text-xs font-bold rounded-xs"
              >
                Unschedule
              </button>
              <button
                type="button"
                onClick={() => {
                  const success = handleWorkflowTransition('published');
                  if (success) {
                    handleSaveDraft('Published scheduled article immediately');
                  }
                }}
                disabled={actingRole === 'Author'}
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
                className="px-3 py-1.5 bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold rounded-xs"
              >
                Unpublish to Draft
              </button>
              <button
                type="button"
                onClick={() => handleWorkflowTransition('archived')}
                className="px-3 py-1.5 bg-stone-100 text-stone-700 text-xs font-bold rounded-xs"
              >
                Archive
              </button>
            </div>
          )}

          {workflowStatus === 'archived' && (
            <button
              type="button"
              onClick={() => handleWorkflowTransition('draft')}
              className="px-4 py-1.5 bg-white border border-stone-300 text-stone-900 text-xs font-bold rounded-xs"
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
              className="text-stone-500 hover:text-stone-900"
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

      {/* MAIN TWO-COLUMN WORKSPACE: 8-COL FORM + 4-COL INSPECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ======================================================== */}
        {/* LEFT COLUMN: EXACT 8 PRIMARY FIELDS IN REQUIRED ORDER */}
        {/* ======================================================== */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white border border-stone-200 rounded-sm p-6 shadow-2xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-bold">
                Primary Editorial Fields (01 &ndash; 08)
              </span>
              <span className="text-[11px] font-mono text-stone-400">
                Exact Editorial Sequence Preserved
              </span>
            </div>

            {/* FIELD 01 — MAIN HEADLINE (H1) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-sans text-stone-600 mb-1">
                <label htmlFor="field-01-headline" className="font-bold text-stone-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span>Field 01 &mdash; Main Headline (H1)</span>
                  <span className="text-rose-500 font-mono">*Required</span>
                </label>
                <span className={`font-mono text-[11px] ${
                  title.length > 70 ? 'text-amber-600 font-semibold' : 'text-stone-500'
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
                <span className="text-[11px] font-mono text-stone-400">Optional Context</span>
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
                  <span className="text-rose-500 font-mono">*Required</span>
                </label>
                <span className={`font-mono text-[11px] ${
                  excerpt.length >= 100 && excerpt.length <= 220 ? 'text-emerald-700 font-semibold' : 'text-stone-500'
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

            {/* FIELD 04 — ARTICLE BODY (RICH BLOCK EDITOR) */}
            <div className="space-y-2 pt-2 border-t border-stone-100">
              <div className="flex items-center justify-between">
                <label className="font-bold text-stone-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5 font-sans">
                  <span>Field 04 &mdash; Article Body</span>
                  <span className="text-rose-500 font-mono">*Required</span>
                </label>
                <span className="text-[10px] font-mono text-[#8B5E3C] bg-[#F7F3EA] border border-[#8B5E3C]/30 px-2 py-0.5 rounded-xs">
                  Structured JSON Model
                </span>
              </div>

              <RichBlockEditor
                blocks={blocks}
                onChange={(nextBlocks) => {
                  setBlocks(nextBlocks);
                  markDirty();
                }}
              />
            </div>

            {/* FIELD 05 — SEO TITLE */}
            <div className="space-y-1 pt-4 border-t border-stone-100">
              <div className="flex items-center justify-between text-xs font-sans text-stone-600 mb-1">
                <label htmlFor="field-05-seotitle" className="font-bold text-stone-900 uppercase tracking-wider text-[11px]">
                  Field 05 &mdash; SEO Title
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-stone-500">
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
                      className="text-[10px] font-mono text-[#8B5E3C] hover:underline"
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
              <p className="text-[11px] text-stone-500 font-sans">
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
                  metaDescription.length >= 110 && metaDescription.length <= 165 ? 'text-emerald-700 font-semibold' : 'text-stone-500'
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
                <span className="text-[11px] font-mono text-stone-400">Media Indexing</span>
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
                  <span className="text-rose-500 font-mono">*Required</span>
                </label>
                <span className="text-[11px] font-mono text-stone-400">Accessibility &bull; No Keyword Stuffing</span>
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

        {/* ======================================================== */}
        {/* RIGHT COLUMN: SECONDARY INSPECTOR PANELS */}
        {/* ======================================================== */}
        <div className="lg:col-span-4 space-y-6 font-sans text-xs">
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
                <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Change Workflow State
                </label>
                <select
                  value={workflowStatus}
                  onChange={(e) => handleWorkflowTransition(e.target.value as ArticleWorkflowStatus)}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs font-sans text-stone-800 focus:outline-none focus:border-[#D4A757]"
                >
                  <option value="draft">Draft (Working State)</option>
                  <option value="in_review">In Review (Editorial Desk)</option>
                  <option value="approved">Approved (Ready to Schedule/Publish)</option>
                  <option value="scheduled">Scheduled (Embargo Date)</option>
                  <option value="published">Published (Live Distribution)</option>
                  <option value="archived">Archived (Deprecate)</option>
                </select>
              </div>

              {workflowStatus === 'scheduled' && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xs space-y-1">
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-purple-900 font-bold">
                    Embargo Date &amp; Time
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => {
                      setScheduledAt(e.target.value);
                      markDirty();
                    }}
                    className="w-full text-xs font-mono p-1.5 bg-white border border-purple-300 rounded-xs text-purple-950"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Assigned Reviewer
                </label>
                <input
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
                      setSlug(generated || 'new-editorial-dispatch');
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
                  <span className="text-stone-400 font-mono text-[11px] select-none">/articles/</span>
                  <input
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
                  <span className="text-stone-400 font-mono text-[11px] select-none">/</span>
                </div>
                {slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && (
                  <p className="text-[10px] text-rose-600 font-mono">
                    Slug must use lowercase letters, numbers, and hyphens without trailing/leading dashes.
                  </p>
                )}
                <div className="text-[10px] font-mono text-stone-400 truncate pt-0.5">
                  Canonical: https://nfrguide.com/articles/{slug}/
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
                {validationReport.score}% Score
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs py-1 border-b border-stone-100">
                <span className="text-stone-500">Category A &mdash; Editorial Blockers:</span>
                <span className={`font-mono font-bold ${
                  validationReport.blockers.length === 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {validationReport.blockers.length === 0 ? '0 Blockers (Pass)' : `${validationReport.blockers.length} Blocker(s)`}
                </span>
              </div>

              <div className="flex justify-between text-xs py-1 border-b border-stone-100">
                <span className="text-stone-500">Category B &mdash; Rights &amp; Safety:</span>
                <span className={`font-mono font-bold ${
                  validationReport.compliance.length === 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {validationReport.compliance.length === 0 ? '0 Issues (Pass)' : `${validationReport.compliance.length} Issue(s)`}
                </span>
              </div>

              <div className="flex justify-between text-xs py-1 border-b border-stone-100">
                <span className="text-stone-500">Category C &mdash; SEO Warnings:</span>
                <span className="font-mono text-amber-700 font-bold">
                  {validationReport.warnings.length} Warning(s)
                </span>
              </div>

              <div className="flex justify-between text-xs py-1">
                <span className="text-stone-500">Ready for Live Publication:</span>
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

          {/* PANEL 3: ARTICLE CLASSIFICATION & BYLINE */}
          <div className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs space-y-4">
            <h4 className="font-serif font-bold text-stone-900 text-sm pb-2 border-b border-stone-100">
              Classification &amp; Metadata
            </h4>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Article Type (18 Typologies)
                </label>
                <select
                  value={articleType}
                  onChange={(e) => {
                    setArticleType(e.target.value as ArticleType);
                    markDirty();
                  }}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800"
                >
                  {ALL_ARTICLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Primary Section
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value as PrimarySection);
                    markDirty();
                  }}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800"
                >
                  {PRIMARY_SECTIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Subcategory
                </label>
                <input
                  type="text"
                  value={subcategory}
                  onChange={(e) => {
                    setSubcategory(e.target.value);
                    markDirty();
                  }}
                  placeholder="e.g. Roughstock, Arena Logistics, Ticketing..."
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Author Byline
                </label>
                <select
                  value={authorKey}
                  onChange={(e) => {
                    setAuthorKey(e.target.value);
                    markDirty();
                  }}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-800"
                >
                  <option value="clayton">Clayton Vance &bull; Senior Rodeo Correspondent</option>
                  <option value="elena">Elena Morales &bull; Staff Editor & Researcher</option>
                  <option value="marcus">Marcus Sterling &bull; Travel & Venue Editor</option>
                  <option value="sarah">Sarah Jenkins &bull; Western Lifestyle Editor</option>
                </select>
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
                        className="text-stone-400 hover:text-rose-600"
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
                <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Monetization Disclosure
                </label>
                <select
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
                <img
                  src={heroImage}
                  alt={imageAltText || title}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-1 right-1 text-[9px] font-mono px-1.5 py-0.5 bg-black/70 text-white rounded-xs">
                  Rights: {imageRightsStatus}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Usage Rights Status
                </label>
                <select
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
                <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Photographer / Agency Credit
                </label>
                <input
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
                <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                  Caption
                </label>
                <input
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

          {/* PANEL 5: RODEO ENTITY RELATIONSHIPS */}
          <RodeoRelationshipsPanel
            relationships={relationships}
            onChange={(nextRel) => {
              setRelationships(nextRel);
              markDirty();
            }}
          />

          {/* PANEL 6: SOURCES & EVIDENCE CITATIONS */}
          <ArticleSourcesPanel
            sources={sources}
            onChange={(nextSources) => {
              setSources(nextSources);
              markDirty();
            }}
          />

          {/* PANEL 7: SEARCH APPEARANCE PREVIEW */}
          <SearchAppearancePreview
            article={currentArticleSnapshot}
            slug={slug}
          />
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
          revisions={articleStore.getRevisions(id || 'new-article-id')}
          currentArticle={currentArticleSnapshot}
          onRestore={handleRestoreRevision}
        />
      )}

      {/* MODAL 3: FULL EDITORIAL PREVIEW */}
      {previewOpen && (
        <ArticleDraftPreview
          article={currentArticleSnapshot}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
};

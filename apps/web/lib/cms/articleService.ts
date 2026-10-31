import 'server-only';
import { z } from 'zod';
import { Prisma, WorkflowStatus, ImageRightsStatus } from '@prisma/client';
import { prisma } from '../db';
import { RoleKey, Permission, roleHasPermission } from '../auth/rbac';
import { validateArticle } from '../../utils/seoValidator';
import type { Article, ContentBlock } from '../../types';
import { safeHref } from '../url';

/**
 * Authenticated, RBAC-enforced CMS article operations (Batch 03 §6/§7/§8).
 * The acting user is passed in explicitly (ActorContext) so these functions are
 * unit/integration-testable without request context. Every operation:
 *   - enforces permissions (default-deny) and ownership where required,
 *   - validates input server-side (zod),
 *   - uses a transaction for multi-table writes,
 *   - detects concurrent edits via an optimistic `version` check,
 *   - records a revision + workflow history + audit log where relevant.
 * Public cache revalidation is handled by the Server Action layer.
 */

export interface ActorContext {
  id: string;
  roles: RoleKey[];
}

export type ServiceErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'invalid_transition'
  // Batch 05 media codes
  | 'processing'
  | 'storage'
  // Batch 07 analytics/ingest codes
  | 'rate_limited'
  | 'disabled';

export class ServiceError extends Error {
  code: ServiceErrorCode;
  details?: unknown;
  constructor(code: ServiceErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function assert(actor: ActorContext, perm: Permission): void {
  if (!roleHasPermission(actor.roles, perm)) {
    throw new ServiceError('forbidden', `Missing permission: ${perm}`);
  }
}

const cleanJson = (v: unknown): object => JSON.parse(JSON.stringify(v ?? {}));
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const RIGHTS: Record<string, ImageRightsStatus> = {
  'Staff Photo': 'STAFF_PHOTO', 'Editorial Pool': 'EDITORIAL_POOL', 'PRCA Archive': 'PRCA_ARCHIVE',
  'Licensed Creative': 'LICENSED_CREATIVE', Unresolved: 'UNRESOLVED',
};

const blockSchema: z.ZodType = z.object({ type: z.string() }).passthrough();

export const ArticleInputSchema = z.object({
  id: z.string().optional(),
  expectedVersion: z.number().int().optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug'),
  title: z.string().min(1).max(300),
  deck: z.string().max(600).optional().default(''),
  excerpt: z.string().min(1).max(1000),
  blocks: z.array(blockSchema).default([]),
  seoTitle: z.string().max(300).optional().default(''),
  metaDescription: z.string().max(600).optional().default(''),
  imageSeoTitle: z.string().max(300).optional().default(''),
  imageAltText: z.string().max(600).optional().default(''),
  subcategory: z.string().max(120).optional().default(''),
  articleType: z.string().max(80).default('General Information'),
  categoryName: z.string().min(1),
  authorName: z.string().min(1),
  authorRole: z.string().optional().default('Staff Writer'),
  reviewerName: z.string().optional().default(''),
  heroImage: z.string().max(600).optional().default(''),
  imageCredit: z.string().max(300).optional().default(''),
  imageCaption: z.string().max(600).optional().default(''),
  imageRightsStatus: z.string().optional().default('Staff Photo'),
  disclosure: z.string().optional().default('editorial-independent'),
  disclosureNote: z.string().max(600).optional().default(''),
  tags: z.array(z.string().max(60)).default([]),
  takeaways: z.array(z.string().max(400)).default([]),
  sources: z.array(z.object({
    title: z.string().min(1), url: z.string(), publisher: z.string().optional(), note: z.string().optional(),
  })).default([]),
  disciplineIds: z.array(z.string()).default([]),
  hubIds: z.array(z.string()).default([]),
  eventIds: z.array(z.string()).default([]),
  editionIds: z.array(z.string()).default([]),
});

export type ArticleInput = z.input<typeof ArticleInputSchema>;

/** Build a Partial<Article> for the publication gate from validated input. */
function toValidatorShape(v: z.infer<typeof ArticleInputSchema>): Partial<Article> {
  return {
    title: v.title,
    excerpt: v.excerpt,
    slug: v.slug,
    structuredBody: v.blocks as unknown as ContentBlock[],
    imageRightsStatus: (v.imageRightsStatus as Article['imageRightsStatus']) ?? 'Staff Photo',
    imageAltText: v.imageAltText,
    disclosure: v.disclosure as Article['disclosure'],
    disclosureNote: v.disclosureNote,
    seo: { title: v.seoTitle || v.title, description: v.metaDescription || v.excerpt },
    takeaways: v.takeaways,
  };
}

async function resolveCategoryId(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const cat = await tx.category.findFirst({ where: { name } });
  if (!cat) throw new ServiceError('validation', `Unknown category: ${name}`);
  return cat.id;
}

async function resolveAuthorId(tx: Prisma.TransactionClient, name: string, role: string): Promise<string> {
  const id = `author-${slugify(name)}`;
  await tx.author.upsert({
    where: { id },
    update: { name, role },
    create: { id, slug: slugify(name), name, role },
  });
  return id;
}

/**
 * Batch 05: keep the ArticleMedia 'hero' link in sync with a DAM-managed hero
 * image (matched by url). Non-DAM / legacy urls create no link. This makes the
 * featured image a tracked relationship so the publish rights-gate and
 * reference-safe deletion work, without changing the editor's save flow.
 */
async function reconcileHeroMedia(tx: Prisma.TransactionClient, articleId: string, heroUrl: string | null): Promise<void> {
  const asset = heroUrl ? await tx.mediaAsset.findFirst({ where: { url: heroUrl }, select: { id: true } }) : null;
  if (asset) {
    await tx.articleMedia.upsert({
      where: { articleId_usageKey: { articleId, usageKey: 'hero' } },
      update: { mediaId: asset.id },
      create: { articleId, usageKey: 'hero', mediaId: asset.id, sortOrder: 0 },
    });
  } else {
    await tx.articleMedia.deleteMany({ where: { articleId, usageKey: 'hero' } });
  }
}

/** Track DAM-backed inline image blocks without putting base64/blob data in JSON.
 * The block keeps the delivery URL for the existing renderer; ArticleMedia is
 * the authoritative reuse/lifecycle relationship and stores placement metadata. */
async function reconcileInlineMedia(tx: Prisma.TransactionClient, articleId: string, blocks: unknown[]): Promise<void> {
  type ImageBlock = { type?: unknown; src?: unknown; alt?: unknown; caption?: unknown };
  const images = blocks
    .map((block, index) => ({ block: block as ImageBlock, index }))
    .filter(({ block }) => block.type === 'image' && typeof block.src === 'string' && block.src.length > 0);
  const urls = images.map(({ block }) => String(block.src));
  const assets = urls.length
    ? await tx.mediaAsset.findMany({ where: { url: { in: urls } }, select: { id: true, url: true } })
    : [];
  const idByUrl = new Map(assets.map((asset) => [asset.url, asset.id]));
  await tx.articleMedia.deleteMany({ where: { articleId, usageKey: { startsWith: 'inline-' } } });
  const rows = images.flatMap(({ block, index }) => {
    const mediaId = idByUrl.get(String(block.src));
    return mediaId ? [{
      articleId, mediaId, usageKey: `inline-${index}`, sortOrder: index,
      altText: typeof block.alt === 'string' ? block.alt : null,
      caption: typeof block.caption === 'string' ? block.caption : null,
    }] : [];
  });
  if (rows.length) await tx.articleMedia.createMany({ data: rows });
}

async function writeChildren(
  tx: Prisma.TransactionClient,
  articleId: string,
  v: z.infer<typeof ArticleInputSchema>,
): Promise<void> {
  // Reset-and-rebuild child collections.
  await tx.articleBlock.deleteMany({ where: { articleId } });
  await tx.articleTag.deleteMany({ where: { articleId } });
  await tx.articleSource.deleteMany({ where: { articleId } });
  await tx.articleDiscipline.deleteMany({ where: { articleId } });

  for (let i = 0; i < v.blocks.length; i++) {
    await tx.articleBlock.create({
      data: { articleId, sortOrder: i, blockType: String((v.blocks[i] as { type: string }).type), data: cleanJson(v.blocks[i]) },
    });
  }
  for (const name of v.tags) {
    const tagId = `tag-${slugify(name)}`;
    await tx.tag.upsert({ where: { id: tagId }, update: { name }, create: { id: tagId, slug: slugify(name), name } });
    await tx.articleTag.create({ data: { articleId, tagId } });
  }
  let sOrder = 0;
  for (const s of v.sources) {
    const sid = `src-${slugify(s.title).slice(0, 40)}-${slugify(s.url).slice(0, 20)}`;
    await tx.source.upsert({
      where: { id: sid },
      update: { title: s.title, url: safeHref(s.url), publisher: s.publisher ?? null },
      create: { id: sid, title: s.title, url: safeHref(s.url), publisher: s.publisher ?? null },
    });
    await tx.articleSource.create({ data: { articleId, sourceId: sid, note: s.note ?? null, sortOrder: sOrder++ } });
  }
  // Link disciplines that exist.
  for (const d of new Set(v.disciplineIds)) {
    const disc = await tx.discipline.findFirst({ where: { OR: [{ id: d }, { slug: d }] }, select: { id: true } });
    if (disc) await tx.articleDiscipline.create({ data: { articleId, disciplineId: disc.id } }).catch(() => {});
  }
  // SEO 1:1
  await tx.articleSeo.upsert({
    where: { articleId },
    update: { seoTitle: v.seoTitle || v.title, metaDescription: v.metaDescription || v.excerpt, canonicalUrl: `https://nfrguide.com/articles/${v.slug}/`, ogImage: v.heroImage || null },
    create: { articleId, seoTitle: v.seoTitle || v.title, metaDescription: v.metaDescription || v.excerpt, canonicalUrl: `https://nfrguide.com/articles/${v.slug}/`, ogImage: v.heroImage || null },
  });
}

function scalarData(v: z.infer<typeof ArticleInputSchema>) {
  return {
    slug: v.slug,
    title: v.title,
    deck: v.deck || null,
    excerpt: v.excerpt,
    subcategory: v.subcategory || null,
    articleType: v.articleType,
    readTime: `${Math.max(1, Math.ceil(v.blocks.reduce<number>((a, b) => a + ((b as { text?: string }).text || '').split(/\s+/).length, 0) / 225))} min read`,
    heroImageUrl: v.heroImage || null,
    imageCredit: v.imageCredit || null,
    imageCaption: v.imageCaption || null,
    imageSeoTitle: v.imageSeoTitle || null,
    imageAltText: v.imageAltText || null,
    imageRightsStatus: RIGHTS[v.imageRightsStatus] ?? 'STAFF_PHOTO',
    disclosureType: v.disclosure || 'editorial-independent',
    disclosureNote: v.disclosureNote || null,
    takeaways: v.takeaways,
  };
}

async function addRevision(
  tx: Prisma.TransactionClient,
  articleId: string,
  actor: ActorContext,
  actorName: string,
  status: WorkflowStatus,
  summary: string,
  snapshot: unknown,
): Promise<void> {
  const last = await tx.articleRevision.findFirst({
    where: { articleId }, orderBy: { revisionNo: 'desc' }, select: { revisionNo: true },
  });
  await tx.articleRevision.create({
    data: {
      articleId, revisionNo: (last?.revisionNo ?? 0) + 1, actorName, actorRole: actor.roles[0] ?? 'editor',
      actorId: actor.id, status, summary, snapshot: cleanJson(snapshot),
    },
  });
}

export interface SaveResult { id: string; slug: string; version: number; }

/** Create or update an article (draft-safe; never auto-publishes). */
export async function saveArticle(actor: ActorContext, rawInput: ArticleInput): Promise<SaveResult> {
  const v = ArticleInputSchema.parse(rawInput);
  const isCreate = !v.id;

  if (isCreate) {
    assert(actor, 'article.create');
  } else {
    const existing = await prisma.article.findUnique({
      where: { id: v.id }, select: { id: true, version: true, createdById: true, workflowStatus: true },
    });
    if (!existing) throw new ServiceError('not_found', 'Article not found');
    const canAny = roleHasPermission(actor.roles, 'article.edit.any');
    const canOwn = roleHasPermission(actor.roles, 'article.edit.own') && existing.createdById === actor.id;
    if (!canAny && !canOwn) throw new ServiceError('forbidden', 'Not permitted to edit this article');
    // edit.own authors may only edit non-published states they own.
    if (!canAny && (existing.workflowStatus === 'PUBLISHED' || existing.workflowStatus === 'ARCHIVED')) {
      throw new ServiceError('forbidden', 'Authors cannot edit published or archived articles');
    }
    if (typeof v.expectedVersion === 'number' && v.expectedVersion !== existing.version) {
      throw new ServiceError('conflict', 'This article was changed by someone else. Reload and reapply your edits.');
    }
  }

  return prisma.$transaction(async (tx) => {
    const categoryId = await resolveCategoryId(tx, v.categoryName);
    const authorId = await resolveAuthorId(tx, v.authorName, v.authorRole);
    let articleId: string;
    let version: number;

    if (isCreate) {
      const created = await tx.article.create({
        data: {
          ...scalarData(v), workflowStatus: 'DRAFT', version: 1,
          authorId, categoryId, createdById: actor.id,
        },
        select: { id: true, version: true },
      });
      articleId = created.id;
      version = created.version;
    } else {
      // Optimistic lock: bump version only if it still matches.
      const where: Prisma.ArticleWhereInput & { id: string } = { id: v.id! };
      if (typeof v.expectedVersion === 'number') (where as { version?: number }).version = v.expectedVersion;
      const upd = await tx.article.updateMany({
        where, data: { ...scalarData(v), authorId, categoryId, version: { increment: 1 } },
      });
      if (upd.count === 0) throw new ServiceError('conflict', 'Concurrent edit detected. Reload and reapply.');
      const after = await tx.article.findUniqueOrThrow({ where: { id: v.id! }, select: { version: true } });
      articleId = v.id!;
      version = after.version;
    }

    await writeChildren(tx, articleId, v);
    await reconcileHeroMedia(tx, articleId, v.heroImage || null);
    await reconcileInlineMedia(tx, articleId, v.blocks);
    await addRevision(tx, articleId, actor, v.authorName, 'DRAFT', isCreate ? 'Created article' : 'Edited article content', { title: v.title, excerpt: v.excerpt, slug: v.slug });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: isCreate ? 'article.create' : 'article.update', entityType: 'article', entityId: articleId, detail: v.slug },
    });

    return { id: articleId, slug: v.slug, version };
  });
}

// --- Workflow -------------------------------------------------------------

type Transition = { from: WorkflowStatus; to: WorkflowStatus; perm: Permission };
const TRANSITIONS: Transition[] = [
  { from: 'DRAFT', to: 'IN_REVIEW', perm: 'article.submit' },
  { from: 'IN_REVIEW', to: 'APPROVED', perm: 'article.approve' },
  { from: 'IN_REVIEW', to: 'DRAFT', perm: 'article.review' },
  { from: 'APPROVED', to: 'SCHEDULED', perm: 'article.schedule' },
  { from: 'APPROVED', to: 'PUBLISHED', perm: 'article.publish' },
  { from: 'APPROVED', to: 'DRAFT', perm: 'article.review' },
  { from: 'SCHEDULED', to: 'PUBLISHED', perm: 'article.publish' },
  { from: 'SCHEDULED', to: 'APPROVED', perm: 'article.schedule' },
  { from: 'PUBLISHED', to: 'DRAFT', perm: 'article.publish' },
  { from: 'PUBLISHED', to: 'ARCHIVED', perm: 'article.publish' },
  { from: 'ARCHIVED', to: 'DRAFT', perm: 'article.edit.any' },
];

export interface TransitionResult { id: string; slug: string; status: WorkflowStatus; version: number; becamePublic: boolean; becamePrivate: boolean; }

export async function transitionWorkflow(
  actor: ActorContext,
  id: string,
  target: WorkflowStatus,
  expectedVersion?: number,
  scheduledAt?: string,
): Promise<TransitionResult> {
  const existing = await prisma.article.findUnique({
    where: { id },
    include: { blocks: { orderBy: { sortOrder: 'asc' } }, seo: true, createdBy: true, author: true },
  });
  if (!existing) throw new ServiceError('not_found', 'Article not found');

  const rule = TRANSITIONS.find((t) => t.from === existing.workflowStatus && t.to === target);
  if (!rule) throw new ServiceError('invalid_transition', `Cannot move from ${existing.workflowStatus} to ${target}`);

  assert(actor, rule.perm);
  // Author submitting must own the article (unless they can review/edit any).
  if (rule.perm === 'article.submit' && !roleHasPermission(actor.roles, 'article.review') && existing.createdById !== actor.id) {
    throw new ServiceError('forbidden', 'Authors can only submit their own articles');
  }

  if (typeof expectedVersion === 'number' && expectedVersion !== existing.version) {
    throw new ServiceError('conflict', 'Concurrent edit detected. Reload and retry.');
  }

  // Publication gate for going live.
  if (target === 'PUBLISHED') {
    const report = validateArticle({
      title: existing.title,
      excerpt: existing.excerpt,
      slug: existing.slug,
      structuredBody: existing.blocks.map((b) => b.data as unknown as ContentBlock),
      imageRightsStatus: existing.imageRightsStatus === 'UNRESOLVED' ? 'Unresolved' : 'Staff Photo',
      imageAltText: existing.imageAltText ?? '',
      disclosure: (existing.disclosureType as Article['disclosure']) ?? 'editorial-independent',
      disclosureNote: existing.disclosureNote ?? '',
    });
    if (!report.canPublish) {
      throw new ServiceError('validation', 'Publication blocked by unresolved editorial/compliance checks.', {
        blockers: report.blockers.map((b) => b.message),
        compliance: report.compliance.map((c) => c.message),
      });
    }
    // Every managed placement (featured and inline) needs confirmed rights before
    // it can become publicly reachable. Legacy seeded assets are grandfathered.
    const unconfirmed = await prisma.articleMedia.count({
      where: { articleId: id, media: { storageProvider: { not: 'legacy-local' }, rightsConfirmed: false } },
    });
    if (unconfirmed > 0) {
      throw new ServiceError('validation', 'One or more attached images have unconfirmed usage rights. Confirm their licenses in the Media Library before publishing.', { media: 'rights_unconfirmed' });
    }
  }

  if (target === 'SCHEDULED') {
    const when = scheduledAt ? new Date(scheduledAt).getTime() : 0;
    if (!when || when <= Date.now()) throw new ServiceError('validation', 'Scheduled time must be in the future.');
  }

  const wasPublic = existing.workflowStatus === 'PUBLISHED';
  const willBePublic = target === 'PUBLISHED';

  const result = await prisma.$transaction(async (tx) => {
    const data: Prisma.ArticleUpdateManyMutationInput = {
      workflowStatus: target,
      version: { increment: 1 },
    };
    if (target === 'PUBLISHED' && !existing.publishedAt) (data as { publishedAt?: Date }).publishedAt = new Date();
    if (target === 'SCHEDULED' && scheduledAt) (data as { scheduledAt?: Date }).scheduledAt = new Date(scheduledAt);

    const upd = await tx.article.updateMany({
      where: typeof expectedVersion === 'number' ? { id, version: expectedVersion } : { id },
      data,
    });
    if (upd.count === 0) throw new ServiceError('conflict', 'Concurrent edit detected. Reload and retry.');

    await tx.editorialWorkflowHistory.create({
      data: { articleId: id, fromStatus: existing.workflowStatus, toStatus: target, actorId: actor.id, actorName: actor.id, note: `→ ${target}` },
    });
    const last = await tx.articleRevision.findFirst({ where: { articleId: id }, orderBy: { revisionNo: 'desc' }, select: { revisionNo: true } });
    await tx.articleRevision.create({
      data: { articleId: id, revisionNo: (last?.revisionNo ?? 0) + 1, actorName: existing.author?.name ?? 'Editor', actorRole: actor.roles[0] ?? 'editor', actorId: actor.id, status: target, summary: `Workflow → ${target}`, snapshot: cleanJson({ status: target }) },
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: `article.workflow.${target.toLowerCase()}`, entityType: 'article', entityId: id, detail: `${existing.workflowStatus}->${target}` },
    });
    const after = await tx.article.findUniqueOrThrow({ where: { id }, select: { version: true } });
    return after.version;
  });

  // Batch 05 §14: when an article goes live, make its attached DAM media
  // publicly servable (rights were confirmed by the publish gate above). One-way
  // — unpublishing does not retract media that other published articles may use.
  if (willBePublic && !wasPublic) {
    await prisma.mediaAsset.updateMany({
      where: { visibility: { not: 'PUBLIC' }, storageProvider: { not: 'legacy-local' }, articles: { some: { articleId: id } } },
      data: { visibility: 'PUBLIC' },
    });
  }

  return { id, slug: existing.slug, status: target, version: result, becamePublic: willBePublic && !wasPublic, becamePrivate: wasPublic && !willBePublic };
}

export async function deleteArticle(actor: ActorContext, id: string): Promise<{ slug: string; wasPublic: boolean }> {
  assert(actor, 'article.delete');
  const existing = await prisma.article.findUnique({ where: { id }, select: { slug: true, workflowStatus: true } });
  if (!existing) throw new ServiceError('not_found', 'Article not found');
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'article.delete', entityType: 'article', entityId: id, detail: existing.slug } });
    await tx.article.delete({ where: { id } });
  });
  return { slug: existing.slug, wasPublic: existing.workflowStatus === 'PUBLISHED' };
}

export async function restoreRevision(actor: ActorContext, articleId: string, revisionId: string): Promise<SaveResult> {
  const existing = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true, createdById: true, slug: true, version: true, workflowStatus: true } });
  if (!existing) throw new ServiceError('not_found', 'Article not found');
  const canAny = roleHasPermission(actor.roles, 'article.edit.any');
  const canOwn = roleHasPermission(actor.roles, 'article.edit.own') && existing.createdById === actor.id;
  if (!canAny && !canOwn) throw new ServiceError('forbidden', 'Not permitted to restore this article');
  const rev = await prisma.articleRevision.findFirst({ where: { id: revisionId, articleId } });
  if (!rev) throw new ServiceError('not_found', 'Revision not found');

  return prisma.$transaction(async (tx) => {
    const upd = await tx.article.updateMany({ where: { id: articleId }, data: { version: { increment: 1 } } });
    if (upd.count === 0) throw new ServiceError('not_found', 'Article not found');
    await addRevision(tx, articleId, actor, 'System Restore', existing.workflowStatus, `Restored revision #${rev.revisionNo}`, rev.snapshot);
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'article.revision.restore', entityType: 'article', entityId: articleId, detail: `rev ${rev.revisionNo}` } });
    const after = await tx.article.findUniqueOrThrow({ where: { id: articleId }, select: { version: true } });
    return { id: articleId, slug: existing.slug, version: after.version };
  });
}

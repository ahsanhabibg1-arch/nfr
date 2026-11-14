import 'server-only';
import { z } from 'zod';
import { Prisma, WorkflowStatus, ImageRightsStatus } from '@prisma/client';
import { prisma } from '../db';
import { RoleKey, Permission, roleHasPermission } from '../auth/rbac';
import { validateArticle } from '../../utils/seoValidator';
import type { Article, ContentBlock } from '../../types';
import { resolveBlocks } from '../content/articleBlockGrandfather';
import { safeHref } from '../url';
import { productionCanonicalUrl } from '../seo/canonical';

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

/** Editor rights labels ↔ DB enum. Only the four resolved values clear the publish gate. */
export const IMAGE_RIGHTS_LABELS = ['Staff Photo', 'Editorial Pool', 'PRCA Archive', 'Licensed Creative', 'Unresolved'] as const;
type RightsLabel = (typeof IMAGE_RIGHTS_LABELS)[number];
const RIGHTS: Record<RightsLabel, ImageRightsStatus> = {
  'Staff Photo': 'STAFF_PHOTO', 'Editorial Pool': 'EDITORIAL_POOL', 'PRCA Archive': 'PRCA_ARCHIVE',
  'Licensed Creative': 'LICENSED_CREATIVE', Unresolved: 'UNRESOLVED',
};
const RIGHTS_LABEL = Object.fromEntries(Object.entries(RIGHTS).map(([label, db]) => [db, label])) as Record<ImageRightsStatus, RightsLabel>;

/**
 * Article body blocks, validated per type.
 *
 * This replaced `z.object({ type: z.string() }).passthrough()`, which accepted
 * any object carrying a string `type` and stored it verbatim. The contract and
 * the reasoning live in `lib/content/articleBlockSchema.ts`; the short version
 * is that inline formatting introduced structured data the renderer interprets
 * (including link targets), so the boundary has to validate it, and unknown
 * KEYS on known block types are deliberately still preserved.
 *
 * `reconcileBlockInline` then enforces the `text` = concatenation-of-`runs`
 * projection, so a block can never be stored with a plain-text projection that
 * disagrees with its formatting.
 */
/**
 * SHAPE here; the real decision happens at save time.
 *
 * Strict per-type validation cannot live in this schema any more, because it
 * must be able to grandfather a legacy block — and whether a block is
 * untouched stored content is only knowable once the article's current blocks
 * have been read. See `resolveBlocks`.
 *
 * So this layer only rejects what is not a block at all, and caps the payload
 * so an oversized body cannot reach the transaction. Every block is then
 * strictly parsed in `writeChildCollections`, where an unknown type is refused
 * unless it is byte-identical to something already stored.
 */
const blockSchema: z.ZodType = z.object({ type: z.string().min(1).max(80) }).passthrough();

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
  /**
   * Batch 04-B — the MANAGED subcategory, by id. `null`/absent means none.
   * The legacy free-text `subcategory` above is preserved and is NEVER
   * overwritten when a managed value is chosen: the two coexist during the
   * transition, and the public mapper prefers the managed name.
   */
  subcategoryId: z.string().min(1).nullable().optional(),
  /**
   * Batch 04-A — validated against the authoritative registry.
   *
   * This was `z.string().max(80)`, i.e. anything at all, which is how six
   * surfaces came to disagree about the vocabulary. It now accepts exactly the
   * 18 selectable types plus the 5 recognised legacy values, so an untouched
   * legacy article still saves while a typo or an invented value is refused.
   *
   * The check is EXACT, not case-insensitive, on purpose: the evergreen query
   * is an exact SQL `IN`, so accepting a case variant would store something
   * that passes validation and then never matches. See `isKnownArticleType`.
   *
   * `.default()` is unchanged, so an omitted field keeps its previous meaning.
   */
  /**
   * Batch 04-E — SHAPE here, ASSIGNABILITY in `saveArticle`.
   *
   * The 04-A `.refine(isKnownArticleType)` was an exact match against the 23
   * compiled-in values. Once an administrator can create a type, that check
   * would reject the very types the CMS exists to add — a newly created value
   * is not in the bundle. And the registry read is asynchronous, which a Zod
   * `.refine()` on a `.parse()` (not `parseAsync`) cannot do; this schema is
   * parsed synchronously in three places, one of them revision restore, where
   * a historical value must be accepted unconditionally.
   *
   * So the schema enforces only what is true of any stored value, and
   * `assertArticleTypeAssignable` below enforces the vocabulary against the
   * managed registry at the single write boundary that matters.
   */
  articleType: z
    .string()
    .max(80)
    .default('General Information')
    .refine((s) => s.trim().length > 0, { message: 'Choose an article type.' }),
  categoryName: z.string().min(1),
  authorName: z.string().min(1),
  authorRole: z.string().optional().default('Staff Writer'),
  reviewerName: z.string().optional().default(''),
  heroImage: z.string().max(600).optional().default(''),
  imageCredit: z.string().max(300).optional().default(''),
  imageCaption: z.string().max(600).optional().default(''),
  // Fail closed: unknown values are rejected, and an omitted value is Unresolved (never assumed cleared).
  imageRightsStatus: z.enum(IMAGE_RIGHTS_LABELS).optional().default('Unresolved'),
  disclosure: z.string().optional().default('editorial-independent'),
  disclosureNote: z.string().max(600).optional().default(''),
  tags: z.array(z.string().max(60)).default([]),
  takeaways: z.array(z.string().max(400)).default([]),
  sources: z.array(z.object({
    // Set when the source is an existing Source-directory row (Batch A, D6). Validated server-side.
    sourceId: z.string().min(1).optional(),
    title: z.string().min(1), url: z.string(), publisher: z.string().optional(), note: z.string().optional(),
  })).default([]),
  disciplineIds: z.array(z.string()).default([]),
  hubIds: z.array(z.string()).default([]),
  eventIds: z.array(z.string()).default([]),
  editionIds: z.array(z.string()).default([]),
});

export type ArticleInput = z.input<typeof ArticleInputSchema>;
type ParsedInput = z.infer<typeof ArticleInputSchema>;

/** Build a Partial<Article> for the publication gate from validated input. */
function toValidatorShape(v: ParsedInput): Partial<Article> {
  return {
    title: v.title,
    excerpt: v.excerpt,
    slug: v.slug,
    structuredBody: v.blocks as unknown as ContentBlock[],
    imageRightsStatus: v.imageRightsStatus,
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

/**
 * Resolves a byline name to an `Author` row, creating one only when genuinely
 * absent.
 *
 * THE DEFECT THIS FIXES, found by browser UAT of the article editor. This used
 * to be a single upsert keyed on a DERIVED id:
 *
 *   const id = `author-${slugify(name)}`;
 *   tx.author.upsert({ where: { id }, update: {...}, create: { id, slug: slugify(name), ... } });
 *
 * `Author.slug` is unique, but the lookup was by `id`. So whenever an author
 * row existed with that slug under a DIFFERENT id — which is true of every
 * author not created by this exact code path, including seeded ones — the
 * `where` matched nothing, the `create` ran, and the slug constraint threw.
 * The action reported "Unexpected server error." and the save was lost. Every
 * attempt to save an article bylined to such an author failed, with no
 * indication of why.
 *
 * The slug IS the natural key, so it is what the lookup now uses. The id is
 * only ever minted for a genuinely new author.
 */
async function resolveAuthorId(tx: Prisma.TransactionClient, name: string, role: string): Promise<string> {
  const slug = slugify(name);
  if (!slug) throw new ServiceError('validation', 'An author byline is required.');

  const existing = await tx.author.findUnique({ where: { slug }, select: { id: true } });
  if (existing) {
    // Kept in step with the byline, exactly as the previous update did when the
    // derived id happened to match.
    await tx.author.update({ where: { id: existing.id }, data: { name, role } });
    return existing.id;
  }

  const created = await tx.author.create({
    data: { id: `author-${slug}`, slug, name, role },
    select: { id: true },
  });
  return created.id;
}

// --- Publication gate -----------------------------------------------------

/**
 * The public path of an article, which now depends on its subcategory as well
 * as its slug: `/<subcategory>/<slug>/` with one, `/articles/<slug>/` without.
 *
 * Mirrors `ROUTES.ARTICLE`. It is restated rather than imported because this
 * module runs inside a transaction against raw rows, where the only thing in
 * hand is the subcategory's slug string.
 */
const articlePath = (slug: string, subcategorySlug?: string | null) =>
  subcategorySlug ? `/${subcategorySlug}/${slug}/` : `/articles/${slug}/`;

/** Image URLs (hero + inline image blocks) referenced by an article input. */
function referencedImageUrls(v: ParsedInput): string[] {
  const inline = v.blocks
    .map((b) => b as { type?: unknown; src?: unknown })
    .filter((b) => b.type === 'image' && typeof b.src === 'string' && b.src.length > 0)
    .map((b) => String(b.src));
  return [...new Set([v.heroImage, ...inline].filter(Boolean))];
}

/**
 * Blocking publication checks (Requirements v2.0 §6.4): required fields, image rights,
 * disclosures, and confirmed rights on every managed (DAM) image. Routine SEO findings are
 * warnings and never reach here. Used both when an article goes live and whenever an
 * already-published article is edited or restored, so a live article cannot be edited
 * into a state that would not have been allowed to publish.
 */
async function assertPublishable(v: ParsedInput): Promise<void> {
  const report = validateArticle(toValidatorShape(v));
  if (!report.canPublish) {
    throw new ServiceError('validation', 'Publication blocked by unresolved editorial/compliance checks.', {
      blockers: report.blockers.map((b) => b.message),
      compliance: report.compliance.map((c) => c.message),
    });
  }
  const urls = referencedImageUrls(v);
  const unconfirmed = urls.length
    ? await prisma.mediaAsset.count({ where: { url: { in: urls }, storageProvider: { not: 'legacy-local' }, rightsConfirmed: false } })
    : 0;
  if (unconfirmed > 0) {
    throw new ServiceError('validation', 'One or more attached images have unconfirmed usage rights. Confirm their licenses in the Media Library before publishing.', { media: 'rights_unconfirmed' });
  }
}

// --- Rodeo relationships --------------------------------------------------

interface ResolvedRelations { disciplineIds: string[]; hubIds: string[]; eventIds: string[]; editionIds: string[] }

/**
 * Validate every relationship id against the database (ADM-06, §7.3). Unknown or deleted
 * ids are rejected rather than silently dropped, and an edition may only be linked when
 * its parent event is linked too. Disciplines also accept their slug (legacy callers).
 */
async function resolveRelationships(tx: Prisma.TransactionClient, v: ParsedInput): Promise<ResolvedRelations> {
  const uniq = (ids: string[]) => [...new Set(ids.filter(Boolean))];
  const [discIn, hubIn, eventIn, editionIn] = [uniq(v.disciplineIds), uniq(v.hubIds), uniq(v.eventIds), uniq(v.editionIds)];

  const [discs, hubs, events, editions] = await Promise.all([
    discIn.length ? tx.discipline.findMany({ where: { OR: [{ id: { in: discIn } }, { slug: { in: discIn } }] }, select: { id: true, slug: true } }) : [],
    hubIn.length ? tx.rodeoHub.findMany({ where: { id: { in: hubIn } }, select: { id: true } }) : [],
    eventIn.length ? tx.rodeoEvent.findMany({ where: { id: { in: eventIn } }, select: { id: true } }) : [],
    editionIn.length ? tx.rodeoEventEdition.findMany({ where: { id: { in: editionIn } }, select: { id: true, label: true, eventId: true } }) : [],
  ]);

  const missing: string[] = [];
  const discKnown = new Set(discs.flatMap((d) => [d.id, d.slug]));
  discIn.filter((d) => !discKnown.has(d)).forEach((d) => missing.push(`discipline ${d}`));
  const hubKnown = new Set(hubs.map((h) => h.id));
  hubIn.filter((h) => !hubKnown.has(h)).forEach((h) => missing.push(`hub ${h}`));
  const eventKnown = new Set(events.map((e) => e.id));
  eventIn.filter((e) => !eventKnown.has(e)).forEach((e) => missing.push(`event ${e}`));
  const editionKnown = new Set(editions.map((e) => e.id));
  editionIn.filter((e) => !editionKnown.has(e)).forEach((e) => missing.push(`edition ${e}`));
  if (missing.length) throw new ServiceError('validation', `Unknown or deleted relationship(s): ${missing.join(', ')}.`, { relationships: missing });

  const mismatched = editions.filter((ed) => !eventKnown.has(ed.eventId));
  if (mismatched.length) {
    throw new ServiceError(
      'validation',
      `Edition ${mismatched.map((e) => `"${e.label}"`).join(', ')} must be linked together with its parent event. Select the event too, or remove the edition.`,
      { editions: mismatched.map((e) => ({ editionId: e.id, requiredEventId: e.eventId })) },
    );
  }
  return { disciplineIds: [...new Set(discs.map((d) => d.id))], hubIds: hubIn, eventIds: eventIn, editionIds: editionIn };
}

/** Every referenced directory source must exist; unknown or deleted ids are rejected (D6). */
async function resolveSources(tx: Prisma.TransactionClient, v: ParsedInput): Promise<void> {
  const ids = [...new Set(v.sources.map((s) => s.sourceId).filter((id): id is string => !!id))];
  if (!ids.length) return;
  const found = new Set((await tx.source.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((s) => s.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw new ServiceError('validation', `Unknown or deleted source(s): ${missing.join(', ')}. Re-select them from the source directory.`, { sources: missing });
  }
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
  v: ParsedInput,
  rel: ResolvedRelations,
): Promise<void> {
  /**
   * Read the current body BEFORE deleting it: the grandfathering rule below
   * needs to know what is already stored, and this function rebuilds the
   * child collections from scratch.
   */
  const storedBlocks = (
    await tx.articleBlock.findMany({ where: { articleId }, select: { data: true } })
  ).map((b) => b.data as unknown);

  // Reset-and-rebuild child collections.
  await tx.articleBlock.deleteMany({ where: { articleId } });
  await tx.articleTag.deleteMany({ where: { articleId } });
  await tx.articleSource.deleteMany({ where: { articleId } });
  await tx.articleDiscipline.deleteMany({ where: { articleId } });
  await tx.articleHub.deleteMany({ where: { articleId } });
  await tx.articleEvent.deleteMany({ where: { articleId } });
  await tx.articleEdition.deleteMany({ where: { articleId } });

  /**
   * STRICT VALIDATION, with untouched legacy content grandfathered.
   *
   * The blocks already stored for this article are read BEFORE the delete above
   * takes effect within the transaction, so an unknown block type is accepted
   * only when its payload is exactly what is already persisted. A new unknown
   * type, or a modified legacy one, is refused. See `articleBlockGrandfather`.
   */
  const decision = resolveBlocks(v.blocks as unknown[], storedBlocks);
  if (!decision.ok) {
    const first = decision.errors[0];
    throw new ServiceError(
      'validation',
      `Article body block ${first.index + 1} ("${first.type}") cannot be saved: ${first.reason}`,
      { blocks: decision.errors },
    );
  }

  for (let i = 0; i < decision.value.blocks.length; i++) {
    const block = decision.value.blocks[i];
    await tx.articleBlock.create({
      data: {
        articleId,
        sortOrder: i,
        blockType: String((block as { type: string }).type),
        data: cleanJson(block),
      },
    });
  }
  /**
   * Tags carry the SAME defect `resolveAuthorId` had, for the same reason:
   * `Tag.slug` is unique, but the upsert looked the row up by a derived id. A
   * tag that already existed under a different id — any tag not created by this
   * exact code path — made the `create` run and the slug constraint throw,
   * failing the whole save with "Unexpected server error."
   *
   * Fixed the same way: resolve on the natural key, mint an id only for a
   * genuinely new tag.
   */
  for (const name of v.tags) {
    const tagSlug = slugify(name);
    if (!tagSlug) continue;                    // a tag of only punctuation has no identity
    const existing = await tx.tag.findUnique({ where: { slug: tagSlug }, select: { id: true } });
    const tagId = existing
      ? (await tx.tag.update({ where: { id: existing.id }, data: { name }, select: { id: true } })).id
      : (await tx.tag.create({ data: { id: `tag-${tagSlug}`, slug: tagSlug, name }, select: { id: true } })).id;
    await tx.articleTag.create({ data: { articleId, tagId } });
  }
  // Sources (Batch A, D6). The Source table is a shared directory: article editing links to
  // it but never rewrites another article's or the directory's record.
  //   - `sourceId` → an existing directory row (validated by resolveSources); linked as-is.
  //   - no `sourceId` → a newly typed source, created only if its deterministic id is free.
  let sOrder = 0;
  const linked = new Set<string>();
  for (const s of v.sources) {
    let sid = s.sourceId;
    if (!sid) {
      sid = `src-${slugify(s.title).slice(0, 40)}-${slugify(s.url).slice(0, 20)}`;
      await tx.source.upsert({
        where: { id: sid },
        update: {},
        create: { id: sid, title: s.title, url: safeHref(s.url), publisher: s.publisher ?? null },
      });
    }
    if (linked.has(sid)) continue; // the same source twice in one article
    linked.add(sid);
    await tx.articleSource.create({ data: { articleId, sourceId: sid, note: s.note ?? null, sortOrder: sOrder++ } });
  }
  // Rodeo relationships — ids already validated by resolveRelationships().
  if (rel.disciplineIds.length) await tx.articleDiscipline.createMany({ data: rel.disciplineIds.map((disciplineId) => ({ articleId, disciplineId })) });
  if (rel.hubIds.length) await tx.articleHub.createMany({ data: rel.hubIds.map((hubId) => ({ articleId, hubId })) });
  if (rel.eventIds.length) await tx.articleEvent.createMany({ data: rel.eventIds.map((eventId) => ({ articleId, eventId })) });
  if (rel.editionIds.length) await tx.articleEdition.createMany({ data: rel.editionIds.map((editionId) => ({ articleId, editionId })) });
  // SEO 1:1. Batch S5: the system canonical is stored as the article's PRODUCTION URL via
  // the shared constant (environment-independent; never the dev/staging host). Rendering
  // re-bases it onto the current SITE_URL (lib/seo/canonical.ts). Same value as before.
  const canonicalUrl = productionCanonicalUrl(`/articles/${v.slug}/`);
  await tx.articleSeo.upsert({
    where: { articleId },
    update: { seoTitle: v.seoTitle || v.title, metaDescription: v.metaDescription || v.excerpt, canonicalUrl, ogImage: v.heroImage || null },
    create: { articleId, seoTitle: v.seoTitle || v.title, metaDescription: v.metaDescription || v.excerpt, canonicalUrl, ogImage: v.heroImage || null },
  });
}

/**
 * Batch 04-B — a managed subcategory must belong to the article's own section.
 *
 * The composite foreign key `Article(categoryId, subcategoryId) ->
 * Subcategory(categoryId, id)` already makes a cross-section assignment
 * impossible at the database level. This check runs first so the editor reads a
 * sentence naming both sections instead of a Postgres constraint, and so the
 * transaction fails before anything else is written.
 *
 * Archived subcategories are accepted HERE on purpose: an article that already
 * points at one must stay editable, and saving unrelated fields must not drop
 * its classification. Archiving withdraws a subcategory from the editor's
 * options (`listAssignableSubcategories`), not from articles already using it.
 */
async function assertSubcategoryInCategory(
  tx: Prisma.TransactionClient,
  categoryId: string,
  subcategoryId: string | null,
): Promise<void> {
  if (!subcategoryId) return;
  const sub = await tx.subcategory.findUnique({
    where: { id: subcategoryId },
    select: { categoryId: true, name: true, category: { select: { name: true } } },
  });
  if (!sub) throw new ServiceError('validation', 'That subcategory no longer exists.', { field: 'subcategoryId' });
  if (sub.categoryId !== categoryId) {
    const target = await tx.category.findUnique({ where: { id: categoryId }, select: { name: true } });
    throw new ServiceError(
      'validation',
      `The subcategory "${sub.name}" belongs to ${sub.category.name}, not ${target?.name ?? 'this section'}. Clear it or choose one from this section.`,
      { field: 'subcategoryId' },
    );
  }
}

function scalarData(v: ParsedInput) {
  return {
    slug: v.slug,
    title: v.title,
    deck: v.deck || null,
    excerpt: v.excerpt,
    subcategory: v.subcategory || null,
    // Batch 04-B: `undefined` would leave the column untouched on update, which
    // is wrong for a field the editor always submits — an explicit null clears.
    subcategoryId: v.subcategoryId ?? null,
    articleType: v.articleType,
    readTime: `${Math.max(1, Math.ceil(v.blocks.reduce<number>((a, b) => a + ((b as { text?: string }).text || '').split(/\s+/).length, 0) / 225))} min read`,
    heroImageUrl: v.heroImage || null,
    imageCredit: v.imageCredit || null,
    imageCaption: v.imageCaption || null,
    imageSeoTitle: v.imageSeoTitle || null,
    imageAltText: v.imageAltText || null,
    imageRightsStatus: RIGHTS[v.imageRightsStatus],
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

// --- Revision snapshots ---------------------------------------------------

/**
 * Revision snapshot format v2: the complete validated editor input (all scalar fields,
 * body blocks, SEO, sources, tags and rodeo relationships), so restoring a revision can
 * faithfully re-apply it. Pre-Phase-2 revisions hold only { title, excerpt, slug } (content
 * edits) or { status } (workflow changes); restoreRevision handles those explicitly.
 */
const SNAPSHOT_VERSION = 2;
function buildSnapshot(v: ParsedInput) {
  const { id: _id, expectedVersion: _ev, ...input } = v;
  return { v: SNAPSHOT_VERSION, input };
}

/** Current persisted state of an article as editor input (used to restore legacy partial snapshots). */
async function loadArticleInput(articleId: string): Promise<ParsedInput | null> {
  const a = await prisma.article.findUnique({
    where: { id: articleId },
    include: {
      blocks: { orderBy: { sortOrder: 'asc' } }, seo: true, category: true, author: true,
      tags: { include: { tag: true } }, sources: { orderBy: { sortOrder: 'asc' }, include: { source: true } },
      disciplines: true, hubs: true, events: true, editions: true,
    },
  });
  if (!a) return null;
  return ArticleInputSchema.parse({
    id: a.id, slug: a.slug, title: a.title, deck: a.deck ?? '', excerpt: a.excerpt,
    blocks: a.blocks.map((b) => b.data), seoTitle: a.seo?.seoTitle ?? '', metaDescription: a.seo?.metaDescription ?? '',
    imageSeoTitle: a.imageSeoTitle ?? '', imageAltText: a.imageAltText ?? '', subcategory: a.subcategory ?? '',
    subcategoryId: a.subcategoryId ?? null,
    articleType: a.articleType, categoryName: a.category.name, authorName: a.author.name, authorRole: a.author.role ?? undefined,
    heroImage: a.heroImageUrl ?? '', imageCredit: a.imageCredit ?? '', imageCaption: a.imageCaption ?? '',
    imageRightsStatus: RIGHTS_LABEL[a.imageRightsStatus], disclosure: a.disclosureType, disclosureNote: a.disclosureNote ?? '',
    tags: a.tags.map((t) => t.tag.name), takeaways: a.takeaways,
    sources: a.sources.map((s) => ({ sourceId: s.source.id, title: s.source.title, url: s.source.url, publisher: s.source.publisher ?? undefined, note: s.note ?? undefined })),
    disciplineIds: a.disciplines.map((d) => d.disciplineId), hubIds: a.hubs.map((h) => h.hubId),
    eventIds: a.events.map((e) => e.eventId), editionIds: a.editions.map((e) => e.editionId),
  });
}

// --- Published URL changes ------------------------------------------------

/**
 * When a published article's URL changes (§6.3, ADM-14, WEB-11): redirect the old path to
 * the new one, collapse any redirect that pointed at the old path (no chains), and disable
 * any redirect whose source is the new path — the article now owns it (no loops / shadowing).
 * Destinations are always internal article paths built from a validated slug.
 *
 * TWO things move an article now. A slug rename always did; assigning,
 * changing or clearing a SUBCATEGORY does as well, because the subcategory is
 * the first segment of the URL. Both arrive here as a from/to pair, so an
 * editor who only ticks a subcategory dropdown still leaves a 308 behind and
 * never silently strands an indexed URL.
 */
async function syncUrlRedirect(tx: Prisma.TransactionClient, from: string, to: string): Promise<boolean> {
  if (from === to) return false;
  await claimPath(tx, to);
  await tx.articleRedirect.updateMany({ where: { targetPath: from, status: 'ACTIVE' }, data: { targetPath: to } });
  await tx.articleRedirect.upsert({
    where: { sourcePath: from },
    update: { targetPath: to, status: 'ACTIVE', statusCode: 308 },
    create: { sourcePath: from, targetPath: to, statusCode: 308 },
  });
  return true;
}

/** A live article owns its canonical path: disable any active redirect away from it. */
async function claimPath(tx: Prisma.TransactionClient, path: string): Promise<void> {
  await tx.articleRedirect.updateMany({ where: { sourcePath: path, status: 'ACTIVE' }, data: { status: 'DISABLED' } });
}

export interface SaveResult { id: string; slug: string; version: number; previousSlug?: string; redirectCreated?: boolean }

type EditableRow = { id: string; slug: string; version: number; createdById: string | null; workflowStatus: WorkflowStatus;
  /** The subcategory the article is CURRENTLY under — the first segment of its live URL. */
  subcategoryTaxon: { slug: string } | null };

async function loadEditable(actor: ActorContext, id: string): Promise<EditableRow> {
  const existing = await prisma.article.findUnique({
    where: { id },
    select: { id: true, slug: true, version: true, createdById: true, workflowStatus: true, subcategoryTaxon: { select: { slug: true } } },
  });
  if (!existing) throw new ServiceError('not_found', 'Article not found');
  const canAny = roleHasPermission(actor.roles, 'article.edit.any');
  const canOwn = roleHasPermission(actor.roles, 'article.edit.own') && existing.createdById === actor.id;
  if (!canAny && !canOwn) throw new ServiceError('forbidden', 'Not permitted to edit this article');
  // edit.own authors may only edit non-published states they own.
  if (!canAny && (existing.workflowStatus === 'PUBLISHED' || existing.workflowStatus === 'ARCHIVED')) {
    throw new ServiceError('forbidden', 'Authors cannot edit published or archived articles');
  }
  return existing;
}

/**
 * Single write path for create, edit and revision restore: publish gate for live articles,
 * validated relationships, slug-redirect maintenance, full revision snapshot and audit log —
 * all in one transaction with the optimistic version lock.
 */
async function persistArticle(
  actor: ActorContext,
  existing: EditableRow | null,
  v: ParsedInput,
  opts: { summary: string; action: string; auditDetail?: string },
): Promise<SaveResult> {
  const isLive = existing?.workflowStatus === 'PUBLISHED';
  if (isLive) await assertPublishable(v);

  return prisma.$transaction(async (tx) => {
    const clash = await tx.article.findFirst({ where: { slug: v.slug, ...(existing ? { id: { not: existing.id } } : {}) }, select: { id: true } });
    if (clash) throw new ServiceError('conflict', `The slug "${v.slug}" is already used by another article.`, { field: 'slug' });

    const categoryId = await resolveCategoryId(tx, v.categoryName);
    await assertSubcategoryInCategory(tx, categoryId, v.subcategoryId ?? null);
    const authorId = await resolveAuthorId(tx, v.authorName, v.authorRole);
    const rel = await resolveRelationships(tx, v);
    await resolveSources(tx, v);
    let articleId: string;
    let version: number;

    if (!existing) {
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
      const where: Prisma.ArticleWhereInput & { id: string } = { id: existing.id };
      if (typeof v.expectedVersion === 'number') (where as { version?: number }).version = v.expectedVersion;
      const upd = await tx.article.updateMany({
        where, data: { ...scalarData(v), authorId, categoryId, version: { increment: 1 } },
      });
      if (upd.count === 0) throw new ServiceError('conflict', 'Concurrent edit detected. Reload and reapply.');
      const after = await tx.article.findUniqueOrThrow({ where: { id: existing.id }, select: { version: true } });
      articleId = existing.id;
      version = after.version;
    }

    await writeChildren(tx, articleId, v, rel);
    await reconcileHeroMedia(tx, articleId, v.heroImage || null);
    await reconcileInlineMedia(tx, articleId, v.blocks);
    const slugChanged = !!existing && existing.slug !== v.slug;
    /**
     * The URL is (subcategory, slug), so BOTH are resolved before and after.
     * `v.subcategoryId` is already validated against the article's section by
     * `assertSubcategoryInCategory`, so this lookup cannot pick up a row from
     * another section.
     */
    const nextSub = v.subcategoryId
      ? await tx.subcategory.findUnique({ where: { id: v.subcategoryId }, select: { slug: true } })
      : null;
    const fromPath = existing ? articlePath(existing.slug, existing.subcategoryTaxon?.slug) : '';
    const toPath = articlePath(v.slug, nextSub?.slug);
    const redirectCreated = isLive && !!existing ? await syncUrlRedirect(tx, fromPath, toPath) : false;
    await addRevision(tx, articleId, actor, v.authorName, existing?.workflowStatus ?? 'DRAFT', opts.summary, buildSnapshot(v));
    await tx.auditLog.create({
      data: { actorId: actor.id, action: opts.action, entityType: 'article', entityId: articleId, detail: opts.auditDetail ?? v.slug },
    });
    if (redirectCreated) {
      await tx.auditLog.create({
        data: { actorId: actor.id, action: 'redirect.create', entityType: 'article', entityId: articleId, detail: `${fromPath} -> ${toPath}` },
      });
    }

    return { id: articleId, slug: v.slug, version, ...(slugChanged ? { previousSlug: existing!.slug } : {}), redirectCreated };
  });
}

/**
 * Batch 04-E — the article-type write boundary.
 *
 * Two rules, and the second one is the point:
 *
 *  1. A NEW assignment must be ASSIGNABLE: recognised, selectable and not
 *     archived. Deactivating a type therefore stops new classification
 *     immediately, server-side, whatever the form offered.
 *
 *  2. KEEPING the value the article already stores is always allowed. Without
 *     this, deactivating or archiving a type would make every article of that
 *     type unsavable — a title fix on a published `guide` article would fail
 *     because of a taxonomy decision taken elsewhere. Lifecycle governs new
 *     classification; it must never hold existing work hostage, and it must
 *     never silently substitute a different type either.
 *
 * `current` is the value stored right now (`null` when creating).
 */
async function assertArticleTypeAssignable(value: string, current: string | null): Promise<void> {
  if (current !== null && value === current) return;
  const { isAssignableArticleType, isStorableArticleType } = await import('./articleTypeRegistry');
  if (await isAssignableArticleType(value)) return;
  if (await isStorableArticleType(value)) {
    throw new ServiceError(
      'validation',
      `"${value}" is no longer offered for new classification. Choose a current article type, or leave this article's existing type unchanged.`,
    );
  }
  throw new ServiceError(
    'validation',
    'Unrecognised article type. Choose one of the current editorial typologies.',
  );
}

/** Create or update an article (draft-safe; never auto-publishes). */
export async function saveArticle(actor: ActorContext, rawInput: ArticleInput): Promise<SaveResult> {
  const v = ArticleInputSchema.parse(rawInput);
  if (!v.id) {
    assert(actor, 'article.create');
    await assertArticleTypeAssignable(v.articleType, null);
    return persistArticle(actor, null, v, { summary: 'Created article', action: 'article.create' });
  }
  const existing = await loadEditable(actor, v.id);
  // Read the stored type separately: `EditableRow` is the shape `persistArticle`
  // consumes and is deliberately not widened for a validation-only field.
  const stored = await prisma.article.findUnique({ where: { id: v.id }, select: { articleType: true } });
  await assertArticleTypeAssignable(v.articleType, stored?.articleType ?? null);
  if (typeof v.expectedVersion === 'number' && v.expectedVersion !== existing.version) {
    throw new ServiceError('conflict', 'This article was changed by someone else. Reload and reapply your edits.');
  }
  return persistArticle(actor, existing, v, { summary: 'Edited article content', action: 'article.update' });
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

/**
 * Scheduled publishing needs a durable job runner, which does not exist yet (Batch A, D8).
 * Until it does, nothing may move INTO `SCHEDULED` — through the editor, bulk actions or a
 * direct Server Action call. Existing SCHEDULED rows keep their exits (→ APPROVED to
 * unschedule, → PUBLISHED to publish manually); they never publish on their own.
 */
export const SCHEDULED_PUBLISHING_AVAILABLE = false;
export const SCHEDULING_UNAVAILABLE_MESSAGE = 'Scheduled publishing is not available yet. Please publish manually.';

export async function transitionWorkflow(
  actor: ActorContext,
  id: string,
  target: WorkflowStatus,
  expectedVersion?: number,
  scheduledAt?: string,
): Promise<TransitionResult> {
  if (target === 'SCHEDULED' && !SCHEDULED_PUBLISHING_AVAILABLE) {
    throw new ServiceError('validation', SCHEDULING_UNAVAILABLE_MESSAGE, { scheduling: 'unavailable' });
  }

  const existing = await prisma.article.findUnique({
    where: { id },
    include: {
      blocks: { orderBy: { sortOrder: 'asc' } }, seo: true, createdBy: true, author: true,
      // Needed to build the article's live path when it becomes public: the
      // subcategory is the first segment of that path.
      subcategoryTaxon: { select: { slug: true } },
    },
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
      imageRightsStatus: RIGHTS_LABEL[existing.imageRightsStatus],
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
    if (willBePublic) await claimPath(tx, articlePath(existing.slug, existing.subcategoryTaxon?.slug));

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

/**
 * Restore a revision (ADM-04): re-applies the revision's content through the normal write
 * path, which records a NEW revision (history is never rewritten), keeps the current workflow
 * status, re-runs the publish gate if the article is live, and maintains slug redirects.
 *
 *   - v2 snapshots (full editor input) are restored completely.
 *   - Pre-Phase-2 content snapshots ({ title, excerpt, slug }) restore exactly those three
 *     fields over the article's current state — nothing else was recorded.
 *   - Workflow-only snapshots ({ status }) have no content and are refused.
 */
export async function restoreRevision(actor: ActorContext, articleId: string, revisionId: string): Promise<SaveResult> {
  const existing = await loadEditable(actor, articleId);
  const rev = await prisma.articleRevision.findFirst({ where: { id: revisionId, articleId } });
  if (!rev) throw new ServiceError('not_found', 'Revision not found');

  const snap = (rev.snapshot ?? {}) as Record<string, unknown>;
  let restored: ParsedInput;
  if (snap.v === SNAPSHOT_VERSION && snap.input && typeof snap.input === 'object') {
    const parsed = ArticleInputSchema.safeParse({ ...(snap.input as object), id: articleId });
    if (!parsed.success) throw new ServiceError('validation', `Revision #${rev.revisionNo} cannot be restored: its content is no longer valid.`, { issues: parsed.error.issues.map((i) => i.message) });
    restored = parsed.data;
  } else if (typeof snap.title === 'string' || typeof snap.excerpt === 'string' || typeof snap.slug === 'string') {
    const current = await loadArticleInput(articleId);
    if (!current) throw new ServiceError('not_found', 'Article not found');
    restored = ArticleInputSchema.parse({
      ...current,
      ...(typeof snap.title === 'string' ? { title: snap.title } : {}),
      ...(typeof snap.excerpt === 'string' ? { excerpt: snap.excerpt } : {}),
      ...(typeof snap.slug === 'string' ? { slug: snap.slug } : {}),
    });
  } else {
    throw new ServiceError('validation', `Revision #${rev.revisionNo} records a workflow change only and has no content to restore.`);
  }

  return persistArticle(actor, existing, restored, {
    summary: `Restored revision #${rev.revisionNo}`,
    action: 'article.revision.restore',
    auditDetail: `rev ${rev.revisionNo}`,
  });
}

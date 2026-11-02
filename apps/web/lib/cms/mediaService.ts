import 'server-only';
import crypto from 'node:crypto';
import { z } from 'zod';
import { Prisma, MediaVisibility, MediaLicenseType } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { getStorage, buildKey } from '../media/storage';
import { validateUpload, DEFAULT_MAX_BYTES, MediaValidationError } from '../media/validation';
import { processImage } from '../media/processing';

/**
 * Digital Asset Management service (Batch 05). Every mutation is RBAC-checked
 * (media.*) and audited. Binaries go through the pluggable storage adapter;
 * Postgres holds metadata only. Newly uploaded assets start DRAFT +
 * rights-unconfirmed and are not publicly served or publish-eligible until an
 * editor confirms usage rights (§11). Legacy `legacy-local` assets are
 * grandfathered (treated as rights-OK) so existing content keeps working.
 */

const need = (a: Actor, p: Parameters<typeof roleHasPermission>[1]) => {
  if (!roleHasPermission(a.roles, p)) throw new ServiceError('forbidden', `Not permitted (${p}).`);
};
const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

type Derivatives = Record<string, { key: string; width: number; height: number; bytes: number }>;

export interface MediaRow {
  id: string; url: string; thumbUrl: string; filename: string; title: string | null;
  seoTitle: string | null; altText: string | null; caption: string | null;
  copyrightHolder: string | null; licenseSourceUrl: string | null;
  usageRestrictions: string | null; sourceAttribution: string | null;
  width: number | null; height: number | null; bytes: number | null;
  mimeType: string | null; visibility: MediaVisibility; processingStatus: string;
  licenseType: MediaLicenseType; rightsConfirmed: boolean; credit: string | null;
  storageProvider: string; uploadedAt: string; uploadedById: string | null; usageCount: number;
}

function thumbUrl(provider: string, url: string, derivatives: unknown): string {
  const d = derivatives as Derivatives | null;
  if (d && d.thumb?.key) return getStorage().publicUrl(d.thumb.key);
  return url; // legacy assets or no-derivative originals
}

// ---------------------------------------------------------------- Upload
export interface UploadInput { buffer: Buffer; originalName: string; declaredMime?: string | null; maxBytes?: number; }
export interface UploadResult { id: string; duplicate: boolean; }

export async function uploadMedia(actor: Actor, input: UploadInput): Promise<UploadResult> {
  need(actor, 'media.upload');
  let v;
  try {
    v = validateUpload(input.buffer, input.originalName, input.declaredMime, input.maxBytes ?? DEFAULT_MAX_BYTES);
  } catch (e) {
    if (e instanceof MediaValidationError) throw new ServiceError('validation', e.message, { reason: e.code });
    throw e;
  }
  const checksum = sha256(input.buffer);

  // Duplicate handling: reuse an identical existing asset instead of re-storing.
  const existing = await prisma.mediaAsset.findFirst({ where: { checksum }, select: { id: true } });
  if (existing) {
    await audit(actor.id, 'media.upload.dedup', 'media', existing.id, input.originalName);
    return { id: existing.id, duplicate: true };
  }

  // Process first (throws on corrupt/unsupported) — nothing stored yet.
  let processed;
  try {
    processed = await processImage(input.buffer);
  } catch {
    throw new ServiceError('processing', 'The image could not be processed (it may be corrupt).');
  }

  const id = crypto.randomUUID();
  const storage = getStorage();
  const originalKey = buildKey(id, v.type.ext);
  const stored: string[] = [];
  const derivatives: Derivatives = {};
  try {
    await storage.put(originalKey, input.buffer, v.type.mime);
    stored.push(originalKey);
    for (const d of processed.derivatives) {
      const dkey = buildKey(id, d.ext, `__${d.name}`);
      await storage.put(dkey, d.buffer, 'image/webp');
      derivatives[d.name] = { key: dkey, width: d.width, height: d.height, bytes: d.buffer.length };
      stored.push(dkey);
    }
  } catch {
    // Upload-failure cleanup: remove any partial objects.
    await Promise.all(stored.map((k) => storage.delete(k).catch(() => {})));
    throw new ServiceError('storage', 'Upload failed while saving the file.');
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.mediaAsset.create({
        data: {
          id, storageProvider: storage.provider, storageKey: originalKey, url: storage.publicUrl(originalKey),
          filename: input.originalName.slice(0, 255), safeFilename: `${v.safeStem}.${v.type.ext}`, extension: v.type.ext,
          mimeType: v.type.mime, bytes: v.bytes, width: processed.width, height: processed.height,
          dimensions: `${processed.width} × ${processed.height}`, checksum, format: v.type.format,
          licenseType: 'UNCONFIRMED', rightsStatus: 'UNRESOLVED', rightsConfirmed: false,
          processingStatus: 'READY', visibility: 'DRAFT', derivatives: derivatives as Prisma.InputJsonValue,
          uploadedById: actor.id,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: 'media.upload', entityType: 'media', entityId: created.id, detail: `${input.originalName} (${processed.width}x${processed.height})` },
      });
      return created;
    });
    return { id: row.id, duplicate: false };
  } catch {
    // A database or audit failure must not leave untracked objects behind.
    await Promise.all(stored.map((k) => storage.delete(k).catch(() => {})));
    throw new ServiceError('storage', 'Upload could not be recorded; stored files were cleaned up.');
  }
}

// ---------------------------------------------------------------- Read
export interface MediaListParams {
  q?: string; type?: string; visibility?: string; usage?: 'used' | 'unused';
  uploadedById?: string; uploadedWithin?: '7d' | '30d' | '365d'; page?: number; pageSize?: number;
}
export interface MediaListResult { rows: MediaRow[]; total: number; page: number; pageSize: number; totalPages: number; }

export async function listMedia(actor: Actor, params: MediaListParams = {}): Promise<MediaListResult> {
  need(actor, 'media.view');
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(60, Math.max(12, params.pageSize ?? 24));
  const where: Prisma.MediaAssetWhereInput = {};
  if (params.q) where.OR = [
    { filename: { contains: params.q, mode: 'insensitive' } },
    { title: { contains: params.q, mode: 'insensitive' } },
    { altText: { contains: params.q, mode: 'insensitive' } },
    { credit: { contains: params.q, mode: 'insensitive' } },
  ];
  if (params.type && ['jpg', 'png', 'webp'].includes(params.type)) where.extension = params.type;
  if (params.visibility && ['DRAFT', 'PUBLIC', 'ARCHIVED'].includes(params.visibility)) where.visibility = params.visibility as MediaVisibility;
  if (params.uploadedById) where.uploadedById = params.uploadedById;
  if (params.uploadedWithin) {
    const days = params.uploadedWithin === '7d' ? 7 : params.uploadedWithin === '30d' ? 30 : 365;
    where.uploadedAt = { gte: new Date(Date.now() - days * 86_400_000) };
  }
  if (params.usage === 'used') where.AND = [{ OR: [
    { articles: { some: {} } }, { hubs: { some: {} } }, { events: { some: {} } },
    { editions: { some: {} } }, { disciplines: { some: {} } }, { venues: { some: {} } },
  ] }];
  if (params.usage === 'unused') where.AND = [{ articles: { none: {} } }, { hubs: { none: {} } }, { events: { none: {} } }, { editions: { none: {} } }, { disciplines: { none: {} } }, { venues: { none: {} } }];

  const [rows, total] = await Promise.all([
    prisma.mediaAsset.findMany({ where, orderBy: { uploadedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: { _count: { select: { articles: true, hubs: true, events: true, editions: true, disciplines: true, venues: true } } } }),
    prisma.mediaAsset.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id, url: r.url, thumbUrl: thumbUrl(r.storageProvider, r.url, r.derivatives), filename: r.filename,
      title: r.title, seoTitle: r.seoTitle, altText: r.altText, caption: r.caption,
      copyrightHolder: r.copyrightHolder, licenseSourceUrl: r.licenseSourceUrl,
      usageRestrictions: r.usageRestrictions, sourceAttribution: r.sourceAttribution,
      width: r.width, height: r.height, bytes: r.bytes, mimeType: r.mimeType,
      visibility: r.visibility, processingStatus: r.processingStatus, licenseType: r.licenseType,
      rightsConfirmed: r.rightsConfirmed, credit: r.credit, storageProvider: r.storageProvider,
      uploadedAt: r.uploadedAt.toISOString(), uploadedById: r.uploadedById,
      usageCount: r._count.articles + r._count.hubs + r._count.events + r._count.editions + r._count.disciplines + r._count.venues,
    })),
    total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getMedia(actor: Actor, id: string) {
  need(actor, 'media.view');
  const r = await prisma.mediaAsset.findUnique({ where: { id }, include: { _count: { select: { articles: true, hubs: true, events: true, editions: true, disciplines: true, venues: true } } } });
  if (!r) throw new ServiceError('not_found', 'Media not found');
  return r;
}

// ---------------------------------------------------------------- Metadata
const MetadataInput = z.object({
  title: z.string().max(300).optional(),
  seoTitle: z.string().max(300).optional(),
  altText: z.string().max(500).optional(),
  caption: z.string().max(1000).optional(),
  credit: z.string().max(200).optional(),
  copyrightHolder: z.string().max(200).optional(),
  licenseSourceUrl: z.string().max(600).optional(),
  usageRestrictions: z.string().max(1000).optional(),
  sourceAttribution: z.string().max(500).optional(),
});
export type MediaMetadataInput = z.input<typeof MetadataInput>;

async function requireEdit(actor: Actor, id: string) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id }, select: { id: true, uploadedById: true } });
  if (!asset) throw new ServiceError('not_found', 'Media not found');
  const canAny = roleHasPermission(actor.roles, 'media.edit.any');
  const canOwn = roleHasPermission(actor.roles, 'media.edit.own') && asset.uploadedById === actor.id;
  if (!canAny && !canOwn) throw new ServiceError('forbidden', 'Not permitted to edit this media.');
  return asset;
}

export async function updateMediaMetadata(actor: Actor, id: string, raw: MediaMetadataInput): Promise<void> {
  await requireEdit(actor, id);
  const v = MetadataInput.parse(raw);
  if (v.licenseSourceUrl && v.licenseSourceUrl.trim() && !/^https?:\/\//i.test(v.licenseSourceUrl.trim())) {
    throw new ServiceError('validation', 'License source URL must start with http(s)://');
  }
  // Partial merge: only touch fields present in the input (empty string clears a
  // field; an absent key is left unchanged). Editing one field never wipes others.
  const data: Prisma.MediaAssetUpdateInput = {};
  for (const k of ['title', 'seoTitle', 'altText', 'caption', 'credit', 'copyrightHolder', 'licenseSourceUrl', 'usageRestrictions', 'sourceAttribution'] as const) {
    const val = v[k];
    if (val !== undefined) (data as Record<string, unknown>)[k] = val === '' ? null : val;
  }
  await prisma.mediaAsset.update({ where: { id }, data });
  await audit(actor.id, 'media.metadata.update', 'media', id);
}

/** Record lawful usage rights (§11). Confirming requires a concrete license type. */
export async function confirmRights(actor: Actor, id: string, licenseType: MediaLicenseType, confirmed: boolean): Promise<void> {
  await requireEdit(actor, id);
  if (confirmed && licenseType === 'UNCONFIRMED') throw new ServiceError('validation', 'Choose a license/usage category before confirming rights.');
  await prisma.mediaAsset.update({ where: { id }, data: {
    licenseType, rightsConfirmed: confirmed,
    rightsConfirmedById: confirmed ? actor.id : null, rightsConfirmedAt: confirmed ? new Date() : null,
  } });
  await audit(actor.id, confirmed ? 'media.rights.confirm' : 'media.rights.unconfirm', 'media', id, licenseType);
}

export async function setVisibility(actor: Actor, id: string, visibility: MediaVisibility): Promise<void> {
  await requireEdit(actor, id);
  if (visibility === 'PUBLIC') {
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id }, select: { rightsConfirmed: true, storageProvider: true, processingStatus: true } });
    if (asset.processingStatus !== 'READY') throw new ServiceError('validation', 'Only fully processed media can be public.');
    if (asset.storageProvider !== 'legacy-local' && !asset.rightsConfirmed) {
      throw new ServiceError('validation', 'Confirm lawful usage rights before making this asset public.');
    }
  }
  await prisma.mediaAsset.update({ where: { id }, data: { visibility } });
  await audit(actor.id, 'media.visibility', 'media', id, visibility);
}

// ---------------------------------------------------------------- Delete (reference-safe)
export async function deleteMedia(actor: Actor, id: string): Promise<void> {
  need(actor, 'media.delete');
  const r = await prisma.mediaAsset.findUnique({ where: { id }, include: {
    _count: { select: { articles: true, hubs: true, events: true, editions: true, disciplines: true, venues: true } },
    articles: { select: { article: { select: { workflowStatus: true } } } },
  } });
  if (!r) throw new ServiceError('not_found', 'Media not found');
  const refs = r._count.articles + r._count.hubs + r._count.events + r._count.editions + r._count.disciplines + r._count.venues;
  const publishedRefs = r.articles.filter((a) => a.article.workflowStatus === 'PUBLISHED').length;
  if (publishedRefs > 0) throw new ServiceError('conflict', `Cannot delete: used by ${publishedRefs} published article(s). Archive it instead.`);
  if (refs > 0) throw new ServiceError('conflict', `Cannot delete: referenced by ${refs} item(s). Detach them or archive it instead.`);

  // Remove managed blobs (never touch legacy static files).
  if (r.storageProvider !== 'legacy-local') {
    const storage = getStorage();
    const keys = [r.storageKey, ...Object.values((r.derivatives as Derivatives | null) ?? {}).map((d) => d.key)];
    await Promise.all(keys.map((k) => storage.delete(k).catch(() => {})));
  }
  await prisma.mediaAsset.delete({ where: { id } });
  await audit(actor.id, 'media.delete', 'media', id, r.filename);
}

// ---------------------------------------------------------------- Assignment
/** Featured image for an article. Mirrors the url onto Article.heroImageUrl so
 *  existing public rendering keeps working, and records the ArticleMedia link. */
export async function setArticleFeaturedImage(actor: Actor, articleId: string, mediaId: string | null): Promise<void> {
  need(actor, 'media.assign');
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true } });
  if (!article) throw new ServiceError('not_found', 'Article not found');
  if (mediaId === null) {
    await prisma.articleMedia.deleteMany({ where: { articleId, usageKey: 'hero' } });
    await prisma.article.update({ where: { id: articleId }, data: { heroImageUrl: null } });
    await audit(actor.id, 'media.article.featured.clear', 'article', articleId);
    return;
  }
  const media = await prisma.mediaAsset.findUnique({ where: { id: mediaId }, select: { url: true, altText: true } });
  if (!media) throw new ServiceError('not_found', 'Media not found');
  await prisma.articleMedia.upsert({
    where: { articleId_usageKey: { articleId, usageKey: 'hero' } },
    update: { mediaId },
    create: { articleId, usageKey: 'hero', mediaId, sortOrder: 0 },
  });
  await prisma.article.update({ where: { id: articleId }, data: { heroImageUrl: media.url } });
  await audit(actor.id, 'media.article.featured.set', 'article', articleId, mediaId);
}

type RodeoKind = 'hub' | 'event' | 'edition' | 'discipline' | 'venue' | 'competitor';
export async function assignRodeoMedia(actor: Actor, kind: RodeoKind, entityId: string, mediaId: string, role = 'gallery'): Promise<void> {
  need(actor, 'media.assign');
  if (!roleHasPermission(actor.roles, 'rodeo.manage')) throw new ServiceError('forbidden', 'Not permitted to manage rodeo media.');
  if (!(await prisma.mediaAsset.findUnique({ where: { id: mediaId }, select: { id: true } }))) throw new ServiceError('not_found', 'Media not found');
  const data = { mediaId, role, sortOrder: 0 };
  switch (kind) {
    case 'hub': await prisma.rodeoHubMedia.upsert({ where: { hubId_mediaId: { hubId: entityId, mediaId } }, update: { role }, create: { hubId: entityId, ...data } }); break;
    case 'event': await prisma.rodeoEventMedia.upsert({ where: { eventId_mediaId: { eventId: entityId, mediaId } }, update: { role }, create: { eventId: entityId, ...data } }); break;
    case 'edition': await prisma.rodeoEventEditionMedia.upsert({ where: { editionId_mediaId: { editionId: entityId, mediaId } }, update: { role }, create: { editionId: entityId, ...data } }); break;
    case 'discipline': await prisma.disciplineMedia.upsert({ where: { disciplineId_mediaId: { disciplineId: entityId, mediaId } }, update: { role }, create: { disciplineId: entityId, ...data } }); break;
    case 'venue': await prisma.venueMedia.upsert({ where: { venueId_mediaId: { venueId: entityId, mediaId } }, update: { role }, create: { venueId: entityId, ...data } }); break;
    case 'competitor': await prisma.competitorMedia.upsert({ where: { competitorId_mediaId: { competitorId: entityId, mediaId } }, update: { role }, create: { competitorId: entityId, ...data } }); break;
  }
  await audit(actor.id, 'media.rodeo.assign', `rodeo_${kind}`, entityId, mediaId);
}

export async function unassignRodeoMedia(actor: Actor, kind: RodeoKind, entityId: string, mediaId: string): Promise<void> {
  need(actor, 'media.assign');
  if (!roleHasPermission(actor.roles, 'rodeo.manage')) throw new ServiceError('forbidden', 'Not permitted to manage rodeo media.');
  switch (kind) {
    case 'hub': await prisma.rodeoHubMedia.deleteMany({ where: { hubId: entityId, mediaId } }); break;
    case 'event': await prisma.rodeoEventMedia.deleteMany({ where: { eventId: entityId, mediaId } }); break;
    case 'edition': await prisma.rodeoEventEditionMedia.deleteMany({ where: { editionId: entityId, mediaId } }); break;
    case 'discipline': await prisma.disciplineMedia.deleteMany({ where: { disciplineId: entityId, mediaId } }); break;
    case 'venue': await prisma.venueMedia.deleteMany({ where: { venueId: entityId, mediaId } }); break;
    case 'competitor': await prisma.competitorMedia.deleteMany({ where: { competitorId: entityId, mediaId } }); break;
  }
  await audit(actor.id, 'media.rodeo.unassign', `rodeo_${kind}`, entityId, mediaId);
}

/** Publish gate helper (§11): is an article's featured image eligible to go public? */
export async function featuredImageRightsOk(articleId: string): Promise<{ ok: boolean; reason?: string }> {
  const hero = await prisma.articleMedia.findUnique({
    where: { articleId_usageKey: { articleId, usageKey: 'hero' } },
    select: { media: { select: { rightsConfirmed: true, storageProvider: true } } },
  });
  if (!hero?.media) return { ok: true }; // no DAM-managed featured image to gate
  if (hero.media.storageProvider === 'legacy-local') return { ok: true }; // grandfathered
  if (!hero.media.rightsConfirmed) return { ok: false, reason: 'The featured image has unconfirmed usage rights. Confirm its license in the Media Library before publishing.' };
  return { ok: true };
}

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';
import type { RoleKey } from '../lib/auth/rbac';
import type * as MediaSvc from '../lib/cms/mediaService';
import type * as ArticleSvc from '../lib/cms/articleService';

/**
 * Batch 05 media integration (§18). Exercises the REAL DAM service against the
 * test DB with an ISOLATED local storage root (temp dir). Verifies upload auth,
 * signature validation, size limits, processing/derivatives, metadata, rights
 * gate, visibility, search/pagination, reference-safe delete, rodeo assignment
 * and audit. Self-skips without a reachable DATABASE_URL. Cleans up rows + blobs.
 */
const TMP = path.join(os.tmpdir(), `nfr-media-test-${Date.now()}`);
process.env.MEDIA_LOCAL_ROOT = TMP;
process.env.MEDIA_STORAGE_PROVIDER = 'local';

let available = false;
let prisma: PrismaClient;
let media: typeof MediaSvc;
let article: typeof ArticleSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    media = await import('../lib/cms/mediaService');
    article = await import('../lib/cms/articleService');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
  } catch {
    available = false;
  }
}

const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);
const rc = () => Math.floor(Math.random() * 256);
// Distinct bytes each call (random background) so checksums don't collide.
const png = (w = 1400, h = 900) => sharp({ create: { width: w, height: h, channels: 3, background: { r: rc(), g: rc(), b: rc() } } }).png().toBuffer();
const jpg = (w = 1200, h = 800) => sharp({ create: { width: w, height: h, channels: 3, background: { r: rc(), g: rc(), b: rc() } } }).jpeg().toBuffer();

suite('Batch 05 — media / DAM integration', () => {
  const actors: Record<string, Actor> = {};
  const createdMedia: string[] = [];
  const track = <T extends { id: string }>(r: T): T => { createdMedia.push(r.id); return r; };

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `mediatest-${roleKey}-${rid()}@example.com`, name: `M ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    return { id: u.id, roles: [roleKey] };
  }
  function articleInput(over: Partial<ArticleSvc.ArticleInput> = {}): ArticleSvc.ArticleInput {
    return {
      slug: `mediatest-${rid()}`, title: 'Media Gate Dispatch Headline',
      excerpt: 'A valid editorial excerpt long enough to satisfy the publication gate checks for this media test case.',
      blocks: [
        { type: 'paragraph', text: 'Opening paragraph with enough words to pass the publication gate checks here.' },
        { type: 'heading', level: 2, text: 'Section' },
      ],
      categoryName: 'NFR Competition', authorName: 'Media Tester',
      imageRightsStatus: 'Staff Photo', imageAltText: 'A descriptive alt text for the featured test photograph.',
      ...over,
    } as ArticleSvc.ArticleInput;
  }

  beforeAll(async () => {
    actors.admin = await makeUser('administrator');
    actors.editor = await makeUser('editor');
    actors.author = await makeUser('author');
    actors.authorB = await makeUser('author');
    actors.seo = await makeUser('seo_manager');
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.article.deleteMany({ where: { slug: { startsWith: 'mediatest-' } } });
    if (createdMedia.length) await prisma.mediaAsset.deleteMany({ where: { id: { in: createdMedia } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'mediatest-' } } });
    await fs.rm(TMP, { recursive: true, force: true }).catch(() => {});
    await prisma.$disconnect();
  });

  // ---- Upload + processing + storage ----
  it('upload: editor uploads a JPEG → READY, DRAFT, rights-unconfirmed, derivatives + blob on disk', async () => {
    const buf = await jpg(1200, 800);
    const r = track(await media.uploadMedia(actors.editor, { buffer: buf, originalName: 'Rodeo Action.JPG', declaredMime: 'image/jpeg' }));
    expect(r.duplicate).toBe(false);
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.processingStatus).toBe('READY');
    expect(row.visibility).toBe('DRAFT');
    expect(row.rightsConfirmed).toBe(false);
    expect(row.width).toBe(1200);
    expect(row.height).toBe(800);
    expect(row.extension).toBe('jpg');
    expect(row.storageProvider).toBe('local');
    expect(row.url.startsWith('/api/media/')).toBe(true);
    const derivs = row.derivatives as Record<string, { key: string; width: number }>;
    expect(derivs.thumb.width).toBeLessThanOrEqual(320);
    // Original + thumbnail blobs physically exist under the isolated root.
    await expect(fs.access(path.join(TMP, row.storageKey))).resolves.toBeUndefined();
    await expect(fs.access(path.join(TMP, derivs.thumb.key))).resolves.toBeUndefined();
  });

  it('upload: writes an audit entry', async () => {
    const r = track(await media.uploadMedia(actors.editor, { buffer: await png(), originalName: 'a.png' }));
    expect(await prisma.auditLog.count({ where: { entityId: r.id, action: 'media.upload' } })).toBeGreaterThan(0);
  });

  // ---- RBAC ----
  it('rbac: SEO Manager cannot upload (media.upload denied)', async () => {
    await expect(media.uploadMedia(actors.seo, { buffer: await png(), originalName: 's.png' })).rejects.toMatchObject({ code: 'forbidden' });
  });

  // ---- Validation (signature, size, mime, empty) ----
  it('validation: SVG is rejected (unsupported signature)', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(media.uploadMedia(actors.editor, { buffer: svg, originalName: 'x.svg', declaredMime: 'image/svg+xml' })).rejects.toMatchObject({ code: 'validation' });
  });
  it('validation: empty file is rejected', async () => {
    await expect(media.uploadMedia(actors.editor, { buffer: Buffer.alloc(0), originalName: 'e.png' })).rejects.toMatchObject({ code: 'validation' });
  });
  it('validation: oversized file is rejected', async () => {
    await expect(media.uploadMedia(actors.editor, { buffer: await jpg(), originalName: 'big.jpg', maxBytes: 100 })).rejects.toMatchObject({ code: 'validation' });
  });
  it('validation: declared MIME that contradicts the real signature is rejected', async () => {
    await expect(media.uploadMedia(actors.editor, { buffer: await png(), originalName: 'liar.png', declaredMime: 'image/jpeg' })).rejects.toMatchObject({ code: 'validation' });
  });
  it('validation: executable/mismatched filename extensions are rejected', async () => {
    await expect(media.uploadMedia(actors.editor, { buffer: await jpg(), originalName: '../payload.exe', declaredMime: 'image/jpeg' })).rejects.toMatchObject({ code: 'validation' });
  });

  // ---- Processing failures (Batch C, sharp 0.35.x) ----
  it('processing: a valid signature with a corrupt body is rejected with a safe, generic error', async () => {
    const good = await jpg(600, 400);
    const corrupt = Buffer.concat([good.subarray(0, 64), Buffer.alloc(4096, 0x41)]);
    const err = await media.uploadMedia(actors.editor, { buffer: corrupt, originalName: 'corrupt.jpg', declaredMime: 'image/jpeg' }).catch((e) => e);
    expect(err).toMatchObject({ code: 'processing', message: 'The image could not be processed (it may be corrupt).' });
    expect(String(err.message)).not.toMatch(/[\\/]|vips|sharp/i); // no paths or library internals
  });

  // ---- Duplicate handling ----
  it('dedup: identical bytes reuse the existing asset instead of re-storing', async () => {
    const buf = await jpg(900, 600);
    const a = track(await media.uploadMedia(actors.editor, { buffer: buf, originalName: 'dup.jpg' }));
    const b = await media.uploadMedia(actors.editor, { buffer: buf, originalName: 'dup2.jpg' });
    expect(b.duplicate).toBe(true);
    expect(b.id).toBe(a.id);
  });

  // ---- Metadata + ownership ----
  it('metadata: owner edits own; another author is forbidden; SEO Manager (edit.any) can edit', async () => {
    const r = track(await media.uploadMedia(actors.author, { buffer: await png(), originalName: 'own.png' }));
    await expect(media.updateMediaMetadata(actors.author, r.id, { altText: 'Owner alt' })).resolves.toBeUndefined();
    await expect(media.updateMediaMetadata(actors.authorB, r.id, { altText: 'Hijack' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(media.updateMediaMetadata(actors.seo, r.id, { seoTitle: 'SEO fix' })).resolves.toBeUndefined();
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.altText).toBe('Owner alt');
    expect(row.seoTitle).toBe('SEO fix');
  });

  // ---- Rights + visibility ----
  it('rights: confirming requires a concrete license type', async () => {
    const r = track(await media.uploadMedia(actors.editor, { buffer: await png(), originalName: 'rights.png' }));
    await expect(media.confirmRights(actors.editor, r.id, 'UNCONFIRMED', true)).rejects.toMatchObject({ code: 'validation' });
    await media.confirmRights(actors.editor, r.id, 'OWNED', true);
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.rightsConfirmed).toBe(true);
    expect(row.licenseType).toBe('OWNED');
    expect(row.rightsConfirmedById).toBe(actors.editor.id);
  });
  it('rights: an unconfirmed managed asset cannot be made PUBLIC', async () => {
    const r = track(await media.uploadMedia(actors.editor, { buffer: await png(), originalName: 'private.png' }));
    await expect(media.setVisibility(actors.editor, r.id, 'PUBLIC')).rejects.toMatchObject({ code: 'validation' });
    await media.confirmRights(actors.editor, r.id, 'OWNED', true);
    await expect(media.setVisibility(actors.editor, r.id, 'PUBLIC')).resolves.toBeUndefined();
  });

  // ---- Search / pagination ----
  it('list: search + type filter + pagination shape', async () => {
    const res = await media.listMedia(actors.editor, { q: 'rodeo', type: 'jpg', page: 1, pageSize: 12 });
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(12);
    expect(typeof res.totalPages).toBe('number');
    expect(res.rows.every((r) => r.id)).toBe(true);
  });

  // ---- Publish rights gate (§11) ----
  it('publish gate: unconfirmed featured image blocks publishing; confirming unblocks it', async () => {
    const img = track(await media.uploadMedia(actors.admin, { buffer: await jpg(), originalName: 'feat.jpg' }));
    const art = await article.saveArticle(actors.admin as ArticleSvc.ActorContext, articleInput());
    await media.setArticleFeaturedImage(actors.admin, art.id, img.id);
    expect((await media.featuredImageRightsOk(art.id)).ok).toBe(false);
    // walk to APPROVED then attempt PUBLISHED
    const r1 = await article.transitionWorkflow(actors.admin as ArticleSvc.ActorContext, art.id, 'IN_REVIEW', art.version);
    const r2 = await article.transitionWorkflow(actors.admin as ArticleSvc.ActorContext, art.id, 'APPROVED', r1.version);
    await expect(article.transitionWorkflow(actors.admin as ArticleSvc.ActorContext, art.id, 'PUBLISHED', r2.version)).rejects.toMatchObject({ code: 'validation' });
    await media.confirmRights(actors.admin, img.id, 'OWNED', true);
    expect((await media.featuredImageRightsOk(art.id)).ok).toBe(true);
    const r3 = await article.transitionWorkflow(actors.admin as ArticleSvc.ActorContext, art.id, 'PUBLISHED', r2.version);
    expect(r3.becamePublic).toBe(true);
  });

  it('inline media: save tracks the DAM relationship and the publish gate covers it', async () => {
    const img = track(await media.uploadMedia(actors.admin, { buffer: await jpg(), originalName: 'inline.jpg' }));
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: img.id } });
    const input = articleInput({ blocks: [
      { type: 'paragraph', text: 'Opening paragraph with enough words to pass the publication gate checks here.' },
      { type: 'heading', level: 2, text: 'Section' },
      { type: 'image', src: row.url, alt: 'Inline arena action', caption: 'Arena action.' },
    ] });
    const art = await article.saveArticle(actors.admin as ArticleSvc.ActorContext, input);
    expect(await prisma.articleMedia.count({ where: { articleId: art.id, mediaId: img.id, usageKey: { startsWith: 'inline-' } } })).toBe(1);
    const r1 = await article.transitionWorkflow(actors.admin as ArticleSvc.ActorContext, art.id, 'IN_REVIEW', art.version);
    const r2 = await article.transitionWorkflow(actors.admin as ArticleSvc.ActorContext, art.id, 'APPROVED', r1.version);
    await expect(article.transitionWorkflow(actors.admin as ArticleSvc.ActorContext, art.id, 'PUBLISHED', r2.version)).rejects.toMatchObject({ code: 'validation' });
    await media.confirmRights(actors.admin, img.id, 'OWNED', true);
    await expect(article.transitionWorkflow(actors.admin as ArticleSvc.ActorContext, art.id, 'PUBLISHED', r2.version)).resolves.toMatchObject({ becamePublic: true });
  });

  // ---- Reference-safe deletion ----
  it('delete: blocked while referenced by a published article; succeeds + removes blobs when unreferenced', async () => {
    const img = track(await media.uploadMedia(actors.admin, { buffer: await jpg(), originalName: 'del.jpg' }));
    const art = await article.saveArticle(actors.admin as ArticleSvc.ActorContext, articleInput());
    await prisma.article.update({ where: { id: art.id }, data: { workflowStatus: 'PUBLISHED' } });
    await prisma.articleMedia.create({ data: { articleId: art.id, usageKey: 'inline-1', mediaId: img.id } });
    await expect(media.deleteMedia(actors.admin, img.id)).rejects.toMatchObject({ code: 'conflict' });
    // detach, then delete should remove the row and its blobs
    await prisma.articleMedia.deleteMany({ where: { mediaId: img.id } });
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: img.id } });
    await media.deleteMedia(actors.admin, img.id);
    expect(await prisma.mediaAsset.findUnique({ where: { id: img.id } })).toBeNull();
    await expect(fs.access(path.join(TMP, row.storageKey))).rejects.toBeTruthy(); // blob gone
  });

  it('delete: Editor cannot delete (media.delete is Admin+)', async () => {
    const img = track(await media.uploadMedia(actors.admin, { buffer: await png(), originalName: 'nd.png' }));
    await expect(media.deleteMedia(actors.editor, img.id)).rejects.toMatchObject({ code: 'forbidden' });
  });

  // ---- Rodeo assignment ----
  it('rodeo: assign media to a hub then unassign (reuse across entities, no binary dup)', async () => {
    const img = track(await media.uploadMedia(actors.admin, { buffer: await png(), originalName: 'hub.png' }));
    const hub = await prisma.rodeoHub.findFirst({ select: { id: true } });
    if (!hub) return; // no seeded hub in this DB — skip body
    await media.assignRodeoMedia(actors.admin, 'hub', hub.id, img.id, 'hero');
    expect(await prisma.rodeoHubMedia.count({ where: { hubId: hub.id, mediaId: img.id } })).toBe(1);
    await media.unassignRodeoMedia(actors.admin, 'hub', hub.id, img.id);
    expect(await prisma.rodeoHubMedia.count({ where: { hubId: hub.id, mediaId: img.id } })).toBe(0);
  });
});

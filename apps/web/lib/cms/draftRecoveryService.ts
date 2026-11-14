import 'server-only';
import { prisma } from '../db';
import { roleHasPermission, type Permission } from '../auth/rbac';
import { ServiceError, type ActorContext } from './articleService';

/**
 * Recovery of unsaved work in the article composer.
 *
 * THE PROBLEM. An author writes for twenty minutes, the tab closes — a crash, a
 * stray Ctrl+W, a laptop lid — and everything since the last explicit save is
 * gone. There was nowhere for that work to be: an article that has never been
 * saved has no row to attach anything to.
 *
 * THE SHAPE OF THE ANSWER, AND WHY IT IS NOT AUTOSAVE-INTO-ARTICLE.
 *
 * The obvious design is to keep calling `saveArticle` in the background. It is
 * the wrong one, for reasons that all bite immediately:
 *
 *   - a half-written composer has no excerpt and no article type, so the save
 *     boundary REFUSES it — correctly, and that is exactly when the author most
 *     needs their words kept;
 *   - every autosave would bump the article's version, which is what the
 *     editor's concurrency check compares, so background saves would start
 *     reporting "changed by someone else" to the author changing it;
 *   - every autosave would leave a revision, burying real editorial history;
 *   - the Article Directory, the SEO engine and the sitemap would fill with
 *     skeletons nobody meant to create.
 *
 * So a snapshot is EDITOR STATE, not editorial content. It lives in its own
 * table, never reaches the public site, and the author decides when the work
 * becomes an article by saving it as one. Recovery restores the composer; it
 * does not publish, create or modify anything editorial.
 *
 * PRIVACY. A snapshot is unfinished work, so it belongs to one editor. Every
 * read and write here is scoped to `actor.id` — there is no "list all" path,
 * not even for an administrator, because the recovery list is a person's own
 * desk and not a management view. What an administrator can still see is the
 * articles themselves, which is where finished work lives.
 */

/** The composer sends its whole input; this is only what the list needs. */
export interface DraftSnapshotSummary {
  id: string;
  composerKey: string;
  articleId: string | null;
  title: string;
  slug: string;
  updatedAt: Date;
  createdAt: Date;
  /** Words in the body, so the list can say how much work is at stake. */
  wordCount: number;
}

export interface DraftSnapshotRecord extends DraftSnapshotSummary {
  payload: unknown;
}

/**
 * The largest snapshot accepted, in bytes of serialised JSON.
 *
 * An article body with a hundred blocks is comfortably inside this. The cap
 * exists so a runaway client cannot fill the table, and it is checked before
 * the write rather than relied on from the database.
 */
export const MAX_SNAPSHOT_BYTES = 1_000_000;

/**
 * How long an untouched snapshot is kept.
 *
 * Long enough to survive a weekend and a holiday; short enough that the list
 * stays a recovery list rather than an archive. Pruning happens on write, so it
 * needs no scheduler — the cost is one bounded delete on the same connection
 * the autosave is already using.
 */
export const SNAPSHOT_RETENTION_DAYS = 30;

/** Composing or editing an article is what gives access to recovery. */
const COMPOSER_PERMISSIONS: Permission[] = ['article.create', 'article.edit.own', 'article.edit.any'];

function assertComposer(actor: ActorContext): void {
  if (!COMPOSER_PERMISSIONS.some((p) => roleHasPermission(actor.roles, p))) {
    throw new ServiceError('forbidden', 'You do not have permission to compose articles.');
  }
}

/**
 * Validates a composer key.
 *
 * It arrives from the client and becomes half of a unique constraint, so it is
 * held to a shape rather than trusted: `article:<id>` or `new:<token>`.
 * Anything else is refused, which keeps one editor's rows from colliding
 * through a crafted key.
 */
const COMPOSER_KEY = /^(article|new):[A-Za-z0-9_-]{1,64}$/;

function assertComposerKey(key: string): void {
  if (!COMPOSER_KEY.test(key)) {
    throw new ServiceError('validation', 'Invalid composer key.');
  }
}

/** Words in the body blocks of a payload, for the recovery list. */
function payloadWordCount(payload: unknown): number {
  const blocks = (payload as { blocks?: unknown[] } | null)?.blocks;
  if (!Array.isArray(blocks)) return 0;
  let words = 0;
  const countText = (v: unknown) => {
    if (typeof v !== 'string') return;
    words += v.trim().split(/\s+/).filter(Boolean).length;
  };
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const block = b as Record<string, unknown>;
    countText(block.text);
    countText(block.quote);
    if (Array.isArray(block.items)) block.items.forEach(countText);
  }
  return words;
}

export interface SaveSnapshotInput {
  composerKey: string;
  /** Present when the composer is editing a stored article. */
  articleId?: string | null;
  title: string;
  slug: string;
  /** Exactly what the composer would send to `saveArticle`. */
  payload: unknown;
}

/**
 * Writes (or replaces) the snapshot for one composer session.
 *
 * Upserted on `(userId, composerKey)`, so one session keeps ONE row however
 * often it autosaves — the table grows with open composers, not with keystrokes.
 */
export async function saveDraftSnapshot(
  actor: ActorContext,
  input: SaveSnapshotInput,
): Promise<{ id: string; updatedAt: Date }> {
  assertComposer(actor);
  assertComposerKey(input.composerKey);

  const serialised = JSON.stringify(input.payload ?? {});
  if (serialised.length > MAX_SNAPSHOT_BYTES) {
    throw new ServiceError(
      'validation',
      'This draft is too large to keep a recovery copy of. Save it as an article instead.',
    );
  }

  /*
    The article link is verified rather than taken on trust: a snapshot that
    claimed an article the editor cannot see would leak its existence through a
    foreign-key error, and would be deleted along with that article.
  */
  let articleId: string | null = null;
  if (input.articleId) {
    const exists = await prisma.article.findUnique({
      where: { id: input.articleId }, select: { id: true },
    });
    articleId = exists?.id ?? null;
  }

  const data = {
    articleId,
    title: input.title.slice(0, 300) || 'Untitled draft',
    slug: input.slug.slice(0, 300),
    payload: JSON.parse(serialised) as object,
  };

  const row = await prisma.articleDraftSnapshot.upsert({
    where: { userId_composerKey: { userId: actor.id, composerKey: input.composerKey } },
    create: { userId: actor.id, composerKey: input.composerKey, ...data },
    update: data,
    select: { id: true, updatedAt: true },
  });

  // Pruning on write: no scheduler, and the author's own stale rows go first.
  const cutoff = new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.articleDraftSnapshot.deleteMany({
    where: { userId: actor.id, updatedAt: { lt: cutoff } },
  });

  return row;
}

/** This editor's recovery list, newest first. */
export async function listDraftSnapshots(actor: ActorContext): Promise<DraftSnapshotSummary[]> {
  assertComposer(actor);
  const rows = await prisma.articleDraftSnapshot.findMany({
    where: { userId: actor.id },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true, composerKey: true, articleId: true, title: true, slug: true,
      updatedAt: true, createdAt: true, payload: true,
    },
  });
  return rows.map(({ payload, ...r }) => ({ ...r, wordCount: payloadWordCount(payload) }));
}

/** One snapshot, with its payload — only ever the caller's own. */
export async function getDraftSnapshot(actor: ActorContext, id: string): Promise<DraftSnapshotRecord> {
  assertComposer(actor);
  const row = await prisma.articleDraftSnapshot.findFirst({
    // `userId` is part of the WHERE, not checked afterwards: a snapshot
    // belonging to someone else is not found rather than found-and-refused,
    // so nothing is revealed about whether it exists.
    where: { id, userId: actor.id },
    select: {
      id: true, composerKey: true, articleId: true, title: true, slug: true,
      updatedAt: true, createdAt: true, payload: true,
    },
  });
  if (!row) throw new ServiceError('not_found', 'That recovery draft is no longer available.');
  const { payload, ...rest } = row;
  return { ...rest, payload, wordCount: payloadWordCount(payload) };
}

/** Removes one snapshot by id. Used by "discard" in the recovery list. */
export async function discardDraftSnapshot(actor: ActorContext, id: string): Promise<void> {
  assertComposer(actor);
  const { count } = await prisma.articleDraftSnapshot.deleteMany({
    where: { id, userId: actor.id },
  });
  if (count === 0) throw new ServiceError('not_found', 'That recovery draft is no longer available.');
}

/**
 * Removes the snapshot for a composer session.
 *
 * Called after a REAL save succeeds: once the work is an article, the recovery
 * copy is not just redundant but misleading — it would offer to restore an
 * older version of something already stored.
 */
export async function discardComposerSnapshot(actor: ActorContext, composerKey: string): Promise<void> {
  assertComposer(actor);
  assertComposerKey(composerKey);
  await prisma.articleDraftSnapshot.deleteMany({
    where: { userId: actor.id, composerKey },
  });
}

/** How many recovery drafts this editor has, for the directory tab's badge. */
export async function countDraftSnapshots(actor: ActorContext): Promise<number> {
  if (!COMPOSER_PERMISSIONS.some((p) => roleHasPermission(actor.roles, p))) return 0;
  return prisma.articleDraftSnapshot.count({ where: { userId: actor.id } });
}

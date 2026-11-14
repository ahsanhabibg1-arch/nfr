import 'server-only';
import { Prisma, type InfoPage, type InfoPageStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { roleHasPermission } from '../auth/rbac';
import type { Actor } from './guard';
import { audit } from './guard';
import { ServiceError } from './articleService';
import { sanitizeLegalHtml } from './sanitizeHtml';

export const LEGACY_SLUGS = ['about', 'privacy', 'terms', 'editorial-policy', 'affiliate-disclosure', 'corrections', 'contact'] as const;

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'auth', '_next', 'internal', 'index', 'page', 'layout',
  'loading', 'error', 'not-found', 'login', 'logout', 'register', 'signup',
  'settings', 'dashboard', 'profile', 'search', 'sitemap', 'robots',
  'favicon', 'manifest', 'feed', 'rss', 'atom', 'info',
  'account', 'forgot-password', 'reset-password',
  'articles', 'categories', 'competitors', 'venues', 'rodeo-events', 'disciplines',
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugSchema = z.string().min(1, 'Slug is required.').max(100, 'Slug must be 100 characters or fewer.').refine(
  (s) => SLUG_RE.test(s),
  'Slug must be lowercase letters, numbers, and hyphens (no leading/trailing/double hyphens).',
).refine(
  (s) => !RESERVED_SLUGS.has(s),
  'This slug is reserved and cannot be used.',
);

export { RESERVED_SLUGS, SLUG_RE };

const need = (a: Actor, perm: string) => {
  if (!roleHasPermission(a.roles, perm as any)) throw new ServiceError('forbidden', `Not permitted (${perm}).`);
};

const SaveSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
  seoTitle: z.string().max(200).nullable().optional(),
  metaDescription: z.string().max(500).nullable().optional(),
  /** A Media Library asset id, or null to clear the hero. */
  heroMediaId: z.string().uuid().nullable().optional(),
});
export type InfoPageInput = z.infer<typeof SaveSchema>;

export async function listInfoPages(): Promise<InfoPage[]> {
  return prisma.infoPage.findMany({ orderBy: { slug: 'asc' } });
}

export async function getInfoPage(slug: string): Promise<InfoPage | null> {
  return prisma.infoPage.findUnique({ where: { slug } });
}

/**
 * The content the public renders. Shaped like the draft columns so the view
 * layer needs no branch, but it always comes from `publishedSnapshot`.
 */
export interface PublicInfoPage {
  title: string;
  body: string;
  seoTitle: string | null;
  metaDescription: string | null;
  publishedAt: string | null;
  hero: PublishedHero | null;
  /**
   * The EntitySeo values AS THEY WERE WHEN THIS VERSION WENT LIVE.
   *
   * EntitySeo is one row per entity, so editing it would otherwise change the
   * live page's metadata the instant it was saved — a draft SEO change leaking
   * straight to production while the draft body politely waited. Folding the
   * SEO into the snapshot keeps the published metadata matched to the published
   * content: both move only at publication, together.
   *
   * Absent on pages published before PM-04, which fall back to the row's own
   * `seoTitle` / `metaDescription`.
   */
  seo: PublishedSeo | null;
}

/**
 * The hero as it was at publication: a resolved COPY of the asset's display
 * fields, not the id.
 *
 * The reference on the row is the source of truth for editing, but a published
 * page must render the same thing tomorrow as today. Resolving at publication
 * means a later alt-text edit in the Media Library does not silently change a
 * live legal page — it reaches readers when the page is published again, like
 * every other change.
 */
export interface PublishedHero {
  url: string;
  alt: string | null;
  caption: string | null;
  credit: string | null;
}

export interface PublishedSeo {
  seoTitle: string | null;
  metaDescription: string | null;
  canonicalOverride: string | null;
  ogImage: string | null;
  noindex: boolean;
}

/**
 * What a public request for `slug` should do. Three outcomes, not two.
 *
 * The missing third case was defect §9. `getPublishedInfoPage` used to return
 * `null` both for "no such page" and for "a page that exists and was
 * deliberately taken down", and `LegalPageView` treats `null` as permission to
 * fall back to the compiled-in copy. So unpublishing a live policy page did not
 * remove it — it swapped the approved wording for unapproved built-in text
 * carrying a pending-review banner, which is the opposite of what the operator
 * asked for.
 *
 *   live      — a snapshot exists and the page is not archived: render it.
 *   withdrawn — a row exists but is not live: 404. NEVER fall back; an operator
 *               took this page down on purpose and the built-in draft is not a
 *               substitute for it.
 *   unmanaged — no row at all: the page has never been touched through the CMS,
 *               so the compiled-in copy is still the only content there is.
 */
export type InfoPageResolution =
  | { kind: 'live'; page: PublicInfoPage }
  | { kind: 'withdrawn' }
  | { kind: 'unmanaged' };

function readSnapshot(raw: unknown): PublicInfoPage | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.title !== 'string' || typeof o.body !== 'string') return null;
  const seo = o.seo && typeof o.seo === 'object' ? (o.seo as Record<string, unknown>) : null;
  const h = o.hero && typeof o.hero === 'object' ? (o.hero as Record<string, unknown>) : null;
  return {
    title: o.title,
    body: o.body,
    seoTitle: typeof o.seoTitle === 'string' ? o.seoTitle : null,
    metaDescription: typeof o.metaDescription === 'string' ? o.metaDescription : null,
    publishedAt: typeof o.publishedAt === 'string' ? o.publishedAt : null,
    hero: h && typeof h.url === 'string'
      ? {
          url: h.url,
          alt: typeof h.alt === 'string' ? h.alt : null,
          caption: typeof h.caption === 'string' ? h.caption : null,
          credit: typeof h.credit === 'string' ? h.credit : null,
        }
      : null,
    seo: seo
      ? {
          seoTitle: typeof seo.seoTitle === 'string' ? seo.seoTitle : null,
          metaDescription: typeof seo.metaDescription === 'string' ? seo.metaDescription : null,
          canonicalOverride: typeof seo.canonicalOverride === 'string' ? seo.canonicalOverride : null,
          ogImage: typeof seo.ogImage === 'string' ? seo.ogImage : null,
          noindex: seo.noindex === true,
        }
      : null,
  };
}

export async function resolvePublicInfoPage(slug: string): Promise<InfoPageResolution> {
  const row = await prisma.infoPage.findUnique({
    where: { slug },
    select: { publishedSnapshot: true, archivedAt: true },
  });
  if (!row) return { kind: 'unmanaged' };
  if (row.archivedAt) return { kind: 'withdrawn' };
  const snap = readSnapshot(row.publishedSnapshot);
  return snap ? { kind: 'live', page: snap } : { kind: 'withdrawn' };
}

/**
 * Kept for callers that only need the live content and treat every other case
 * the same way. Prefer `resolvePublicInfoPage` anywhere the difference between
 * "withdrawn" and "unmanaged" decides what a reader sees.
 */
export async function getPublishedInfoPage(slug: string): Promise<PublicInfoPage | null> {
  const r = await resolvePublicInfoPage(slug);
  return r.kind === 'live' ? r.page : null;
}

/**
 * A snapshot of the draft as it stands, used for both publication and history.
 *
 * One object rather than a column per field is what makes publication atomic:
 * body, SEO title and meta description go live together or not at all. The
 * failure this prevents is a page whose text is the new version while its meta
 * description is still the old one — a mix no reader or crawler could make
 * sense of, and the exact risk a field-by-field copy invites.
 */
function draftSnapshot(page: {
  title: string; body: string; seoTitle: string | null; metaDescription: string | null;
}, publishedAt: Date) {
  return {
    title: page.title,
    body: page.body,
    seoTitle: page.seoTitle,
    metaDescription: page.metaDescription,
    publishedAt: publishedAt.toISOString(),
  };
}

/** Appends a revision inside an open transaction, numbering it per page. */
async function recordRevision(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  page: { id: string; title: string; body: string; seoTitle: string | null; metaDescription: string | null; status: InfoPageStatus },
  actor: Actor,
  summary: string,
): Promise<void> {
  const last = await tx.infoPageRevision.findFirst({
    where: { pageId: page.id }, orderBy: { revisionNo: 'desc' }, select: { revisionNo: true },
  });
  await tx.infoPageRevision.create({
    data: {
      pageId: page.id,
      revisionNo: (last?.revisionNo ?? 0) + 1,
      actorId: actor.id,
      actorName: actor.id,
      status: page.status,
      summary,
      snapshot: {
        title: page.title, body: page.body,
        seoTitle: page.seoTitle, metaDescription: page.metaDescription,
      },
    },
  });
}

/**
 * Saves the working draft. A PUBLISHED page is edited here like any other.
 *
 * This is the S-1 / D-09 fix. The previous implementation refused outright,
 * because draft and live content shared one set of columns and a save would
 * have rewritten the live page under its readers. With `publishedSnapshot`
 * holding the live version, the draft columns are free: visitors keep seeing
 * the published page for as long as the editor takes, and nothing goes live
 * until `publishInfoPage` promotes it.
 *
 * `expectedVersion` is an optimistic lock. Two editors with the same page open
 * used to produce a silent last-write-wins; the second save is now refused with
 * a sentence that says what happened. Omitting it is allowed for callers that
 * genuinely have no prior version (a first save), and is the one case where
 * concurrent writes cannot be detected.
 */
export async function saveInfoPageDraft(
  actor: Actor,
  input: InfoPageInput,
  expectedVersion?: number,
): Promise<InfoPage> {
  need(actor, 'system.config');
  const raw = SaveSchema.parse(input);
  const data = { ...raw, body: sanitizeLegalHtml(raw.body) };
  /**
   * The asset must exist and must be one the Media Library serves. An id that
   * does not resolve would otherwise be stored, fail the foreign key at save
   * time with a constraint name, and tell the operator nothing.
   */
  if (data.heroMediaId) {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: data.heroMediaId }, select: { id: true } });
    if (!asset) throw new ServiceError('validation', 'That image is not in the Media Library.');
  }
  const existing = await prisma.infoPage.findUnique({ where: { slug: data.slug } });

  if (existing?.archivedAt) {
    throw new ServiceError('validation', 'This page is archived. Restore it before editing.');
  }

  /**
   * Editing an APPROVED draft drops its approval, and clears the stamp with it
   * so the row cannot keep claiming an approval it no longer holds. Losing a
   * legal-page approval is never silent: the audit record says so.
   */
  const droppedApproval = existing != null && (existing.status === 'APPROVED' || existing.approvedAt != null);

  if (!existing) {
    const created = await prisma.infoPage.create({
      data: { ...data, status: 'DRAFT', createdById: actor.id, updatedById: actor.id },
    });
    await audit(actor.id, 'info_page.save_draft', 'InfoPage', created.id, `${data.slug} — created`);
    return created;
  }

  if (typeof expectedVersion === 'number' && expectedVersion !== existing.version) {
    throw new ServiceError(
      'conflict',
      'This page was changed by someone else while you were editing. Reload to see their version before saving yours.',
    );
  }

  /**
   * A protected page keeps its slug. The seven policy URLs are referenced by
   * the footer, the policy cross-navigation and the sitemap, none of which live
   * in this table, so a rename here would break links nothing here can see.
   */
  if (existing.isProtected && data.slug !== existing.slug) {
    throw new ServiceError('forbidden', 'This is a protected page; its URL cannot be changed.');
  }

  const result = await prisma.$transaction(async (tx) => {
    await recordRevision(tx, existing, actor, 'Draft saved');
    const updated = await tx.infoPage.updateMany({
      where: { id: existing.id, version: existing.version },
      data: {
        ...data,
        status: 'DRAFT',
        version: { increment: 1 },
        updatedById: actor.id,
        ...(droppedApproval ? { approvedById: null, approvedAt: null } : {}),
      },
    });
    if (updated.count === 0) {
      throw new ServiceError('conflict', 'This page was changed by someone else. Reload and try again.');
    }
    return tx.infoPage.findUniqueOrThrow({ where: { id: existing.id } });
  });

  await audit(
    actor.id,
    'info_page.save_draft',
    'InfoPage',
    result.id,
    droppedApproval
      ? `${data.slug} — approval reset; this page needs re-approval before it can be published`
      : data.slug,
  );
  return result;
}

export async function submitForReview(actor: Actor, slug: string): Promise<void> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  if (page.status !== 'DRAFT') throw new ServiceError('validation', 'Only drafts can be submitted for review.');
  await prisma.infoPage.update({ where: { slug }, data: { status: 'PENDING_REVIEW', updatedById: actor.id } });
  await audit(actor.id, 'info_page.submit_review', 'InfoPage', page.id, slug);
}

export async function approveInfoPage(actor: Actor, slug: string): Promise<void> {
  need(actor, 'system.config');
  if (!roleHasPermission(actor.roles, 'system.config')) {
    throw new ServiceError('forbidden', 'Only super_admin / administrator can approve legal pages.');
  }
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  if (page.status !== 'PENDING_REVIEW') throw new ServiceError('validation', 'Only pages pending review can be approved.');
  await prisma.infoPage.update({
    where: { slug },
    data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date(), updatedById: actor.id },
  });
  await audit(actor.id, 'info_page.approve', 'InfoPage', page.id, slug);
}

/**
 * Promotes the approved draft to the live snapshot, in ONE transaction.
 *
 * Everything a reader sees changes together or not at all. If any statement
 * here fails the transaction rolls back and the previously published version
 * stays exactly as it was — a half-published page, with the new body beside the
 * old meta description, is not a state this can reach.
 */
export async function publishInfoPage(actor: Actor, slug: string): Promise<void> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  if (page.archivedAt) throw new ServiceError('validation', 'This page is archived. Restore it before publishing.');
  if (page.status !== 'APPROVED') throw new ServiceError('validation', 'Only approved pages can be published.');

  const publishedAt = new Date();
  /**
   * Read OUTSIDE the transaction but immediately before it: EntitySeo is a
   * separate table with its own editor, and the point is to capture what it
   * says at this moment, not to lock it.
   */
  const heroRow = page.heroMediaId
    ? await prisma.mediaAsset.findUnique({
        where: { id: page.heroMediaId },
        select: { url: true, altText: true, caption: true, credit: true },
      })
    : null;
  const seoRow = await prisma.entitySeo.findUnique({
    where: { entityType_entityId: { entityType: 'INFO_PAGE', entityId: page.id } },
    select: { seoTitle: true, metaDescription: true, canonicalOverride: true, ogImage: true, noindex: true },
  });

  await prisma.$transaction(async (tx) => {
    await recordRevision(tx, page, actor, 'Published');
    await tx.infoPage.update({
      where: { id: page.id },
      data: {
        status: 'PUBLISHED',
        publishedAt,
        publishedSnapshot: {
          ...draftSnapshot(page, publishedAt),
          seo: seoRow ?? null,
          hero: heroRow ? { url: heroRow.url, alt: heroRow.altText, caption: heroRow.caption, credit: heroRow.credit } : null,
        },
        version: { increment: 1 },
        updatedById: actor.id,
      },
    });
  });
  await audit(actor.id, 'info_page.publish', 'InfoPage', page.id, slug);
}

export async function revertToDraft(actor: Actor, slug: string): Promise<void> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  /**
   * A PUBLISHED page may be reverted now: this moves the DRAFT back to editable
   * and leaves `publishedSnapshot` untouched, so the live page is unaffected.
   * Use `unpublishInfoPage` to take it down.
   */
  await prisma.infoPage.update({
    where: { slug },
    data: { status: 'DRAFT', version: { increment: 1 }, updatedById: actor.id },
  });
  await audit(actor.id, 'info_page.revert_draft', 'InfoPage', page.id, slug);
}

export async function unpublishInfoPage(actor: Actor, slug: string): Promise<void> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  /**
   * "Is this page live?" is a question about the SNAPSHOT, not about the draft's
   * status — and conflating the two was a real defect while this was written.
   * Once draft and live content were separated, saving any edit to a published
   * page moves its draft back to DRAFT; checking `status` here would then
   * refuse to unpublish a page that is plainly still being served, leaving the
   * operator no way to take it down.
   */
  if (page.publishedSnapshot === null) {
    throw new ServiceError('validation', 'This page is not currently published.');
  }
  /**
   * Clearing the snapshot is what takes the page off the public site, and the
   * row staying behind is what stops the compiled-in draft from filling the
   * gap: `resolvePublicInfoPage` reads a row with no snapshot as `withdrawn`
   * and returns 404 rather than falling back. Taking a policy page down no
   * longer silently replaces approved wording with unapproved wording.
   */
  await prisma.infoPage.update({
    where: { slug },
    data: { status: 'DRAFT', publishedSnapshot: Prisma.DbNull, version: { increment: 1 }, updatedById: actor.id },
  });

  /**
   * Stage 09 Task E: the audit record states the PUBLIC effect, not just the
   * state change.
   *
   * Unpublishing is a legitimate operation and Stage 09 does not block it — an
   * operator may genuinely need a page down. What it does is make the
   * consequence legible afterwards: "now a draft" describes the row, while what
   * a reader experiences is that the page left public view. A legal page
   * quietly reverting to different built-in wording is the kind of change
   * someone will later need to account for.
   */
  const isLegacy = (LEGACY_SLUGS as readonly string[]).includes(slug);
  await audit(
    actor.id,
    'info_page.unpublish',
    'InfoPage',
    page.id,
    `${slug} — removed from public view; ` +
      (isLegacy
        ? 'this legacy policy URL now returns 404 — it no longer falls back to the built-in text'
        : 'this URL now returns 404 until the page is published again'),
  );
}

// --- Archive, restore and deletion -----------------------------------------

/**
 * Soft delete. The page leaves the public site and the sitemap; the row, its
 * revisions and its audit trail stay.
 *
 * Archiving clears the live snapshot for the same reason unpublishing does —
 * otherwise an archived page would keep serving. A protected page cannot be
 * archived: the seven policy URLs are linked from the footer and the sitemap,
 * and an archived one would leave those links pointing at a 404.
 */
export async function archiveInfoPage(actor: Actor, slug: string): Promise<void> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  if (page.isProtected) {
    throw new ServiceError('forbidden', 'This is a protected page and cannot be archived. Unpublish it instead if it must come down.');
  }
  if (page.archivedAt) throw new ServiceError('validation', 'This page is already archived.');
  await prisma.$transaction(async (tx) => {
    await recordRevision(tx, page, actor, 'Archived');
    await tx.infoPage.update({
      where: { id: page.id },
      data: { archivedAt: new Date(), status: 'DRAFT', publishedSnapshot: Prisma.DbNull, version: { increment: 1 }, updatedById: actor.id },
    });
  });
  await audit(actor.id, 'info_page.archive', 'InfoPage', page.id,
    `${slug} — withdrawn from the public site and the sitemap; content and revisions kept`);
}

/**
 * Restores an archived page as a DRAFT, never straight back to live.
 *
 * Whatever was published before archiving is gone from the snapshot, and the
 * reason it was taken down may still apply, so restoring returns it to the
 * editor rather than to readers. It goes live again only by being approved and
 * published like any other change.
 */
export async function restoreInfoPage(actor: Actor, slug: string): Promise<void> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  if (!page.archivedAt) throw new ServiceError('validation', 'This page is not archived.');
  await prisma.infoPage.update({
    where: { id: page.id },
    data: { archivedAt: null, status: 'DRAFT', version: { increment: 1 }, updatedById: actor.id },
  });
  await audit(actor.id, 'info_page.restore', 'InfoPage', page.id, `${slug} — restored as a draft, not published`);
}

/**
 * Permanent deletion, for CUSTOM pages only and only once archived.
 *
 * Two gates rather than one. `isProtected` keeps the policy pages, and
 * requiring the page to be archived first means deletion is never the first
 * action taken on a live page — somebody has already decided it should be gone
 * and seen the site without it. Revisions cascade with the row, which is the
 * point of the distinction between this and archiving.
 */
export async function deleteInfoPage(actor: Actor, slug: string): Promise<void> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  if (page.isProtected || page.pageType === 'SYSTEM') {
    throw new ServiceError('forbidden', 'Protected system pages cannot be deleted.');
  }
  if (!page.archivedAt) {
    throw new ServiceError('validation', 'Archive this page first. Deletion is permanent and removes its revision history.');
  }
  await prisma.infoPage.delete({ where: { id: page.id } });
  await audit(actor.id, 'info_page.delete', 'InfoPage', page.id, `${slug} — permanently deleted with its revision history`);
}

// --- Revisions --------------------------------------------------------------

export interface InfoPageRevisionRow {
  id: string;
  revisionNo: number;
  actorName: string;
  status: InfoPageStatus;
  summary: string;
  createdAt: Date;
}

export async function listInfoPageRevisions(actor: Actor, slug: string): Promise<InfoPageRevisionRow[]> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug }, select: { id: true } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  return prisma.infoPageRevision.findMany({
    where: { pageId: page.id },
    orderBy: { revisionNo: 'desc' },
    select: { id: true, revisionNo: true, actorName: true, status: true, summary: true, createdAt: true },
  });
}

/**
 * Restores an earlier revision INTO THE DRAFT. The live page is untouched.
 *
 * This is the behaviour the brief asks for: restoring V1 while V2 is live must
 * not put V1 back in front of readers. It loads the old content into the
 * editor, where it goes through review and publication like any other change —
 * so a restore is reviewable, and a mistaken one is itself undoable because the
 * draft it replaced was recorded as a revision first.
 */
export async function restoreInfoPageRevision(actor: Actor, slug: string, revisionNo: number): Promise<void> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  if (page.archivedAt) throw new ServiceError('validation', 'This page is archived. Restore it before restoring a revision.');
  const rev = await prisma.infoPageRevision.findUnique({
    where: { pageId_revisionNo: { pageId: page.id, revisionNo } },
  });
  if (!rev) throw new ServiceError('not_found', 'Revision not found.');
  const snap = rev.snapshot as Record<string, unknown>;
  if (typeof snap.title !== 'string' || typeof snap.body !== 'string') {
    throw new ServiceError('validation', 'That revision is missing its content and cannot be restored.');
  }

  await prisma.$transaction(async (tx) => {
    await recordRevision(tx, page, actor, `Draft replaced by revision ${revisionNo}`);
    await tx.infoPage.update({
      where: { id: page.id },
      data: {
        title: snap.title as string,
        body: sanitizeLegalHtml(snap.body as string),
        seoTitle: typeof snap.seoTitle === 'string' ? snap.seoTitle : null,
        metaDescription: typeof snap.metaDescription === 'string' ? snap.metaDescription : null,
        status: 'DRAFT',
        approvedById: null,
        approvedAt: null,
        version: { increment: 1 },
        updatedById: actor.id,
      },
    });
  });
  await audit(actor.id, 'info_page.restore_revision', 'InfoPage', page.id,
    `${slug} — revision ${revisionNo} loaded into the draft; the live page is unchanged`);
}

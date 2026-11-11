import 'server-only';
import type { InfoPage, InfoPageStatus } from '@prisma/client';
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
});
export type InfoPageInput = z.infer<typeof SaveSchema>;

export async function listInfoPages(): Promise<InfoPage[]> {
  return prisma.infoPage.findMany({ orderBy: { slug: 'asc' } });
}

export async function getInfoPage(slug: string): Promise<InfoPage | null> {
  return prisma.infoPage.findUnique({ where: { slug } });
}

export async function getPublishedInfoPage(slug: string): Promise<InfoPage | null> {
  return prisma.infoPage.findFirst({ where: { slug, status: 'PUBLISHED' } });
}

/**
 * Why a published information page cannot be edited (Stage 09 Task E, D-09).
 *
 * The previous message was *"Cannot edit a published page directly. Create a
 * new draft revision."* — and **no such mechanism exists**. There is no draft
 * revision function, action, route or button anywhere in the codebase, so the
 * message sent the operator to look for something that was never built. That,
 * not a silent overwrite, is the real D-09 defect: `saveInfoPageDraft` does
 * refuse, and a live page is never rewritten behind the editor's back.
 *
 * This message states the truth instead: the only available path is to
 * unpublish, and unpublishing **takes the page off the public site**. For one
 * of the seven legacy slugs the URL keeps working but reverts to the built-in
 * text, which still carries a pending-review banner; for any other slug the URL
 * 404s. The operator needs that fact before choosing, and it is exactly what
 * the old wording concealed.
 *
 * A real fix — separate draft and published content, so a page can be edited
 * while the current version stays live — needs schema change **S-1** and is
 * BLOCKED pending owner approval. An accurate warning is not publication
 * isolation, and Stage 09 does not claim otherwise.
 */
const PUBLISHED_EDIT_REFUSAL =
  'This page is PUBLISHED, so its content cannot be edited in place — there is no draft-alongside-published ' +
  'capability yet. To change it you must Unpublish it first, which removes it from public view: a legacy ' +
  'policy URL will fall back to the built-in text (still marked pending review), and any other slug will ' +
  'return 404 until you publish again. Unpublish, edit, re-submit, re-approve, then publish.';

export async function saveInfoPageDraft(actor: Actor, input: InfoPageInput): Promise<InfoPage> {
  need(actor, 'system.config');
  const raw = SaveSchema.parse(input);
  const data = { ...raw, body: sanitizeLegalHtml(raw.body) };
  const existing = await prisma.infoPage.findUnique({ where: { slug: data.slug } });
  if (existing && existing.status === 'PUBLISHED') {
    throw new ServiceError('validation', PUBLISHED_EDIT_REFUSAL);
  }

  /**
   * Editing an APPROVED page drops its approval — correctly, because the
   * approved wording is no longer what is stored. Two Stage 09 corrections:
   *
   *   - the approval STAMP is cleared too. It was left behind, so the row kept
   *     claiming an `approvedAt` and `approvedById` for an approval it no
   *     longer held;
   *   - the audit record says so, because losing a legal-page approval should
   *     never be silent.
   */
  const droppedApproval = existing != null && (existing.status === 'APPROVED' || existing.approvedAt != null);

  const result = await prisma.infoPage.upsert({
    where: { slug: data.slug },
    create: { ...data, status: 'DRAFT', createdById: actor.id, updatedById: actor.id },
    update: {
      ...data,
      status: 'DRAFT',
      updatedById: actor.id,
      ...(droppedApproval ? { approvedById: null, approvedAt: null } : {}),
    },
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

export async function publishInfoPage(actor: Actor, slug: string): Promise<void> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  if (page.status !== 'APPROVED') throw new ServiceError('validation', 'Only approved pages can be published.');
  await prisma.infoPage.update({
    where: { slug },
    data: { status: 'PUBLISHED', publishedAt: new Date(), updatedById: actor.id },
  });
  await audit(actor.id, 'info_page.publish', 'InfoPage', page.id, slug);
}

export async function revertToDraft(actor: Actor, slug: string): Promise<void> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  if (page.status === 'PUBLISHED') {
    throw new ServiceError('validation', 'Cannot revert a published page directly. Unpublish it first.');
  }
  await prisma.infoPage.update({ where: { slug }, data: { status: 'DRAFT', updatedById: actor.id } });
  await audit(actor.id, 'info_page.revert_draft', 'InfoPage', page.id, slug);
}

export async function unpublishInfoPage(actor: Actor, slug: string): Promise<void> {
  need(actor, 'system.config');
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) throw new ServiceError('not_found', 'Page not found.');
  if (page.status !== 'PUBLISHED') throw new ServiceError('validation', 'Only published pages can be unpublished.');
  await prisma.infoPage.update({ where: { slug }, data: { status: 'DRAFT', updatedById: actor.id } });

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
        ? 'this legacy policy URL now renders the built-in text, which is still marked pending review'
        : 'this URL now returns 404 until the page is published again'),
  );
}

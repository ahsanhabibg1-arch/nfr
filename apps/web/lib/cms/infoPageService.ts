import 'server-only';
import type { InfoPage, InfoPageStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { roleHasPermission } from '../auth/rbac';
import type { Actor } from './guard';
import { audit } from './guard';
import { ServiceError } from './articleService';
import { sanitizeLegalHtml } from './sanitizeHtml';

const VALID_SLUGS = ['about', 'privacy', 'terms', 'editorial-policy', 'affiliate-disclosure', 'corrections', 'contact'] as const;

const need = (a: Actor, perm: string) => {
  if (!roleHasPermission(a.roles, perm as any)) throw new ServiceError('forbidden', `Not permitted (${perm}).`);
};

const SaveSchema = z.object({
  slug: z.enum(VALID_SLUGS),
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

export async function saveInfoPageDraft(actor: Actor, input: InfoPageInput): Promise<InfoPage> {
  need(actor, 'system.config');
  const raw = SaveSchema.parse(input);
  const data = { ...raw, body: sanitizeLegalHtml(raw.body) };
  const existing = await prisma.infoPage.findUnique({ where: { slug: data.slug } });
  if (existing && existing.status === 'PUBLISHED') {
    throw new ServiceError('validation', 'Cannot edit a published page directly. Create a new draft revision.');
  }
  const result = await prisma.infoPage.upsert({
    where: { slug: data.slug },
    create: { ...data, status: 'DRAFT', createdById: actor.id, updatedById: actor.id },
    update: { ...data, status: 'DRAFT', updatedById: actor.id },
  });
  await audit(actor.id, 'info_page.save_draft', 'InfoPage', result.id, data.slug);
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
  await audit(actor.id, 'info_page.unpublish', 'InfoPage', page.id, slug);
}

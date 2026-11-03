'use server';

import { revalidatePath } from 'next/cache';
import { WorkflowStatus } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import * as svc from '@/lib/cms/articleService';
import type { ArticleInput } from '@/lib/cms/articleService';

export type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; code: string; error: string; details?: unknown };

async function getActor(): Promise<svc.ActorContext | null> {
  const u = await getCurrentUser();
  return u ? { id: u.id, roles: u.roles } : null;
}

function fail(e: unknown): ActionResult {
  if (e instanceof svc.ServiceError) return { ok: false, code: e.code, error: e.message, details: e.details };
  console.error('[article-action] unexpected error:', e);
  return { ok: false, code: 'error', error: 'Unexpected server error.' };
}

/** Invalidate all public pages + the article page + sitemap (editorial privacy). */
function revalidatePublic(slug?: string) {
  revalidatePath('/', 'layout');
  if (slug) revalidatePath(`/articles/${slug}/`);
  revalidatePath('/sitemap.xml');
}

export async function saveArticleAction(input: ArticleInput): Promise<ActionResult<{ id: string; slug: string; version: number }>> {
  const actor = await getActor();
  if (!actor) return { ok: false, code: 'unauthenticated', error: 'You must be signed in.' };
  try {
    const res = await svc.saveArticle(actor, input);
    revalidatePath(`/articles/${res.slug}/`); // refresh if it happens to be public
    // A live slug change: the old URL now redirects, and listings/sitemap show the new URL.
    if (res.previousSlug) revalidatePublic(res.previousSlug);
    return { ok: true, ...res };
  } catch (e) {
    return fail(e) as ActionResult<{ id: string; slug: string; version: number }>;
  }
}

export async function transitionArticleAction(
  id: string,
  target: string,
  expectedVersion?: number,
  scheduledAt?: string,
): Promise<ActionResult<{ status: string; version: number }>> {
  const actor = await getActor();
  if (!actor) return { ok: false, code: 'unauthenticated', error: 'You must be signed in.' };
  if (!(Object.values(WorkflowStatus) as string[]).includes(target)) {
    return { ok: false, code: 'invalid_transition', error: 'Unknown target status.' };
  }
  try {
    const res = await svc.transitionWorkflow(actor, id, target as WorkflowStatus, expectedVersion, scheduledAt);
    if (res.becamePublic || res.becamePrivate) revalidatePublic(res.slug);
    return { ok: true, status: res.status, version: res.version };
  } catch (e) {
    return fail(e) as ActionResult<{ status: string; version: number }>;
  }
}

export async function deleteArticleAction(id: string): Promise<ActionResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, code: 'unauthenticated', error: 'You must be signed in.' };
  try {
    const res = await svc.deleteArticle(actor, id);
    if (res.wasPublic) revalidatePublic(res.slug);
    revalidatePath('/admin/articles/');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreRevisionAction(articleId: string, revisionId: string): Promise<ActionResult<{ version: number }>> {
  const actor = await getActor();
  if (!actor) return { ok: false, code: 'unauthenticated', error: 'You must be signed in.' };
  try {
    const res = await svc.restoreRevision(actor, articleId, revisionId);
    revalidatePath(`/articles/${res.slug}/`);
    if (res.previousSlug) revalidatePublic(res.previousSlug);
    revalidatePath(`/admin/articles/${articleId}/edit/`);
    return { ok: true, version: res.version };
  } catch (e) {
    return fail(e) as ActionResult<{ version: number }>;
  }
}

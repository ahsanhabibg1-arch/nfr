'use server';

import { revalidatePath } from 'next/cache';
import { getActor, AuthzError, toActionError, type ActionResult } from '@/lib/cms/guard';
import {
  saveInfoPageDraft, submitForReview, approveInfoPage,
  publishInfoPage, revertToDraft, unpublishInfoPage, type InfoPageInput,
} from '@/lib/cms/infoPageService';

async function actor() {
  const a = await getActor();
  if (!a) throw new AuthzError('unauthenticated');
  return a;
}

export async function saveInfoPageDraftAction(input: InfoPageInput): Promise<ActionResult> {
  try {
    await saveInfoPageDraft(await actor(), input);
    revalidatePath('/admin/info-pages/');
    revalidatePath(`/${input.slug}/`);
    revalidatePath(`/info/${input.slug}/`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function submitForReviewAction(slug: string): Promise<ActionResult> {
  try {
    await submitForReview(await actor(), slug);
    revalidatePath('/admin/info-pages/');
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function approveInfoPageAction(slug: string): Promise<ActionResult> {
  try {
    await approveInfoPage(await actor(), slug);
    revalidatePath('/admin/info-pages/');
    revalidatePath(`/${slug}/`);
    revalidatePath(`/info/${slug}/`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function publishInfoPageAction(slug: string): Promise<ActionResult> {
  try {
    await publishInfoPage(await actor(), slug);
    revalidatePath('/admin/info-pages/');
    revalidatePath(`/${slug}/`);
    revalidatePath(`/info/${slug}/`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revertToDraftAction(slug: string): Promise<ActionResult> {
  try {
    await revertToDraft(await actor(), slug);
    revalidatePath('/admin/info-pages/');
    revalidatePath(`/${slug}/`);
    revalidatePath(`/info/${slug}/`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function unpublishInfoPageAction(slug: string): Promise<ActionResult> {
  try {
    await unpublishInfoPage(await actor(), slug);
    revalidatePath('/admin/info-pages/');
    revalidatePath(`/${slug}/`);
    revalidatePath(`/info/${slug}/`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

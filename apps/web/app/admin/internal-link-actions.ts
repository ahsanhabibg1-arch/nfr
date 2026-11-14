'use server';

import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import {
  searchInternalLinkTargets,
  type InternalLinkKind,
  type InternalLinkResult,
} from '@/lib/cms/internalLinkSearch';

/**
 * Internal link search for the article editor's link dialog.
 *
 * READ-ONLY, and gated on `article.create` by `requireActor` before the service
 * re-checks the full set of write permissions. Two gates rather than one
 * because this endpoint returns entity slugs: an unauthenticated caller must
 * not be able to enumerate them, and the service must not depend on its caller
 * having done the check.
 *
 * No revalidation: nothing is mutated.
 */
export async function searchInternalLinksAction(
  query: string,
  kinds?: InternalLinkKind[],
): Promise<ActionResult<{ results: InternalLinkResult[] }>> {
  try {
    const actor = await requireActor('article.create');
    const results = await searchInternalLinkTargets(actor, query, kinds);
    return { ok: true, results };
  } catch (e) {
    return toActionError(e) as ActionResult<{ results: InternalLinkResult[] }>;
  }
}

import 'server-only';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import type { RodeoEntityKind } from './rodeoService';
import { normalizeSlug, slugShapeError } from './slugRules';
import { writeMoveRedirect, invalidateRedirectCache, EDITION_SUB_TABS } from '../redirects/write';

/**
 * Custom slug editing for Rodeo Coverage, with permanent redirects.
 *
 * Until now a slug was derived from the title at creation and never changed, so
 * a rename left the public URL on the original wording. The owner approved
 * editable slugs; the cost of that is that changing one BREAKS AN EXISTING
 * PUBLIC URL, so every change writes a permanent redirect from the old path.
 *
 * Redirects reuse the existing `ArticleRedirect` table. Despite the name it is
 * keyed on `sourcePath` and stores a target path and status code — it is a
 * path-to-path redirect store, and §12 explicitly requires reusing it rather
 * than inventing a second one.
 */

const req = (a: Actor) => {
  if (!roleHasPermission(a.roles, 'rodeo.manage')) {
    throw new ServiceError('forbidden', 'Not permitted to manage rodeo coverage');
  }
};

/**
 * Slug rules live in `./slugRules` so the admin editor can import the SAME
 * normalisation and reserved list. A browser copy would drift from the server's
 * and show the operator a preview that does not match what gets stored.
 */
export { RESERVED_SLUGS, normalizeSlug } from './slugRules';

export function validateSlugShape(slug: string): void {
  const err = slugShapeError(slug);
  if (!err) return;
  // Reserved and duplicate are conflicts; everything else is malformed input.
  throw new ServiceError(err.includes('reserved path') ? 'conflict' : 'validation', err);
}

/** The public path an entity is served at. */
export async function publicPathFor(kind: RodeoEntityKind, id: string): Promise<string | null> {
  switch (kind) {
    case 'hub': {
      const r = await prisma.rodeoHub.findUnique({ where: { id }, select: { slug: true } });
      return r ? `/rodeo-events/${r.slug}/` : null;
    }
    case 'event': {
      const r = await prisma.rodeoEvent.findUnique({ where: { id }, select: { slug: true } });
      return r ? `/rodeo-events/${r.slug}/` : null;
    }
    case 'edition': {
      const r = await prisma.rodeoEventEdition.findUnique({ where: { id }, select: { editionSlug: true, event: { select: { slug: true } } } });
      return r ? `/rodeo-events/${r.event.slug}/${r.editionSlug}/` : null;
    }
    case 'venue': {
      const r = await prisma.venue.findUnique({ where: { id }, select: { slug: true } });
      return r ? `/venues/${r.slug}/` : null;
    }
    case 'discipline': {
      const r = await prisma.discipline.findUnique({ where: { id }, select: { slug: true } });
      return r ? `/disciplines/${r.slug}/` : null;
    }
  }
}

/** Refuse a slug already taken inside the relevant namespace. */
async function assertSlugFree(kind: RodeoEntityKind, id: string, slug: string): Promise<void> {
  if (kind === 'hub' || kind === 'event') {
    // Hubs and recurring events share `/rodeo-events/<slug>/`, and PostgreSQL
    // cannot express a cross-table unique constraint, so both tables are checked.
    const [hub, ev] = await Promise.all([
      prisma.rodeoHub.findUnique({ where: { slug }, select: { id: true } }),
      prisma.rodeoEvent.findUnique({ where: { slug }, select: { id: true } }),
    ]);
    const clash = (hub && hub.id !== id) || (ev && ev.id !== id);
    if (clash) throw new ServiceError('conflict', `The slug "${slug}" is already used by another rodeo hub or event.`);
    return;
  }
  if (kind === 'venue') {
    const r = await prisma.venue.findUnique({ where: { slug }, select: { id: true } });
    if (r && r.id !== id) throw new ServiceError('conflict', `The slug "${slug}" is already used by another venue.`);
    return;
  }
  if (kind === 'discipline') {
    const r = await prisma.discipline.findUnique({ where: { slug }, select: { id: true } });
    if (r && r.id !== id) throw new ServiceError('conflict', `The slug "${slug}" is already used by another discipline.`);
    return;
  }
  // Editions are unique per parent event, not globally.
  const ed = await prisma.rodeoEventEdition.findUnique({ where: { id }, select: { eventId: true } });
  if (!ed) throw new ServiceError('not_found', 'Edition not found');
  const clash = await prisma.rodeoEventEdition.findFirst({
    where: { eventId: ed.eventId, editionSlug: slug, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new ServiceError('conflict', `This event already has an edition with the slug "${slug}".`);
}

async function writeSlug(kind: RodeoEntityKind, id: string, slug: string): Promise<void> {
  switch (kind) {
    case 'hub': await prisma.rodeoHub.update({ where: { id }, data: { slug } }); return;
    case 'event': await prisma.rodeoEvent.update({ where: { id }, data: { slug } }); return;
    case 'edition': await prisma.rodeoEventEdition.update({ where: { id }, data: { editionSlug: slug } }); return;
    case 'venue': await prisma.venue.update({ where: { id }, data: { slug } }); return;
    case 'discipline': await prisma.discipline.update({ where: { id }, data: { slug } }); return;
  }
}

export interface SlugChangeResult {
  oldPath: string;
  newPath: string;
  redirectCreated: boolean;
  /** Old redirects re-pointed at the new destination, so no chain forms. */
  chainsCollapsed: number;
  /** Nested edition URLs redirected alongside a parent-event rename. */
  nestedRedirects: number;
  /**
   * Every path whose cached render is now wrong and must be revalidated.
   *
   * A slug change rewrites routing, but an already-prerendered page keeps
   * being served from the full route cache — so the OLD url carried on
   * returning its stale 200 instead of the new 308 until this list was
   * revalidated. Found by checking real HTTP responses rather than redirect
   * rows.
   */
  affectedPaths: string[];
}

/**
 * Change an entity's slug and leave a permanent redirect behind.
 *
 * Redirect hygiene, all enforced here rather than left to whoever edits next:
 *
 *  - **No loop.** A redirect whose source equals its target is never written,
 *    and any existing redirect FROM the new path is removed — otherwise the new
 *    URL would immediately bounce somewhere else.
 *  - **No chain.** Renaming twice would otherwise leave A→B and B→C. Every
 *    existing redirect that targeted the old path is re-pointed at the new one,
 *    so historical URLs always reach the destination in a single hop.
 *  - **No dangling target.** The row is written inside the same transaction as
 *    the slug change, so the destination exists by the time the redirect does.
 */
export async function changeSlug(a: Actor, kind: RodeoEntityKind, id: string, rawSlug: string): Promise<SlugChangeResult> {
  req(a);

  const slug = normalizeSlug(rawSlug);
  validateSlugShape(slug);

  const oldPath = await publicPathFor(kind, id);
  if (!oldPath) throw new ServiceError('not_found', 'Entity not found');

  await assertSlugFree(kind, id, slug);

  /**
   * NESTED URLs MOVE TOO.
   *
   * An edition is addressed through its parent: `/rodeo-events/<event>/<edition>/`.
   * Renaming the EVENT therefore breaks every one of its edition URLs, not just
   * the event's own — and redirecting only the parent path would leave each
   * edition 404ing while the operator saw a success message.
   *
   * So the nested paths are captured BEFORE the rename and redirected
   * alongside it, in the same transaction. One row per edition, in the same
   * table; no prefix-matching layer and no second redirect store.
   */
  const nestedBefore = kind === 'event'
    ? (await prisma.rodeoEventEdition.findMany({ where: { eventId: id }, select: { editionSlug: true } }))
      .map((e) => e.editionSlug)
    : [];

  const result = await prisma.$transaction(async (tx) => {
    await writeSlug(kind, id, slug);
    const newPath = await publicPathFor(kind, id);
    if (!newPath) throw new ServiceError('validation', 'Could not resolve the new public path.');

    if (newPath === oldPath) {
      // Nothing actually changed (e.g. re-submitting the same slug).
      return { oldPath, newPath, redirectCreated: false, chainsCollapsed: 0, nestedRedirects: 0, affectedPaths: [] };
    }

    /*
      THE MOVE ITSELF now goes through `lib/redirects/write.ts` (Stage 03,
      D-3). This block used to DELETE a conflicting row while `articleService`
      DISABLED it, and it flattened chains regardless of status — so a disabled
      historical record could be rewritten by an unrelated rename. Both
      services now share one definition: disable rather than delete, and
      flatten only ACTIVE permanent rows.
    */
    const move = await writeMoveRedirect(tx, oldPath, newPath);

    /*
      DESCENDANT URLs (Stage 03, D-4).

      An edition is addressed through its parent, and it serves three sub-tabs
      below its own URL. Redirecting only the edition root left
      `/schedule/`, `/results/` and `/standings/` 404ing after a parent rename
      — three indexed URLs per edition, silently stranded, while the operator
      saw a success message.

      The tab list is the real route inventory from
      `app/(public)/rodeo-events/[slug]/[edition]/`, not an assumption that
      every edition has every tab: a redirect is written for each, and the
      resolver independently refuses any whose destination does not resolve, so
      a tab that is not meaningful for a given edition never produces a
      misleading hop.
    */
    const affectedPaths: string[] = [oldPath, newPath];
    let nestedRedirects = 0;
    for (const editionSlug of nestedBefore) {
      const editionFrom = `${oldPath}${editionSlug}/`;
      const editionTo = `${newPath}${editionSlug}/`;
      for (const suffix of ['', ...EDITION_SUB_TABS.map((t) => `${t}/`)]) {
        const from = `${editionFrom}${suffix}`;
        const to = `${editionTo}${suffix}`;
        if (from === to) continue;
        const r = await writeMoveRedirect(tx, from, to);
        if (!r.written) continue;
        affectedPaths.push(from, to);
        nestedRedirects++;
      }
    }

    return {
      oldPath,
      newPath,
      redirectCreated: move.written,
      chainsCollapsed: move.flattened,
      nestedRedirects,
      affectedPaths,
    };
  });

  // After the commit, never inside it: see `invalidateRedirectCache`.
  if (result.redirectCreated) await invalidateRedirectCache();

  await audit(a.id, `rodeo.${kind}.slug_change`, kind, id,
    `${result.oldPath} -> ${result.newPath}; permanent redirect created; ` +
    `${result.chainsCollapsed} existing redirect(s) re-pointed; ${result.nestedRedirects} nested edition URL(s) redirected`);
  return result;
}

/**
 * Resolve a redirect for any non-article public path.
 *
 * THE DEFECT THIS REPLACES (Stage 03, D-2). This function used to return the
 * stored `targetPath` after a single self-redirect check. It did not verify
 * that the destination was internal, well-formed, or that anything public
 * still lived there — while the article resolver checked all three. Any row
 * carrying an off-site or dead target would therefore have been honoured on
 * `/disciplines/`, `/venues/`, `/rodeo-events/` and every edition URL: an open
 * redirect waiting for the first row that did not come from this file.
 *
 * Nothing user-controlled writes to the table today, so there is no evidence it
 * was ever exploitable. That is precisely why it is fixed BEFORE Stage 04 adds
 * manual redirect creation, rather than after.
 *
 * It now delegates to the shared resolver, which treats every stored row as
 * untrusted, proves the destination resolves to a live public entity, and
 * returns that entity's current canonical URL. Behaviour for valid rows is
 * unchanged except that a stale target now resolves in one hop.
 *
 * VISIBILITY IS NOT "PUBLISHED" HERE. An archived hub, event, edition, venue
 * or discipline still serves its detail URL at HTTP 200 with `noindex` by
 * owner-approved policy (`lib/cms/lifecycle.ts`), so it remains a legitimate
 * destination. Requiring a published state would have broken the inbound links
 * that policy exists to keep working.
 */
export async function resolveRodeoRedirect(path: string): Promise<{ destination: string; permanent: boolean } | null> {
  const { resolveRedirect } = await import('../redirects/resolve');
  const hit = await resolveRedirect(path);
  return hit ? { destination: hit.destination, permanent: hit.permanent } : null;
}

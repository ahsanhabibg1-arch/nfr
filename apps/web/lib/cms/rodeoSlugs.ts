import 'server-only';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import type { RodeoEntityKind } from './rodeoService';
import { normalizeSlug, slugShapeError } from './slugRules';

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

    // A redirect FROM the destination would send the new URL straight back out.
    await tx.articleRedirect.deleteMany({ where: { sourcePath: newPath } });

    // Collapse chains: anything that pointed at the old path now points here.
    const chains = await tx.articleRedirect.updateMany({
      where: { targetPath: oldPath },
      data: { targetPath: newPath },
    });

    await tx.articleRedirect.upsert({
      where: { sourcePath: oldPath },
      update: { targetPath: newPath, statusCode: 308, status: 'ACTIVE' },
      create: { sourcePath: oldPath, targetPath: newPath, statusCode: 308, status: 'ACTIVE' },
    });

    // Each nested edition URL gets the same treatment as its parent.
    const affectedPaths: string[] = [oldPath, newPath];
    let nestedRedirects = 0;
    for (const editionSlug of nestedBefore) {
      const from = `${oldPath}${editionSlug}/`;
      const to = `${newPath}${editionSlug}/`;
      if (from === to) continue;
      await tx.articleRedirect.deleteMany({ where: { sourcePath: to } });
      await tx.articleRedirect.updateMany({ where: { targetPath: from }, data: { targetPath: to } });
      await tx.articleRedirect.upsert({
        where: { sourcePath: from },
        update: { targetPath: to, statusCode: 308, status: 'ACTIVE' },
        create: { sourcePath: from, targetPath: to, statusCode: 308, status: 'ACTIVE' },
      });
      affectedPaths.push(from, to);
      nestedRedirects++;
    }

    return { oldPath, newPath, redirectCreated: true, chainsCollapsed: chains.count, nestedRedirects, affectedPaths };
  });

  await audit(a.id, `rodeo.${kind}.slug_change`, kind, id,
    `${result.oldPath} -> ${result.newPath}; permanent redirect created; ` +
    `${result.chainsCollapsed} existing redirect(s) re-pointed; ${result.nestedRedirects} nested edition URL(s) redirected`);
  return result;
}

/**
 * Resolve a redirect for any non-article public path.
 *
 * `resolveArticleRedirect` in `lib/content.ts` does the same job for articles
 * but hardcodes `/articles/<slug>/` and validates the target against a live
 * article, so it cannot serve these routes. Same table, same semantics.
 */
export async function resolveRodeoRedirect(path: string): Promise<{ destination: string; permanent: boolean } | null> {
  const r = await prisma.articleRedirect.findFirst({
    where: { sourcePath: path, status: 'ACTIVE' },
    select: { targetPath: true, statusCode: true },
  });
  if (!r) return null;
  // Never redirect to itself, whatever is stored.
  if (r.targetPath === path) return null;
  return { destination: r.targetPath, permanent: r.statusCode === 301 || r.statusCode === 308 };
}

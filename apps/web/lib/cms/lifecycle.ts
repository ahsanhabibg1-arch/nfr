import 'server-only';
import { publicSlugWhere } from '../fixturePolicy';

/**
 * Rodeo Coverage archive lifecycle — the single definition of what "active"
 * means for a hub, recurring event, edition, venue or discipline.
 *
 * WHY ONE MODULE. Archive leaks are silent: a record that stays visible in one
 * forgotten listing looks exactly like a record that was never archived, and
 * nothing fails. The audit found five files holding public reads of these
 * entities, so the filter lives here and every public read composes it, rather
 * than each call site spelling out `archivedAt: null` and one of them
 * eventually not.
 *
 * ARCHIVE IS NOT UNPUBLISH. Archiving hides a record from *discovery* —
 * listings, search, sitemap, editorial pickers — while deliberately keeping its
 * detail URL alive at HTTP 200 with `noindex`. Inbound links and historical
 * references keep working; search engines are told to stop indexing it. That is
 * the owner-approved policy, and `archivedAt` never touches publication state:
 * reactivating an unpublished entity does not publish it.
 */

/** Rows that have not been archived. */
export const ACTIVE_ONLY = { archivedAt: null } as const;

/** Rows that HAVE been archived. */
export const ARCHIVED_ONLY = { archivedAt: { not: null } } as const;

/** The admin's three-way list filter. */
export type LifecycleFilter = 'active' | 'archived' | 'all';

export function lifecycleWhere(filter: LifecycleFilter): Record<string, unknown> {
  if (filter === 'active') return { ...ACTIVE_ONLY };
  if (filter === 'archived') return { ...ARCHIVED_ONLY };
  return {};
}

/**
 * `where` for a PUBLIC read of a slug-addressed rodeo entity: not a fixture (in
 * production) and not archived. This is the fragment every public listing,
 * search and sitemap query must use.
 */
export function publicRodeoWhere(): Record<string, unknown> {
  return { ...publicSlugWhere(), ...ACTIVE_ONLY };
}

/**
 * `where` for an edition read. An edition has no slug of its own in the fixture
 * sense — it is addressed through its parent event — so fixture exclusion is
 * applied to the PARENT while the archive filter applies to both.
 *
 * EFFECTIVE VISIBILITY (the hierarchical rule §5 requires, stated explicitly):
 * an edition is publicly discoverable only when the edition itself is active
 * AND its parent recurring event is active. Archiving an event therefore
 * removes its editions from listings too — without writing `archivedAt` to any
 * child row. Nothing cascades in the database; the parent's state is simply
 * part of the child's visibility test. That keeps reactivation exact: clearing
 * the parent's `archivedAt` restores precisely the children that were visible
 * before, because none of them were modified.
 */
export function publicEditionWhere(): Record<string, unknown> {
  return { event: publicRodeoWhere(), ...ACTIVE_ONLY };
}

/** True when the record (or its parent chain) is archived. */
export function isArchived(row: { archivedAt?: Date | null } | null | undefined): boolean {
  return !!row?.archivedAt;
}

/**
 * Effective archive state for an edition, which inherits from its event.
 * Used by the detail route to decide `noindex` without hiding the page.
 */
export function isEffectivelyArchived(
  row: { archivedAt?: Date | null; event?: { archivedAt?: Date | null } | null } | null | undefined,
): boolean {
  if (!row) return false;
  return !!row.archivedAt || !!row.event?.archivedAt;
}

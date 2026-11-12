import 'server-only';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import type { RodeoEntityKind } from './rodeoService';

/**
 * Rodeo Coverage dependency inspection and relationship transfer.
 *
 * WHY THIS EXISTS. The owner does not accept a permanently locked Delete
 * button. But the alternative is not "delete anyway": several of the rows that
 * point at these entities are RECORDS OF WHAT HAPPENED — results, standings,
 * sessions, who competed. Those cannot honestly be re-pointed at a different
 * competition to make a delete succeed, because doing so would assert that an
 * athlete scored at an event they never attended.
 *
 * So every dependency is classified, and the classification decides what the
 * admin is offered:
 *
 *   transferable  a curated association (an editorial link, a hub listing).
 *                 Re-pointing it changes no historical claim.
 *   conditional   re-pointing is meaningful only under a stated premise the
 *                 operator must confirm — "this edition really does belong to
 *                 that event", "these two rows are the same physical venue".
 *   historical    a record of a real outcome. Never transferable. The delete
 *                 stays blocked and the dialog says exactly why.
 *
 * `blocking` is what prevents deletion; a snapshot with no blocking groups is
 * eligible for permanent deletion.
 */

const req = (a: Actor) => {
  if (!roleHasPermission(a.roles, 'rodeo.manage')) {
    throw new ServiceError('forbidden', 'Not permitted to manage rodeo coverage');
  }
};

export type DependencyClass = 'transferable' | 'conditional' | 'historical';

export interface DependencyGroup {
  /** Stable key used by the transfer API. */
  key: string;
  label: string;
  count: number;
  classification: DependencyClass;
  /** Shown to the operator — why it can or cannot be moved. */
  reason: string;
}

export interface DependencySnapshot {
  kind: RodeoEntityKind;
  id: string;
  name: string;
  slug: string | null;
  groups: DependencyGroup[];
  /** Total rows that block permanent deletion. */
  blockingCount: number;
  /** True when nothing blocks deletion right now. */
  deletable: boolean;
  /** Groups the operator can act on to make deletion possible. */
  resolvableKeys: string[];
  /** Groups that can never be resolved by transfer. */
  immovableKeys: string[];
}

const TRANSFERABLE = (what: string) =>
  `Curated ${what} — re-pointing it to another record changes no historical claim.`;
const CONDITIONAL = (premise: string) =>
  `Transferable only if you confirm that ${premise}. The system cannot verify this for you.`;
const HISTORICAL = (what: string) =>
  `${what} record what actually happened. Moving it to another record would assert something untrue, so it can never be transferred — delete or correct these records at source first.`;

/** Identify the entity for display, without assuming a shared field name. */
async function describe(kind: RodeoEntityKind, id: string): Promise<{ name: string; slug: string | null }> {
  switch (kind) {
    case 'hub': {
      const r = await prisma.rodeoHub.findUnique({ where: { id }, select: { title: true, slug: true } });
      if (!r) throw new ServiceError('not_found', 'Hub not found');
      return { name: r.title, slug: r.slug };
    }
    case 'event': {
      const r = await prisma.rodeoEvent.findUnique({ where: { id }, select: { name: true, slug: true } });
      if (!r) throw new ServiceError('not_found', 'Recurring event not found');
      return { name: r.name, slug: r.slug };
    }
    case 'edition': {
      const r = await prisma.rodeoEventEdition.findUnique({ where: { id }, select: { label: true, editionSlug: true } });
      if (!r) throw new ServiceError('not_found', 'Edition not found');
      return { name: r.label, slug: r.editionSlug };
    }
    case 'venue': {
      const r = await prisma.venue.findUnique({ where: { id }, select: { name: true, slug: true } });
      if (!r) throw new ServiceError('not_found', 'Venue not found');
      return { name: r.name, slug: r.slug };
    }
    case 'discipline': {
      const r = await prisma.discipline.findUnique({ where: { id }, select: { name: true, slug: true } });
      if (!r) throw new ServiceError('not_found', 'Discipline not found');
      return { name: r.name, slug: r.slug };
    }
  }
}

async function groupsFor(kind: RodeoEntityKind, id: string): Promise<DependencyGroup[]> {
  const g: DependencyGroup[] = [];
  const add = (key: string, label: string, count: number, classification: DependencyClass, reason: string) => {
    if (count > 0) g.push({ key, label, count, classification, reason });
  };

  switch (kind) {
    case 'hub': {
      const [articles, events] = await Promise.all([
        prisma.articleHub.count({ where: { hubId: id } }),
        prisma.rodeoHubEvent.count({ where: { hubId: id } }),
      ]);
      add('hub.articles', 'Articles filed under this hub', articles, 'transferable', TRANSFERABLE('editorial association'));
      add('hub.events', 'Recurring events listed by this hub', events, 'transferable', TRANSFERABLE('hub listing — the event URL is hub-independent'));
      return g;
    }
    case 'event': {
      const [editions, articles, hubLinks] = await Promise.all([
        prisma.rodeoEventEdition.count({ where: { eventId: id } }),
        prisma.articleEvent.count({ where: { eventId: id } }),
        prisma.rodeoHubEvent.count({ where: { eventId: id } }),
      ]);
      add('event.editions', 'Annual editions of this event', editions, 'conditional',
        CONDITIONAL('these editions genuinely belong to the destination event — this merges two competition histories and cannot be undone automatically'));
      add('event.articles', 'Articles about this event', articles, 'transferable', TRANSFERABLE('editorial association'));
      add('event.hubLinks', 'Hubs listing this event', hubLinks, 'transferable', TRANSFERABLE('hub listing'));
      return g;
    }
    case 'edition': {
      const [articles, sessions, results, standings, participation] = await Promise.all([
        prisma.articleEdition.count({ where: { editionId: id } }),
        prisma.competitionSession.count({ where: { editionId: id } }),
        prisma.competitionResult.count({ where: { editionId: id } }),
        prisma.competitionStanding.count({ where: { editionId: id } }),
        prisma.competitorParticipation.count({ where: { editionId: id } }),
      ]);
      add('edition.articles', 'Articles about this edition', articles, 'transferable', TRANSFERABLE('editorial association'));
      add('edition.sessions', 'Scheduled sessions', sessions, 'historical', HISTORICAL('Sessions'));
      add('edition.results', 'Recorded results', results, 'historical', HISTORICAL('Results'));
      add('edition.standings', 'Standings', standings, 'historical', HISTORICAL('Standings'));
      add('edition.participation', 'Competitor participation', participation, 'historical', HISTORICAL('Participation records'));
      return g;
    }
    case 'venue': {
      const [editions, sessions] = await Promise.all([
        prisma.rodeoEventEdition.count({ where: { venueId: id } }),
        prisma.competitionSession.count({ where: { venueId: id } }),
      ]);
      add('venue.editions', 'Editions held at this venue', editions, 'conditional',
        CONDITIONAL('the destination is the SAME physical venue, or the original reference was wrong'));
      add('venue.sessions', 'Sessions held at this venue', sessions, 'conditional',
        CONDITIONAL('the destination is the SAME physical venue, or the original reference was wrong'));
      return g;
    }
    case 'discipline': {
      const [articles, competitors, events, results, sessions, standings] = await Promise.all([
        prisma.articleDiscipline.count({ where: { disciplineId: id } }),
        prisma.competitorDiscipline.count({ where: { disciplineId: id } }),
        prisma.eventDiscipline.count({ where: { disciplineId: id } }),
        prisma.competitionResult.count({ where: { disciplineId: id } }),
        prisma.competitionSession.count({ where: { disciplineId: id } }),
        prisma.competitionStanding.count({ where: { disciplineId: id } }),
      ]);
      add('discipline.articles', 'Articles in this discipline', articles, 'transferable', TRANSFERABLE('editorial association'));
      add('discipline.competitors', 'Competitors who contest it', competitors, 'conditional',
        CONDITIONAL('these athletes genuinely contest the destination discipline'));
      add('discipline.events', 'Events featuring it', events, 'conditional',
        CONDITIONAL('the destination discipline is genuinely contested at those events'));
      add('discipline.results', 'Recorded results', results, 'historical', HISTORICAL('Results'));
      add('discipline.sessions', 'Scheduled sessions', sessions, 'historical', HISTORICAL('Sessions'));
      add('discipline.standings', 'Standings', standings, 'historical', HISTORICAL('Standings'));
      return g;
    }
  }
}

export async function inspectDependencies(kind: RodeoEntityKind, id: string): Promise<DependencySnapshot> {
  const { name, slug } = await describe(kind, id);
  const groups = await groupsFor(kind, id);
  const blockingCount = groups.reduce((n, x) => n + x.count, 0);
  return {
    kind,
    id,
    name,
    slug,
    groups,
    blockingCount,
    deletable: blockingCount === 0,
    resolvableKeys: groups.filter((x) => x.classification !== 'historical').map((x) => x.key),
    immovableKeys: groups.filter((x) => x.classification === 'historical').map((x) => x.key),
  };
}

/** Candidate destinations for a transfer — same family, excluding the source. */
export async function listTransferDestinations(
  kind: RodeoEntityKind, sourceId: string,
): Promise<{ id: string; label: string }[]> {
  const notSource = { id: { not: sourceId } };
  switch (kind) {
    case 'hub':
      return (await prisma.rodeoHub.findMany({ where: notSource, orderBy: { title: 'asc' }, select: { id: true, title: true } }))
        .map((r) => ({ id: r.id, label: r.title }));
    case 'event':
      return (await prisma.rodeoEvent.findMany({ where: notSource, orderBy: { name: 'asc' }, select: { id: true, name: true } }))
        .map((r) => ({ id: r.id, label: r.name }));
    case 'edition':
      return (await prisma.rodeoEventEdition.findMany({ where: notSource, orderBy: { label: 'asc' }, select: { id: true, label: true, event: { select: { name: true } } } }))
        .map((r) => ({ id: r.id, label: `${r.event.name} — ${r.label}` }));
    case 'venue':
      return (await prisma.venue.findMany({ where: notSource, orderBy: { name: 'asc' }, select: { id: true, name: true } }))
        .map((r) => ({ id: r.id, label: r.name }));
    case 'discipline':
      return (await prisma.discipline.findMany({ where: notSource, orderBy: { name: 'asc' }, select: { id: true, name: true } }))
        .map((r) => ({ id: r.id, label: r.name }));
  }
}

export interface TransferResult { moved: number; skipped: number; detail: string }

/**
 * Move one dependency group from `sourceId` to `destId`, transactionally.
 *
 * `historical` groups are refused outright — the classification is enforced
 * here at the service boundary, not merely rendered in the dialog, so a crafted
 * request cannot rewrite a result.
 *
 * Join tables carry composite primary keys, so a row whose destination pairing
 * already exists would violate that key. Those rows are SKIPPED rather than
 * failing the whole transfer, and the count is reported: the end state the
 * operator asked for (nothing left pointing at the source) is still reached.
 */
export async function transferDependencyGroup(
  a: Actor, kind: RodeoEntityKind, sourceId: string, groupKey: string, destId: string,
): Promise<TransferResult> {
  req(a);
  if (sourceId === destId) throw new ServiceError('validation', 'Source and destination must be different.');

  const snapshot = await inspectDependencies(kind, sourceId);
  const group = snapshot.groups.find((x) => x.key === groupKey);
  if (!group) throw new ServiceError('validation', `No outstanding dependency group "${groupKey}".`);
  if (group.classification === 'historical') {
    throw new ServiceError('validation', `"${group.label}" cannot be transferred. ${group.reason}`);
  }

  // The destination must exist and be of the same family.
  await describe(kind, destId);

  const result = await prisma.$transaction(async (tx) => {
    switch (groupKey) {
      /* ---- simple re-point: a nullable/standalone FK ---- */
      case 'event.editions': {
        // Edition slugs are unique per event, so a clash must be reported, not
        // silently renamed — renaming would change a public URL behind the
        // operator's back.
        const moving = await tx.rodeoEventEdition.findMany({ where: { eventId: sourceId }, select: { id: true, editionSlug: true } });
        const taken = new Set((await tx.rodeoEventEdition.findMany({ where: { eventId: destId }, select: { editionSlug: true } })).map((r) => r.editionSlug));
        const clash = moving.filter((m) => taken.has(m.editionSlug));
        if (clash.length > 0) {
          throw new ServiceError('conflict',
            `The destination event already has an edition with the slug "${clash[0].editionSlug}". ` +
            'Rename or remove it first — the system will not rename a published edition URL for you.');
        }
        const r = await tx.rodeoEventEdition.updateMany({ where: { eventId: sourceId }, data: { eventId: destId } });
        return { moved: r.count, skipped: 0 };
      }
      case 'venue.editions': {
        const r = await tx.rodeoEventEdition.updateMany({ where: { venueId: sourceId }, data: { venueId: destId } });
        return { moved: r.count, skipped: 0 };
      }
      case 'venue.sessions': {
        const r = await tx.competitionSession.updateMany({ where: { venueId: sourceId }, data: { venueId: destId } });
        return { moved: r.count, skipped: 0 };
      }

      /* ---- join tables: composite PKs, so pre-existing pairs are skipped ---- */
      case 'hub.articles': return moveJoin(
        () => tx.articleHub.findMany({ where: { hubId: sourceId }, select: { articleId: true } }),
        (ids) => tx.articleHub.findMany({ where: { hubId: destId, articleId: { in: ids } }, select: { articleId: true } }),
        (id) => tx.articleHub.update({ where: { articleId_hubId: { articleId: id, hubId: sourceId } }, data: { hubId: destId } }),
        (id) => tx.articleHub.delete({ where: { articleId_hubId: { articleId: id, hubId: sourceId } } }),
        (r) => r.articleId,
      );
      case 'event.articles': return moveJoin(
        () => tx.articleEvent.findMany({ where: { eventId: sourceId }, select: { articleId: true } }),
        (ids) => tx.articleEvent.findMany({ where: { eventId: destId, articleId: { in: ids } }, select: { articleId: true } }),
        (id) => tx.articleEvent.update({ where: { articleId_eventId: { articleId: id, eventId: sourceId } }, data: { eventId: destId } }),
        (id) => tx.articleEvent.delete({ where: { articleId_eventId: { articleId: id, eventId: sourceId } } }),
        (r) => r.articleId,
      );
      case 'edition.articles': return moveJoin(
        () => tx.articleEdition.findMany({ where: { editionId: sourceId }, select: { articleId: true } }),
        (ids) => tx.articleEdition.findMany({ where: { editionId: destId, articleId: { in: ids } }, select: { articleId: true } }),
        (id) => tx.articleEdition.update({ where: { articleId_editionId: { articleId: id, editionId: sourceId } }, data: { editionId: destId } }),
        (id) => tx.articleEdition.delete({ where: { articleId_editionId: { articleId: id, editionId: sourceId } } }),
        (r) => r.articleId,
      );
      case 'discipline.articles': return moveJoin(
        () => tx.articleDiscipline.findMany({ where: { disciplineId: sourceId }, select: { articleId: true } }),
        (ids) => tx.articleDiscipline.findMany({ where: { disciplineId: destId, articleId: { in: ids } }, select: { articleId: true } }),
        (id) => tx.articleDiscipline.update({ where: { articleId_disciplineId: { articleId: id, disciplineId: sourceId } }, data: { disciplineId: destId } }),
        (id) => tx.articleDiscipline.delete({ where: { articleId_disciplineId: { articleId: id, disciplineId: sourceId } } }),
        (r) => r.articleId,
      );
      case 'discipline.competitors': return moveJoin(
        () => tx.competitorDiscipline.findMany({ where: { disciplineId: sourceId }, select: { competitorId: true } }),
        (ids) => tx.competitorDiscipline.findMany({ where: { disciplineId: destId, competitorId: { in: ids } }, select: { competitorId: true } }),
        (id) => tx.competitorDiscipline.update({ where: { competitorId_disciplineId: { competitorId: id, disciplineId: sourceId } }, data: { disciplineId: destId } }),
        (id) => tx.competitorDiscipline.delete({ where: { competitorId_disciplineId: { competitorId: id, disciplineId: sourceId } } }),
        (r) => r.competitorId,
      );
      case 'hub.events': return moveJoin(
        () => tx.rodeoHubEvent.findMany({ where: { hubId: sourceId }, select: { eventId: true } }),
        (ids) => tx.rodeoHubEvent.findMany({ where: { hubId: destId, eventId: { in: ids } }, select: { eventId: true } }),
        (id) => tx.rodeoHubEvent.update({ where: { hubId_eventId: { hubId: sourceId, eventId: id } }, data: { hubId: destId } }),
        (id) => tx.rodeoHubEvent.delete({ where: { hubId_eventId: { hubId: sourceId, eventId: id } } }),
        (r) => r.eventId,
      );
      case 'event.hubLinks': return moveJoin(
        () => tx.rodeoHubEvent.findMany({ where: { eventId: sourceId }, select: { hubId: true } }),
        (ids) => tx.rodeoHubEvent.findMany({ where: { eventId: destId, hubId: { in: ids } }, select: { hubId: true } }),
        (id) => tx.rodeoHubEvent.update({ where: { hubId_eventId: { hubId: id, eventId: sourceId } }, data: { eventId: destId } }),
        (id) => tx.rodeoHubEvent.delete({ where: { hubId_eventId: { hubId: id, eventId: sourceId } } }),
        (r) => r.hubId,
      );
      case 'discipline.events': {
        const rows = await tx.eventDiscipline.findMany({ where: { disciplineId: sourceId }, select: { eventId: true } });
        const ids = rows.map((r) => r.eventId);
        const existing = new Set((await tx.eventDiscipline.findMany({ where: { disciplineId: destId, eventId: { in: ids } }, select: { eventId: true } })).map((r) => r.eventId));
        let moved = 0; let skipped = 0;
        for (const eventId of ids) {
          if (existing.has(eventId)) {
            await tx.eventDiscipline.delete({ where: { disciplineId_eventId: { disciplineId: sourceId, eventId } } });
            skipped++;
          } else {
            await tx.eventDiscipline.update({ where: { disciplineId_eventId: { disciplineId: sourceId, eventId } }, data: { disciplineId: destId } });
            moved++;
          }
        }
        return { moved, skipped };
      }
      default:
        throw new ServiceError('validation', `Transfer is not supported for "${groupKey}".`);
    }

    async function moveJoin<T>(
      loadSource: () => Promise<T[]>,
      loadExisting: (ids: string[]) => Promise<T[]>,
      update: (id: string) => Promise<unknown>,
      remove: (id: string) => Promise<unknown>,
      pick: (row: T) => string,
    ): Promise<{ moved: number; skipped: number }> {
      const rows = await loadSource();
      const ids = rows.map(pick);
      if (ids.length === 0) return { moved: 0, skipped: 0 };
      const existing = new Set((await loadExisting(ids)).map(pick));
      let moved = 0; let skipped = 0;
      for (const id of ids) {
        if (existing.has(id)) { await remove(id); skipped++; } else { await update(id); moved++; }
      }
      return { moved, skipped };
    }
  });

  const detail = `${groupKey}: moved ${result.moved}, merged-duplicate ${result.skipped}, ${sourceId} -> ${destId}`;
  await audit(a.id, `rodeo.${kind}.transfer`, kind, sourceId, detail);
  return { ...result, detail };
}

/**
 * Permanently delete an entity, re-checking dependencies as late as possible.
 *
 * §9 is explicit that a preview is not a guarantee: another operator may add a
 * relationship between the dialog opening and the confirm. So the counts are
 * recomputed inside the deleting transaction rather than trusted from the
 * snapshot the dialog was built from.
 *
 * HONEST LIMIT ON THAT GUARANTEE. Prisma runs this at PostgreSQL's default READ
 * COMMITTED isolation, so a row inserted by a concurrent transaction that
 * commits between the recount and the DELETE is not visible to the recount. For
 * the relations the database itself restricts — `CompetitionResult.disciplineId`
 * is required and therefore RESTRICT — the database is the real backstop and
 * the delete fails with a foreign-key error. For relations declared
 * `onDelete: Cascade`, no such backstop exists and the application check is the
 * only guard; the window is small but it is not zero. Closing it completely
 * would need `SELECT … FOR UPDATE` on the dependent rows or SERIALIZABLE
 * isolation, which is a larger change than this workstream authorises and is
 * recorded as remaining work rather than claimed as done.
 */
export async function permanentDeleteEntity(a: Actor, kind: RodeoEntityKind, id: string): Promise<void> {
  req(a);

  const pre = await inspectDependencies(kind, id);
  if (!pre.deletable) {
    const names = pre.groups.map((g) => `${g.count} × ${g.label.toLowerCase()}`).join(', ');
    throw new ServiceError('conflict',
      `Cannot delete "${pre.name}" yet — it still has ${names}. Resolve or transfer these first.`);
  }

  await prisma.$transaction(async (tx) => {
    // Recount inside the transaction: the snapshot above may already be stale.
    const fresh = await groupsFor(kind, id);
    const blocking = fresh.reduce((n, x) => n + x.count, 0);
    if (blocking > 0) {
      throw new ServiceError('conflict',
        'A relationship was added while you were confirming. Nothing was deleted — reopen the dialog to see the current dependencies.');
    }

    /**
     * FAIL-CLOSED DELETE (owner Decision C).
     *
     * The recount above cannot see a dependency committed by another
     * transaction after its snapshot was taken, so on its own it leaves a
     * window in which a cascade could destroy a record that was never counted.
     * Decision C does not authorise row locking or SERIALIZABLE isolation to
     * close that window.
     *
     * It does not need them. The delete is issued as ONE statement whose WHERE
     * requires every blocking relation to be empty. Two existing PostgreSQL
     * behaviours then do the work:
     *
     *   - the statement evaluates its NOT EXISTS subqueries against a snapshot
     *     taken when the statement begins, so a dependency committed before it
     *     starts IS visible and the delete matches zero rows;
     *   - a concurrent INSERT of a child row takes a FOR KEY SHARE lock on this
     *     parent row, so it cannot commit "underneath" the delete — it waits,
     *     then fails with a foreign-key violation once the parent is gone.
     *
     * So the outcome is always one of: deleted with no dependents, or deleted
     * nothing. `count === 0` is the fail-closed signal. This is ordinary
     * referential integrity, not a new concurrency-control mechanism.
     */
    let deleted: { count: number };
    switch (kind) {
      case 'hub':
        deleted = await tx.rodeoHub.deleteMany({
          where: { id, articles: { none: {} }, hubEvents: { none: {} } },
        });
        break;
      case 'event':
        deleted = await tx.rodeoEvent.deleteMany({
          where: { id, editions: { none: {} }, articles: { none: {} }, hubLinks: { none: {} } },
        });
        break;
      case 'edition':
        deleted = await tx.rodeoEventEdition.deleteMany({
          where: {
            id,
            articles: { none: {} }, sessions: { none: {} }, results: { none: {} },
            standings: { none: {} }, competitors: { none: {} },
          },
        });
        break;
      case 'venue':
        deleted = await tx.venue.deleteMany({
          where: { id, editions: { none: {} }, compSessions: { none: {} } },
        });
        break;
      case 'discipline':
        deleted = await tx.discipline.deleteMany({
          where: {
            id,
            articles: { none: {} }, competitors: { none: {} }, events: { none: {} },
            compResults: { none: {} }, compSessions: { none: {} }, compStandings: { none: {} },
          },
        });
        break;
    }

    if (deleted.count === 0) {
      throw new ServiceError('conflict',
        'A relationship was added while you were confirming, so nothing was deleted. ' +
        'Reopen the dialog to see the current dependencies.');
    }

    // Polymorphic SEO/FAQ rows have no foreign key, so they must be removed
    // explicitly or they outlive the entity as orphans.
    const entityType = LANDING_TYPE[kind];
    await tx.entitySeo.deleteMany({ where: { entityType, entityId: id } });
    await tx.entityFaq.deleteMany({ where: { entityType, entityId: id } });

    /**
     * Tombstone a deleted discipline inside the SAME transaction.
     *
     * `prisma/seed.ts` recreates foundational disciplines by their fixed id. A
     * tombstone written outside this transaction could be lost to a crash,
     * leaving the record deleted but un-tombstoned — and the next seed run
     * would resurrect it. Written here, a rolled-back delete leaves no
     * tombstone and a committed delete always leaves one.
     *
     * Only disciplines are seeded, so only disciplines are tombstoned; this is
     * deliberately not a generic deletion framework.
     */
    if (kind === 'discipline') {
      await tx.seedTombstone.upsert({
        where: { kind_key: { kind: 'discipline', key: id } },
        update: {},
        create: { kind: 'discipline', key: id },
      });
    }
  });

  await audit(a.id, `rodeo.${kind}.permanent_delete`, kind, id, `"${pre.name}" permanently deleted after dependency resolution`);
}

const LANDING_TYPE: Record<RodeoEntityKind, 'RODEO_HUB' | 'RODEO_EVENT' | 'RODEO_EDITION' | 'VENUE' | 'DISCIPLINE'> = {
  hub: 'RODEO_HUB',
  event: 'RODEO_EVENT',
  edition: 'RODEO_EDITION',
  venue: 'VENUE',
  discipline: 'DISCIPLINE',
};

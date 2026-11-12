import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as RodeoSvc from '../lib/cms/rodeoService';

/**
 * Rodeo Coverage — administrative capability and delete-safety audit.
 *
 * Written for the Master Admin Management Audit. Its purpose is to establish, by
 * observed behaviour against the isolated test database, what the Rodeo Coverage
 * admin can and cannot actually do — because a visible button, a Prisma model and
 * an exported server action each prove nothing on their own.
 *
 * Three sections:
 *   §1  the guarantees that genuinely hold today (confirmed, not assumed)
 *   §2  the delete-safety gap that does NOT hold, reproduced end to end
 *   §3  the capabilities that are absent, pinned so the report cannot overstate
 *
 * Self-skips without DATABASE_URL, like the other DB suites.
 */

let available = false;
let prisma: PrismaClient;
let rodeo: typeof RodeoSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    rodeo = await import('../lib/cms/rodeoService');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = true;
  } catch {
    available = false;
  }
}

const tag = `rac${Date.now().toString(36)}`;
const rid = () => Math.random().toString(36).slice(2, 8);
/** Mirrors the service's own slugify, so expected messages are built not guessed. */
const slugOf = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

describe.runIf(available)('Rodeo Coverage admin capability audit', () => {
  let editor: Actor;   // holds rodeo.manage
  let author: Actor;   // does NOT hold rodeo.manage
  const userIds: string[] = [];
  const eventIds: string[] = [];
  const hubIds: string[] = [];
  const venueIds: string[] = [];
  const competitorIds: string[] = [];
  let disciplineId = '';

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({
      data: { email: `${tag}-${roleKey}-${rid()}@example.com`, name: `RAC ${roleKey}`, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  /**
   * A recurring event owned by this suite.
   *
   * Note the API shape, which the audit had to discover: `EventInput` has NO
   * slug field. The slug and the primary key are both DERIVED from the name
   * (`event-${slugify(name)}`), so the name must be unique per suite run.
   */
  async function newEvent(name = `Ev ${tag} ${rid()}`): Promise<string> {
    const { id } = await rodeo.createEvent(editor, { name });
    eventIds.push(id);
    return id;
  }

  async function newEdition(eventId: string, slug = `ed-${rid()}`): Promise<string> {
    const { id } = await rodeo.createEdition(editor, { eventId, editionSlug: slug, label: `Label ${slug}` });
    return id;
  }

  beforeAll(async () => {
    editor = await makeUser('editor');
    author = await makeUser('author');
    const d = await prisma.discipline.findFirst({ select: { id: true } });
    disciplineId = d?.id ?? '';
  });

  afterAll(async () => {
    /**
     * Remove only rows this suite created. Nothing pre-existing is touched.
     *
     * Disciplines are swept by the suite tag rather than by a tracked id list:
     * during a MUTATION run the authorization check can be disabled, so the RBAC
     * test's `createDiscipline` call succeeds instead of being refused and
     * creates a row no happy-path cleanup knows about. Those orphans later broke
     * a production build, because the public discipline route could not prerender
     * them. Sweeping by tag closes that off. The foundational seven carry no tag
     * and so can never match.
     */
    await prisma.discipline.deleteMany({ where: { slug: { contains: tag } } });
    await prisma.competitionResult.deleteMany({ where: { edition: { event: { id: { in: eventIds } } } } });
    await prisma.rodeoEventEdition.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.rodeoEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.rodeoHub.deleteMany({ where: { id: { in: hubIds } } });
    await prisma.venue.deleteMany({ where: { id: { in: venueIds } } });
    await prisma.competitor.deleteMany({ where: { id: { in: competitorIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  /* ── §1 Guarantees that hold ─────────────────────────────────────── */

  describe('§1 — the delete guards that genuinely work', () => {
    it('refuses to delete a recurring event that still has editions', async () => {
      /**
       * This is the guard that matters most, because the SCHEMA would happily
       * destroy the editions: `RodeoEventEdition.event` is `onDelete: Cascade`.
       * The application-level check is the only thing standing between a single
       * admin click and the loss of every edition of an event.
       */
      const eventId = await newEvent();
      await newEdition(eventId);

      await expect(rodeo.deleteEvent(editor, eventId)).rejects.toThrow(/remove its 1 edition/i);
      expect(await prisma.rodeoEvent.count({ where: { id: eventId } }), 'the event survives').toBe(1);
      expect(await prisma.rodeoEventEdition.count({ where: { eventId } }), 'its edition survives').toBe(1);
    });

    it('refuses to delete a recurring event referenced by an article', async () => {
      const eventId = await newEvent();
      const article = await prisma.article.findFirst({ select: { id: true } });
      if (!article) return; // no article content in this database
      await prisma.articleEvent.create({ data: { articleId: article.id, eventId } });

      await expect(rodeo.deleteEvent(editor, eventId)).rejects.toThrow(/article\(s\) reference this event/i);
      expect(await prisma.rodeoEvent.count({ where: { id: eventId } })).toBe(1);

      await prisma.articleEvent.deleteMany({ where: { eventId } });
    });

    it('refuses to delete a venue still used by an edition', async () => {
      /**
       * Also schema-critical in the other direction: `RodeoEventEdition.venue`
       * is OPTIONAL with no `onDelete`, so Prisma's default is SetNull — without
       * this check the venue would vanish and its editions would quietly lose
       * their location rather than erroring.
       */
      const { id: venueId } = await rodeo.createVenue(editor, { name: `Venue ${tag} ${rid()}` });
      venueIds.push(venueId);
      const eventId = await newEvent();
      const editionId = await newEdition(eventId);
      await prisma.rodeoEventEdition.update({ where: { id: editionId }, data: { venueId } });

      await expect(rodeo.deleteVenue(editor, venueId)).rejects.toThrow(/edition\(s\) use this venue/i);
      const after = await prisma.rodeoEventEdition.findUniqueOrThrow({ where: { id: editionId } });
      expect(after.venueId, 'the edition keeps its venue').toBe(venueId);
    });

    it('refuses to delete a hub referenced by an article', async () => {
      const { id: hubId } = await rodeo.createHub(editor, { title: `Hub ${tag} ${rid()}` });
      hubIds.push(hubId);
      const article = await prisma.article.findFirst({ select: { id: true } });
      if (!article) return;
      await prisma.articleHub.create({ data: { articleId: article.id, hubId } });

      await expect(rodeo.deleteHub(editor, hubId)).rejects.toThrow(/article\(s\) reference this hub/i);
      await prisma.articleHub.deleteMany({ where: { hubId } });
    });

    it('deletes a dependency-free entity and writes an audit record', async () => {
      const { id: hubId } = await rodeo.createHub(editor, { title: `Hub ${tag} ${rid()}` });
      await rodeo.deleteHub(editor, hubId);

      expect(await prisma.rodeoHub.count({ where: { id: hubId } })).toBe(0);
      const log = await prisma.auditLog.findFirst({ where: { action: 'rodeo.hub.delete', entityId: hubId } });
      expect(log, 'a delete must be auditable').not.toBeNull();
      expect(log!.actorId).toBe(editor.id);
    });

    it('keeps rodeo slugs unique ACROSS hubs and events, which share one URL space', async () => {
      /**
       * Hubs and recurring events both live under `/rodeo-events/<slug>/`, and
       * Postgres cannot express a cross-table unique constraint, so this is a
       * write-time check — exactly the kind of guarantee worth proving.
       *
       * The slug is derived from the title/name, so a COLLIDING NAME is what
       * triggers it.
       */
      const shared = `Shared ${tag} ${rid()}`;
      const { id: hubId } = await rodeo.createHub(editor, { title: shared });
      hubIds.push(hubId);
      await expect(rodeo.createEvent(editor, { name: shared }))
        .rejects.toThrow(/already used by another rodeo hub or event/i);
    });

    it('a slug is derived from the title and is NOT editable afterwards', async () => {
      /**
       * A capability finding rather than a defect. `HubInput` accepts no slug,
       * and `updateHub` never writes one, so a hub's public URL is fixed at
       * creation from its original title. Renaming it leaves the URL on the old
       * slug — deliberate URL stability, but it means title and URL can drift
       * apart and the admin cannot correct a slug without deleting the record.
       */
      const original = `Original ${tag} ${rid()}`;
      const { id } = await rodeo.createHub(editor, { title: original });
      hubIds.push(id);
      const before = await prisma.rodeoHub.findUniqueOrThrow({ where: { id } });

      await rodeo.updateHub(editor, id, { title: `Renamed ${tag} ${rid()}` });
      const after = await prisma.rodeoHub.findUniqueOrThrow({ where: { id } });

      expect(after.title, 'the title changes').not.toBe(before.title);
      expect(after.slug, 'the public URL does not').toBe(before.slug);
    });

    it('prevents two editions of the same event sharing an edition slug', async () => {
      const eventId = await newEvent();
      await newEdition(eventId, 'dupe-2026');
      await expect(rodeo.createEdition(editor, { eventId, editionSlug: 'dupe-2026', label: 'Again' })).rejects.toThrow();
    });

    it('enforces rodeo.manage at the SERVICE boundary, not just in the UI', async () => {
      /**
       * Hiding a button is not authorization. Every mutation is called directly
       * with an actor that lacks `rodeo.manage`.
       */
      const eventId = await newEvent();
      const calls: [string, Promise<unknown>][] = [
        ['createHub', rodeo.createHub(author, { title: `X ${tag} ${rid()}` })],
        ['updateHub', rodeo.updateHub(author, 'any-id', { title: 'X' })],
        ['deleteHub', rodeo.deleteHub(author, 'any-id')],
        ['createEvent', rodeo.createEvent(author, { name: `X ${tag} ${rid()}` })],
        ['updateEvent', rodeo.updateEvent(author, 'any-id', { name: 'X' })],
        ['deleteEvent', rodeo.deleteEvent(author, eventId)],
        ['createEdition', rodeo.createEdition(author, { eventId, editionSlug: 'x', label: 'X' })],
        ['updateEdition', rodeo.updateEdition(author, 'any-id', { label: 'X' })],
        ['deleteEdition', rodeo.deleteEdition(author, 'any-id')],
        ['createVenue', rodeo.createVenue(author, { name: `X ${tag} ${rid()}` })],
        ['updateVenue', rodeo.updateVenue(author, 'any-id', { name: 'X' })],
        ['deleteVenue', rodeo.deleteVenue(author, 'any-id')],
        ['updateDiscipline', rodeo.updateDiscipline(author, 'any-id', { summary: 'X' })],
        ['createDiscipline', rodeo.createDiscipline(author, { name: `X ${tag} ${rid()}`, summary: 'X' })],
        ['deleteDiscipline', rodeo.deleteDiscipline(author, 'any-id')],
      ];
      for (const [name, p] of calls) {
        await expect(p, `${name} must refuse an actor without rodeo.manage`).rejects.toThrow(/not permitted/i);
      }
    });
  });

  /* ── §2 The gap ──────────────────────────────────────────────────── */

  describe('§2 — FIXED: an edition with competition history cannot be deleted', () => {
    it('refuses the delete and names every blocking record', async () => {
      /**
       * ───────────────────────────────────────────────────────────────────
       * THE CRITICAL FINDING OF THIS AUDIT.
       *
       * `deleteEdition` checks exactly one dependency: linked articles. But
       * five other tables point at an edition, and every one of them is
       * `onDelete: Cascade` in the schema:
       *
       *     CompetitionSession.editionId        -> Cascade   (schedules)
       *     CompetitionResult.editionId         -> Cascade   (results)
       *     CompetitionStanding.editionId       -> Cascade   (standings)
       *     CompetitorParticipation.editionId   -> Cascade   (who competed)
       *     RodeoEventEditionMedia.editionId    -> Cascade
       *
       * So an edition carrying a full year of verified competition history
       * deletes cleanly, and takes all of it with it. The operator is shown no
       * dependency warning, because none is computed. The only reason the
       * sibling guard on `deleteEvent` protects anything is that it refuses
       * while editions exist — delete the editions first and the same data is
       * gone, one level down.
       *
       * This test REPRODUCES the loss rather than asserting the fix, so it
       * documents real current behaviour. Remediation is described in the
       * report; it is an application-level dependency check, needing no schema
       * change.
       * ───────────────────────────────────────────────────────────────────
       */
      if (!disciplineId) return; // needs the foundational discipline taxonomy

      const eventId = await newEvent();
      const editionId = await newEdition(eventId);

      const competitor = await prisma.competitor.create({
        data: { slug: `${tag}-c-${rid()}`, fullName: `Competitor ${rid()}` },
      });
      competitorIds.push(competitor.id);

      const session = await prisma.competitionSession.create({
        data: { editionId, disciplineId, title: 'Round 1', sessionType: 'ROUND', sortOrder: 1 },
      });
      await prisma.competitionResult.create({
        data: { editionId, disciplineId, sessionId: session.id, competitorId: competitor.id, resultType: 'SCORE' },
      });
      await prisma.competitionStanding.create({
        data: { editionId, disciplineId, competitorId: competitor.id, category: 'AGGREGATE' },
      });
      await prisma.competitorParticipation.create({
        data: { editionId, competitorId: competitor.id },
      });

      // Everything is in place and verifiable before the delete.
      expect(await prisma.competitionSession.count({ where: { editionId } })).toBe(1);
      expect(await prisma.competitionResult.count({ where: { editionId } })).toBe(1);
      expect(await prisma.competitionStanding.count({ where: { editionId } })).toBe(1);
      expect(await prisma.competitorParticipation.count({ where: { editionId } })).toBe(1);

      // BEFORE THE FIX this resolved, and all four tables above were emptied by
      // the schema cascade. It now refuses, and the message names each record
      // type so the operator knows what to remove or reassign.
      await expect(rodeo.deleteEdition(editor, editionId)).rejects.toThrow(
        /1 scheduled session\(s\), 1 recorded result\(s\), 1 standing\(s\), 1 competitor participation record\(s\)/,
      );
      await expect(rodeo.deleteEdition(editor, editionId)).rejects.toThrow(/not recreatable/i);

      // Nothing was lost.
      expect(await prisma.rodeoEventEdition.count({ where: { id: editionId } }), 'edition survives').toBe(1);
      expect(await prisma.competitionSession.count({ where: { editionId } }), 'schedule survives').toBe(1);
      expect(await prisma.competitionResult.count({ where: { editionId } }), 'results survive').toBe(1);
      expect(await prisma.competitionStanding.count({ where: { editionId } }), 'standings survive').toBe(1);
      expect(await prisma.competitorParticipation.count({ where: { editionId } }), 'participation survives').toBe(1);
    });

    it('reports the same dependencies to the UI before the operator clicks', async () => {
      // `getEditionDependencies` is what lets the admin warn up front rather
      // than only explaining after a failed attempt.
      if (!disciplineId) return;
      const eventId = await newEvent();
      const editionId = await newEdition(eventId);
      const empty = await rodeo.getEditionDependencies(editionId);
      expect(empty.total).toBe(0);

      const competitor = await prisma.competitor.create({
        data: { slug: `${tag}-c-${rid()}`, fullName: `Competitor ${rid()}` },
      });
      competitorIds.push(competitor.id);
      await prisma.competitorParticipation.create({ data: { editionId, competitorId: competitor.id } });

      const dep = await rodeo.getEditionDependencies(editionId);
      expect(dep.competitors).toBe(1);
      expect(dep.total).toBe(1);
    });

    it('still deletes an edition that genuinely has no dependencies', async () => {
      // The fix must not make editions undeletable.
      const eventId = await newEvent();
      const editionId = await newEdition(eventId);
      await expect(rodeo.deleteEdition(editor, editionId)).resolves.toBeUndefined();
      expect(await prisma.rodeoEventEdition.count({ where: { id: editionId } })).toBe(0);
    });

    it('refuses to delete a venue used by a scheduled session', async () => {
      /**
       * The second cascade gap closed by this audit. `CompetitionSession` has its
       * own optional `venueId`, which is SET NULL on delete — so a venue could be
       * removed and historical schedule rows would quietly lose their location.
       */
      if (!disciplineId) return;
      const { id: venueId } = await rodeo.createVenue(editor, { name: `Venue ${tag} ${rid()}` });
      venueIds.push(venueId);
      const eventId = await newEvent();
      const editionId = await newEdition(eventId);
      await prisma.competitionSession.create({
        data: { editionId, disciplineId, venueId, title: 'Round 1', sessionType: 'ROUND', sortOrder: 1 },
      });

      await expect(rodeo.deleteVenue(editor, venueId)).rejects.toThrow(/session\(s\) take place at this venue/i);
      expect(await prisma.venue.count({ where: { id: venueId } })).toBe(1);
    });
  });

  /* ── §3 Absent capabilities ──────────────────────────────────────── */

  describe('§3 — capabilities that do not exist', () => {
    it('IMPLEMENTED: a discipline can now be created, with a derived slug', async () => {
      const name = `Pole Bending ${tag} ${rid()}`;
      const { id } = await rodeo.createDiscipline(editor, { name, summary: 'A timed event.', category: 'Timed Event' });
      const row = await prisma.discipline.findUniqueOrThrow({ where: { id } });

      expect(row.name).toBe(name);
      expect(row.slug, 'slug derives from the name').toBe(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      expect(row.id, 'id follows the seed convention').toBe(`disc-${row.slug}`);
      expect(row.guide, 'no guide content is invented at creation').toBeNull();

      const log = await prisma.auditLog.findFirst({ where: { action: 'rodeo.discipline.create', entityId: id } });
      expect(log).not.toBeNull();

      await prisma.discipline.delete({ where: { id } });
    });

    it('refuses a duplicate discipline slug with an operator-readable message', async () => {
      /**
       * Asserted on the SERVICE's own wording, not on the generic phrase
       * "already exists".
       *
       * Mutation testing caught this: with the application-level check disabled,
       * the database still rejected the insert on its unique constraint, and a
       * looser assertion passed anyway — so the test proved nothing about the
       * code it was supposed to protect. The distinction matters to an operator,
       * because a raw `P2002 Unique constraint failed on the fields: (id)` is not
       * something they can act on, whereas naming the slug is.
       */
      const name = `Dupe ${tag} ${rid()}`;
      const { id } = await rodeo.createDiscipline(editor, { name, summary: 'x' });

      const err = await rodeo.createDiscipline(editor, { name, summary: 'x' }).then(
        () => null,
        (e: unknown) => e as { code?: string; message: string },
      );
      expect(err, 'a duplicate must be refused').not.toBeNull();
      // The service's own error code. A raw database violation surfaces as
      // PrismaClientKnownRequestError with code "P2002", which fails this.
      expect(err!.code, 'refused by the service, not by a raw constraint error').toBe('conflict');
      expect(err!.message).toBe(`A discipline with the URL slug "${slugOf(name)}" already exists.`);

      await prisma.discipline.delete({ where: { id } });
    });

    it('IMPLEMENTED: a dependency-free discipline can be deleted, and is audited', async () => {
      const { id } = await rodeo.createDiscipline(editor, { name: `Temp ${tag} ${rid()}`, summary: 'x' });
      await expect(rodeo.deleteDiscipline(editor, id)).resolves.toBeUndefined();
      expect(await prisma.discipline.count({ where: { id } })).toBe(0);

      /**
       * Deleting site taxonomy must leave a trail. Added after a mutation run:
       * removing the audit call originally went undetected here, because no
       * assertion covered it.
       */
      const log = await prisma.auditLog.findFirst({ where: { action: 'rodeo.discipline.delete', entityId: id } });
      expect(log, 'a discipline deletion must be auditable').not.toBeNull();
      expect(log!.actorId).toBe(editor.id);
      /**
       * UPDATED: this asserted the old caveat that a deleted foundational
       * discipline "would be recreated by the next seed run". That was true
       * when written and is no longer — owner Decision A added durable
       * `SeedTombstone` rows, so the audit now records the opposite guarantee.
       */
      expect(log!.detail, 'the audit records that deletion is now durable').toMatch(/tombstoned so no seed run can recreate it/);
    });

    it('refuses to delete a discipline that is still referenced', async () => {
      /**
       * Without this check the join rows would cascade away silently and
       * historical sessions/standings would be detached by SET NULL.
       */
      const { id } = await rodeo.createDiscipline(editor, { name: `Linked ${tag} ${rid()}`, summary: 'x' });
      const competitor = await prisma.competitor.create({
        data: { slug: `${tag}-c-${rid()}`, fullName: `Competitor ${rid()}` },
      });
      competitorIds.push(competitor.id);
      await prisma.competitorDiscipline.create({ data: { competitorId: competitor.id, disciplineId: id } });

      await expect(rodeo.deleteDiscipline(editor, id)).rejects.toThrow(/competitor profile\(s\)/i);
      expect(await prisma.discipline.count({ where: { id } }), 'discipline survives').toBe(1);

      await prisma.competitorDiscipline.deleteMany({ where: { disciplineId: id } });
      await prisma.discipline.delete({ where: { id } });
    });

    it('a newly created discipline renders its PUBLIC page without crashing', async () => {
      /**
       * Regression test for the defect this audit's own feature exposed.
       *
       * `createDiscipline` deliberately leaves `guide` null, so
       * `scoringBreakdown` and `rulesHighlights` are absent — yet `Discipline`
       * declares both as required and `toDiscipline` ended with `as Discipline`,
       * which asserted their presence without checking. The public route then
       * died on `.map()` of undefined, and `next build` aborted with a prerender
       * error on `/disciplines/<slug>/`.
       *
       * Asserted at the mapper, which is where the fix lives and where every
       * consumer is protected at once.
       */
      const { id } = await rodeo.createDiscipline(editor, { name: `Fresh ${tag} ${rid()}`, summary: 'Summary only.' });
      const row = await prisma.discipline.findUniqueOrThrow({ where: { id } });
      expect(row.guide, 'created with no guide content').toBeNull();

      const { toDiscipline } = await import('../lib/mappers');
      const mapped = toDiscipline(row);
      expect(Array.isArray(mapped.scoringBreakdown), 'never undefined').toBe(true);
      expect(mapped.scoringBreakdown).toEqual([]);
      expect(Array.isArray(mapped.rulesHighlights), 'never undefined').toBe(true);
      expect(mapped.rulesHighlights).toEqual([]);
      // The view maps these directly; undefined is what used to crash the route.
      expect(() => mapped.scoringBreakdown.map((x) => x)).not.toThrow();
      expect(() => mapped.rulesHighlights.map((x) => x)).not.toThrow();

      await prisma.discipline.delete({ where: { id } });
    });

    it('real guide content still overrides the empty defaults', async () => {
      // The defaults must not shadow a discipline that genuinely has a guide.
      const { toDiscipline } = await import('../lib/mappers');
      const mapped = toDiscipline({
        id: 'x', slug: 'x', name: 'X', shortName: null, category: null,
        tagline: null, summary: 's', image: null, imageCredit: null,
        guide: { scoringBreakdown: [{ title: 'T', description: 'D' }], rulesHighlights: ['R'] },
      });
      expect(mapped.scoringBreakdown).toHaveLength(1);
      expect(mapped.rulesHighlights).toEqual(['R']);
    });

    it('the foundational seven are untouched by this audit', async () => {
      // They must survive implementation and testing.
      const slugs = ['bareback-riding', 'steer-wrestling', 'team-roping', 'saddle-bronc-riding',
        'tie-down-roping', 'barrel-racing', 'bull-riding'];
      const found = await prisma.discipline.findMany({ where: { slug: { in: slugs } }, select: { slug: true } });
      expect(found.length, 'all seven foundational disciplines still present').toBe(7);
    });

    it('SUPERSEDED: Archive and Reactivate now exist for all five families', async () => {
      /**
       * This test previously asserted that NO archive capability existed — a
       * true statement at the time of the audit, and the finding that produced
       * the owner's schema approval. The `archivedAt` migration has since been
       * approved and implemented, so the assertion is inverted rather than
       * deleted: the capability's arrival should break a test that claimed its
       * absence, and the record of why it changed belongs here.
       *
       * Behaviour is covered in `rodeo-lifecycle.test.ts`.
       */
      const svc = rodeo as unknown as Record<string, unknown>;
      expect(typeof svc.archiveEntity).toBe('function');
      expect(typeof svc.reactivateEntity).toBe('function');
    });

    it('SUPERSEDED: the approved migration added the lifecycle column', async () => {
      /**
       * The other half of the same supersession. This asserted that no archive
       * column existed anywhere, which was the blocker behind the schema
       * approval request. The owner approved `archivedAt`, it was applied to
       * the isolated test database, and the column now exists on all five
       * families — so the test asserts that instead.
       *
       * Migration shape (nullable, no default, no row rewritten) is verified in
       * `rodeo-lifecycle.test.ts`.
       */
      const columns = await prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('RodeoHub', 'RodeoEvent', 'RodeoEventEdition', 'Venue', 'Discipline')
          AND column_name = 'archivedAt'
        ORDER BY table_name`;
      expect(columns.map((c) => c.table_name)).toEqual([
        'Discipline', 'RodeoEvent', 'RodeoEventEdition', 'RodeoHub', 'Venue',
      ]);
    });
  });
});

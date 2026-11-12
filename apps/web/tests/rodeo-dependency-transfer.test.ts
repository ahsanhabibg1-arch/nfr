import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as RodeoSvc from '../lib/cms/rodeoService';
import type * as DepSvc from '../lib/cms/rodeoDependencies';

/**
 * Dependency inspection, relationship transfer and permanent deletion.
 *
 * The owner's requirement is that Delete is never a dead end — but also that
 * nothing fabricates history to satisfy a delete. These tests hold both halves:
 * curated associations really do move, and records of what happened really do
 * refuse to move, at the SERVICE boundary rather than only in the dialog.
 */

let available = false;
let prisma: PrismaClient;
let rodeo: typeof RodeoSvc;
let dep: typeof DepSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    rodeo = await import('../lib/cms/rodeoService');
    dep = await import('../lib/cms/rodeoDependencies');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = true;
  } catch {
    available = false;
  }
}

const tag = `rdt${Date.now().toString(36)}`;
const rid = () => Math.random().toString(36).slice(2, 8);

describe.runIf(available)('Rodeo dependency resolution and transfer', () => {
  let editor: Actor;
  let author: Actor;
  const userIds: string[] = [];
  const eventIds: string[] = [];
  const hubIds: string[] = [];
  const venueIds: string[] = [];
  const competitorIds: string[] = [];
  let articleId = '';
  let disciplineId = '';

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `${tag}-${roleKey}-${rid()}@example.com`, name: 'RDT', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  async function newDiscipline(): Promise<string> {
    const { id } = await rodeo.createDiscipline(editor, { name: `D ${tag} ${rid()}`, summary: 's' });
    return id;
  }
  async function newEvent(): Promise<string> {
    const { id } = await rodeo.createEvent(editor, { name: `Ev ${tag} ${rid()}` });
    eventIds.push(id);
    return id;
  }
  async function newHub(): Promise<string> {
    const { id } = await rodeo.createHub(editor, { title: `Hub ${tag} ${rid()}` });
    hubIds.push(id);
    return id;
  }
  async function newVenue(): Promise<string> {
    const { id } = await rodeo.createVenue(editor, { name: `V ${tag} ${rid()}` });
    venueIds.push(id);
    return id;
  }

  beforeAll(async () => {
    editor = await makeUser('editor');
    author = await makeUser('author');
    const art = await prisma.article.findFirst({ select: { id: true } });
    articleId = art?.id ?? '';
    const d = await prisma.discipline.findFirst({ where: { slug: 'bull-riding' }, select: { id: true } });
    disciplineId = d?.id ?? '';
  });

  afterAll(async () => {
    await prisma.rodeoEventEdition.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.rodeoEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.rodeoHub.deleteMany({ where: { id: { in: hubIds } } });
    await prisma.venue.deleteMany({ where: { id: { in: venueIds } } });
    await prisma.competitor.deleteMany({ where: { id: { in: competitorIds } } });
    await prisma.discipline.deleteMany({ where: { slug: { contains: tag } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  /* ── Inspection ──────────────────────────────────────────────────── */

  describe('dependency inspection', () => {
    it('reports no dependencies for a fresh entity, which is therefore deletable', async () => {
      const id = await newDiscipline();
      const snap = await dep.inspectDependencies('discipline', id);
      expect(snap.groups).toEqual([]);
      expect(snap.blockingCount).toBe(0);
      expect(snap.deletable).toBe(true);
    });

    it('classifies an editorial link as transferable and a result as historical', async () => {
      if (!articleId || !disciplineId) return;
      const id = await newDiscipline();
      await prisma.articleDiscipline.create({ data: { articleId, disciplineId: id } });

      const snap = await dep.inspectDependencies('discipline', id);
      const articles = snap.groups.find((g) => g.key === 'discipline.articles');
      expect(articles?.classification).toBe('transferable');
      expect(articles?.count).toBe(1);
      expect(snap.deletable, 'a dependency blocks deletion').toBe(false);
      expect(snap.resolvableKeys).toContain('discipline.articles');
      expect(snap.immovableKeys).toEqual([]);

      await prisma.articleDiscipline.deleteMany({ where: { disciplineId: id } });
    });

    it('classifies competition records as historical and never resolvable', async () => {
      if (!disciplineId) return;
      const eventId = await newEvent();
      const { id: editionId } = await rodeo.createEdition(editor, { eventId, editionSlug: `ed-${rid()}`, label: 'L' });
      const competitor = await prisma.competitor.create({ data: { slug: `${tag}-c-${rid()}`, fullName: 'C' } });
      competitorIds.push(competitor.id);
      await prisma.competitionResult.create({ data: { editionId, disciplineId, competitorId: competitor.id, resultType: 'SCORE' } });

      const snap = await dep.inspectDependencies('edition', editionId);
      const results = snap.groups.find((g) => g.key === 'edition.results');
      expect(results?.classification).toBe('historical');
      expect(snap.immovableKeys).toContain('edition.results');
      expect(results?.reason).toMatch(/can never be transferred/i);
    });
  });

  /* ── Transfer: the half that moves ───────────────────────────────── */

  describe('transferring a curated association', () => {
    it('re-points an article from one discipline to another', async () => {
      if (!articleId) return;
      const source = await newDiscipline();
      const dest = await newDiscipline();
      await prisma.articleDiscipline.create({ data: { articleId, disciplineId: source } });

      const r = await dep.transferDependencyGroup(editor, 'discipline', source, 'discipline.articles', dest);
      expect(r.moved).toBe(1);
      expect(r.skipped).toBe(0);

      expect(await prisma.articleDiscipline.count({ where: { disciplineId: source } }), 'source is clear').toBe(0);
      expect(await prisma.articleDiscipline.count({ where: { disciplineId: dest } }), 'destination has it').toBe(1);

      // The article itself is untouched — no duplicate, no state change.
      const art = await prisma.article.findUniqueOrThrow({ where: { id: articleId }, select: { slug: true, workflowStatus: true } });
      expect(art.slug, 'the public URL must not move').toBeTruthy();
      expect(await prisma.article.count({ where: { id: articleId } }), 'no duplicate article').toBe(1);

      await prisma.articleDiscipline.deleteMany({ where: { disciplineId: dest } });
    });

    it('merges rather than failing when the destination already has the same link', async () => {
      /**
       * Join tables use composite primary keys, so re-pointing a row whose
       * destination pairing already exists would violate the key. Those rows
       * are removed instead and reported as skipped — the operator still gets
       * the end state they asked for: nothing left pointing at the source.
       */
      if (!articleId) return;
      const source = await newDiscipline();
      const dest = await newDiscipline();
      await prisma.articleDiscipline.create({ data: { articleId, disciplineId: source } });
      await prisma.articleDiscipline.create({ data: { articleId, disciplineId: dest } });

      const r = await dep.transferDependencyGroup(editor, 'discipline', source, 'discipline.articles', dest);
      expect(r.moved).toBe(0);
      expect(r.skipped).toBe(1);
      expect(await prisma.articleDiscipline.count({ where: { disciplineId: source } })).toBe(0);
      expect(await prisma.articleDiscipline.count({ where: { disciplineId: dest } }), 'exactly one link remains').toBe(1);

      await prisma.articleDiscipline.deleteMany({ where: { disciplineId: dest } });
    });

    it('moves an edition to another recurring event when slugs do not clash', async () => {
      const source = await newEvent();
      const dest = await newEvent();
      const slug = `ed-${rid()}`;
      const { id: editionId } = await rodeo.createEdition(editor, { eventId: source, editionSlug: slug, label: 'Movable' });

      const r = await dep.transferDependencyGroup(editor, 'event', source, 'event.editions', dest);
      expect(r.moved).toBe(1);
      const moved = await prisma.rodeoEventEdition.findUniqueOrThrow({ where: { id: editionId }, select: { eventId: true, editionSlug: true } });
      expect(moved.eventId).toBe(dest);
      expect(moved.editionSlug, 'identity preserved').toBe(slug);
    });

    it('REFUSES an edition move that would collide, rather than renaming a URL', async () => {
      const source = await newEvent();
      const dest = await newEvent();
      const slug = `clash-${rid()}`;
      await rodeo.createEdition(editor, { eventId: source, editionSlug: slug, label: 'A' });
      await rodeo.createEdition(editor, { eventId: dest, editionSlug: slug, label: 'B' });

      await expect(dep.transferDependencyGroup(editor, 'event', source, 'event.editions', dest))
        .rejects.toThrow(/already has an edition with the slug/i);
      // And nothing moved.
      expect(await prisma.rodeoEventEdition.count({ where: { eventId: source } })).toBe(1);
    });

    it('re-points editions and sessions from one venue to another', async () => {
      const source = await newVenue();
      const dest = await newVenue();
      const eventId = await newEvent();
      const { id: editionId } = await rodeo.createEdition(editor, { eventId, editionSlug: `ed-${rid()}`, label: 'L', venueId: source });

      const r = await dep.transferDependencyGroup(editor, 'venue', source, 'venue.editions', dest);
      expect(r.moved).toBe(1);
      expect((await prisma.rodeoEventEdition.findUniqueOrThrow({ where: { id: editionId }, select: { venueId: true } })).venueId).toBe(dest);
    });

    it('moves a hub listing without touching the event URL', async () => {
      const source = await newHub();
      const dest = await newHub();
      const eventId = await newEvent();
      const before = await prisma.rodeoEvent.findUniqueOrThrow({ where: { id: eventId }, select: { slug: true } });
      await prisma.rodeoHubEvent.create({ data: { hubId: source, eventId } });

      const r = await dep.transferDependencyGroup(editor, 'hub', source, 'hub.events', dest);
      expect(r.moved).toBe(1);
      const after = await prisma.rodeoEvent.findUniqueOrThrow({ where: { id: eventId }, select: { slug: true } });
      expect(after.slug, 'hub association never changes the event URL').toBe(before.slug);
    });
  });

  /* ── Transfer: the half that must refuse ─────────────────────────── */

  describe('historical records refuse to move', () => {
    it('refuses to transfer results at the SERVICE boundary, not just in the dialog', async () => {
      if (!disciplineId) return;
      const eventId = await newEvent();
      const { id: editionId } = await rodeo.createEdition(editor, { eventId, editionSlug: `ed-${rid()}`, label: 'L' });
      const dest = await rodeo.createEdition(editor, { eventId, editionSlug: `ed-${rid()}`, label: 'Dest' });
      const competitor = await prisma.competitor.create({ data: { slug: `${tag}-c-${rid()}`, fullName: 'C' } });
      competitorIds.push(competitor.id);
      await prisma.competitionResult.create({ data: { editionId, disciplineId, competitorId: competitor.id, resultType: 'SCORE' } });

      await expect(dep.transferDependencyGroup(editor, 'edition', editionId, 'edition.results', dest.id))
        .rejects.toThrow(/cannot be transferred/i);

      // The result stayed exactly where it happened.
      expect(await prisma.competitionResult.count({ where: { editionId } })).toBe(1);
      expect(await prisma.competitionResult.count({ where: { editionId: dest.id } })).toBe(0);
    });

    it('refuses a transfer to the same entity', async () => {
      const id = await newDiscipline();
      await expect(dep.transferDependencyGroup(editor, 'discipline', id, 'discipline.articles', id))
        .rejects.toThrow(/must be different/i);
    });

    it('requires rodeo.manage to transfer', async () => {
      const source = await newDiscipline();
      const dest = await newDiscipline();
      await expect(dep.transferDependencyGroup(author, 'discipline', source, 'discipline.articles', dest))
        .rejects.toThrow(/not permitted/i);
    });
  });

  /* ── Permanent deletion ──────────────────────────────────────────── */

  describe('permanent deletion after resolution', () => {
    it('refuses while a dependency remains, then succeeds once transferred', async () => {
      if (!articleId) return;
      const source = await newDiscipline();
      const dest = await newDiscipline();
      await prisma.articleDiscipline.create({ data: { articleId, disciplineId: source } });

      await expect(dep.permanentDeleteEntity(editor, 'discipline', source))
        .rejects.toThrow(/still has 1 × articles in this discipline/i);

      await dep.transferDependencyGroup(editor, 'discipline', source, 'discipline.articles', dest);
      await expect(dep.permanentDeleteEntity(editor, 'discipline', source)).resolves.toBeUndefined();
      expect(await prisma.discipline.count({ where: { id: source } })).toBe(0);

      await prisma.articleDiscipline.deleteMany({ where: { disciplineId: dest } });
    });

    it('removes orphan-prone SEO and FAQ rows with the entity', async () => {
      const id = await newDiscipline();
      await prisma.entitySeo.create({ data: { entityType: 'DISCIPLINE', entityId: id, seoTitle: 'T' } });
      await prisma.entityFaq.create({ data: { entityType: 'DISCIPLINE', entityId: id, question: 'Q?', answer: 'A.' } });

      await dep.permanentDeleteEntity(editor, 'discipline', id);
      // These tables have no foreign key, so without explicit cleanup they
      // would outlive the entity as orphans.
      expect(await prisma.entitySeo.count({ where: { entityType: 'DISCIPLINE', entityId: id } })).toBe(0);
      expect(await prisma.entityFaq.count({ where: { entityType: 'DISCIPLINE', entityId: id } })).toBe(0);
    });

    it('audits the permanent deletion', async () => {
      const id = await newDiscipline();
      await dep.permanentDeleteEntity(editor, 'discipline', id);
      const log = await prisma.auditLog.findFirst({ where: { action: 'rodeo.discipline.permanent_delete', entityId: id } });
      expect(log).not.toBeNull();
      expect(log!.actorId).toBe(editor.id);
    });

    it('requires rodeo.manage', async () => {
      const id = await newDiscipline();
      await expect(dep.permanentDeleteEntity(author, 'discipline', id)).rejects.toThrow(/not permitted/i);
    });

    it('NEVER deletes a historical record to satisfy a delete request', async () => {
      // The whole point: an edition holding results cannot be deleted at all,
      // by any path in this engine.
      if (!disciplineId) return;
      const eventId = await newEvent();
      const { id: editionId } = await rodeo.createEdition(editor, { eventId, editionSlug: `ed-${rid()}`, label: 'L' });
      const competitor = await prisma.competitor.create({ data: { slug: `${tag}-c-${rid()}`, fullName: 'C' } });
      competitorIds.push(competitor.id);
      await prisma.competitionResult.create({ data: { editionId, disciplineId, competitorId: competitor.id, resultType: 'SCORE' } });

      await expect(dep.permanentDeleteEntity(editor, 'edition', editionId)).rejects.toThrow(/still has/i);
      expect(await prisma.competitionResult.count({ where: { editionId } }), 'the result survives').toBe(1);
      expect(await prisma.rodeoEventEdition.count({ where: { id: editionId } }), 'and so does the edition').toBe(1);
    });
  });

  /* ── Fail-closed delete (owner Decision C) ───────────────────────── */

  describe('the delete fails closed when a dependency appears late', () => {
    it('deletes nothing when a dependency exists at statement time', async () => {
      /**
       * Simulates the race the recount cannot see.
       *
       * `permanentDeleteEntity` pre-checks, then deletes. Here a dependency is
       * inserted AFTER a clean pre-check would have passed — the same position
       * a concurrent transaction would occupy. The delete statement's own
       * WHERE still sees it, matches zero rows, and the operation fails closed
       * rather than cascading.
       *
       * This is what makes the guard real rather than advisory: with the
       * `none: {}` conditions removed the row would be deleted and its
       * dependent destroyed, which mutation L9 confirms.
       */
      if (!articleId) return;
      const id = await newDiscipline();

      // Clean at this point — a pre-check would pass.
      expect((await dep.inspectDependencies('discipline', id)).deletable).toBe(true);

      // The "concurrent" write.
      await prisma.articleDiscipline.create({ data: { articleId, disciplineId: id } });

      await expect(dep.permanentDeleteEntity(editor, 'discipline', id)).rejects.toThrow(/still has|added while you were confirming/i);
      expect(await prisma.discipline.count({ where: { id } }), 'the record survives').toBe(1);
      expect(await prisma.articleDiscipline.count({ where: { disciplineId: id } }), 'and so does its dependent').toBe(1);

      await prisma.articleDiscipline.deleteMany({ where: { disciplineId: id } });
      await prisma.discipline.delete({ where: { id } });
    });

    it('an edition holding competition history can never be cascaded away', async () => {
      // The highest-value case: these rows are irreplaceable, and the schema
      // would cascade them.
      if (!disciplineId) return;
      const eventId = await newEvent();
      const { id: editionId } = await rodeo.createEdition(editor, { eventId, editionSlug: `fc-${rid()}`, label: 'L' });
      const competitor = await prisma.competitor.create({ data: { slug: `${tag}-c-${rid()}`, fullName: 'C' } });
      competitorIds.push(competitor.id);
      await prisma.competitionResult.create({ data: { editionId, disciplineId, competitorId: competitor.id, resultType: 'SCORE' } });

      await expect(dep.permanentDeleteEntity(editor, 'edition', editionId)).rejects.toThrow();
      expect(await prisma.competitionResult.count({ where: { editionId } })).toBe(1);
      expect(await prisma.rodeoEventEdition.count({ where: { id: editionId } })).toBe(1);
    });

    it('a clean record still deletes — the guard is not a blanket block', async () => {
      const id = await newDiscipline();
      await expect(dep.permanentDeleteEntity(editor, 'discipline', id)).resolves.toBeUndefined();
      expect(await prisma.discipline.count({ where: { id } })).toBe(0);
    });
  });

  /* ── Destinations ────────────────────────────────────────────────── */

  it('offers destinations of the same family, never the source itself', async () => {
    const source = await newDiscipline();
    const dest = await newDiscipline();
    const options = await dep.listTransferDestinations('discipline', source);
    const ids = options.map((o) => o.id);
    expect(ids).toContain(dest);
    expect(ids, 'the source can never be its own destination').not.toContain(source);
  });
});

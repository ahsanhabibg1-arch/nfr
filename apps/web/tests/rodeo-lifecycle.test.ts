import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as RodeoSvc from '../lib/cms/rodeoService';

/**
 * Rodeo Coverage archive lifecycle — owner-approved `archivedAt` workstream.
 *
 * Archive leaks are silent by nature: a record that stays visible in one
 * forgotten listing is indistinguishable from one that was never archived, and
 * nothing throws. So these tests check every DISCOVERY surface the audit found
 * (listings, search, sitemap, static params) rather than trusting that one
 * shared `where` fragment reached them all.
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

const tag = `rlc${Date.now().toString(36)}`;
const rid = () => Math.random().toString(36).slice(2, 8);

describe.runIf(available)('Rodeo Coverage archive lifecycle', () => {
  let editor: Actor;
  let author: Actor;
  const userIds: string[] = [];
  const eventIds: string[] = [];
  const hubIds: string[] = [];
  const venueIds: string[] = [];

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({
      data: { email: `${tag}-${roleKey}-${rid()}@example.com`, name: `RLC ${roleKey}`, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  async function newHub(): Promise<{ id: string; slug: string }> {
    const { id } = await rodeo.createHub(editor, { title: `Hub ${tag} ${rid()}` });
    hubIds.push(id);
    const row = await prisma.rodeoHub.findUniqueOrThrow({ where: { id }, select: { slug: true } });
    return { id, slug: row.slug };
  }

  async function newEvent(): Promise<{ id: string; slug: string }> {
    const { id } = await rodeo.createEvent(editor, { name: `Ev ${tag} ${rid()}`, description: 'Has content.' });
    eventIds.push(id);
    const row = await prisma.rodeoEvent.findUniqueOrThrow({ where: { id }, select: { slug: true } });
    return { id, slug: row.slug };
  }

  beforeAll(async () => {
    editor = await makeUser('editor');
    author = await makeUser('author');
  });

  afterAll(async () => {
    await prisma.rodeoEventEdition.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.rodeoEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.rodeoHub.deleteMany({ where: { id: { in: hubIds } } });
    await prisma.venue.deleteMany({ where: { id: { in: venueIds } } });
    await prisma.discipline.deleteMany({ where: { slug: { contains: tag } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  /* ── Migration shape ─────────────────────────────────────────────── */

  describe('the approved migration', () => {
    it('added a nullable archivedAt to all five families and nothing else', async () => {
      const cols = await prisma.$queryRaw<{ table_name: string; is_nullable: string; column_default: string | null }[]>`
        SELECT table_name, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'archivedAt'
        ORDER BY table_name`;
      expect(cols.map((c) => c.table_name)).toEqual([
        'Discipline', 'RodeoEvent', 'RodeoEventEdition', 'RodeoHub', 'Venue',
      ]);
      for (const c of cols) {
        // Nullable with no default ⇒ the migration rewrote no row, and every
        // pre-existing record reads as active.
        expect(c.is_nullable, `${c.table_name} must be nullable`).toBe('YES');
        expect(c.column_default, `${c.table_name} must have no default`).toBeNull();
      }
    });

    it('left every existing record active', async () => {
      const archived = await prisma.discipline.count({ where: { archivedAt: { not: null } } });
      expect(archived, 'no record was archived by the migration itself').toBe(0);
    });
  });

  /* ── Service ─────────────────────────────────────────────────────── */

  describe('archive and reactivate', () => {
    it('archives and reactivates each of the five families', async () => {
      const hub = await newHub();
      const event = await newEvent();
      const { id: venueId } = await rodeo.createVenue(editor, { name: `Venue ${tag} ${rid()}` });
      venueIds.push(venueId);
      const { id: editionId } = await rodeo.createEdition(editor, { eventId: event.id, editionSlug: `ed-${rid()}`, label: 'L' });
      const { id: discId } = await rodeo.createDiscipline(editor, { name: `Disc ${tag} ${rid()}`, summary: 's' });

      const cases: [RodeoSvc.RodeoEntityKind, string][] = [
        ['hub', hub.id], ['event', event.id], ['edition', editionId],
        ['venue', venueId], ['discipline', discId],
      ];

      for (const [kind, id] of cases) {
        await rodeo.archiveEntity(editor, kind, id);
        const after = await readArchived(kind, id);
        expect(after, `${kind} must be archived`).not.toBeNull();

        await rodeo.reactivateEntity(editor, kind, id);
        expect(await readArchived(kind, id), `${kind} must be active again`).toBeNull();
      }
    });

    async function readArchived(kind: RodeoSvc.RodeoEntityKind, id: string): Promise<Date | null> {
      const sel = { where: { id }, select: { archivedAt: true } } as const;
      switch (kind) {
        case 'hub': return (await prisma.rodeoHub.findUniqueOrThrow(sel)).archivedAt;
        case 'event': return (await prisma.rodeoEvent.findUniqueOrThrow(sel)).archivedAt;
        case 'edition': return (await prisma.rodeoEventEdition.findUniqueOrThrow(sel)).archivedAt;
        case 'venue': return (await prisma.venue.findUniqueOrThrow(sel)).archivedAt;
        case 'discipline': return (await prisma.discipline.findUniqueOrThrow(sel)).archivedAt;
      }
    }

    it('is idempotent — re-archiving does not move the timestamp', async () => {
      // The timestamp records when the record left public view; silently
      // resetting it would misreport that.
      const hub = await newHub();
      await rodeo.archiveEntity(editor, 'hub', hub.id);
      const first = (await prisma.rodeoHub.findUniqueOrThrow({ where: { id: hub.id }, select: { archivedAt: true } })).archivedAt;
      await new Promise((r) => setTimeout(r, 25));
      await rodeo.archiveEntity(editor, 'hub', hub.id);
      const second = (await prisma.rodeoHub.findUniqueOrThrow({ where: { id: hub.id }, select: { archivedAt: true } })).archivedAt;
      expect(second?.getTime()).toBe(first?.getTime());
    });

    it('preserves every relationship across an archive/reactivate cycle', async () => {
      const event = await newEvent();
      const { id: editionId } = await rodeo.createEdition(editor, { eventId: event.id, editionSlug: `ed-${rid()}`, label: 'Keeps links' });

      await rodeo.archiveEntity(editor, 'event', event.id);
      expect(await prisma.rodeoEventEdition.count({ where: { eventId: event.id } }), 'children are untouched').toBe(1);
      const child = await prisma.rodeoEventEdition.findUniqueOrThrow({ where: { id: editionId }, select: { archivedAt: true, eventId: true } });
      expect(child.archivedAt, 'archiving a parent writes NOTHING to the child').toBeNull();
      expect(child.eventId).toBe(event.id);

      await rodeo.reactivateEntity(editor, 'event', event.id);
      expect(await prisma.rodeoEventEdition.count({ where: { eventId: event.id } })).toBe(1);
    });

    it('audits both directions', async () => {
      const hub = await newHub();
      await rodeo.archiveEntity(editor, 'hub', hub.id);
      await rodeo.reactivateEntity(editor, 'hub', hub.id);
      const logs = await prisma.auditLog.findMany({ where: { entityId: hub.id }, select: { action: true } });
      const actions = logs.map((l) => l.action);
      expect(actions).toContain('rodeo.hub.archive');
      expect(actions).toContain('rodeo.hub.reactivate');
    });

    it('requires rodeo.manage for both operations', async () => {
      const hub = await newHub();
      await expect(rodeo.archiveEntity(author, 'hub', hub.id)).rejects.toThrow(/not permitted/i);
      await expect(rodeo.reactivateEntity(author, 'hub', hub.id)).rejects.toThrow(/not permitted/i);
    });

    it('reports a missing record rather than silently succeeding', async () => {
      await expect(rodeo.archiveEntity(editor, 'hub', 'no-such-id')).rejects.toThrow(/not found/i);
    });
  });

  /* ── Public visibility ───────────────────────────────────────────── */

  describe('archived records leave every discovery surface', () => {
    it('an archived hub disappears from the public hub listing', async () => {
      const hub = await newHub();
      const { listPublicHubs } = await import('../lib/rodeoContent');

      expect((await listPublicHubs()).map((h) => h.slug), 'visible while active').toContain(hub.slug);
      await rodeo.archiveEntity(editor, 'hub', hub.id);
      expect((await listPublicHubs()).map((h) => h.slug), 'gone once archived').not.toContain(hub.slug);
      await rodeo.reactivateEntity(editor, 'hub', hub.id);
      expect((await listPublicHubs()).map((h) => h.slug), 'back on reactivate').toContain(hub.slug);
    });

    it('an archived event disappears from the public event listing', async () => {
      const event = await newEvent();
      const { listPublicEvents } = await import('../lib/rodeoContent');
      expect((await listPublicEvents()).map((e) => e.slug)).toContain(event.slug);
      await rodeo.archiveEntity(editor, 'event', event.id);
      expect((await listPublicEvents()).map((e) => e.slug)).not.toContain(event.slug);
    });

    it('an archived record leaves generateStaticParams', async () => {
      const hub = await newHub();
      const { getAllRodeoSlugs } = await import('../lib/rodeoContent');
      expect((await getAllRodeoSlugs()).hubs).toContain(hub.slug);
      await rodeo.archiveEntity(editor, 'hub', hub.id);
      expect((await getAllRodeoSlugs()).hubs).not.toContain(hub.slug);
    });

    it('an archived record leaves the sitemap', async () => {
      const event = await newEvent();
      const { buildSitemapEntries } = await import('../lib/seo/sitemapEntries');
      const has = async () => (await buildSitemapEntries()).some((e) => e.url.includes(`/${event.slug}/`));
      expect(await has(), 'in the sitemap while active').toBe(true);
      await rodeo.archiveEntity(editor, 'event', event.id);
      expect(await has(), 'out of the sitemap once archived').toBe(false);
    });

    it('an archived record is not findable by search', async () => {
      const event = await newEvent();
      const { runPublicSearch } = await import('../lib/search/publicSearch');
      /**
       * Asserted on the RESULT ROWS, never on the serialised response.
       *
       * The first version of this test stringified the whole response and
       * searched for the slug — which matched the echoed `query` and
       * `normalizedQuery` fields, i.e. the very text the test had just passed
       * in. It reported a leak that did not exist.
       */
      const found = async () => {
        const r = await runPublicSearch({ q: event.slug });
        return r.rodeo.some((row) => row.url.includes(`/${event.slug}/`));
      };
      expect(await found(), 'findable while active').toBe(true);
      await rodeo.archiveEntity(editor, 'event', event.id);
      expect(await found(), 'search must not surface an archived record').toBe(false);
    });

    it('an archived EDITION leaves listings on its own, not only via its parent', async () => {
      /**
       * Mutation testing found this gap: every edition test archived the parent
       * event, so dropping the edition's OWN archive filter from
       * `publicEditionWhere` changed nothing that was asserted. An edition must
       * disappear when archived directly, with its event left active.
       */
      const event = await newEvent();
      const editionSlug = `ed-${rid()}`;
      const { id: editionId } = await rodeo.createEdition(editor, { eventId: event.id, editionSlug, label: 'Solo' });
      const { getAllRodeoSlugs } = await import('../lib/rodeoContent');

      const listed = async () => (await getAllRodeoSlugs()).editions.some(
        (e) => e.eventSlug === event.slug && e.editionSlug === editionSlug);
      expect(await listed(), 'listed while active').toBe(true);

      await rodeo.archiveEntity(editor, 'edition', editionId);
      expect(await listed(), 'gone once the EDITION itself is archived').toBe(false);

      // The parent is untouched and still listed.
      const parentArchived = (await prisma.rodeoEvent.findUniqueOrThrow({ where: { id: event.id }, select: { archivedAt: true } })).archivedAt;
      expect(parentArchived, 'archiving a child must not touch the parent').toBeNull();
    });

    it('an archived discipline leaves the discipline listing', async () => {
      const { id } = await rodeo.createDiscipline(editor, { name: `Disc ${tag} ${rid()}`, summary: 's' });
      const { getAllDisciplines } = await import('../lib/content');
      const slug = (await prisma.discipline.findUniqueOrThrow({ where: { id }, select: { slug: true } })).slug;

      expect((await getAllDisciplines()).map((d) => d.slug)).toContain(slug);
      await rodeo.archiveEntity(editor, 'discipline', id);
      expect((await getAllDisciplines()).map((d) => d.slug)).not.toContain(slug);
    });
  });

  /* ── 200 + noindex, not 404 ──────────────────────────────────────── */

  describe('an archived detail page stays reachable but is noindex', () => {
    it('the hub detail record still resolves, and reports itself archived', async () => {
      const hub = await newHub();
      const { getPublicHubBySlug } = await import('../lib/rodeoContent');
      await rodeo.archiveEntity(editor, 'hub', hub.id);

      const row = await getPublicHubBySlug(hub.slug);
      // NOT null — the page renders HTTP 200 rather than 404, so inbound links
      // and historical references keep working.
      expect(row, 'archived detail must still resolve').not.toBeNull();
      expect(row!.archived).toBe(true);
      expect(row!.indexable, 'archived is never indexable').toBe(false);
    });

    it('an archived discipline still resolves for its detail page', async () => {
      const { id } = await rodeo.createDiscipline(editor, { name: `Disc ${tag} ${rid()}`, summary: 's' });
      const slug = (await prisma.discipline.findUniqueOrThrow({ where: { id }, select: { slug: true } })).slug;
      await rodeo.archiveEntity(editor, 'discipline', id);

      const { getDisciplineBySlug } = await import('../lib/content');
      const d = await getDisciplineBySlug(slug);
      expect(d, 'still reachable at 200').not.toBeNull();
      expect(d!.archivedAt, 'and carries the archive state for noindex').not.toBeNull();
    });

    it('an edition inherits its parent event archive state', async () => {
      /**
       * The hierarchical rule: archiving an event hides its editions without
       * writing to them. Proven from the public read, which is what the route
       * uses to decide noindex.
       */
      const event = await newEvent();
      const editionSlug = `ed-${rid()}`;
      await rodeo.createEdition(editor, { eventId: event.id, editionSlug, label: 'Child' });
      const { getPublicEditionBySlug } = await import('../lib/rodeoContent');

      const before = await getPublicEditionBySlug(event.slug, editionSlug);
      expect(before!.archived).toBe(false);
      expect(before!.indexable).toBe(true);

      await rodeo.archiveEntity(editor, 'event', event.id);
      const after = await getPublicEditionBySlug(event.slug, editionSlug);
      expect(after, 'the edition page still resolves').not.toBeNull();
      expect(after!.archived, 'inherited from the parent').toBe(true);
      expect(after!.indexable, 'and therefore noindex').toBe(false);
    });
  });

  /* ── Archive is not unpublish ────────────────────────────────────── */

  describe('archive does not touch publication state', () => {
    it('writes only archivedAt and leaves every other column alone', async () => {
      const event = await newEvent();
      const before = await prisma.rodeoEvent.findUniqueOrThrow({ where: { id: event.id } });

      await rodeo.archiveEntity(editor, 'event', event.id);
      const after = await prisma.rodeoEvent.findUniqueOrThrow({ where: { id: event.id } });

      const { archivedAt: _a, ...restBefore } = before;
      const { archivedAt: _b, ...restAfter } = after;
      expect(restAfter, 'no other field may change').toEqual(restBefore);
      expect(after.archivedAt).not.toBeNull();
    });
  });
});

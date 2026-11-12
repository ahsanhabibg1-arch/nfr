import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as RodeoSvc from '../lib/cms/rodeoService';
import type * as SlugSvc from '../lib/cms/rodeoSlugs';

/**
 * Custom slug editing and permanent redirects.
 *
 * Changing a slug breaks a live public URL, so the redirect is not a nicety —
 * it is the thing that makes the feature safe to ship. These tests cover the
 * hygiene rules that are easy to get wrong and invisible when wrong: loops,
 * chains, reserved paths and cross-table collisions.
 */

let available = false;
let prisma: PrismaClient;
let rodeo: typeof RodeoSvc;
let slugs: typeof SlugSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    rodeo = await import('../lib/cms/rodeoService');
    slugs = await import('../lib/cms/rodeoSlugs');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = true;
  } catch {
    available = false;
  }
}

const tag = `rsr${Date.now().toString(36)}`;
const rid = () => Math.random().toString(36).slice(2, 8);

describe.runIf(available)('Rodeo slugs and redirects', () => {
  let editor: Actor;
  let author: Actor;
  const userIds: string[] = [];
  const hubIds: string[] = [];
  const eventIds: string[] = [];
  const paths: string[] = [];

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `${tag}-${roleKey}-${rid()}@example.com`, name: 'RSR', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  async function newHub(): Promise<{ id: string; slug: string }> {
    const { id } = await rodeo.createHub(editor, { title: `Hub ${tag} ${rid()}` });
    hubIds.push(id);
    const r = await prisma.rodeoHub.findUniqueOrThrow({ where: { id }, select: { slug: true } });
    paths.push(`/rodeo-events/${r.slug}/`);
    return { id, slug: r.slug };
  }

  beforeAll(async () => {
    editor = await makeUser('editor');
    author = await makeUser('author');
  });

  afterAll(async () => {
    // Redirects created by this suite, by either endpoint.
    await prisma.articleRedirect.deleteMany({ where: { OR: [{ sourcePath: { contains: tag } }, { targetPath: { contains: tag } }] } });
    await prisma.rodeoEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.rodeoHub.deleteMany({ where: { id: { in: hubIds } } });
    await prisma.discipline.deleteMany({ where: { slug: { contains: tag } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  /* ── Normalisation and validation ────────────────────────────────── */

  describe('slug normalisation', () => {
    it('lowercases, collapses separators and trims hyphens', () => {
      expect(slugs.normalizeSlug('  Bull   Riding!! ')).toBe('bull-riding');
      expect(slugs.normalizeSlug('Café / Niño')).toBe('caf-ni-o');
      expect(slugs.normalizeSlug('--already--slugged--')).toBe('already-slugged');
    });

    it('rejects an empty, overlong or malformed slug', () => {
      expect(() => slugs.validateSlugShape('')).toThrow(/cannot be empty/i);
      expect(() => slugs.validateSlugShape('a'.repeat(81))).toThrow(/at most 80/i);
      expect(() => slugs.validateSlugShape('Has Capitals')).toThrow(/lowercase/i);
      expect(() => slugs.validateSlugShape('double--hyphen')).toThrow(/lowercase/i);
      expect(() => slugs.validateSlugShape('-leading')).toThrow(/lowercase/i);
    });

    it('rejects a slug that would shadow a real route', () => {
      for (const reserved of ['admin', 'api', 'venues', 'disciplines', 'search', 'results', 'schedule']) {
        expect(() => slugs.validateSlugShape(reserved), `${reserved} must be reserved`).toThrow(/reserved path/i);
      }
    });
  });

  /* ── Changing a slug ─────────────────────────────────────────────── */

  describe('changing a slug', () => {
    it('renames the entity and leaves a 308 redirect from the old URL', async () => {
      const hub = await newHub();
      const next = `renamed-${tag}-${rid()}`;
      const r = await slugs.changeSlug(editor, 'hub', hub.id, next);

      expect(r.oldPath).toBe(`/rodeo-events/${hub.slug}/`);
      expect(r.newPath).toBe(`/rodeo-events/${next}/`);
      expect(r.redirectCreated).toBe(true);

      const row = await prisma.articleRedirect.findUniqueOrThrow({ where: { sourcePath: r.oldPath } });
      expect(row.targetPath).toBe(r.newPath);
      expect(row.statusCode, 'permanent').toBe(308);
      expect(row.status).toBe('ACTIVE');
    });

    it('the old URL resolves to the new one', async () => {
      const hub = await newHub();
      const next = `moved-${tag}-${rid()}`;
      await slugs.changeSlug(editor, 'hub', hub.id, next);

      const moved = await slugs.resolveRodeoRedirect(`/rodeo-events/${hub.slug}/`);
      expect(moved).not.toBeNull();
      expect(moved!.destination).toBe(`/rodeo-events/${next}/`);
      expect(moved!.permanent).toBe(true);
    });

    it('a title change still does NOT move the slug', async () => {
      // Name and slug are independently editable; renaming must not silently
      // change a published URL.
      const hub = await newHub();
      await rodeo.updateHub(editor, hub.id, { title: `Totally Different ${rid()}` });
      const after = await prisma.rodeoHub.findUniqueOrThrow({ where: { id: hub.id }, select: { slug: true } });
      expect(after.slug).toBe(hub.slug);
    });

    it('COLLAPSES a chain so a historical URL always reaches the destination in one hop', async () => {
      /**
       * Renaming twice would otherwise leave A→B and B→C, and a visitor on A
       * would need two hops (or hit a stale target if B is later reused).
       */
      const hub = await newHub();
      const second = `step2-${tag}-${rid()}`;
      const third = `step3-${tag}-${rid()}`;

      await slugs.changeSlug(editor, 'hub', hub.id, second);
      const r2 = await slugs.changeSlug(editor, 'hub', hub.id, third);
      expect(r2.chainsCollapsed, 'the first redirect was re-pointed').toBeGreaterThanOrEqual(1);

      const first = await slugs.resolveRodeoRedirect(`/rodeo-events/${hub.slug}/`);
      expect(first!.destination, 'original URL goes straight to the final slug').toBe(`/rodeo-events/${third}/`);

      const mid = await slugs.resolveRodeoRedirect(`/rodeo-events/${second}/`);
      expect(mid!.destination).toBe(`/rodeo-events/${third}/`);
    });

    it('creates NO loop when a slug is changed back to a previous value', async () => {
      const hub = await newHub();
      const other = `tmp-${tag}-${rid()}`;
      await slugs.changeSlug(editor, 'hub', hub.id, other);
      await slugs.changeSlug(editor, 'hub', hub.id, hub.slug); // back again

      /**
       * Asserted on the STORED ROW, not only on what the resolver returns.
       *
       * Mutation testing caught this: `resolveRodeoRedirect` has its own
       * self-redirect guard, so with the write-side loop guard removed a
       * self-referential row (A→A) was still stored but resolved to null, and a
       * resolver-only assertion passed. Two guards are good; a test that can
       * only see one of them is not.
       */
      const selfRow = await prisma.articleRedirect.findUnique({ where: { sourcePath: `/rodeo-events/${hub.slug}/` } });
      expect(selfRow, 'no redirect row may exist for the live URL').toBeNull();

      const atDest = await slugs.resolveRodeoRedirect(`/rodeo-events/${hub.slug}/`);
      expect(atDest, 'and the live URL must not redirect').toBeNull();

      const fromOther = await slugs.resolveRodeoRedirect(`/rodeo-events/${other}/`);
      expect(fromOther!.destination).toBe(`/rodeo-events/${hub.slug}/`);
    });

    it('refuses a slug already used by another hub OR event', async () => {
      const a = await newHub();
      const b = await newHub();
      await expect(slugs.changeSlug(editor, 'hub', b.id, a.slug)).rejects.toThrow(/already used by another rodeo hub or event/i);

      const { id: eventId } = await rodeo.createEvent(editor, { name: `Ev ${tag} ${rid()}` });
      eventIds.push(eventId);
      const ev = await prisma.rodeoEvent.findUniqueOrThrow({ where: { id: eventId }, select: { slug: true } });
      await expect(slugs.changeSlug(editor, 'hub', b.id, ev.slug)).rejects.toThrow(/already used by another rodeo hub or event/i);
    });

    it('refuses a reserved slug and writes nothing', async () => {
      const hub = await newHub();
      await expect(slugs.changeSlug(editor, 'hub', hub.id, 'admin')).rejects.toThrow(/reserved path/i);
      const after = await prisma.rodeoHub.findUniqueOrThrow({ where: { id: hub.id }, select: { slug: true } });
      expect(after.slug, 'unchanged').toBe(hub.slug);
    });

    it('requires rodeo.manage', async () => {
      const hub = await newHub();
      await expect(slugs.changeSlug(author, 'hub', hub.id, `nope-${rid()}`)).rejects.toThrow(/not permitted/i);
    });

    it('audits the change with both paths', async () => {
      const hub = await newHub();
      const next = `audited-${tag}-${rid()}`;
      await slugs.changeSlug(editor, 'hub', hub.id, next);
      const log = await prisma.auditLog.findFirst({ where: { action: 'rodeo.hub.slug_change', entityId: hub.id } });
      expect(log).not.toBeNull();
      expect(log!.detail).toContain(`/rodeo-events/${next}/`);
    });

    it('works for a discipline too, with its own namespace', async () => {
      const { id } = await rodeo.createDiscipline(editor, { name: `Disc ${tag} ${rid()}`, summary: 's' });
      const before = await prisma.discipline.findUniqueOrThrow({ where: { id }, select: { slug: true } });
      const next = `dnew-${tag}-${rid()}`;
      const r = await slugs.changeSlug(editor, 'discipline', id, next);
      expect(r.oldPath).toBe(`/disciplines/${before.slug}/`);
      expect(r.newPath).toBe(`/disciplines/${next}/`);
      const moved = await slugs.resolveRodeoRedirect(r.oldPath);
      expect(moved!.destination).toBe(r.newPath);
    });
  });

  /* ── Nested edition URLs ─────────────────────────────────────────── */

  describe('edition slugs and nested URLs', () => {
    async function newEventWithEdition(editionSlug: string) {
      const { id: eventId } = await rodeo.createEvent(editor, { name: `Ev ${tag} ${rid()}` });
      eventIds.push(eventId);
      const ev = await prisma.rodeoEvent.findUniqueOrThrow({ where: { id: eventId }, select: { slug: true } });
      const { id: editionId } = await rodeo.createEdition(editor, { eventId, editionSlug, label: 'Edition' });
      return { eventId, eventSlug: ev.slug, editionId };
    }

    it('changing an EDITION slug redirects the nested URL', async () => {
      const edSlug = `e1-${rid()}`;
      const { eventSlug, editionId } = await newEventWithEdition(edSlug);
      const next = `e2-${rid()}`;

      const r = await slugs.changeSlug(editor, 'edition', editionId, next);
      expect(r.oldPath).toBe(`/rodeo-events/${eventSlug}/${edSlug}/`);
      expect(r.newPath).toBe(`/rodeo-events/${eventSlug}/${next}/`);

      const moved = await slugs.resolveRodeoRedirect(r.oldPath);
      expect(moved!.destination).toBe(r.newPath);
      expect(moved!.permanent).toBe(true);
    });

    it('changing the PARENT EVENT slug redirects every nested edition URL', async () => {
      /**
       * The gap this round was called to close. Renaming an event moved only
       * its own path, so each `/rodeo-events/<old>/<edition>/` kept 404ing
       * while the operator was told the rename succeeded.
       */
      const a = `y1-${rid()}`;
      const b = `y2-${rid()}`;
      const { eventId, eventSlug } = await newEventWithEdition(a);
      await rodeo.createEdition(editor, { eventId, editionSlug: b, label: 'Second' });

      const next = `moved-${tag}-${rid()}`;
      const r = await slugs.changeSlug(editor, 'event', eventId, next);
      expect(r.nestedRedirects, 'both editions were redirected').toBe(2);

      for (const ed of [a, b]) {
        const moved = await slugs.resolveRodeoRedirect(`/rodeo-events/${eventSlug}/${ed}/`);
        expect(moved, `nested URL for ${ed} must redirect`).not.toBeNull();
        expect(moved!.destination).toBe(`/rodeo-events/${next}/${ed}/`);
        expect(moved!.permanent).toBe(true);
      }
    });

    it('renaming the parent TWICE collapses nested chains too', async () => {
      const edSlug = `z-${rid()}`;
      const { eventId, eventSlug } = await newEventWithEdition(edSlug);
      const mid = `mid-${tag}-${rid()}`;
      const fin = `fin-${tag}-${rid()}`;

      await slugs.changeSlug(editor, 'event', eventId, mid);
      await slugs.changeSlug(editor, 'event', eventId, fin);

      const fromOriginal = await slugs.resolveRodeoRedirect(`/rodeo-events/${eventSlug}/${edSlug}/`);
      expect(fromOriginal!.destination, 'one hop to the final nested URL').toBe(`/rodeo-events/${fin}/${edSlug}/`);
    });

    it('renaming BOTH parent and edition lands on the final nested URL', async () => {
      const edSlug = `w1-${rid()}`;
      const { eventId, eventSlug, editionId } = await newEventWithEdition(edSlug);
      const newEvent = `pe-${tag}-${rid()}`;
      const newEd = `w2-${rid()}`;

      await slugs.changeSlug(editor, 'event', eventId, newEvent);
      await slugs.changeSlug(editor, 'edition', editionId, newEd);

      const original = await slugs.resolveRodeoRedirect(`/rodeo-events/${eventSlug}/${edSlug}/`);
      expect(original!.destination, 'the very first URL still resolves in one hop')
        .toBe(`/rodeo-events/${newEvent}/${newEd}/`);
    });

    it('an edition slug cannot collide within its parent event', async () => {
      const taken = `dup-${rid()}`;
      const { eventId, editionId } = await newEventWithEdition(taken);
      const { id: other } = await rodeo.createEdition(editor, { eventId, editionSlug: `oth-${rid()}`, label: 'Other' });
      await expect(slugs.changeSlug(editor, 'edition', other, taken)).rejects.toThrow(/already has an edition with the slug/i);
      expect(editionId).toBeTruthy();
    });

    it('an edition slug cannot be a reserved sub-route', async () => {
      // `/rodeo-events/<event>/results/` is a real coverage route.
      const { editionId } = await newEventWithEdition(`r-${rid()}`);
      for (const reserved of ['results', 'schedule', 'standings']) {
        await expect(slugs.changeSlug(editor, 'edition', editionId, reserved)).rejects.toThrow(/reserved path/i);
      }
    });

    it('archiving does not break the redirect, and the target keeps 200 + noindex', async () => {
      const edSlug = `ar-${rid()}`;
      const { eventSlug, editionId } = await newEventWithEdition(edSlug);
      const next = `ar2-${rid()}`;
      await slugs.changeSlug(editor, 'edition', editionId, next);
      await rodeo.archiveEntity(editor, 'edition', editionId);

      const moved = await slugs.resolveRodeoRedirect(`/rodeo-events/${eventSlug}/${edSlug}/`);
      expect(moved!.destination, 'the redirect still points at the archived page').toBe(`/rodeo-events/${eventSlug}/${next}/`);

      const { getPublicEditionBySlug } = await import('../lib/rodeoContent');
      const row = await getPublicEditionBySlug(eventSlug, next);
      expect(row, 'and that page still resolves (200, not 404)').not.toBeNull();
      expect(row!.archived).toBe(true);
      expect(row!.indexable, 'as noindex').toBe(false);
    });

    it('every redirect path keeps the trailing slash convention', async () => {
      const edSlug = `ts-${rid()}`;
      const { editionId } = await newEventWithEdition(edSlug);
      const r = await slugs.changeSlug(editor, 'edition', editionId, `ts2-${rid()}`);
      expect(r.oldPath.endsWith('/')).toBe(true);
      expect(r.newPath.endsWith('/')).toBe(true);
    });
  });

  /* ── Seed durability ─────────────────────────────────────────────── */

  /**
   * SUPERSEDED AND MOVED — see `tests/rodeo-seed-tombstone.test.ts`.
   *
   * Two tests here asserted the empty-table gate: that the seed created
   * foundational disciplines only when none existed. That gate was the best
   * available without a schema change, and it has now been replaced by durable
   * `SeedTombstone` rows under owner Decision A, which handle the case it could
   * not — a deployment that deleted ALL seven.
   *
   * The assertions were not deleted to make this file pass; they were replaced
   * by a stronger suite that tests the behaviour rather than the source text.
   */

});

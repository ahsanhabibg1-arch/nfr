import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as RodeoSvc from '../lib/cms/rodeoService';
import type * as DepSvc from '../lib/cms/rodeoDependencies';

/**
 * Durable seed tombstones (owner Decision A).
 *
 * The thing under test is a DISTINCTION, not a feature: the seed must be able
 * to tell "this foundational record was never installed" from "an admin deleted
 * it on purpose". Two earlier attempts could not — the first recreated anything
 * missing, the second treated a fully-emptied table as a fresh install.
 *
 * The real seed is never executed here. It opens its own PrismaClient and
 * writes site-wide rows, so running it mid-suite would race every other DB
 * suite against the same database. Instead the seed's EXACT decision rule is
 * re-executed against real tombstone rows, and the seed source is asserted to
 * still contain that rule.
 */

let available = false;
let prisma: PrismaClient;
let rodeo: typeof RodeoSvc;
let deps: typeof DepSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    rodeo = await import('../lib/cms/rodeoService');
    deps = await import('../lib/cms/rodeoDependencies');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = true;
  } catch {
    available = false;
  }
}

const tag = `tmb${Date.now().toString(36)}`;
const rid = () => Math.random().toString(36).slice(2, 8);

describe.runIf(available)('Seed tombstones', () => {
  let editor: Actor;
  const userIds: string[] = [];
  const tombstoneKeys: string[] = [];

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `${tag}-${roleKey}-${rid()}@example.com`, name: 'TMB', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  /**
   * The seed's decision rule, re-executed verbatim: for each foundational
   * record, skip it when a tombstone exists, otherwise upsert-by-id.
   * Returns which ids the seed WOULD create.
   */
  async function seedWouldCreate(foundationalIds: string[]): Promise<string[]> {
    const tombstoned = new Set(
      (await prisma.seedTombstone.findMany({ where: { kind: 'discipline' }, select: { key: true } }))
        .map((t) => t.key),
    );
    const out: string[] = [];
    for (const id of foundationalIds) {
      if (tombstoned.has(id)) continue;
      const existing = await prisma.discipline.findUnique({ where: { id }, select: { id: true } });
      if (!existing) out.push(id);
    }
    return out;
  }

  beforeAll(async () => {
    editor = await makeUser('editor');
  });

  afterAll(async () => {
    await prisma.seedTombstone.deleteMany({ where: { key: { in: tombstoneKeys } } });
    await prisma.discipline.deleteMany({ where: { slug: { contains: tag } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  /* ── Migration shape ─────────────────────────────────────────────── */

  it('the approved migration created the tombstone table with a unique identity', async () => {
    const cols = await prisma.$queryRaw<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'SeedTombstone' ORDER BY column_name`;
    expect(cols.map((c) => c.column_name)).toEqual(['deletedAt', 'id', 'key', 'kind']);

    const idx = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'SeedTombstone'`;
    const unique = idx.map((i) => i.indexdef).join(' ');
    expect(unique, '(kind, key) must be unique').toMatch(/UNIQUE INDEX .*kind.*key/);
  });

  it('refuses a duplicate tombstone for the same logical record', async () => {
    const key = `disc-${tag}-dup`;
    tombstoneKeys.push(key);
    await prisma.seedTombstone.create({ data: { kind: 'discipline', key } });
    await expect(prisma.seedTombstone.create({ data: { kind: 'discipline', key } })).rejects.toThrow();
    expect(await prisma.seedTombstone.count({ where: { kind: 'discipline', key } })).toBe(1);
  });

  /* ── The decision rule ───────────────────────────────────────────── */

  describe('what the seed would do', () => {
    it('FRESH INSTALL: creates every foundational record', async () => {
      const ids = [`disc-${tag}-a`, `disc-${tag}-b`, `disc-${tag}-c`];
      expect(await seedWouldCreate(ids)).toEqual(ids);
    });

    it('REPEATED RUN: creates nothing once the records exist', async () => {
      const id = `disc-${tag}-${rid()}`;
      await prisma.discipline.create({ data: { id, slug: id.replace('disc-', ''), name: 'Existing', summary: 's' } });
      expect(await seedWouldCreate([id]), 'idempotent').toEqual([]);
      await prisma.discipline.delete({ where: { id } });
    });

    it('does not overwrite an admin-customised foundational record', async () => {
      // `update: {}` on the upsert: the seed may create, never modify.
      const seed = await readSeed();
      expect(seed).toContain('update: {},');
      expect(seed, 'the upsert is still keyed on the stable id').toContain('where: { id },');
    });

    it('DELETED ONE: that record is not recreated, the others still are', async () => {
      const kept = `disc-${tag}-kept-${rid()}`;
      const gone = `disc-${tag}-gone-${rid()}`;
      tombstoneKeys.push(gone);
      await prisma.seedTombstone.create({ data: { kind: 'discipline', key: gone } });

      const would = await seedWouldCreate([kept, gone]);
      expect(would).toContain(kept);
      expect(would, 'a tombstoned record is never recreated').not.toContain(gone);
    });

    it('DELETED ALL: an emptied set still does not come back', async () => {
      /**
       * The exact case the previous empty-table gate could not handle: with
       * every foundational record deleted, the database looks like a fresh
       * install. Tombstones are what make the two distinguishable.
       */
      const all = [`disc-${tag}-x1`, `disc-${tag}-x2`, `disc-${tag}-x3`];
      for (const key of all) {
        tombstoneKeys.push(key);
        await prisma.seedTombstone.create({ data: { kind: 'discipline', key } });
      }
      expect(await seedWouldCreate(all), 'nothing is resurrected').toEqual([]);
    });

    it('preserves custom disciplines, which it never touches', async () => {
      const { id } = await rodeo.createDiscipline(editor, { name: `Custom ${tag} ${rid()}`, summary: 's' });
      // The seed only ever considers its own foundational ids.
      expect(await seedWouldCreate([`disc-${tag}-unrelated`])).toEqual([`disc-${tag}-unrelated`]);
      expect(await prisma.discipline.count({ where: { id } }), 'the custom record is untouched').toBe(1);
      await prisma.discipline.delete({ where: { id } });
    });

    it('a RENAMED foundational record is still recognised', async () => {
      /**
       * §4's identity requirement. Slugs became editable in this workstream;
       * the seed's identity is the immutable primary key, so renaming cannot
       * cause a duplicate to be seeded alongside the renamed record.
       */
      const slugs = await import('../lib/cms/rodeoSlugs');
      const { id } = await rodeo.createDiscipline(editor, { name: `Rename ${tag} ${rid()}`, summary: 's' });
      const before = await prisma.discipline.findUniqueOrThrow({ where: { id }, select: { id: true, slug: true } });

      await slugs.changeSlug(editor, 'discipline', id, `renamed-${tag}-${rid()}`);
      const after = await prisma.discipline.findUniqueOrThrow({ where: { id }, select: { id: true, slug: true } });

      expect(after.slug, 'the slug moved').not.toBe(before.slug);
      expect(after.id, 'the identity did not').toBe(before.id);
      expect(await seedWouldCreate([id]), 'so the seed still sees it as present').toEqual([]);

      await prisma.articleRedirect.deleteMany({ where: { OR: [{ sourcePath: { contains: tag } }, { targetPath: { contains: tag } }] } });
      await prisma.discipline.delete({ where: { id } });
    });
  });

  /* ── Tombstones are written by deletion, and only by deletion ────── */

  describe('tombstone lifecycle', () => {
    it('a successful delete writes a tombstone atomically', async () => {
      const { id } = await rodeo.createDiscipline(editor, { name: `Del ${tag} ${rid()}`, summary: 's' });
      tombstoneKeys.push(id);
      await rodeo.deleteDiscipline(editor, id);

      expect(await prisma.discipline.count({ where: { id } })).toBe(0);
      const t = await prisma.seedTombstone.findUnique({ where: { kind_key: { kind: 'discipline', key: id } } });
      expect(t, 'the deletion is recorded').not.toBeNull();
    });

    it('the permanent-delete path tombstones too', async () => {
      const { id } = await rodeo.createDiscipline(editor, { name: `Perm ${tag} ${rid()}`, summary: 's' });
      tombstoneKeys.push(id);
      await deps.permanentDeleteEntity(editor, 'discipline', id);

      expect(await prisma.discipline.count({ where: { id } })).toBe(0);
      expect(await prisma.seedTombstone.findUnique({ where: { kind_key: { kind: 'discipline', key: id } } })).not.toBeNull();
    });

    it('a FAILED delete writes no tombstone', async () => {
      /**
       * If a refused delete left a tombstone, a record that still exists would
       * be excluded from future seeding — a silent, permanent divergence.
       */
      const { id } = await rodeo.createDiscipline(editor, { name: `Fail ${tag} ${rid()}`, summary: 's' });
      const competitor = await prisma.competitor.create({ data: { slug: `${tag}-c-${rid()}`, fullName: 'C' } });
      await prisma.competitorDiscipline.create({ data: { competitorId: competitor.id, disciplineId: id } });

      await expect(rodeo.deleteDiscipline(editor, id)).rejects.toThrow(/competitor profile/i);

      expect(await prisma.discipline.count({ where: { id } }), 'still exists').toBe(1);
      expect(
        await prisma.seedTombstone.findUnique({ where: { kind_key: { kind: 'discipline', key: id } } }),
        'and carries no tombstone',
      ).toBeNull();

      await prisma.competitorDiscipline.deleteMany({ where: { disciplineId: id } });
      await prisma.competitor.delete({ where: { id: competitor.id } });
      await prisma.discipline.delete({ where: { id } });
    });

    it('ARCHIVE does not tombstone, and REACTIVATE does not touch tombstones', async () => {
      // Archive is reversible and is not a deletion; conflating them would make
      // an archived record un-seedable forever.
      const { id } = await rodeo.createDiscipline(editor, { name: `Arch ${tag} ${rid()}`, summary: 's' });

      await rodeo.archiveEntity(editor, 'discipline', id);
      expect(await prisma.seedTombstone.findUnique({ where: { kind_key: { kind: 'discipline', key: id } } })).toBeNull();

      await rodeo.reactivateEntity(editor, 'discipline', id);
      expect(await prisma.seedTombstone.findUnique({ where: { kind_key: { kind: 'discipline', key: id } } })).toBeNull();

      await prisma.discipline.delete({ where: { id } });
      tombstoneKeys.push(id);
    });

    it('re-deleting the same logical id does not duplicate the tombstone', async () => {
      const key = `disc-${tag}-re-${rid()}`;
      tombstoneKeys.push(key);
      for (let i = 0; i < 2; i++) {
        await prisma.seedTombstone.upsert({
          where: { kind_key: { kind: 'discipline', key } },
          update: {},
          create: { kind: 'discipline', key },
        });
      }
      expect(await prisma.seedTombstone.count({ where: { kind: 'discipline', key } })).toBe(1);
    });
  });

  /* ── The seed source still implements the rule ───────────────────── */

  it('the seed consults tombstones and no longer gates on an empty table', async () => {
    const seed = await readSeed();
    expect(seed).toContain("prisma.seedTombstone.findMany({ where: { kind: 'discipline' }");
    expect(seed).toContain('if (tombstoned.has(id))');
    expect(seed, 'the superseded empty-table gate is gone')
      .not.toContain('const existingDisciplines = await prisma.discipline.count();');
    expect(seed, 'and the seed still never deletes anything')
      .not.toMatch(/prisma\.discipline\.delete|prisma\.discipline\.deleteMany/);
  });

  async function readSeed(): Promise<string> {
    const fs = await import('node:fs');
    const path = await import('node:path');
    return fs.readFileSync(path.join(__dirname, '..', 'prisma', 'seed.ts'), 'utf8');
  }
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrismaClient } from '@prisma/client';

/**
 * Batch 05 — managed Discipline Classification, behavioural tests.
 *
 * Every test here exercises the real service against the isolated test
 * database, or renders the real public component. The point of the batch is
 * that a classification can be renamed WITHOUT orphaning the disciplines that
 * use it, so the rename test is the centre of the file.
 *
 * DB-gated in the project's usual way: without an isolated test database the
 * suite self-skips rather than touching development data.
 */

const dbUrl = process.env.DATABASE_URL ?? '';
const suite = dbUrl ? describe : describe.skip;

/**
 * Actors must be REAL users: the rodeo write path writes an `AuditLog` row, and
 * `AuditLog.actorId` is a foreign key, so a synthetic id fails the insert.
 */
let SUPER: import('../lib/cms/guard').Actor;
const READER = { id: 'test-reader-no-write', roles: ['reader'] } as never;

let svc: typeof import('../lib/cms/disciplineClassificationService');
let boot: typeof import('../lib/cms/disciplineClassificationBootstrap');
let prisma: PrismaClient;

/** Rows this file creates, removed afterwards so the suite leaves no residue. */
const madeClassifications: string[] = [];
const madeDisciplines: string[] = [];
const madeUsers: string[] = [];

beforeAll(async () => {
  if (!dbUrl) return;
  svc = await import('../lib/cms/disciplineClassificationService');
  boot = await import('../lib/cms/disciplineClassificationBootstrap');
  prisma = new PrismaClient();

  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
  const u = await prisma.user.create({
    data: { email: `b05-super-${Math.random().toString(36).slice(2, 8)}@example.com`, name: 'B05 Super', status: 'ACTIVE' },
  });
  await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
  madeUsers.push(u.id);
  SUPER = { id: u.id, roles: ['super_admin'] };
});

/**
 * Teardown, made failure-tolerant deliberately.
 *
 * THE BUG THIS FIXES. The first version awaited each delete in a bare loop. One
 * delete threw, the rest of the teardown was skipped, and the suite left two
 * disciplines and three classifications behind in the shared test database.
 * That residue was not harmless: the Competition filter renders one button per
 * classification with eligible disciplines, so the extra rows widened the row
 * and broke two UNRELATED Playwright tests — `navbar` and the hero — which
 * assert no horizontal overflow at 320px and 390px. A leaked fixture became a
 * layout failure somewhere else entirely.
 *
 * Each step is therefore isolated: a failure is reported and the remaining
 * steps still run, and the audit rows a discipline write produces are removed
 * before the rows they refer to.
 */
afterAll(async () => {
  if (!dbUrl) return;
  const problems: string[] = [];
  const attempt = async (what: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { problems.push(`${what}: ${(e as Error).message.split('\n')[0]}`); }
  };

  await attempt('audit rows for created disciplines', () =>
    prisma.auditLog.deleteMany({ where: { entityId: { in: madeDisciplines } } }));
  // Disciplines before classifications: the FK is RESTRICT, so a referenced
  // classification cannot be deleted — which is itself behaviour under test.
  for (const id of madeDisciplines) {
    await attempt(`discipline ${id}`, () => prisma.discipline.deleteMany({ where: { id } }));
  }
  for (const id of madeClassifications) {
    await attempt(`classification ${id}`, () => prisma.disciplineClassification.deleteMany({ where: { id } }));
  }
  await attempt('audit rows for test users', () => prisma.auditLog.deleteMany({ where: { actorId: { in: madeUsers } } }));
  await attempt('user roles', () => prisma.userRole.deleteMany({ where: { userId: { in: madeUsers } } }));
  await attempt('users', () => prisma.user.deleteMany({ where: { id: { in: madeUsers } } }));

  // Prove the database was left as it was found, and say so loudly if not:
  // silent residue is what caused the original failure.
  const [discLeft, clsLeft] = await Promise.all([
    prisma.discipline.count({ where: { id: { in: madeDisciplines } } }),
    prisma.disciplineClassification.count({ where: { id: { in: madeClassifications } } }),
  ]);
  await prisma.$disconnect();

  if (problems.length || discLeft || clsLeft) {
    throw new Error(
      `teardown left residue in the test database — ${discLeft} discipline(s), ${clsLeft} classification(s).\n` +
      problems.map((p) => `  - ${p}`).join('\n'),
    );
  }
});

const uniq = () => Math.random().toString(36).slice(2, 8);

async function makeClassification(name: string) {
  const r = await svc.createClassification(SUPER, { name });
  madeClassifications.push(r.id);
  return r.id;
}

// ---------------------------------------------------------------------------
// CRUD, identifiers, duplicates (§8.1-6)
// ---------------------------------------------------------------------------

suite('classification CRUD', () => {
  it('creates a classification with an immutable identity and a derived slug', async () => {
    const name = `Chute Event ${uniq()}`;
    const id = await makeClassification(name);
    const row = await prisma.disciplineClassification.findUniqueOrThrow({ where: { id } });
    expect(row.name).toBe(name);
    expect(row.value).toBe(name);                        // identity defaults to the name
    expect(row.slug).toBe(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    expect(row.active).toBe(true);
  });

  it('RENAMING does not orphan disciplines — the whole point of the batch', async () => {
    const id = await makeClassification(`Renamable ${uniq()}`);
    const before = await prisma.disciplineClassification.findUniqueOrThrow({ where: { id }, select: { value: true } });

    const dSlug = `test-disc-${uniq()}`;
    const d = await prisma.discipline.create({
      data: { id: dSlug, slug: dSlug, name: 'Test Discipline', summary: 'x', classificationId: id },
      select: { id: true },
    });
    madeDisciplines.push(d.id);

    const newName = `Renamed ${uniq()}`;
    await svc.updateClassification(SUPER, id, { name: newName });

    const after = await prisma.disciplineClassification.findUniqueOrThrow({ where: { id } });
    const stillLinked = await prisma.discipline.findUniqueOrThrow({
      where: { id: d.id },
      select: { classificationId: true, classification: { select: { name: true } } },
    });

    expect(after.name).toBe(newName);
    // The identity did NOT change, which is what keeps the reference valid...
    expect(after.value).toBe(before.value);
    // ...and the discipline still resolves, now reading the NEW name.
    expect(stillLinked.classificationId).toBe(id);
    expect(stillLinked.classification?.name).toBe(newName);
  });

  it('refuses a duplicate name, and a name differing only by case', async () => {
    const name = `Dupe ${uniq()}`;
    await makeClassification(name);
    /**
     * Both are refused, with different sentences, because the identity check
     * runs first: an exact repeat collides on `value` ("already uses this
     * identity") and a case variant collides there too, which is the stricter
     * and more useful message. Asserted loosely enough to allow either wording
     * while still requiring a refusal.
     */
    await expect(svc.createClassification(SUPER, { name })).rejects.toThrow(/already (exists|uses this identity)/i);
    await expect(svc.createClassification(SUPER, { name: name.toUpperCase() })).rejects.toThrow(/already/i);
  });

  it('refuses a rename onto another classification\'s name', async () => {
    const a = `Alpha ${uniq()}`;
    const b = `Beta ${uniq()}`;
    await makeClassification(a);
    const idB = await makeClassification(b);
    await expect(svc.updateClassification(SUPER, idB, { name: a })).rejects.toThrow(/already exists/i);
  });

  it('refuses a name that produces no usable slug', async () => {
    await expect(svc.createClassification(SUPER, { name: '!!!' })).rejects.toThrow(/letter or number/i);
  });

  it('deactivates without touching the disciplines that use it', async () => {
    const id = await makeClassification(`Deactivated ${uniq()}`);
    const dSlug = `test-disc-${uniq()}`;
    const d = await prisma.discipline.create({
      data: { id: dSlug, slug: dSlug, name: 'Still Classified', summary: 'x', classificationId: id },
      select: { id: true },
    });
    madeDisciplines.push(d.id);

    await svc.setClassificationActive(SUPER, id, false);

    const row = await prisma.disciplineClassification.findUniqueOrThrow({ where: { id } });
    const disc = await prisma.discipline.findUniqueOrThrow({ where: { id: d.id }, select: { classificationId: true } });
    expect(row.active).toBe(false);
    expect(disc.classificationId).toBe(id);     // assignment preserved
  });

  it('reorders by sending the whole order', async () => {
    const a = await makeClassification(`Order A ${uniq()}`);
    const b = await makeClassification(`Order B ${uniq()}`);
    await svc.reorderClassifications(SUPER, [b, a]);
    const rows = await prisma.disciplineClassification.findMany({ where: { id: { in: [a, b] } }, select: { id: true, sortOrder: true } });
    const order = new Map(rows.map((r) => [r.id, r.sortOrder]));
    expect(order.get(b)!).toBeLessThan(order.get(a)!);
  });
});

// ---------------------------------------------------------------------------
// Deletion protection (§8.6)
// ---------------------------------------------------------------------------

suite('deletion protection', () => {
  it('deletes an unused classification', async () => {
    const id = await makeClassification(`Unused ${uniq()}`);
    await svc.deleteClassification(SUPER, id);
    expect(await prisma.disciplineClassification.findUnique({ where: { id } })).toBeNull();
  });

  it('REFUSES to delete one a discipline still references, and says what to do', async () => {
    const id = await makeClassification(`Referenced ${uniq()}`);
    const dSlug = `test-disc-${uniq()}`;
    const d = await prisma.discipline.create({
      data: { id: dSlug, slug: dSlug, name: 'Blocker', summary: 'x', classificationId: id },
      select: { id: true },
    });
    madeDisciplines.push(d.id);

    await expect(svc.deleteClassification(SUPER, id)).rejects.toThrow(/Cannot delete.*Deactivate/is);
    // Still there, and the discipline is untouched.
    expect(await prisma.disciplineClassification.findUnique({ where: { id } })).not.toBeNull();
  });

  it('the DATABASE refuses it too, not just the service', async () => {
    /**
     * The service guard can be bypassed (a script, a console, a future code
     * path). `ON DELETE RESTRICT` is the guard that cannot be forgotten, so it
     * is asserted directly rather than trusted.
     */
    const id = await makeClassification(`FkGuarded ${uniq()}`);
    const dSlug = `test-disc-${uniq()}`;
    const d = await prisma.discipline.create({
      data: { id: dSlug, slug: dSlug, name: 'FK Blocker', summary: 'x', classificationId: id },
      select: { id: true },
    });
    madeDisciplines.push(d.id);

    await expect(prisma.disciplineClassification.delete({ where: { id } })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// RBAC (§8.7)
// ---------------------------------------------------------------------------

suite('RBAC', () => {
  it('every write refuses an actor without rodeo.manage', async () => {
    const id = await makeClassification(`Rbac ${uniq()}`);
    await expect(svc.createClassification(READER, { name: `Nope ${uniq()}` })).rejects.toThrow(/permitted/i);
    await expect(svc.updateClassification(READER, id, { name: 'Nope' })).rejects.toThrow(/permitted/i);
    await expect(svc.setClassificationActive(READER, id, false)).rejects.toThrow(/permitted/i);
    await expect(svc.reorderClassifications(READER, [id])).rejects.toThrow(/permitted/i);
    await expect(svc.deleteClassification(READER, id)).rejects.toThrow(/permitted/i);
    await expect(svc.listClassifications(READER)).rejects.toThrow(/permitted/i);
  });
});

// ---------------------------------------------------------------------------
// Invalid references and the assignable list (§8.8-11)
// ---------------------------------------------------------------------------

suite('assignment', () => {
  it('a discipline cannot be created against a classification id that does not exist', async () => {
    const rodeo = await import('../lib/cms/rodeoService');
    await expect(
      rodeo.createDiscipline(SUPER, {
        name: `Bad Ref ${uniq()}`,
        summary: 'x',
        classificationId: 'not-a-real-id',
      }),
    ).rejects.toThrow(/no longer exists|not available/i);
  });

  it('assigning by id ALSO mirrors the legacy text, so the fallback cannot lie', async () => {
    const rodeo = await import('../lib/cms/rodeoService');
    const id = await makeClassification(`Mirrored ${uniq()}`);
    const r = await rodeo.createDiscipline(SUPER, { name: `Mirror Disc ${uniq()}`, summary: 'x', classificationId: id });
    madeDisciplines.push(r.id);

    const row = await prisma.discipline.findUniqueOrThrow({
      where: { id: r.id },
      select: { classificationId: true, category: true },
    });
    const cls = await prisma.disciplineClassification.findUniqueOrThrow({ where: { id }, select: { value: true } });
    expect(row.classificationId).toBe(id);
    expect(row.category).toBe(cls.value);
  });

  it('the assignable list excludes inactive rows, but keeps the one being edited', async () => {
    const id = await makeClassification(`Hidden ${uniq()}`);
    await svc.setClassificationActive(SUPER, id, false);

    const withoutContext = await svc.listAssignableClassifications();
    expect(withoutContext.map((c) => c.id)).not.toContain(id);

    // This is what stops an edit form silently clearing a real assignment.
    const withContext = await svc.listAssignableClassifications(id);
    expect(withContext.map((c) => c.id)).toContain(id);
  });

  it('clearing a classification is possible and leaves no dangling reference', async () => {
    const rodeo = await import('../lib/cms/rodeoService');
    const id = await makeClassification(`Clearable ${uniq()}`);
    const r = await rodeo.createDiscipline(SUPER, { name: `Clearable Disc ${uniq()}`, summary: 'x', classificationId: id });
    madeDisciplines.push(r.id);

    await rodeo.updateDiscipline(SUPER, r.id, { summary: 'x', classificationId: null });
    const row = await prisma.discipline.findUniqueOrThrow({
      where: { id: r.id },
      select: { classificationId: true, category: true },
    });
    expect(row.classificationId).toBeNull();
    expect(row.category).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bootstrap / backfill (§8.17)
// ---------------------------------------------------------------------------

suite('bootstrap idempotency and data preservation', () => {
  it('a second run creates nothing and reassigns nothing', async () => {
    const first = await boot.bootstrapDisciplineClassifications(prisma, { apply: true });
    const second = await boot.bootstrapDisciplineClassifications(prisma, { apply: true });
    expect(second.created).toEqual([]);
    expect(second.attached).toBe(0);
    expect(second.alreadyAttached).toBeGreaterThanOrEqual(first.attached);
  });

  it('a DRY RUN predicts the same attachment the apply performs, and writes nothing', async () => {
    /**
     * The regression this prevents: the dry run originally looked up only rows
     * that already existed, so before the first apply it reported every
     * discipline as UNMATCHED — predicting the opposite of what applying did.
     */
    const before = await prisma.disciplineClassification.count();
    const dry = await boot.bootstrapDisciplineClassifications(prisma, { apply: false });
    expect(await prisma.disciplineClassification.count()).toBe(before);
    expect(dry.unmatched).toEqual([]);
  });

  it('never writes the legacy category column', async () => {
    const snapshot = await prisma.discipline.findMany({ select: { id: true, category: true }, orderBy: { id: 'asc' } });
    await boot.bootstrapDisciplineClassifications(prisma, { apply: true });
    const after = await prisma.discipline.findMany({ select: { id: true, category: true }, orderBy: { id: 'asc' } });
    expect(after).toEqual(snapshot);
  });

  it('reports a registry with every compatibility value as complete', async () => {
    await boot.bootstrapDisciplineClassifications(prisma, { apply: true });
    const v = await boot.verifyClassificationRegistry(prisma);
    expect(v.missing).toEqual([]);
    expect(v.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Public Competition filter (§8.12-13)
// ---------------------------------------------------------------------------

describe('the public Competition filter is dynamic', () => {
  const render = (disciplines: unknown[]) =>
    import('../components/sections/CompetitionSection').then(({ CompetitionSection }) =>
      renderToStaticMarkup(
        React.createElement(CompetitionSection, {
          disciplines: disciplines as never,
          onSelectDiscipline: () => {},
        }),
      ),
    );

  const disc = (id: string, cls: { id: string; name: string; pluralName: string } | null, legacy = 'Roughstock') => ({
    id, slug: id, name: id.toUpperCase(), category: legacy, classification: cls,
  });

  it('offers an administrator-created classification as a filter button', async () => {
    const html = await render([
      disc('a', { id: 'c1', name: 'Roughstock', pluralName: 'Roughstock' }),
      disc('b', { id: 'c2', name: 'Timed Event', pluralName: 'Timed Events' }),
      disc('c', { id: 'c3', name: 'Freestyle Reining', pluralName: 'Freestyle Reining' }),
    ]);
    expect(html).toContain('Freestyle Reining (1)');
    expect(html).toContain('Roughstock (1)');
    expect(html).toContain('Timed Events (1)');
    expect(html).toContain('All 3 Events');
  });

  it('a classification with no eligible disciplines produces NO button', async () => {
    const html = await render([disc('a', { id: 'c1', name: 'Roughstock', pluralName: 'Roughstock' })]);
    expect(html).toContain('Roughstock (1)');
    expect(html).not.toContain('Timed Events');
  });

  it('a RENAME changes the button text and breaks no grouping', async () => {
    // Same stable id, new display name: the filter follows the name.
    const html = await render([
      disc('a', { id: 'c2', name: 'Against the Clock', pluralName: 'Against the Clock' }),
      disc('b', { id: 'c2', name: 'Against the Clock', pluralName: 'Against the Clock' }),
    ]);
    expect(html).toContain('Against the Clock (2)');
    expect(html).not.toContain('Timed Events');
  });

  it('falls back to the legacy text when no managed classification is present', async () => {
    const html = await render([disc('a', null, 'Timed Event'), disc('b', null, 'Roughstock')]);
    expect(html).toContain('Timed Events (1)');
    expect(html).toContain('Roughstock (1)');
  });

  it('still shows no editorial section names', async () => {
    const html = await render([disc('a', { id: 'c1', name: 'Roughstock', pluralName: 'Roughstock' })]);
    expect(html).not.toContain('NFR Competition');
    expect(html).not.toContain('More Rodeo');
  });
});

// ---------------------------------------------------------------------------
// Editorial Category independence (§8.14)
// ---------------------------------------------------------------------------

suite('Editorial Category independence', () => {
  it('Discipline carries no relation to Category, and classifications are not sections', async () => {
    const schema = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    );
    const model = schema.slice(schema.indexOf('model Discipline {'));
    const body = model.slice(0, model.indexOf('\n}'));
    expect(body).not.toMatch(/\bCategory\b/);

    const { PRIMARY_SECTIONS } = await import('../config/routes');
    const sectionNames = Object.values(PRIMARY_SECTIONS).map((s) => (s as { categoryKey?: string }).categoryKey);
    const cls = await prisma.disciplineClassification.findMany({ select: { name: true } });
    for (const c of cls) expect(sectionNames).not.toContain(c.name);
  });
});

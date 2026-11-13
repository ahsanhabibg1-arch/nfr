import 'server-only';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { Actor } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { classificationSlug } from '../content/disciplineClassifications';
import { bootstrapDisciplineClassifications as runBootstrap } from './disciplineClassificationBootstrap';
import type { ClassificationBootstrapReport as BootstrapReport } from './disciplineClassificationBootstrap';

/**
 * Managed Discipline Classification — the service layer (Batch 05).
 *
 * Owns every write to `DisciplineClassification` and every read the admin and
 * public surfaces use. Rules live here, not in the UI: an action or a component
 * can be bypassed, a service call cannot.
 *
 * WHAT IS IMMUTABLE AND WHY. `value` is the machine identity and is set once.
 * The display `name` is what a rename changes, and because `Discipline` points
 * at the row's `id`, a rename cannot orphan a discipline — which is exactly the
 * defect this batch removes. Allowing `value` to change would reintroduce it in
 * a subtler form, since the bootstrap and the legacy-text fallback both match on
 * `value`.
 *
 * DELETION is guarded twice: here, with a count and a useful message, and by
 * PostgreSQL's `ON DELETE RESTRICT`. The database guard is the one that cannot
 * be forgotten; this one exists so an administrator is told *why*.
 */

const requireManage = (a: Actor) => {
  if (!roleHasPermission(a.roles, 'rodeo.manage')) {
    throw new ServiceError('forbidden', 'Not permitted to manage discipline classifications');
  }
};

export type ClassificationRow = {
  id: string;
  value: string;
  name: string;
  slug: string;
  pluralName: string | null;
  description: string | null;
  sortOrder: number;
  active: boolean;
  /** How many disciplines currently reference this row — drives the delete guard. */
  disciplineCount: number;
};

/** Public-facing shape: what a reader-side filter needs and nothing more. */
export type PublicClassification = {
  id: string;
  value: string;
  name: string;
  pluralName: string;
  sortOrder: number;
};

const NameInput = z.object({
  name: z.string().trim().min(1, 'A name is required').max(80),
  pluralName: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

const CreateInput = NameInput.extend({
  /**
   * The immutable identity. Accepted at CREATE only. Defaults to the name when
   * omitted, so an administrator who does not care about the distinction gets a
   * sensible one without being asked.
   */
  value: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional(),
});
export type ClassificationCreateInput = z.input<typeof CreateInput>;
export type ClassificationUpdateInput = z.input<typeof NameInput>;

function conflict(e: unknown, what: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = Array.isArray(e.meta?.target) ? (e.meta?.target as string[]).join(', ') : String(e.meta?.target ?? '');
    throw new ServiceError('conflict', `A classification with this ${/slug/i.test(target) ? 'slug' : /value/i.test(target) ? 'identity' : 'name'} already exists (${what}).`);
  }
  throw e;
}

// ---- reads ---------------------------------------------------------------

/**
 * Every classification with its discipline count, for the admin list.
 *
 * Includes inactive rows: the tab filters them client-side, exactly as the
 * Subcategory and Article Type tabs do, so an administrator can see and
 * reactivate something they switched off.
 */
export async function listClassifications(actor: Actor): Promise<ClassificationRow[]> {
  requireManage(actor);
  const rows = await prisma.disciplineClassification.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true, value: true, name: true, slug: true, pluralName: true,
      description: true, sortOrder: true, active: true,
      _count: { select: { disciplines: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id, value: r.value, name: r.name, slug: r.slug, pluralName: r.pluralName,
    description: r.description, sortOrder: r.sortOrder, active: r.active,
    disciplineCount: r._count.disciplines,
  }));
}

/**
 * Classifications offered for a NEW assignment, plus whichever one the record
 * being edited already holds.
 *
 * `includeId` is the reason this is not simply `where: { active: true }`. If a
 * discipline is classified by a row that was later deactivated, an editor
 * opening that discipline must still see its current value in the dropdown —
 * otherwise the form renders with nothing selected and the first save silently
 * clears a real assignment.
 */
export async function listAssignableClassifications(includeId?: string | null): Promise<PublicClassification[]> {
  const rows = await prisma.disciplineClassification.findMany({
    where: includeId ? { OR: [{ active: true }, { id: includeId }] } : { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, value: true, name: true, pluralName: true, sortOrder: true },
  });
  return rows.map(toPublic);
}

function toPublic(r: { id: string; value: string; name: string; pluralName: string | null; sortOrder: number }): PublicClassification {
  return { id: r.id, value: r.value, name: r.name, pluralName: r.pluralName?.trim() || r.name, sortOrder: r.sortOrder };
}

/**
 * What the PUBLIC Competition filter offers.
 *
 * Returns `null` when the managed vocabulary cannot be used — the table is
 * absent (migration not yet applied), empty (bootstrap not yet run), or
 * unreachable. The caller then falls back to the legacy compiled-in pair, so a
 * public page never fails over a taxonomy read. Same fail-open shape as
 * `articleTypeRegistry`.
 */
export async function getPublicClassifications(): Promise<PublicClassification[] | null> {
  try {
    const rows = await prisma.disciplineClassification.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, value: true, name: true, pluralName: true, sortOrder: true },
    });
    if (rows.length === 0) return null;
    return rows.map(toPublic);
  } catch {
    // P2021 (table absent), P1001/P1017 (unreachable) and anything else: the
    // reader gets the legacy vocabulary rather than an error page.
    return null;
  }
}

// ---- writes --------------------------------------------------------------

export async function createClassification(actor: Actor, raw: ClassificationCreateInput): Promise<{ id: string }> {
  requireManage(actor);
  const v = CreateInput.parse(raw);
  const value = (v.value ?? v.name).trim();
  const slug = classificationSlug(v.name);
  if (!slug) throw new ServiceError('validation', 'The name must contain at least one letter or number.');

  /**
   * Case-collision is refused here rather than by a `lower(value)` unique index,
   * for the reason Batch 04-E documented: the index would also forbid pairs that
   * legitimately differ only by case, and the policy belongs at CREATE, where an
   * administrator is adding something new.
   */
  const existing = await prisma.disciplineClassification.findMany({ select: { value: true, name: true } });
  const fold = (s: string) => s.trim().toLowerCase();
  if (existing.some((e) => fold(e.value) === fold(value))) {
    throw new ServiceError('conflict', `"${value}" already uses this identity. A new classification cannot differ from an existing one only by letter case.`);
  }
  if (existing.some((e) => fold(e.name) === fold(v.name))) {
    throw new ServiceError('conflict', `A classification named "${v.name}" already exists.`);
  }

  try {
    const row = await prisma.disciplineClassification.create({
      data: {
        value,
        name: v.name,
        slug,
        pluralName: v.pluralName?.trim() || null,
        description: v.description?.trim() || null,
        sortOrder: v.sortOrder ?? (existing.length),
        active: v.active ?? true,
      },
      select: { id: true },
    });
    return row;
  } catch (e) {
    conflict(e, 'create');
  }
}

/**
 * Renames and re-describes. `value` and `slug` are deliberately NOT updatable:
 * `value` is the immutable identity, and `slug` is derived from the name at
 * creation and left alone so a rename cannot change a URL-shaped identifier.
 */
export async function updateClassification(actor: Actor, id: string, raw: ClassificationUpdateInput): Promise<void> {
  requireManage(actor);
  const v = NameInput.parse(raw);
  const row = await prisma.disciplineClassification.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw new ServiceError('not_found', 'Classification not found');

  const others = await prisma.disciplineClassification.findMany({ where: { id: { not: id } }, select: { name: true } });
  if (others.some((o) => o.name.trim().toLowerCase() === v.name.trim().toLowerCase())) {
    throw new ServiceError('conflict', `A classification named "${v.name}" already exists.`);
  }

  try {
    await prisma.disciplineClassification.update({
      where: { id },
      data: {
        name: v.name,
        pluralName: v.pluralName?.trim() || null,
        description: v.description?.trim() || null,
        ...(v.sortOrder === undefined ? {} : { sortOrder: v.sortOrder }),
      },
    });
  } catch (e) {
    conflict(e, 'update');
  }
}

export async function setClassificationActive(actor: Actor, id: string, active: boolean): Promise<void> {
  requireManage(actor);
  const row = await prisma.disciplineClassification.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw new ServiceError('not_found', 'Classification not found');
  await prisma.disciplineClassification.update({ where: { id }, data: { active } });
}

export async function reorderClassifications(actor: Actor, idsInOrder: string[]): Promise<void> {
  requireManage(actor);
  await prisma.$transaction(
    idsInOrder.map((id, i) => prisma.disciplineClassification.update({ where: { id }, data: { sortOrder: i } })),
  );
}

/**
 * Deletes a classification no discipline references.
 *
 * The count is re-read here rather than trusted from the list the administrator
 * was looking at, which may be seconds stale. `ON DELETE RESTRICT` would refuse
 * the write anyway; this turns that into a sentence that says what to do
 * instead.
 */
export async function deleteClassification(actor: Actor, id: string): Promise<void> {
  requireManage(actor);
  const row = await prisma.disciplineClassification.findUnique({
    where: { id },
    select: { name: true, _count: { select: { disciplines: true } } },
  });
  if (!row) throw new ServiceError('not_found', 'Classification not found');
  if (row._count.disciplines > 0) {
    throw new ServiceError(
      'conflict',
      `Cannot delete: ${row._count.disciplines} discipline(s) are classified as "${row.name}". Deactivate it instead — those disciplines keep their classification and stay public.`,
    );
  }
  await prisma.disciplineClassification.delete({ where: { id } });
}

// ---- bootstrap / backfill ------------------------------------------------

export type { ClassificationBootstrapReport as BootstrapReport } from './disciplineClassificationBootstrap';

/**
 * Creates the two pre-existing classifications and attaches existing
 * disciplines, delegating to the bootstrap module.
 *
 * Thin wrapper on purpose: the logic lives in
 * `disciplineClassificationBootstrap.ts` so the CLI script and the admin action
 * share ONE definition of what the bootstrap does, and the definition does not
 * depend on the app's `server-only` Prisma singleton.
 */
export async function bootstrapDisciplineClassifications(
  opts: { apply: boolean },
): Promise<BootstrapReport> {
  return runBootstrap(prisma, opts);
}

/** Whether the managed vocabulary is usable: table present and seeded. */
export async function classificationRegistryState(): Promise<'database' | 'not-initialised' | 'absent'> {
  try {
    const n = await prisma.disciplineClassification.count();
    return n > 0 ? 'database' : 'not-initialised';
  } catch {
    return 'absent';
  }
}

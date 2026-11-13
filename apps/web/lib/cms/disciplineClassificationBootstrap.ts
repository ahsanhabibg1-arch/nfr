import type { PrismaClient } from '@prisma/client';
import {
  LEGACY_DISCIPLINE_CLASSIFICATIONS,
  classificationSlug,
} from '../content/disciplineClassifications';

/**
 * Batch 05 — Discipline Classification registry bootstrap.
 *
 * Creates the two pre-existing classifications as real records and attaches the
 * disciplines that already carry the matching legacy text.
 *
 * NO `server-only` IMPORT, AND `prisma` IS A PARAMETER. Same convention as
 * `articleTypeBootstrap`: this module runs both inside the application (from a
 * server action) and from a CLI script against an explicitly chosen database,
 * so it must not bind itself to the app's singleton client or to the React
 * server bundle.
 *
 * IDEMPOTENT BY CONSTRUCTION, not by a "has run" marker:
 *
 *   - classifications are matched on `value`, the immutable identity, so an
 *     existing one is never recreated or overwritten;
 *   - a discipline is attached only while its `classificationId` is still NULL,
 *     so a later administrator reassignment is never undone.
 *
 * Running it twice creates nothing and attaches nothing the second time.
 *
 * NON-DESTRUCTIVE. `Discipline.category` is never written. The legacy text stays
 * exactly as it is, which is what keeps the whole change reversible by dropping
 * the new column, and what keeps the application's fallback honest.
 */

export type ClassificationBootstrapReport = {
  /** `value`s that do not exist yet (and were created, when applying). */
  created: string[];
  /** Disciplines newly linked (or that would be linked, on a dry run). */
  attached: number;
  /** Disciplines that already had a managed classification — left untouched. */
  alreadyAttached: number;
  /** Disciplines with no classification text at all — left unclassified. */
  unclassified: number;
  /**
   * Legacy text that matches no known classification. Reported rather than
   * guessed at: inventing a classification from an unrecognised string is how a
   * backfill silently creates taxonomy nobody approved.
   */
  unmatched: { category: string; disciplines: number }[];
};

export async function bootstrapDisciplineClassifications(
  prisma: PrismaClient,
  opts: { apply: boolean },
): Promise<ClassificationBootstrapReport> {
  const created: string[] = [];

  for (const def of LEGACY_DISCIPLINE_CLASSIFICATIONS) {
    const existing = await prisma.disciplineClassification.findUnique({
      where: { value: def.value },
      select: { id: true },
    });
    if (existing) continue;
    created.push(def.value);
    if (opts.apply) {
      await prisma.disciplineClassification.create({
        data: {
          value: def.value,
          name: def.name,
          slug: classificationSlug(def.name),
          pluralName: def.pluralName,
          description: def.description,
          sortOrder: def.sortOrder,
          active: true,
        },
      });
    }
  }

  const byValue = new Map(
    (await prisma.disciplineClassification.findMany({ select: { id: true, value: true } }))
      .map((c) => [c.value, c.id] as const),
  );

  /**
   * On a DRY RUN the rows above were not created, so a lookup keyed only on
   * what exists would report every discipline as UNMATCHED — the dry run would
   * predict the opposite of what applying actually does. The values this run
   * *would* create are therefore treated as present, with a placeholder id that
   * is never written because `apply` is false.
   */
  if (!opts.apply) for (const v of created) byValue.set(v, '<would-be-created>');

  const rows = await prisma.discipline.findMany({
    select: { id: true, category: true, classificationId: true },
  });

  let attached = 0;
  let alreadyAttached = 0;
  let unclassified = 0;
  const unmatched = new Map<string, number>();

  for (const d of rows) {
    if (d.classificationId) { alreadyAttached += 1; continue; }
    const text = d.category?.trim();
    if (!text) { unclassified += 1; continue; }
    const target = byValue.get(text);
    if (!target) { unmatched.set(text, (unmatched.get(text) ?? 0) + 1); continue; }
    attached += 1;
    if (opts.apply) {
      await prisma.discipline.update({ where: { id: d.id }, data: { classificationId: target } });
    }
  }

  return {
    created,
    attached,
    alreadyAttached,
    unclassified,
    unmatched: [...unmatched].map(([category, disciplines]) => ({ category, disciplines })),
  };
}

/**
 * Whether every compatibility classification exists as a record.
 *
 * Mirrors `verifyArticleTypeRegistry`: a PARTIAL registry is the dangerous
 * state, because the application would offer a managed vocabulary that silently
 * omits a classification real disciplines still use.
 */
export async function verifyClassificationRegistry(
  prisma: PrismaClient,
): Promise<{ ok: boolean; missing: string[]; danglingLegacy: { category: string; disciplines: number }[] }> {
  const rows = await prisma.disciplineClassification.findMany({ select: { value: true } });
  const have = new Set(rows.map((r) => r.value));
  const missing = LEGACY_DISCIPLINE_CLASSIFICATIONS.map((d) => d.value).filter((v) => !have.has(v));

  // Legacy text on an unattached discipline that matches no record at all.
  const unattached = await prisma.discipline.findMany({
    where: { classificationId: null, NOT: { category: null } },
    select: { category: true },
  });
  const dangling = new Map<string, number>();
  for (const u of unattached) {
    const text = u.category?.trim();
    if (!text || have.has(text)) continue;
    dangling.set(text, (dangling.get(text) ?? 0) + 1);
  }

  return {
    ok: missing.length === 0,
    missing,
    danglingLegacy: [...dangling].map(([category, disciplines]) => ({ category, disciplines })),
  };
}

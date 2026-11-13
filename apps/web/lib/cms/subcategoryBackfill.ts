/**
 * NOTE on the missing `import 'server-only'`.
 *
 * Every other module in `lib/cms/` carries that marker. This one deliberately
 * does not, because the Issue 04-D CLI (`scripts/backfill-subcategories.mjs`)
 * imports it from plain Node, where `server-only` cannot resolve — its package
 * exports are gated behind Next's `react-server` condition. A backfill has to
 * be runnable outside the app, so the marker is the thing that gives way.
 *
 * The module is still server-only in substance: it takes a `PrismaClient` as an
 * argument and every in-app importer (`taxonomyService`, the test suite) is
 * itself marked `server-only`, so there is no path from a client component to
 * here that would not already fail on `@prisma/client`.
 */
import { z } from 'zod';
import { Prisma, type PrismaClient } from '@prisma/client';
// Explicit `.ts` extension so plain Node (type-stripping) can resolve it for
// the backfill CLI; Turbopack and Vitest resolve it identically.
import { normalizeSlug, slugShapeError } from './slugRules.ts';

/**
 * Issue 04-D — the legacy-subcategory backfill mechanism.
 *
 * WHAT THIS IS FOR. Eleven published articles carry a free-text
 * `Article.subcategory` label and no managed `subcategoryId`. Batch 04-B built
 * the managed taxonomy without touching them. This module can later attach them
 * — but ONLY from a mapping an owner has written down and approved.
 *
 * THE RULES IT ENFORCES, and why each exists:
 *
 *  - **Fail closed.** `dryRun` defaults to true, and an execution without an
 *    APPROVED mapping is refused. The default behaviour of a data-changing tool
 *    should be to change nothing.
 *  - **No inference.** Every (section, label) pair present in the database must
 *    appear in the mapping. An unmapped label stops the whole run rather than
 *    being guessed at, slugified, or skipped silently.
 *  - **No automatic suffixes.** A slug collision stops the run. Appending `-2`
 *    would quietly invent a taxonomy entry nobody chose.
 *  - **Transactional.** Everything happens in one transaction; a partial
 *    failure rolls the whole thing back, so a half-mapped taxonomy is not a
 *    reachable state.
 *  - **Idempotent.** An article that already has a managed subcategory is left
 *    alone, and an existing subcategory with the target slug is reused rather
 *    than duplicated. Running twice changes nothing the second time.
 *  - **Cross-section integrity.** A target is resolved within the article's own
 *    Category, so the composite foreign key can never be the thing that catches
 *    a mistake.
 *  - **Legacy text is never modified.** Not by CREATE, not by MERGE, not by
 *    RETAIN. The public mapper prefers the managed name and falls back to the
 *    label, so nothing disappears and nothing is rewritten.
 *
 * `RETAIN` means exactly: no managed assignment, no text change. It is recorded
 * so the mapping covers every label explicitly, which is what makes "unmapped"
 * a meaningful error.
 */

// ---------------------------------------------------------------- Mapping file

export const BackfillAction = z.enum(['CREATE', 'MERGE', 'RETAIN']);

const MappingEntry = z
  .object({
    /** Primary section slug, e.g. `nfr-plan-watch`. Matched exactly. */
    categorySlug: z.string().min(1),
    /** The legacy `Article.subcategory` text, matched EXACTLY (no trimming games). */
    legacyLabel: z.string().min(1),
    action: BackfillAction,
    /** CREATE: the managed name. MERGE: ignored (the target supplies it). */
    name: z.string().trim().min(1).max(120).optional(),
    /** CREATE: explicit slug. MERGE: the slug of the existing target. */
    slug: z.string().trim().min(1).max(80).optional(),
    description: z.string().max(600).optional(),
    note: z.string().max(600).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.action === 'CREATE' && (!e.name || !e.slug)) {
      ctx.addIssue({ code: 'custom', message: `CREATE requires both name and slug (${e.categorySlug}/${e.legacyLabel})` });
    }
    if (e.action === 'MERGE' && !e.slug) {
      ctx.addIssue({ code: 'custom', message: `MERGE requires the target slug (${e.categorySlug}/${e.legacyLabel})` });
    }
    if (e.action === 'RETAIN' && (e.name || e.slug)) {
      ctx.addIssue({ code: 'custom', message: `RETAIN must not name a target (${e.categorySlug}/${e.legacyLabel})` });
    }
  });

export const MappingFile = z.object({
  version: z.literal(1),
  /**
   * The approval gate. `status` must be the exact string `APPROVED`, with a
   * named approver and a date, before anything can be written. Anything else —
   * including the default `PENDING_OWNER_APPROVAL` — is a refusal.
   */
  approval: z.object({
    status: z.string(),
    /**
     * Nullable as well as optional: the shipped file writes an explicit `null`,
     * which is clearer to a reviewer than an absent key. The approval check
     * below requires a non-empty value either way, so `null` is still a refusal.
     */
    approvedBy: z.string().nullable().optional(),
    approvedAt: z.string().nullable().optional(),
  }),
  entries: z.array(MappingEntry).min(1),
});
export type MappingFile = z.infer<typeof MappingFile>;
export type MappingEntry = z.infer<typeof MappingEntry>;

export const APPROVED = 'APPROVED';
export const PENDING = 'PENDING_OWNER_APPROVAL';

// ---------------------------------------------------------------- Report

export interface BackfillPlanItem {
  categorySlug: string;
  legacyLabel: string;
  action: 'CREATE' | 'MERGE' | 'RETAIN';
  /** Articles that would be (or were) attached. */
  articleSlugs: string[];
  targetName?: string;
  targetSlug?: string;
  /** Set when an existing subcategory is reused instead of created. */
  reusedExisting?: boolean;
  skipped?: string;
}

export interface BackfillReport {
  dryRun: boolean;
  approved: boolean;
  /** Fingerprint of every article field the backfill must NOT change. */
  fingerprintBefore: string;
  fingerprintAfter: string;
  fingerprintUnchanged: boolean;
  plan: BackfillPlanItem[];
  created: number;
  attached: number;
  retained: number;
  alreadyAttached: number;
  errors: string[];
}

export class BackfillError extends Error {}

type Tx = Prisma.TransactionClient;

/**
 * Every article column the backfill is forbidden to touch, hashed into one
 * string. `subcategoryId` is deliberately EXCLUDED — it is the only field this
 * process may change. Anything else differing means the run did something it
 * was not supposed to.
 */
async function fingerprint(tx: Tx | PrismaClient): Promise<string> {
  const rows = await tx.article.findMany({
    orderBy: { slug: 'asc' },
    select: {
      slug: true, title: true, subcategory: true, articleType: true,
      workflowStatus: true, categoryId: true, publishedAt: true, heroImageUrl: true,
    },
  });
  return JSON.stringify(rows);
}

// ---------------------------------------------------------------- Runner

export interface RunBackfillOptions {
  mapping: unknown;
  /** Defaults to TRUE. Nothing is written unless this is explicitly false. */
  dryRun?: boolean;
  /** Restrict to these article slugs — used by tests with synthetic fixtures. */
  onlyArticleSlugs?: string[];
}

export async function runSubcategoryBackfill(
  prisma: PrismaClient,
  options: RunBackfillOptions,
): Promise<BackfillReport> {
  const dryRun = options.dryRun !== false;
  const parsed = MappingFile.safeParse(options.mapping);
  if (!parsed.success) {
    throw new BackfillError(
      'The mapping file is not valid: ' + parsed.error.issues.map((i) => i.message).join('; '),
    );
  }
  const mapping = parsed.data;
  const approved = mapping.approval.status === APPROVED
    && !!mapping.approval.approvedBy
    && !!mapping.approval.approvedAt;

  // FAIL CLOSED: an execution without approval is refused before anything is read.
  if (!dryRun && !approved) {
    throw new BackfillError(
      `Refusing to execute: the mapping is not approved (status "${mapping.approval.status}"). ` +
      `Set approval.status to "${APPROVED}" with approvedBy and approvedAt, or run in dry-run mode.`,
    );
  }

  const errors: string[] = [];
  const plan: BackfillPlanItem[] = [];
  const fingerprintBefore = await fingerprint(prisma);

  const report = await prisma.$transaction(async (tx) => {
    // ---- resolve sections -------------------------------------------------
    const categories = await tx.category.findMany({ select: { id: true, slug: true, name: true } });
    const bySlug = new Map(categories.map((c) => [c.slug, c]));

    // ---- what is actually in the database --------------------------------
    const legacyArticles = await tx.article.findMany({
      where: {
        subcategory: { not: null },
        ...(options.onlyArticleSlugs ? { slug: { in: options.onlyArticleSlugs } } : {}),
      },
      select: { id: true, slug: true, subcategory: true, subcategoryId: true, categoryId: true },
      orderBy: { slug: 'asc' },
    });

    // Group by (section, label) — the exact pair the mapping keys on.
    const groups = new Map<string, { categoryId: string; categorySlug: string; label: string; articles: typeof legacyArticles }>();
    for (const a of legacyArticles) {
      const cat = categories.find((c) => c.id === a.categoryId);
      if (!cat) { errors.push(`Article ${a.slug} has an unknown category.`); continue; }
      const key = `${cat.slug}\u0000${a.subcategory}`;
      const g = groups.get(key) ?? { categoryId: cat.id, categorySlug: cat.slug, label: a.subcategory as string, articles: [] };
      g.articles.push(a);
      groups.set(key, g);
    }

    // ---- UNMAPPED LABELS STOP THE RUN ------------------------------------
    const mapped = new Map(mapping.entries.map((e) => [`${e.categorySlug}\u0000${e.legacyLabel}`, e]));
    const unmapped: string[] = [];
    for (const [key, g] of groups) {
      if (!mapped.has(key)) unmapped.push(`${g.categorySlug} / "${g.label}" (${g.articles.length} article(s))`);
    }
    if (unmapped.length) {
      throw new BackfillError(
        'Refusing to proceed: these (section, label) pairs exist in the database but are not in the mapping:\n  - ' +
        unmapped.join('\n  - ') +
        '\nAdd an explicit CREATE, MERGE or RETAIN entry for each. Nothing is inferred.',
      );
    }

    // ---- validate the mapping's own targets ------------------------------
    for (const e of mapping.entries) {
      if (!bySlug.has(e.categorySlug)) {
        throw new BackfillError(`Mapping references an unknown primary section "${e.categorySlug}".`);
      }
      if (e.slug) {
        const shape = slugShapeError(normalizeSlug(e.slug));
        if (shape) throw new BackfillError(`Mapping slug "${e.slug}" is not usable: ${shape}`);
        if (normalizeSlug(e.slug) !== e.slug) {
          // No silent normalisation: the file must hold the final slug.
          throw new BackfillError(`Mapping slug "${e.slug}" is not already normalised (expected "${normalizeSlug(e.slug)}").`);
        }
      }
    }

    // ---- COLLISION DETECTION within the mapping --------------------------
    const seenTargets = new Map<string, string>();
    for (const e of mapping.entries) {
      if (e.action !== 'CREATE' || !e.slug) continue;
      const key = `${e.categorySlug}\u0000${e.slug}`;
      if (seenTargets.has(key)) {
        throw new BackfillError(
          `Two CREATE entries target the same slug "${e.slug}" in ${e.categorySlug} ` +
          `("${seenTargets.get(key)}" and "${e.legacyLabel}"). Use MERGE for the second, or pick a distinct slug. ` +
          `No suffix is added automatically.`,
        );
      }
      seenTargets.set(key, e.legacyLabel);
    }

    let created = 0;
    let attached = 0;
    let retained = 0;
    let alreadyAttached = 0;

    /**
     * Targets this run has brought into existence, keyed `categoryId\0slug`.
     *
     * TWO PROBLEMS THIS SOLVES, both found by dry-running the real mapping:
     *
     *  1. ORDER. A MERGE may legitimately point at a slug that a CREATE entry
     *     in the same run produces (the proposed `visiting-las-vegas` is exactly
     *     this: one label creates it, another merges into it). Iterating the
     *     database groups in arbitrary order could reach the MERGE first and
     *     declare the target missing. CREATEs are therefore processed first.
     *  2. DRY RUN. A dry run writes nothing, so a dependent MERGE would find no
     *     row no matter the order. Recording the intent lets the plan resolve
     *     without writing — which is the whole point of a dry run being
     *     trustworthy.
     */
    const plannedTargets = new Map<string, { id: string | null; name: string }>();

    // CREATE before MERGE; RETAIN last since it touches nothing.
    const RANK = { CREATE: 0, MERGE: 1, RETAIN: 2 } as const;
    const ordered = [...groups.entries()].sort(
      (a, b) => RANK[mapped.get(a[0])!.action] - RANK[mapped.get(b[0])!.action],
    );

    for (const [key, g] of ordered) {
      const entry = mapped.get(key)!;
      const item: BackfillPlanItem = {
        categorySlug: g.categorySlug, legacyLabel: g.label, action: entry.action,
        articleSlugs: g.articles.map((a) => a.slug),
      };

      if (entry.action === 'RETAIN') {
        retained += g.articles.length;
        item.skipped = 'RETAIN — no managed assignment, legacy label untouched';
        plan.push(item);
        continue;
      }

      const cat = bySlug.get(entry.categorySlug)!;
      const targetSlug = entry.slug!;
      item.targetSlug = targetSlug;

      const targetKey = `${cat.id}\u0000${targetSlug}`;

      // Reuse an existing subcategory when one already has this slug in this
      // section. That is what makes a second run a no-op, and what MERGE means.
      // A target this run already planned counts as existing (see above).
      let target =
        (await tx.subcategory.findFirst({
          where: { categoryId: cat.id, slug: targetSlug },
          select: { id: true, name: true },
        })) ?? plannedTargets.get(targetKey) ?? null;

      if (!target) {
        if (entry.action === 'MERGE') {
          throw new BackfillError(
            `MERGE target "${targetSlug}" does not exist in ${entry.categorySlug}. ` +
            `Create it first (as a CREATE entry or in the admin), or change this entry to CREATE.`,
          );
        }
        item.targetName = entry.name!;
        if (dryRun) {
          // Record the intent so a dependent MERGE can resolve against it.
          plannedTargets.set(targetKey, { id: null, name: entry.name! });
          created += 1;
        } else {
          const max = await tx.subcategory.aggregate({ where: { categoryId: cat.id }, _max: { sortOrder: true } });
          target = await tx.subcategory.create({
            data: {
              categoryId: cat.id, name: entry.name!, slug: targetSlug,
              description: entry.description?.trim() || null,
              sortOrder: (max._max.sortOrder ?? -1) + 1,
            },
            select: { id: true, name: true },
          });
          plannedTargets.set(targetKey, { id: target.id, name: target.name });
          created += 1;
        }
      } else {
        item.reusedExisting = true;
        item.targetName = target.name;
      }

      for (const a of g.articles) {
        if (a.subcategoryId) { alreadyAttached += 1; continue; }
        // Cross-section integrity, checked before the write rather than left to
        // the foreign key.
        if (a.categoryId !== cat.id) {
          throw new BackfillError(`Article ${a.slug} is in a different section from its mapping target.`);
        }
        if (dryRun) { attached += 1; continue; }
        // In an executing run a planned target always has a real id; a null one
        // can only mean a dry-run path leaked, which must not write.
        if (!target!.id) throw new BackfillError(`Internal: target for "${targetSlug}" has no id.`);
        await tx.article.update({ where: { id: a.id }, data: { subcategoryId: target!.id } });
        attached += 1;
      }

      plan.push(item);
    }

    if (dryRun) {
      // Nothing may persist from a dry run, not even a created subcategory.
      throw new DryRunRollback({ plan, created, attached, retained, alreadyAttached, errors });
    }
    return { plan, created, attached, retained, alreadyAttached, errors };
  }).catch((e: unknown) => {
    if (e instanceof DryRunRollback) return e.payload;
    throw e;
  });

  const fingerprintAfter = await fingerprint(prisma);
  return {
    dryRun, approved, fingerprintBefore, fingerprintAfter,
    fingerprintUnchanged: fingerprintBefore === fingerprintAfter,
    ...report,
  };
}

/**
 * How a dry run leaves no trace: the transaction is aborted deliberately and
 * the collected plan travels out on the error. Querying what WOULD happen and
 * then not committing is the only way to report accurately without writing.
 */
type DryRunPayload = Omit<
  BackfillReport,
  'dryRun' | 'approved' | 'fingerprintBefore' | 'fingerprintAfter' | 'fingerprintUnchanged'
>;

class DryRunRollback extends Error {
  /**
   * Written as an explicit field rather than a constructor parameter property:
   * the CLI imports this module through Node's strip-only TypeScript mode,
   * which does not support parameter properties.
   */
  payload: DryRunPayload;

  constructor(payload: DryRunPayload) {
    super('dry-run rollback');
    this.payload = payload;
  }
}

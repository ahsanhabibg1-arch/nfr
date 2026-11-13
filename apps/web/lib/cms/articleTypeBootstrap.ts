/**
 * Batch 04-E — idempotent Article Type bootstrap.
 *
 * Creates the 23 compatibility definitions (18 selectable + 5 legacy) as
 * managed rows. It is the ONE mechanism that turns the in-repository registry
 * into database state, and it is deliberately dull: it only ever INSERTS.
 *
 * WHY IT NEVER UPDATES. The second run of a bootstrap is the dangerous one. If
 * it reconciled existing rows towards the registry, then every later deploy
 * would silently revert whatever an administrator had changed — the label they
 * renamed, the type they deactivated, the evergreen flag they cleared. So a row
 * that already exists is left exactly as it is and reported as `present`. The
 * registry seeds; it does not govern.
 *
 * WHAT IT NEVER TOUCHES. No `Article` row is read for writing, no stored
 * `articleType` value is normalised, and no legacy value is mapped into a newer
 * type: `guide` stays `guide`. The five legacy definitions are created as
 * non-selectable so they remain storable and readable forever without being
 * offered for new work.
 *
 * NO `server-only` IMPORT, on purpose: `scripts/bootstrap-article-types.mjs`
 * imports this module under plain Node, outside any Next bundler context, and
 * `server-only` throws there. Nothing here is importable from a client
 * component — it takes a Prisma client as an argument and has no React surface.
 */
import { ARTICLE_TYPES } from '../content/articleTypes';
import { articleTypeValueKey, type ArticleSchemaTypeName } from '../content/articleTypeShape';

export interface BootstrapDefinition {
  value: string;
  label: string;
  sortOrder: number;
  selectable: boolean;
  evergreen: boolean;
  schemaType: ArticleSchemaTypeName;
}

/**
 * The definitions to seed, derived from the compatibility registry in its
 * declared order so `sortOrder` reproduces the editorial order editors see
 * today (selectable first, legacy last).
 */
export function bootstrapDefinitions(): BootstrapDefinition[] {
  return ARTICLE_TYPES.map((t, i) => ({
    value: t.value,
    label: t.label,
    sortOrder: i,
    selectable: t.selectable,
    evergreen: t.evergreen,
    schemaType: t.news ? ('NewsArticle' as const) : ('Article' as const),
  }));
}

/**
 * The `SeedTombstone.kind` this module owns.
 *
 * `SeedTombstone` is the existing, owner-approved mechanism for "a seeded
 * foundational record was deliberately deleted, so seeding must not recreate
 * it" (migration `20261112010000_add_seed_tombstone`, already used for
 * disciplines). Article Type definitions are seeded the same way and need the
 * same protection, so this reuses it rather than inventing a second marker —
 * no schema change, no migration.
 */
export const ARTICLE_TYPE_TOMBSTONE_KIND = 'articleType';

export type BootstrapOutcome = 'created' | 'present' | 'conflict' | 'tombstoned';

export interface BootstrapRow {
  value: string;
  outcome: BootstrapOutcome;
  /** Present only for `conflict`: why the definition could not be reconciled. */
  reason?: string;
}

export interface BootstrapReport {
  /** False for a dry run: nothing was written. */
  applied: boolean;
  rows: BootstrapRow[];
  created: number;
  present: number;
  conflicts: number;
  /** Definitions an administrator deleted; deliberately NOT recreated. */
  tombstoned: string[];
  /** Rows in the table that the registry does not define (administrator additions). */
  unmanaged: string[];
  /**
   * True when every definition that MAY exist does.
   *
   * A tombstoned definition counts as resolved, not as missing: the registry is
   * complete with respect to what the administrator has decided, which is the
   * only completeness that means anything once deletion is supported.
   */
  complete: boolean;
}

/** The create payload, named so the transactional writer and the store agree. */
export interface ArticleTypeCreateData {
  value: string;
  label: string;
  sortOrder: number;
  selectable: boolean;
  evergreen: boolean;
  schemaType: 'ARTICLE' | 'NEWS_ARTICLE';
}

/** The write half of the store — what a transaction hands back. */
export interface ArticleTypeWriter {
  articleType: {
    create(args: { data: ArticleTypeCreateData }): Promise<unknown>;
  };
}

/**
 * The minimum Prisma surface this module needs — keeps it testable and
 * client-free.
 *
 * Batch 04-E.2: `$transaction` is part of the contract. It is optional on the
 * TYPE because the planning path (`apply: false`) never writes and a read-only
 * fake should not have to provide it — but it is REQUIRED at runtime to apply,
 * and `bootstrapArticleTypes` refuses rather than writing without it. A silent
 * non-atomic fallback is exactly the defect this batch exists to remove.
 */
export interface ArticleTypeStore extends ArticleTypeWriter {
  articleType: {
    findMany(args: { select: { value: true } }): Promise<{ value: string }[]>;
    create(args: { data: ArticleTypeCreateData }): Promise<unknown>;
  };
  seedTombstone: {
    findMany(args: {
      where: { kind: string };
      select: { key: true };
    }): Promise<{ key: string }[]>;
  };
  $transaction?<T>(
    fn: (tx: ArticleTypeWriter) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T>;
}

const dbSchemaType = (s: ArticleSchemaTypeName): 'ARTICLE' | 'NEWS_ARTICLE' =>
  s === 'NewsArticle' ? 'NEWS_ARTICLE' : 'ARTICLE';

/**
 * Plan, and optionally apply, the bootstrap.
 *
 * `apply: false` (the default) performs no write at all and returns the same
 * report shape, so the plan can be read before anything happens.
 */
export async function bootstrapArticleTypes(
  store: ArticleTypeStore,
  options: { apply?: boolean } = {},
): Promise<BootstrapReport> {
  const apply = options.apply === true;
  const defs = bootstrapDefinitions();

  const [existing, tombstones] = await Promise.all([
    store.articleType.findMany({ select: { value: true } }),
    store.seedTombstone.findMany({ where: { kind: ARTICLE_TYPE_TOMBSTONE_KIND }, select: { key: true } }),
  ]);
  const existingValues = new Set(existing.map((r) => r.value));
  const definedValues = new Set(defs.map((d) => d.value));
  /**
   * Values an administrator deliberately deleted. The bootstrap must not
   * recreate them: doing so silently reverses the decision, and §2.3 forbids
   * overwriting administrator-managed settings. They are REPORTED rather than
   * hidden, so an operator can see that the registry is incomplete on purpose.
   */
  const tombstoned = new Set(tombstones.map((t) => t.key));

  /**
   * Case-folded index of what is in the table, used ONLY to spot a renamed
   * definition. It cannot be a uniqueness test: `News` and `news` are both
   * legitimate definitions, so several definitions may share a folded key.
   */
  const foldedExisting = new Map<string, string[]>();
  for (const r of existing) {
    const k = articleTypeValueKey(r.value);
    foldedExisting.set(k, [...(foldedExisting.get(k) ?? []), r.value]);
  }

  const rows: BootstrapRow[] = [];
  /** Planned inserts, written together or not at all (see below). */
  const toCreate: ArticleTypeCreateData[] = [];
  for (const def of defs) {
    if (existingValues.has(def.value)) {
      rows.push({ value: def.value, outcome: 'present' });
      continue;
    }
    if (tombstoned.has(def.value)) {
      rows.push({
        value: def.value,
        outcome: 'tombstoned',
        reason: 'deliberately deleted by an administrator; not recreated',
      });
      continue;
    }
    /**
     * The exact value is absent, but something in the table case-folds to it
     * and is not itself one of the 23 definitions. That is a definition whose
     * identity was changed by hand. Reported, never repaired: `value` is
     * immutable by policy, and rewriting it here would be precisely the silent
     * identity change §9 forbids. An operator decides.
     */
    const suspects = (foldedExisting.get(articleTypeValueKey(def.value)) ?? [])
      .filter((v) => !definedValues.has(v));
    if (suspects.length > 0) {
      rows.push({
        value: def.value,
        outcome: 'conflict',
        reason: `the table holds "${suspects.join('", "')}" which differs only by letter case; values are immutable, so this must be resolved by hand`,
      });
      continue;
    }
    toCreate.push({
      value: def.value,
      label: def.label,
      sortOrder: def.sortOrder,
      selectable: def.selectable,
      evergreen: def.evergreen,
      schemaType: dbSchemaType(def.schemaType),
    });
    rows.push({ value: def.value, outcome: 'created' });
  }

  /**
   * Batch 04-E.2 (R-8) — ONE transaction for every insert, or none at all.
   *
   * It used to be a bare `await create()` inside the planning loop, so a
   * failure on the Nth definition left N-1 rows behind: a registry that looks
   * initialised (`source: 'database'`) while missing definitions, which is the
   * silent state 04-E.1 had to defend the structured-data path against.
   *
   * Planning is deliberately OUTSIDE the transaction — it is read-only, and
   * holding a transaction open across it would lengthen the write lock for no
   * benefit. The window between planning and writing is covered by the unique
   * constraint on `value`: if a concurrent run inserted a definition in the
   * meantime, this insert fails, the whole transaction rolls back, and the
   * caller is told. It is not silently repaired, because a concurrent
   * bootstrap means two operators are initialising the same registry and that
   * is worth knowing. Re-running afterwards is always safe: the function only
   * ever inserts, so the second run reports the rows as `present`.
   *
   * No retry loop. A retry would race the same way, and this is an operator-
   * triggered step, not a request path.
   */
  if (apply && toCreate.length > 0) {
    if (typeof store.$transaction !== 'function') {
      throw new Error(
        'Refusing to bootstrap article types without transaction support: a partial registry is worse than none.',
      );
    }
    await store.$transaction(
      async (tx) => {
        for (const data of toCreate) {
          await tx.articleType.create({ data });
        }
      },
      // 23 single-row inserts; the generous ceiling is for a slow remote
      // database, not for a long-running operation.
      { timeout: 20_000 },
    );
  }

  const unmanaged = existing.filter((r) => !definedValues.has(r.value)).map((r) => r.value).sort();
  const created = rows.filter((r) => r.outcome === 'created').length;
  const present = rows.filter((r) => r.outcome === 'present').length;
  const conflicts = rows.filter((r) => r.outcome === 'conflict').length;
  const tombstonedValues = rows.filter((r) => r.outcome === 'tombstoned').map((r) => r.value);

  return {
    applied: apply,
    rows,
    created,
    present,
    conflicts,
    tombstoned: tombstonedValues,
    unmanaged,
    // On a dry run `created` rows do not exist yet, so completeness describes
    // the state the run would reach rather than claiming one it did not write.
    complete: conflicts === 0 && created + present + tombstonedValues.length === defs.length,
  };
}

/**
 * Registry completeness check for the rollout gate (§16 step 3): every
 * compatibility definition must exist before application code stops needing
 * the fallback.
 */
export async function verifyArticleTypeRegistry(
  store: ArticleTypeStore,
): Promise<{ ok: boolean; missing: string[]; miscased: string[] }> {
  const defs = bootstrapDefinitions();
  const [existing, tombstones] = await Promise.all([
    store.articleType.findMany({ select: { value: true } }),
    store.seedTombstone.findMany({ where: { kind: ARTICLE_TYPE_TOMBSTONE_KIND }, select: { key: true } }),
  ]);
  const existingValues = new Set(existing.map((r) => r.value));
  const definedValues = new Set(defs.map((d) => d.value));
  const tombstoned = new Set(tombstones.map((t) => t.key));
  // A deliberately deleted definition is RESOLVED, not missing: the rollout
  // gate must not demand that an administrator's decision be undone.
  const missing = defs
    .filter((d) => !existingValues.has(d.value) && !tombstoned.has(d.value))
    .map((d) => d.value);
  // A row that case-folds onto a definition without BEING one of them: an
  // identity changed by hand. Reported separately from "missing" because the
  // remedy differs — one needs a bootstrap run, the other needs a decision.
  const miscased = existing
    .map((r) => r.value)
    .filter(
      (v) =>
        !definedValues.has(v) &&
        defs.some((d) => articleTypeValueKey(d.value) === articleTypeValueKey(v)),
    );
  return { ok: missing.length === 0 && miscased.length === 0, missing, miscased };
}

import 'server-only';
import { prisma } from '../db';
import { ARTICLE_TYPE_TOMBSTONE_KIND } from './articleTypeBootstrap';
import {
  fallbackSnapshot,
  compatibilityValues,
  compatibilityEvergreenValues,
  evergreenValuesIn,
  schemaTypeIn,
  isKnownIn,
  isAssignableIn,
  type ArticleSchemaTypeName,
  type ArticleTypeSnapshot,
  type ManagedArticleType,
} from '../content/articleTypeShape';

/**
 * Batch 04-E — the authoritative Article Type READ path.
 *
 * The database owns the definitions; this module is the only place that reads
 * them, so there is exactly one answer to "what are the article types right
 * now" and one cache to invalidate.
 *
 * TWO FAILURE MODES, ONE ANSWER. The table may not exist yet (a code version
 * deployed ahead of its migration — §16) or the database may be briefly
 * unreachable. Both fall back to the in-repository compatibility registry,
 * which is the 23 definitions this release already behaves by. The fallback is
 * never a *partial* answer: it is the whole previous policy, so a surface
 * either renders managed definitions or renders exactly what it rendered
 * before Batch 04-E. It is never consulted while the table has rows.
 *
 * CACHING. One short-lived process cache, not a per-request one: the evergreen
 * query, the editor page and the JSON-LD path each want the same answer within
 * a request, and the homepage asks on every ISR regeneration. A mutation calls
 * `invalidateArticleTypes()` in the same process and `revalidatePath` for the
 * rendered output, so an administrator's change is visible immediately there;
 * the TTL bounds how long any *other* server instance can keep serving the
 * previous definitions. Deliberately no `unstable_cache`: this feeds
 * structured-data decisions, and a stale cached SEO classification is worse
 * than a 25 ms query.
 */

const TTL_MS = 10_000;

/**
 * Batch 04-E.1 — a fallback caused by an ERROR is cached for much less time.
 *
 * A successful read is good for 10 s. A read that FAILED is a different thing:
 * holding its fallback for the full window would turn a 200 ms database blip
 * into 10 s of degraded answers for every surface at once. One second is long
 * enough to stop a failing database being hammered by a render pass, and short
 * enough that recovery is effectively immediate.
 */
const ERROR_TTL_MS = 1_000;

interface CacheEntry {
  snapshot: ArticleTypeSnapshot;
  at: number;
  ttl: number;
  /**
   * The resolved evergreen list, memoised alongside the snapshot it was derived
   * from. Keeps the incomplete-registry tombstone lookup off the hot path: the
   * homepage asks for this on every ISR regeneration.
   */
  evergreen?: string[];
}
let cached: CacheEntry | null = null;

/**
 * Registry failures are REPORTED, not swallowed — but throttled per reason so a
 * sustained outage does not flood the log.
 *
 * Deliberately time-based rather than once-per-process: a once-only warning
 * makes an intermittent fault invisible after its first occurrence, which is
 * exactly when you most want to see it recurring. Each distinct reason is
 * logged at most once a minute, with the occurrence count since the last line.
 */
const WARN_INTERVAL_MS = 60_000;
const warnState = new Map<string, { last: number; suppressed: number }>();

function reportFallback(reason: string, detail: string): void {
  const now = Date.now();
  const s = warnState.get(reason);
  if (s && now - s.last < WARN_INTERVAL_MS) {
    s.suppressed += 1;
    return;
  }
  const repeated = s && s.suppressed > 0 ? ` (+${s.suppressed} more since the last report)` : '';
  warnState.set(reason, { last: now, suppressed: 0 });
  console.warn(
    `[article-types] using the compatibility registry (${reason}): ${detail}${repeated}`,
  );
}

export function invalidateArticleTypes(): void {
  cached = null;
}

/** Test seam: forget the throttled warning state too. */
export function resetArticleTypeRegistryForTests(): void {
  cached = null;
  warnState.clear();
}

function toManaged(row: {
  value: string;
  label: string;
  description: string | null;
  sortOrder: number;
  selectable: boolean;
  evergreen: boolean;
  schemaType: string;
  archivedAt: Date | null;
}): ManagedArticleType {
  return {
    value: row.value,
    label: row.label,
    description: row.description,
    sortOrder: row.sortOrder,
    selectable: row.selectable,
    evergreen: row.evergreen,
    schemaType: row.schemaType === 'NEWS_ARTICLE' ? 'NewsArticle' : 'Article',
    archived: row.archivedAt != null,
  };
}

/**
 * The managed definitions, or the compatibility registry when the table is
 * absent/unreachable/empty.
 *
 * An EMPTY table counts as "not initialised", not as "no article types": an
 * empty answer would blank the editor's dropdown and empty the evergreen
 * surface, which is the Batch 04-A failure in a new costume.
 */
export async function getArticleTypeSnapshot(): Promise<ArticleTypeSnapshot> {
  const now = Date.now();
  if (cached && now - cached.at < cached.ttl) return cached.snapshot;

  let snapshot: ArticleTypeSnapshot;
  let ttl = TTL_MS;
  try {
    const rows = await prisma.articleType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: {
        value: true,
        label: true,
        description: true,
        sortOrder: true,
        selectable: true,
        evergreen: true,
        schemaType: true,
        archivedAt: true,
      },
    });
    if (rows.length === 0) {
      // Not an error: the table exists and is simply not seeded yet. Cached for
      // the normal window, because the answer will not change until a bootstrap
      // runs, and a bootstrap invalidates this cache itself.
      reportFallback('not-initialised', 'the ArticleType table is empty — run the bootstrap');
      snapshot = fallbackSnapshot();
    } else {
      snapshot = { source: 'database', types: rows.map(toManaged) };
    }
  } catch (e) {
    const code = (e as { code?: string })?.code;
    // P2021 = table does not exist (migration not yet applied); P1001/P1017 =
    // unreachable/closed connection. Anything else is unexpected but must not
    // take down a public page over a taxonomy read.
    reportFallback(code ?? 'error', (e as Error).message);
    snapshot = fallbackSnapshot();
    ttl = ERROR_TTL_MS;
  }

  cached = { snapshot, at: now, ttl };
  return snapshot;
}

// ---- registry health (Batch 04-E.2, Task C) -------------------------------

/**
 * What the registry's state actually is, derived rather than recorded.
 *
 * WHY NO INITIALISATION MARKER. The obvious implementation is a row or a column
 * saying "bootstrap completed". That would be a second source of truth about
 * the registry, and it can disagree with the registry: a marker set while rows
 * were later deleted reads "complete" over an incomplete table, and a table
 * seeded by hand reads "incomplete" while being fine. Comparing the managed
 * values against the compiled-in definitions cannot disagree with reality,
 * because it IS reality — so no schema change was needed or made.
 *
 * COSTS NOTHING. It reads the same cached snapshot every other call uses; there
 * is no additional query, and nothing is per-row.
 */
export interface ArticleTypeRegistryHealth {
  source: 'database' | 'fallback';
  /** True once the table holds rows — i.e. a bootstrap has run at all. */
  initialised: boolean;
  managedCount: number;
  /** Compatibility definitions absent from the managed registry. */
  missing: string[];
  /** Managed values the compatibility registry does not define — administrator additions. */
  unmanaged: string[];
  /** Initialised AND holding all 23 compatibility definitions. */
  complete: boolean;
}

export async function getArticleTypeRegistryHealth(): Promise<ArticleTypeRegistryHealth> {
  const snapshot = await getArticleTypeSnapshot();
  const compat = new Set(compatibilityValues());
  const managed = new Set(snapshot.types.map((t) => t.value));
  const initialised = snapshot.source === 'database';
  const missing = initialised ? [...compat].filter((v) => !managed.has(v)) : [];
  const unmanaged = initialised ? [...managed].filter((v) => !compat.has(v)).sort() : [];
  return {
    source: snapshot.source,
    initialised,
    managedCount: initialised ? snapshot.types.length : 0,
    missing,
    unmanaged,
    complete: initialised && missing.length === 0,
  };
}

// ---- the questions callers actually ask -----------------------------------

/**
 * Exact stored values the evergreen query may match (Batch 04-E.2, R-9).
 *
 * THE PROBLEM. `evergreenValuesIn` reads managed flags only, so a registry
 * missing definitions produced a short list — and articles of those types
 * silently vanished from the evergreen surface. That is the Batch 04-A failure
 * returning through a different door, and it is quiet: `source` is still
 * `'database'`, so nothing warns.
 *
 * THE RULE, in precedence order:
 *
 *  1. A MANAGED definition is authoritative. `evergreen: true` includes the
 *     value; `evergreen: false` excludes it, and nothing below can override
 *     that — an administrator who turned a type off has turned it off.
 *  2. A definition the registry does not hold AND that was not deliberately
 *     deleted is treated as a gap, and takes the compiled-in flag.
 *  3. A definition an administrator DELETED stays out, whatever the compiled-in
 *     flag says. `SeedTombstone` is what makes this knowable: `deleteArticleType`
 *     writes one in the same transaction as the delete.
 *  4. An unknown value is never evergreen. It appears in no list, and only the
 *     23 compatibility values can be filled in at all.
 *
 * WHY THE TOMBSTONE IS NECESSARY. Without it, "missing" is ambiguous — an
 * interrupted bootstrap and a deliberate deletion look identical — so filling
 * gaps in would silently resurrect deleted definitions, and refusing to fill
 * them in would silently drop articles. Neither is acceptable, and the audit
 * log cannot settle it: the CLI bootstrap writes no audit entry at all, and a
 * raw SQL deletion writes none either.
 *
 * COST. The tombstone query runs ONLY when the registry is incomplete, which
 * is not the normal state, and the result is cached with the snapshot. A
 * complete registry and a fallback registry both cost nothing extra.
 */
export async function getEvergreenArticleTypeValues(): Promise<string[]> {
  const snapshot = await getArticleTypeSnapshot();
  if (cached && cached.snapshot === snapshot && cached.evergreen) return cached.evergreen;

  const managed = evergreenValuesIn(snapshot);
  let values = managed;

  if (snapshot.source === 'database') {
    const present = new Set(snapshot.types.map((t) => t.value));
    const absent = compatibilityValues().filter((v) => !present.has(v));
    if (absent.length > 0) {
      let tombstoned = new Set<string>();
      try {
        const rows = await prisma.seedTombstone.findMany({
          where: { kind: ARTICLE_TYPE_TOMBSTONE_KIND, key: { in: absent } },
          select: { key: true },
        });
        tombstoned = new Set(rows.map((r) => r.key));
      } catch (e) {
        /**
         * Fail towards NOT filling. If we cannot tell whether a value was
         * deleted on purpose, adding it back could reverse an administrator's
         * decision; leaving it out only matches the behaviour that shipped in
         * 04-E. The quieter mistake wins, and it is reported.
         */
        reportFallback('tombstone-read', (e as Error).message);
        tombstoned = new Set(absent);
      }
      const evergreenCompat = new Set(compatibilityEvergreenValues());
      const filled = absent.filter((v) => !tombstoned.has(v) && evergreenCompat.has(v));
      if (filled.length > 0) values = [...managed, ...filled];
    }
  }

  if (cached && cached.snapshot === snapshot) cached.evergreen = values;
  return values;
}

/** `'Article'` or `'NewsArticle'`; never `'NewsArticle'` for an unknown value. */
export async function getArticleSchemaType(
  value: string | null | undefined,
): Promise<ArticleSchemaTypeName> {
  return schemaTypeIn(await getArticleTypeSnapshot(), value);
}

/** Storable: recognised, whatever its lifecycle. */
export async function isStorableArticleType(value: string | null | undefined): Promise<boolean> {
  return isKnownIn(await getArticleTypeSnapshot(), value);
}

/** Assignable to a NEW article: recognised, selectable and not archived. */
export async function isAssignableArticleType(value: string | null | undefined): Promise<boolean> {
  return isAssignableIn(await getArticleTypeSnapshot(), value);
}

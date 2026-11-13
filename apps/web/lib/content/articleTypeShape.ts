import { ARTICLE_TYPES } from './articleTypes';

/**
 * Batch 04-E — the ISOMORPHIC Article Type shape.
 *
 * WHY THIS MODULE EXISTS. Three of the five Article Type consumers are
 * `'use client'` components (the editor shell, the category archive, the draft
 * preview) and a fourth, `lib/seo.tsx`, is isomorphic and synchronous. None of
 * them can reach the database, and `lib/seo.tsx`'s synchronous signatures are
 * pinned by four existing test suites. So the managed definitions travel to
 * those surfaces as a plain, serialisable SNAPSHOT passed down as props, and
 * every question asked of a snapshot is answered by a pure function here.
 *
 * Nothing in this file imports `server-only`, touches Prisma, or performs I/O.
 */

/** The two structured-data classifications an Article Type may carry. */
export type ArticleSchemaTypeName = 'Article' | 'NewsArticle';

export const ARTICLE_SCHEMA_TYPES: readonly ArticleSchemaTypeName[] = Object.freeze([
  'Article',
  'NewsArticle',
]);

export function isArticleSchemaTypeName(v: unknown): v is ArticleSchemaTypeName {
  return v === 'Article' || v === 'NewsArticle';
}

/** One managed Article Type, as both the database and the fallback express it. */
export interface ManagedArticleType {
  /** Immutable stored identity — exactly what `Article.articleType` holds. */
  value: string;
  label: string;
  description: string | null;
  sortOrder: number;
  /** Offered for NEW classification. */
  selectable: boolean;
  evergreen: boolean;
  schemaType: ArticleSchemaTypeName;
  archived: boolean;
}

/**
 * What a server surface hands to a client component.
 *
 * `source` is carried deliberately: a surface rendering from `'fallback'` is
 * running before the table was bootstrapped (or while it is unreachable), and
 * the admin UI says so out loud rather than presenting stale policy as managed
 * configuration.
 */
export interface ArticleTypeSnapshot {
  source: 'database' | 'fallback';
  types: readonly ManagedArticleType[];
}

/**
 * The in-repository compatibility definition, in snapshot form.
 *
 * Batch 04-A's registry stays the bootstrap seed AND the fallback: a deploy that
 * reaches a database without the table still classifies, validates and renders
 * exactly as it does today. It never overrides the database once rows exist.
 */
export function fallbackArticleTypes(): ManagedArticleType[] {
  return ARTICLE_TYPES.map((t, i) => ({
    value: t.value,
    label: t.label,
    description: null,
    sortOrder: i,
    selectable: t.selectable,
    evergreen: t.evergreen,
    // The compatibility registry's `news` boolean is the ONLY place that flag
    // survives; from here on the single authoritative field is `schemaType`.
    schemaType: t.news ? 'NewsArticle' : 'Article',
    archived: false,
  }));
}

export function fallbackSnapshot(): ArticleTypeSnapshot {
  return { source: 'fallback', types: fallbackArticleTypes() };
}

/**
 * The 23 compatibility values, exactly as stored. Used to judge whether a
 * managed registry holds every definition it was seeded from — a derived
 * check, so it cannot disagree with the table the way a recorded marker could.
 */
export function compatibilityValues(): string[] {
  return ARTICLE_TYPES.map((t) => t.value);
}

// ---- pure reads over a snapshot -------------------------------------------

export function findType(
  snapshot: ArticleTypeSnapshot,
  value: string | null | undefined,
): ManagedArticleType | undefined {
  if (value == null) return undefined;
  return snapshot.types.find((t) => t.value === value);
}

/** Known = storable. Archived and non-selectable values are still known. */
export function isKnownIn(snapshot: ArticleTypeSnapshot, value: string | null | undefined): boolean {
  return !!findType(snapshot, value);
}

/**
 * Assignable to a NEW article: selectable and not archived. This is the check
 * the write boundary applies; "known" is a weaker, read-side question.
 */
export function isAssignableIn(snapshot: ArticleTypeSnapshot, value: string | null | undefined): boolean {
  const t = findType(snapshot, value);
  return !!t && t.selectable && !t.archived;
}

/** Offered in the editor, in configured order. */
export function assignableTypes(snapshot: ArticleTypeSnapshot): ManagedArticleType[] {
  return snapshot.types
    .filter((t) => t.selectable && !t.archived)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

/** Recognised but withdrawn from new classification (inactive or archived). */
export function retiredTypes(snapshot: ArticleTypeSnapshot): ManagedArticleType[] {
  return snapshot.types
    .filter((t) => !t.selectable || t.archived)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

/**
 * Display label for a stored value. An UNKNOWN value is returned unchanged
 * rather than hidden or substituted — a reader and an editor should both see
 * what is actually stored.
 */
export function labelIn(snapshot: ArticleTypeSnapshot, value: string | null | undefined): string {
  if (!value) return '';
  return findType(snapshot, value)?.label ?? value;
}

/**
 * Exact stored values the evergreen query may match, from the MANAGED
 * definitions only.
 *
 * Deliberately unchanged by Batch 04-E.2: a managed flag is authoritative, and
 * this function must never add a value the administrator did not mark. Filling
 * in definitions a registry is missing needs to know whether they were deleted
 * on purpose, which is server-side knowledge — so it lives in
 * `articleTypeRegistry.getEvergreenArticleTypeValues`, not here.
 */
export function evergreenValuesIn(snapshot: ArticleTypeSnapshot): string[] {
  return snapshot.types.filter((t) => t.evergreen).map((t) => t.value);
}

/**
 * The compiled-in evergreen values — the approved matrix, as shipped.
 *
 * Used only to fill definitions a managed registry is genuinely missing, and
 * never to override one it holds.
 */
export function compatibilityEvergreenValues(): string[] {
  return ARTICLE_TYPES.filter((t) => t.evergreen).map((t) => t.value);
}

/**
 * The compiled-in classification for each of the 23 compatibility values,
 * keyed by the EXACT stored string.
 *
 * Exact, not case-folded, for two reasons that pull the same way: `News` and
 * the legacy `news` are distinct stored identities that must each keep their
 * own entry, and a case variant such as `NEWS` is not a recognised type at all
 * — resolving it as news would be classifying an unknown value as
 * `NewsArticle`, which is the one thing this module must never do.
 */
const COMPAT_SCHEMA_TYPE: ReadonlyMap<string, ArticleSchemaTypeName> = new Map(
  ARTICLE_TYPES.map((t) => [t.value, t.news ? ('NewsArticle' as const) : ('Article' as const)]),
);

/**
 * Structured-data classification for a stored value. Three cases, in order.
 *
 *  1. THE SNAPSHOT DEFINES IT → the managed classification wins, always. A
 *     deliberate administrator decision is never overridden by the compiled-in
 *     definition, including when it disagrees with it.
 *
 *  2. THE SNAPSHOT DOES NOT DEFINE IT, BUT THE COMPATIBILITY REGISTRY DOES →
 *     the compiled-in classification applies.
 *
 *     Batch 04-E.1. This case is why the function is no longer a one-liner.
 *     `getArticleTypeSnapshot` already falls back to all 23 definitions when
 *     the table is missing, unreachable or empty, so an outright registry
 *     failure was already safe. What was NOT safe was a snapshot that came
 *     from the database and is INCOMPLETE: the bootstrap inserts row by row
 *     with no transaction, so an interrupted run leaves a real, partial
 *     registry, and before this change a published `News` article would then
 *     have silently declared `Article` to search engines. A recognised type
 *     does not lose its identity because a seeding run was cut short.
 *
 *  3. NOTHING DEFINES IT → `'Article'`.
 *
 *     Conservative on purpose. Claiming `NewsArticle` for a page that is not
 *     news is the misstatement that costs something, so an unrecognised value
 *     can never produce it — there is no trusted definition to justify it.
 */
export function schemaTypeIn(
  snapshot: ArticleTypeSnapshot,
  value: string | null | undefined,
): ArticleSchemaTypeName {
  const managed = findType(snapshot, value);
  if (managed) return managed.schemaType === 'NewsArticle' ? 'NewsArticle' : 'Article';
  if (value == null) return 'Article';
  return COMPAT_SCHEMA_TYPE.get(value) ?? 'Article';
}

/**
 * Filter options for an archive, derived from the articles actually present and
 * labelled from the snapshot.
 *
 * Deriving from the data is what keeps an inactive or archived type visible in
 * the filter while its articles remain public: lifecycle governs NEW
 * classification, never public visibility of work already published.
 */
export function archiveFilterOptions(
  snapshot: ArticleTypeSnapshot,
  articles: readonly { articleType?: string | null }[],
): { value: string; label: string }[] {
  const seen = new Set<string>();
  for (const a of articles) {
    const v = a.articleType?.trim();
    if (v) seen.add(v);
  }
  const ordered = snapshot.types
    .filter((t) => seen.has(t.value))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((t) => ({ value: t.value, label: t.label }));
  const known = new Set(snapshot.types.map((t) => t.value));
  const extras = [...seen]
    .filter((v) => !known.has(v))
    .sort()
    .map((v) => ({ value: v, label: v }));
  return [...ordered, ...extras];
}

// ---- value identity policy ------------------------------------------------

/**
 * Stored-identity normalisation for a NEW type (§9).
 *
 * The policy is deliberately conservative: trim, collapse internal whitespace,
 * keep the administrator's casing. The 18 existing selectable values are
 * human-readable Title Case strings (`Results & Standings`), and a new value
 * must look like them, because the value is what appears in exports, audits and
 * any hand-written query. Nothing is lower-cased or slugified — that would make
 * new values a different species from the ones already stored.
 */
export function normalizeArticleTypeValue(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Case-folded identity. Two values sharing this are the same type. */
export function articleTypeValueKey(value: string): string {
  return normalizeArticleTypeValue(value).toLowerCase();
}

const VALUE_SHAPE = /^[A-Za-z0-9][A-Za-z0-9 &'’\-/.()]*$/;

/**
 * Returns a human sentence when the value is unusable, or `null` when it is
 * fine. Shape is checked rather than silently repaired: a value is a permanent
 * identity, so the administrator must see exactly what will be stored.
 */
export function articleTypeValueError(value: string): string | null {
  const v = normalizeArticleTypeValue(value);
  if (!v) return 'Enter an article type name.';
  if (v.length > 80) return 'An article type value may be at most 80 characters.';
  if (!VALUE_SHAPE.test(v)) {
    return 'Use letters, numbers, spaces and & \' - / . ( ) only, starting with a letter or number.';
  }
  return null;
}

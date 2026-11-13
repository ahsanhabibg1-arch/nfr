import type { ArticleType } from '../../types';

/**
 * Batch 04-A — THE authoritative Article Type definition.
 *
 * WHAT WAS WRONG. `Article.articleType` is a free-text column, and six places
 * each kept their own idea of what could go in it:
 *
 *   1. the editor's dropdown      18 Title-Case values
 *   2. the category archive filter  `['all','feature','analysis','guide','news']`, inline
 *   3. the evergreen query        4 Title-Case values — matching ZERO rows
 *   4. the JSON-LD news check     {`news`,`event update`}, compared lower-cased
 *   5. the draft preview          `articleType || 'Feature'` — a value in no list at all
 *   6. write validation           `z.string().max(80)` — i.e. anything
 *
 * and the database held a seventh vocabulary: every one of the 11 published
 * articles stores a lowercase legacy value (`guide` ×6, `analysis` ×3,
 * `feature` ×2), so **0 of 11 matched the dropdown and 0 of 11 matched the
 * evergreen query**. The consequences were a blank dropdown on every existing
 * article, a permanently empty evergreen surface, and an archive filter that
 * would hide any article an editor "corrected".
 *
 * WHY A CODE REGISTRY AND NOT A DATABASE TABLE. Code branches on this value —
 * JSON-LD `@type`, evergreen eligibility, archive filtering. A dashboard-editable
 * list would let an editor create a value no code path recognises, which is
 * precisely the failure above wearing a new costume. The vocabulary is house
 * style, revised deliberately and rarely. (Subcategory is the opposite on both
 * counts, which is why Batch 04-B gives it a table.)
 *
 * THE COLUMN STAYS `String`. A Prisma enum would make the five legacy values
 * unreadable until the data were rewritten — the opposite of preserving it.
 * Nothing here rewrites, normalises or migrates a stored value.
 */

export interface ArticleTypeDef {
  /** Exactly as stored in `Article.articleType`. */
  value: ArticleType;
  /** Human-readable form, for a chip or an option. */
  label: string;
  /** Offered to editors for NEW classification. Legacy values are not. */
  selectable: boolean;
  /** Eligible for the evergreen surface (owner-approved matrix, Batch 04-A §4). */
  evergreen: boolean;
  /** Emits schema.org `NewsArticle` rather than `Article`. */
  news: boolean;
}

/**
 * The 18 selectable typologies, then the 5 legacy values.
 *
 * The evergreen and news columns are the owner-approved policy, reproduced
 * verbatim rather than inferred. `guide` and `explainer` are evergreen, which is
 * what gives the evergreen surface its six real articles — all 11 rows carry a
 * legacy value, so the legacy flags alone decide whether that surface has any
 * content at all.
 */
export const ARTICLE_TYPES: readonly ArticleTypeDef[] = Object.freeze([
  // ---- selectable ----
  { value: 'News', label: 'News', selectable: true, evergreen: false, news: true },
  { value: 'Event Update', label: 'Event Update', selectable: true, evergreen: false, news: true },
  { value: 'Event Guide', label: 'Event Guide', selectable: true, evergreen: false, news: false },
  { value: 'Schedule', label: 'Schedule', selectable: true, evergreen: false, news: false },
  { value: 'Results & Standings', label: 'Results & Standings', selectable: true, evergreen: false, news: false },
  { value: 'How to Watch', label: 'How to Watch', selectable: true, evergreen: true, news: false },
  { value: 'Preview', label: 'Preview', selectable: true, evergreen: false, news: false },
  { value: 'Competitor Profile', label: 'Competitor Profile', selectable: true, evergreen: false, news: false },
  { value: 'Rules & Format', label: 'Rules & Format', selectable: true, evergreen: true, news: false },
  { value: 'History', label: 'History', selectable: true, evergreen: true, news: false },
  { value: 'Records & Past Winners', label: 'Records & Past Winners', selectable: true, evergreen: true, news: false },
  { value: 'Entertainment Guide', label: 'Entertainment Guide', selectable: true, evergreen: false, news: false },
  { value: 'Ticket Guide', label: 'Ticket Guide', selectable: true, evergreen: true, news: false },
  { value: 'Venue Guide', label: 'Venue Guide', selectable: true, evergreen: true, news: false },
  { value: 'Travel Guide', label: 'Travel Guide', selectable: true, evergreen: true, news: false },
  { value: 'Product Buying Guide', label: 'Product Buying Guide', selectable: true, evergreen: false, news: false },
  { value: 'Product Review', label: 'Product Review', selectable: true, evergreen: false, news: false },
  { value: 'General Information', label: 'General Information', selectable: true, evergreen: true, news: false },
  // ---- legacy: storable and readable forever, never offered for new work ----
  { value: 'guide', label: 'Guide (legacy)', selectable: false, evergreen: true, news: false },
  { value: 'explainer', label: 'Explainer (legacy)', selectable: false, evergreen: true, news: false },
  { value: 'feature', label: 'Feature (legacy)', selectable: false, evergreen: false, news: false },
  { value: 'analysis', label: 'Analysis (legacy)', selectable: false, evergreen: false, news: false },
  { value: 'news', label: 'News (legacy)', selectable: false, evergreen: false, news: true },
]);

const BY_VALUE: ReadonlyMap<string, ArticleTypeDef> = new Map(ARTICLE_TYPES.map((t) => [t.value, t]));

/** Offered in the editor for new classification, in editorial order. */
export const SELECTABLE_ARTICLE_TYPES: readonly ArticleTypeDef[] = ARTICLE_TYPES.filter((t) => t.selectable);

/** Recognised but not offered. Present so old articles keep working. */
export const LEGACY_ARTICLE_TYPES: readonly ArticleTypeDef[] = ARTICLE_TYPES.filter((t) => !t.selectable);

/** Exact stored values the evergreen query may match. */
export const EVERGREEN_ARTICLE_TYPE_VALUES: readonly string[] = ARTICLE_TYPES.filter((t) => t.evergreen).map((t) => t.value);

export function articleTypeDef(value: string | null | undefined): ArticleTypeDef | undefined {
  return value == null ? undefined : BY_VALUE.get(value);
}

/**
 * Write-boundary check — deliberately EXACT, not case-insensitive.
 *
 * This is the one place where tolerance would be a mistake. The evergreen query
 * is an exact SQL `IN` over `EVERGREEN_ARTICLE_TYPE_VALUES`, so accepting
 * `'GUIDE'` on save would store a value that passes validation and then silently
 * fails to match the query — the exact bug class this batch exists to remove.
 * Rejecting it at the boundary keeps "stored" and "queryable" the same set.
 */
export function isKnownArticleType(value: string | null | undefined): boolean {
  return value != null && BY_VALUE.has(value);
}

export function isSelectableArticleType(value: string | null | undefined): boolean {
  return !!articleTypeDef(value)?.selectable;
}

export function isLegacyArticleType(value: string | null | undefined): boolean {
  const def = articleTypeDef(value);
  return !!def && !def.selectable;
}

export function isEvergreenType(value: string | null | undefined): boolean {
  return !!articleTypeDef(value)?.evergreen;
}

/**
 * schema.org type selector. Kept CASE-INSENSITIVE on purpose: this is a read
 * over data that already exists, and the behaviour it replaces
 * (`NEWS_ARTICLE_TYPES` compared via `.trim().toLowerCase()`) tolerated both
 * `News` and `news`. Narrowing it here would change structured data on live
 * pages, which this batch must not do.
 */
export function isNewsType(value: string | null | undefined): boolean {
  const key = (value ?? '').trim().toLowerCase();
  if (!key) return false;
  for (const t of ARTICLE_TYPES) {
    if (t.news && t.value.toLowerCase() === key) return true;
  }
  return false;
}

/**
 * Display label for a stored value. An UNKNOWN value is returned unchanged
 * rather than hidden or replaced: a reader and an editor should both see what is
 * actually stored. (The draft preview used to substitute the literal 'Feature'
 * for an empty value, inventing a seventh vocabulary.)
 */
export function articleTypeLabel(value: string | null | undefined): string {
  if (!value) return '';
  return articleTypeDef(value)?.label ?? value;
}

/**
 * Filter options for an archive, derived from the articles actually present.
 *
 * The archive used to hardcode four lowercase values, so an article typed with
 * any of the 18 selectable types vanished from every button but "All". Deriving
 * from the data makes both failure directions impossible: no option can be empty
 * and no present type can be missing.
 */
export function articleTypeOptionsFor(
  articles: readonly { articleType?: string | null }[],
): { value: string; label: string }[] {
  const seen = new Set<string>();
  for (const a of articles) {
    const v = a.articleType?.trim();
    if (v) seen.add(v);
  }
  // Registry order first (editorial order, legacy last), then any unrecognised
  // stored value so nothing can hide.
  const ordered = ARTICLE_TYPES.filter((t) => seen.has(t.value)).map((t) => ({ value: t.value, label: t.label }));
  const extras = [...seen].filter((v) => !BY_VALUE.has(v)).sort().map((v) => ({ value: v, label: v }));
  return [...ordered, ...extras];
}

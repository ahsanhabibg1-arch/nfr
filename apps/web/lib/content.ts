import 'server-only';
import { WorkflowStatus } from '@prisma/client';
import { prisma } from './db';
import { publicArticleWhere } from './fixturePolicy';
import { articleInclude, toArticle, toDiscipline } from './mappers';
import { Article, Discipline, SearchIndexItem } from '../types';
import { PRIMARY_SECTIONS, SectionMeta } from '../config/routes';
import { ACTIVE_ONLY } from './cms/lifecycle';
import { EVERGREEN_ARTICLE_TYPE_VALUES } from './content/articleTypes';
import { getEvergreenArticleTypeValues } from './cms/articleTypeRegistry';

/**
 * NFRGuide — Server-only published content repository (Batch 02 §8).
 *
 * Every PUBLIC read goes through here. All article reads are constrained to
 * `workflowStatus = PUBLISHED`, so draft / in_review / approved / scheduled /
 * archived content can never reach a public response (eligibility is enforced
 * in the database query, not the client). This module is `server-only`.
 *
 * It replaces the Batch 01 static adapter of the same name and path, so the
 * public pages' imports are unchanged (their calls simply became `await`ed).
 *
 * Phase 2: the homepage/section modules that were Phase 0 static content are now
 * fed from published articles (and the DB rodeo directory); no static mock data
 * reaches public pages. Quick-access is plain navigation (config/quickAccess.ts).
 */

const PUBLISHED = WorkflowStatus.PUBLISHED;

// ---- Articles --------------------------------------------------------------

export async function getPublishedArticles(): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: { ...publicArticleWhere() },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  return rows.map(toArticle);
}

export async function getPublishedArticleBySlug(slug: string): Promise<Article | null> {
  const row = await prisma.article.findFirst({
    where: { slug, ...publicArticleWhere() },
    include: articleInclude,
  });
  return row ? toArticle(row) : null;
}

/** `Category.name` -> the slug the public archive is addressed by. */
export function sectionCategorySlug(categoryKey: string): string {
  return categoryKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Stage 06 (UI-02 / UI-03) — resolve a section token to a managed `Category.id`.
 *
 * THE DEFECT THIS REPLACES. `getPublishedArticlesBySection` matched
 * `category: { name: token }` and nothing else, so it silently returned ZERO
 * rows whenever the token was not character-for-character a `Category.name`:
 *
 *   - `lib/cms/detailTemplateData.ts` passes SECTION IDS (`'rodeo-events'`,
 *     `'competition'`). No category is named that, so every related-article rail
 *     on those detail templates was permanently empty.
 *   - `Category.name` is an editor-facing display string (`@unique`, editable in
 *     the admin) while `config/routes.ts` holds a hardcoded copy of it in
 *     `categoryKey`. Renaming a category in the admin therefore emptied three
 *     homepage sections with no error anywhere — the exact class of defect the
 *     Stage 06 brief calls out as "hardcoded category names used as query logic".
 *
 * A name match alone also cannot be trusted going forward, so resolution now
 * accepts, in order: an exact `Category.name`, the archive `slug`, or a
 * `PRIMARY_SECTIONS` key/id — and then selects by `categoryId`.
 *
 * Selecting by `categoryId` is also what makes descendants work. `Article.categoryId`
 * is REQUIRED and `subcategoryTaxon` is a COMPOSITE foreign key on
 * `(categoryId, subcategoryId)`, so PostgreSQL guarantees that an article in a
 * subcategory already carries that subcategory's parent `categoryId`. One
 * `categoryId` predicate therefore returns direct-category AND every descendant
 * article, with no join and no second query — which is why this fix needs no
 * schema change and cannot drift from the archive's own view.
 *
 * Returns null when nothing matches, so the caller renders its real empty state
 * rather than a misleading full feed.
 */
/**
 * A section's category, by the most stable reference the caller has.
 *
 * `categoryId` is the Builder's persisted, immutable link (Stage 06-R / R-01).
 * `token` is the legacy display-name / slug / section-id string, kept so every
 * existing call site and every stored layout keeps working untouched.
 */
export interface SectionCategoryRef {
  categoryId?: string | null;
  token?: string | null;
}

/**
 * Stage 06-R (R-01) — resolution is ORDERED, and each step is its own query.
 *
 * The Stage 06 version used one `findFirst` with `OR: [{name: {in: …}}, {slug:
 * {in: …}}]`. That returns an ARBITRARY row when more than one matches — if a
 * category is named "More Rodeo" while a different one is slugged `more-rodeo`,
 * the database picks, and the homepage silently shows the wrong section's
 * articles. Ambiguity must not be resolved by chance, so the candidates are
 * tried strictly in order of how much they can be trusted:
 *
 *   1. `categoryId` — the Builder's stored link. Immutable: renaming the
 *      category or changing its slug cannot break it.
 *   2. an exact `Category.name` match on the token (legacy configuration).
 *   3. an exact `Category.slug` match on the token.
 *   4. the `PRIMARY_SECTIONS` entry the token names, by its `categoryKey`…
 *   5. …then by that key's derived archive slug.
 *
 * Steps 2–5 are why a rename is survivable in BOTH directions: a renamed
 * display name is still found by slug, and a changed slug is still found by
 * name. Only changing both at once defeats them, which is exactly what step 1
 * exists for.
 *
 * A `categoryId` that no longer exists falls through to the token rather than
 * failing hard, and a token that matches nothing returns null so the caller
 * renders its real empty state instead of an unrelated feed.
 */
export interface ResolvedSectionCategory {
  id: string;
  name: string;
  slug: string;
}

export type SectionCategoryResolution =
  | { ok: true; category: ResolvedSectionCategory }
  /** An explicit `categoryId` was configured and does not resolve. */
  | { ok: false; reason: 'invalid-id' }
  /** No explicit id, and the legacy token matched nothing. */
  | { ok: false; reason: 'unresolved' };

/**
 * Stage 06-R FC-01 — an explicit id that does not resolve now FAILS SAFE.
 *
 * It used to fall through to the legacy token. That is wrong whenever the two
 * disagree, and they disagree in exactly the case that matters: an administrator
 * who deliberately pointed the Entertainment SLOT at some other category, via
 * `categoryId`, and whose chosen category is later deleted. Falling through
 * would quietly start publishing the compiled-in Entertainment feed under their
 * heading — a silent switch to an unrelated category, with no error anywhere.
 *
 * Explicit configuration is therefore authoritative in BOTH directions: when it
 * resolves it wins, and when it does not resolve the section shows nothing and
 * reports `invalid-id`, which the homepage surfaces as a distinct empty state.
 * An administrator can see and fix that; a silently wrong feed they cannot.
 *
 * The legacy ladder below is unchanged and still applies when NO explicit id is
 * stored, so every pre-existing layout behaves exactly as before.
 */
export async function resolveSectionCategoryResult(
  ref: SectionCategoryRef | string,
): Promise<SectionCategoryResolution> {
  const { categoryId, token } = typeof ref === 'string' ? { categoryId: null, token: ref } : ref;
  const select = { id: true, name: true, slug: true } as const;

  const stableId = (categoryId ?? '').trim();
  if (stableId) {
    const byId = await prisma.category.findUnique({ where: { id: stableId }, select });
    return byId ? { ok: true, category: byId } : { ok: false, reason: 'invalid-id' };
  }

  const raw = (token ?? '').trim();
  if (!raw) return { ok: false, reason: 'unresolved' };

  const section = getSectionMetaByCategorySlug(raw);
  const candidates: Array<{ name: string } | { slug: string }> = [
    { name: raw },
    { slug: raw },
    ...(section ? [{ name: section.categoryKey }, { slug: sectionCategorySlug(section.categoryKey) }] : []),
  ];

  for (const where of candidates) {
    const row = await prisma.category.findFirst({ where, select });
    if (row) return { ok: true, category: row };
  }
  return { ok: false, reason: 'unresolved' };
}

/** Convenience wrapper: the category, or null however it failed. */
export async function resolveSectionCategory(
  ref: SectionCategoryRef | string,
): Promise<ResolvedSectionCategory | null> {
  const r = await resolveSectionCategoryResult(ref);
  return r.ok ? r.category : null;
}

export async function getPublishedArticlesBySection(
  categoryKey: string | SectionCategoryRef,
  opts: { limit?: number; excludeIds?: string[] } = {},
): Promise<Article[]> {
  const category = await resolveSectionCategory(categoryKey);
  if (!category) return [];
  const categoryId = category.id;

  const rows = await prisma.article.findMany({
    where: {
      ...publicArticleWhere(),
      // Direct-category AND descendant-subcategory articles — see the note on
      // `resolveSectionCategoryId` for why one predicate covers both.
      categoryId,
      ...(opts.excludeIds?.length ? { id: { notIn: opts.excludeIds } } : {}),
    },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    ...(opts.limit ? { take: opts.limit } : {}),
  });
  return rows.map(toArticle);
}

/**
 * Stage 09 (PERF) — an article with its BODY removed, for card rendering.
 *
 * MEASURED: the homepage serialized 16 complete articles — every paragraph of
 * `content` and every block of `structuredBody` — into React's client payload
 * so that cards could show a title, a deck and a thumbnail. The section landing
 * and category archives do the same through their own resolvers, because each
 * one hands `Article[]` to a client view.
 *
 * No card component reads either field (verified across every section and
 * archive view), so emptying them changes nothing that renders. The shape stays
 * `Article`, so no component prop, type or call site changes — which is what
 * makes this safe to apply at several resolvers at once.
 *
 * Detail pages are unaffected: they fetch their own article and render the body
 * from that, never from a card list.
 */
export function toCardArticle(a: Article): Article {
  return { ...a, content: [], structuredBody: undefined };
}

/** `toCardArticle` over a list, preserving order. */
export function toCardArticles(list: readonly Article[]): Article[] {
  return list.map(toCardArticle);
}

/**
 * How much body text a lead-carrying card may keep, in characters.
 *
 * Sized from the surface that asked for it: the homepage's featured card is
 * about 64 characters to the line and, beside a five-card column, has room for
 * roughly a dozen. `deck` and `excerpt` supply the first five, so ~480 more
 * characters covers the rest with a margin. Kept well under a full paragraph
 * so the bound stays the point.
 */
export const CARD_LEAD_MAX_CHARS = 480;

/**
 * A card article that keeps a BOUNDED opening of the body. Opt-in.
 *
 * WHY THIS EXISTS, ALONGSIDE `toCardArticle` RATHER THAN REPLACING IT.
 * Stripping the body was a measured fix: the homepage was serialising sixteen
 * complete articles — every paragraph, every block — so that cards could show
 * a title and a deck. That stays the default, and every list that does not ask
 * for a lead still gets nothing.
 *
 * But one card does need running text. The homepage's featured card is as tall
 * as the column of cards beside it, and `deck` + `excerpt` run out several
 * lines short of that, leaving a blank band no CSS can close — a clamp limits
 * text, it cannot produce any. The honest options were to crop the photograph
 * to fill the space or to show a little more of the article, and the second is
 * what a reader is actually served by.
 *
 * The bound is what keeps this from undoing the fix: at `CARD_LEAD_MAX_CHARS`
 * a sixteen-card payload grows by single-digit kilobytes, against the hundreds
 * the full bodies cost. The DB cost is nil — `articleInclude` already loads
 * the blocks, so this only changes how much of what is already in memory
 * crosses to the client.
 *
 * `structuredBody` stays stripped either way: nothing renders it from a card,
 * and it is the larger of the two fields.
 */
export function toCardArticleWithLead(a: Article, maxChars = CARD_LEAD_MAX_CHARS): Article {
  const lead = buildCardLead(a.content, maxChars);
  return { ...a, content: lead ? [lead] : [], structuredBody: undefined };
}

/** `toCardArticleWithLead` over a list, preserving order. */
export function toCardArticlesWithLead(list: readonly Article[], maxChars = CARD_LEAD_MAX_CHARS): Article[] {
  return list.map((a) => toCardArticleWithLead(a, maxChars));
}

/**
 * The opening of a body, trimmed to `maxChars` on a WORD boundary.
 *
 * Paragraphs are joined so a short opening paragraph does not strand the bound
 * — several two-line paragraphs are common. Cutting mid-word reads as a fault
 * rather than a continuation, so the trim steps back to the last space and
 * drops a trailing comma or similar; the ellipsis then reads as deliberate.
 * Returns `''` when there is no body, which callers treat as "no lead".
 */
export function buildCardLead(paragraphs: readonly string[], maxChars = CARD_LEAD_MAX_CHARS): string {
  const joined = paragraphs
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!joined) return '';
  if (joined.length <= maxChars) return joined;

  const cut = joined.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  // A single word longer than the bound is pathological; fall back to the hard
  // cut rather than returning nothing.
  const trimmed = (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.—-]+$/, '');
  return `${trimmed}…`;
}

/* ── /coverage/ archive (Stage 06-R, R-04) ─────────────────────────── */

export const COVERAGE_SORTS = ['newest', 'oldest', 'title'] as const;
export type CoverageSort = (typeof COVERAGE_SORTS)[number];

export interface CoverageQuery {
  q?: string;
  /** Archive slug of a category to filter by. */
  categorySlug?: string;
  sort?: CoverageSort;
  page?: number;
  pageSize?: number;
}

export interface CoveragePage {
  articles: Article[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** The filters actually applied, after clamping — what the view should echo. */
  applied: { q: string; categorySlug: string; sort: CoverageSort };
}

/**
 * One bounded page of publicly eligible articles for the site-wide archive.
 *
 * Eligibility is `publicArticleWhere()` — the same predicate every other public
 * read uses — so drafts, in-review, archived and scheduled rows are excluded in
 * the DATABASE, not the view. Editor `noindex` is deliberately NOT treated as
 * unpublished: it withholds an article from search engines, not from readers,
 * and the sitemap already models that distinction.
 *
 * Every input is clamped before it reaches Prisma: the page size is bounded, the
 * page number is bounded by the real total, and the sort is an enum. An
 * unbounded or injected query parameter therefore cannot produce an unbounded
 * scan or an arbitrary ordering.
 */
export async function listCoverageArticles(query: CoverageQuery = {}): Promise<CoveragePage> {
  const pageSize = Math.min(48, Math.max(6, Math.round(query.pageSize ?? 12)));
  const q = (query.q ?? '').trim().slice(0, 120);
  const categorySlug = (query.categorySlug ?? '').trim().slice(0, 120);
  const sort: CoverageSort = COVERAGE_SORTS.includes(query.sort as CoverageSort)
    ? (query.sort as CoverageSort)
    : 'newest';

  const where = {
    ...publicArticleWhere(),
    ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { excerpt: { contains: q, mode: 'insensitive' as const } },
            { deck: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const total = await prisma.article.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // `Number.NaN` survives Math.max/min and would reach Prisma as `skip: NaN`,
  // which throws. The route already sanitises its query string, but this
  // function is called directly too, so it clamps its own input.
  const requested = Number(query.page ?? 1);
  const page = Number.isFinite(requested) ? Math.min(Math.max(1, Math.round(requested)), totalPages) : 1;

  // `id` is the deterministic tie-break: without it two articles published in
  // the same second can swap places between pages and one can be skipped.
  const orderBy =
    sort === 'oldest'
      ? [{ publishedAt: 'asc' as const }, { id: 'asc' as const }]
      : sort === 'title'
        ? [{ title: 'asc' as const }, { id: 'asc' as const }]
        : [{ publishedAt: 'desc' as const }, { id: 'desc' as const }];

  const rows = await prisma.article.findMany({
    where,
    include: articleInclude,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    articles: rows.map(toArticle),
    total,
    page,
    pageSize,
    totalPages,
    applied: { q, categorySlug, sort },
  };
}

/** Categories that currently have at least one publicly eligible article. */
export async function listCoverageCategories(): Promise<{ name: string; slug: string; count: number }[]> {
  const rows = await prisma.category.findMany({
    select: {
      name: true,
      slug: true,
      _count: { select: { articles: { where: publicArticleWhere() } } },
    },
    orderBy: { sortOrder: 'asc' },
  });
  return rows
    .map((r) => ({ name: r.name, slug: r.slug, count: r._count.articles }))
    .filter((r) => r.count > 0);
}

/** Published articles for hand-picked IDs, returned in the given order (unpublished/missing IDs are dropped). */
export async function getPublishedArticlesByIds(ids: string[]): Promise<Article[]> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 50);
  if (unique.length === 0) return [];
  const rows = await prisma.article.findMany({
    where: { ...publicArticleWhere(), id: { in: unique } },
    include: articleInclude,
  });
  const byId = new Map(rows.map((r) => [r.id, toArticle(r)]));
  return unique.map((id) => byId.get(id)).filter((a): a is Article => Boolean(a));
}

export async function getPublishedArticlesByCategory(categorySlug: string): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: { ...publicArticleWhere(), category: { slug: categorySlug } },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  return rows.map(toArticle);
}

export async function getPublishedArticlesByDiscipline(
  disciplineSlug: string,
  limit = 3,
): Promise<Article[]> {
  const linked = await prisma.article.findMany({
    where: { ...publicArticleWhere(), disciplines: { some: { discipline: { slug: disciplineSlug } } } },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  if (linked.length > 0) return linked.map(toArticle);

  // Fallback: competition coverage when no explicit links exist.
  const fallback = await prisma.article.findMany({
    where: { ...publicArticleWhere(), category: { name: 'NFR Competition' } },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return fallback.map(toArticle);
}

export async function getRelatedPublishedArticles(
  articleId: string,
  limit = 3,
): Promise<Article[]> {
  const curated = await prisma.article.findMany({
    where: {
      ...publicArticleWhere(),
      id: { not: articleId },
      relatedFrom: { some: { sourceId: articleId } },
    },
    include: articleInclude,
    take: limit,
  });
  if (curated.length > 0) return curated.map(toArticle);

  const current = await prisma.article.findUnique({
    where: { id: articleId },
    select: { categoryId: true },
  });
  const rows = await prisma.article.findMany({
    where: {
      ...publicArticleWhere(),
      id: { not: articleId },
      ...(current ? { categoryId: current.categoryId } : {}),
    },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map(toArticle);
}

/** Batch 01 compatibility alias (same published-only guarantee). */
export const getRelatedArticles = getRelatedPublishedArticles;

/**
 * Resolve a public article URL that no longer renders to its redirect target
 * (ADM-14 / WEB-11; corrected in Stage 03, defect D-1).
 *
 * THE DEFECT THIS REPLACES. This function used to take a bare SLUG and look up
 * `/articles/<slug>/`, and it validated the destination against an
 * `/articles/...`-only regular expression. But an article that has a
 * subcategory lives at `/<subcategory>/<slug>/`, and that is exactly the path
 * `syncUrlRedirect` stores when such an article is renamed. So the write path
 * saved a correct 308 and the read path looked for it under a different key:
 * the old URL returned 404 while a perfectly good redirect sat in the table,
 * unreachable. Subcategory URLs are the site's primary article form, so this
 * affected the main content type.
 *
 * It now takes the ACTUAL REQUESTED PATH, which is the only thing that can be
 * matched against `sourcePath` for both URL shapes, and both route consumers
 * pass what the reader asked for.
 *
 * Destination validation moved to `lib/redirects/resolve.ts`, which proves the
 * target resolves to a live public entity and returns that entity's CURRENT
 * canonical URL rather than the stored string — so a stale target becomes one
 * hop instead of two, and a dead one falls through to `notFound()`.
 */
export async function resolveArticleRedirect(
  requestPath: string,
): Promise<{ destination: string; permanent: boolean } | null> {
  const { resolveRedirect } = await import('./redirects/resolve');
  const hit = await resolveRedirect(requestPath);
  return hit ? { destination: hit.destination, permanent: hit.permanent } : null;
}

export async function getPublishedArticleSlugs(): Promise<string[]> {
  const rows = await prisma.article.findMany({
    where: { ...publicArticleWhere() },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

// ---- Homepage feeds --------------------------------------------------------

export async function getHeroArticle(): Promise<Article | null> {
  const lead = await prisma.article.findFirst({
    where: { ...publicArticleWhere(), isLeadHero: true },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  if (lead) return toArticle(lead);
  const latest = await prisma.article.findFirst({
    where: { ...publicArticleWhere() },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  return latest ? toArticle(latest) : null;
}

export async function getSecondaryHeroStories(limit = 2, excludeId?: string): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: {
      ...publicArticleWhere(),
      isFeatured: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map(toArticle);
}

export async function getLatestArticles(limit = 6, excludeIds: string[] = []): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: {
      ...publicArticleWhere(),
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map(toArticle);
}

/** Article types treated as evergreen learning content (Requirements v2.0 §6.2 seed types). */
/**
 * Batch 04-A — derived from the authoritative registry, not a second list.
 *
 * This used to be four hardcoded Title-Case values. Every one of the 11
 * published articles stores a lowercase legacy value, so the SQL `IN` below
 * matched **zero rows** and the evergreen surface was permanently, silently
 * empty. The registry marks `guide` and `explainer` evergreen per the approved
 * matrix, which is what gives the surface its six real articles.
 *
 * Batch 04-E — the eligibility list is now ADMINISTRATOR-MANAGED, so this
 * constant is no longer what the query reads. It is kept, unchanged, as the
 * compatibility value for existing importers and as the documented fallback
 * when the managed table has not been initialised.
 *
 * @deprecated for querying — use `getEvergreenArticleTypeValues()`, which
 * returns the managed list and falls back to exactly this one.
 */
export const EVERGREEN_ARTICLE_TYPES: readonly string[] = EVERGREEN_ARTICLE_TYPE_VALUES;

export async function getEvergreenArticles(limit = 4): Promise<Article[]> {
  /**
   * Batch 04-E — eligibility comes from the managed registry.
   *
   * One extra read per call, cached in-process for 10 s and shared with the
   * editor and the JSON-LD path, so this is not an N+1: the article query
   * itself is unchanged, still a single `findMany`.
   *
   * An EMPTY list would silently empty the surface — the Batch 04-A failure —
   * so the registry never returns one: it falls back to the compatibility
   * values when the table is absent or uninitialised.
   */
  const evergreenValues = await getEvergreenArticleTypeValues();
  const rows = await prisma.article.findMany({
    // `publicArticleWhere()` is applied first and unchanged, so publication,
    // visibility and fixture filtering keep their existing behaviour.
    where: { ...publicArticleWhere(), articleType: { in: evergreenValues } },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map(toArticle);
}

/**
 * Upper bound for the client-side quick-search index (Stage 09, PERF).
 *
 * This index is fetched by the public layout and serialized into EVERY public
 * page so the ⌘K modal can filter it in the browser. It was unbounded: every
 * published article, forever, on every page load, whether or not anyone opened
 * search. At today's volume that is small, but it grows without limit and the
 * cost is paid by every visitor on every page.
 *
 * 300 newest articles keeps the modal useful — it filters by title and deck,
 * and anything older is reached through `/search/`, which is server-side,
 * paginated and searches the full corpus. A cap is not a feature change; it is
 * the difference between a bounded page weight and one that tracks the archive.
 */
export const SEARCH_INDEX_LIMIT = 300;

export async function getPublishedSearchIndex(): Promise<SearchIndexItem[]> {
  const rows = await prisma.article.findMany({
    where: { ...publicArticleWhere() },
    select: { id: true, slug: true, title: true, deck: true, readTime: true, category: { select: { name: true } } },
    orderBy: { publishedAt: 'desc' },
    take: SEARCH_INDEX_LIMIT,
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    deck: r.deck ?? '',
    category: r.category.name,
    readTime: r.readTime ?? '',
  }));
}

// ---- Categories & disciplines ---------------------------------------------

export async function getPublishedCategories(): Promise<{ slug: string; name: string }[]> {
  const rows = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  return rows.map((c) => ({ slug: c.slug, name: c.name }));
}

/** Category row by slug (for landing SEO/FAQ keying — Batch 11). */
export async function getCategoryBySlug(slug: string): Promise<{ id: string; slug: string; name: string; description: string | null } | null> {
  const c = await prisma.category.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, description: true } });
  return c ?? null;
}

/**
 * Issue 03 — attach the Media Library asset behind each discipline hero.
 *
 * `Discipline.image` stores a URL string rather than a media id, so the asset
 * is looked up by that URL — the same thing the SEO audit engine does. ONE
 * batched query for the whole set, so a list of disciplines costs a constant
 * extra query rather than one per row. Heroes that are not DAM-managed (a
 * `/assets/images/…` path, or empty) are skipped entirely and simply resolve to
 * the existing fallback behaviour.
 */
async function withHeroAssets<T extends { image: string | null }>(
  rows: T[],
): Promise<(T & { heroAsset: Parameters<typeof toDiscipline>[0]['heroAsset'] })[]> {
  const urls = [...new Set(rows.map((r) => r.image).filter((u): u is string => !!u && u.startsWith('/api/media/')))];
  const assets = urls.length
    ? await prisma.mediaAsset.findMany({
        where: { url: { in: urls } },
        select: { url: true, altText: true, caption: true, derivatives: true, width: true, height: true, storageKey: true },
      })
    : [];
  const byUrl = new Map(assets.map((a) => [a.url, { ...a, url: a.url }]));
  return rows.map((r) => ({ ...r, heroAsset: (r.image && byUrl.get(r.image)) || null }));
}

export async function getAllDisciplines(): Promise<Discipline[]> {
  // Archived disciplines leave active listings (lib/cms/lifecycle.ts).
  /**
   * Batch 05 — the managed classification is included so the public Competition
   * filter can group by a stable id instead of the display label.
   *
   * The include is attempted and the query retried without it if the table does
   * not exist, because this function feeds the homepage and the Competition
   * section: those pages must still render on an environment where the
   * classification migration has not been applied. Falling back costs one extra
   * query only in that case, and `toDiscipline` already treats the relation as
   * optional.
   */
  let rows;
  try {
    rows = await prisma.discipline.findMany({
      where: ACTIVE_ONLY,
      orderBy: { sortOrder: 'asc' },
      include: { classification: { select: { id: true, name: true, pluralName: true } } },
    });
  } catch {
    rows = await prisma.discipline.findMany({ where: ACTIVE_ONLY, orderBy: { sortOrder: 'asc' } });
  }
  return (await withHeroAssets(rows)).map(toDiscipline);
}

export async function getRodeoDisciplineBySlug(slug: string): Promise<Discipline | null> {
  const row = await prisma.discipline.findUnique({ where: { slug } });
  if (!row) return null;
  const [enriched] = await withHeroAssets([row]);
  return toDiscipline(enriched);
}

/** Batch 01 compatibility alias. */
export const getDisciplineBySlug = getRodeoDisciplineBySlug;

// ---- Section route metadata (config defaults merged with DB overrides) ------

export async function getSectionMeta(sectionKey: string): Promise<SectionMeta | undefined> {
  const base = PRIMARY_SECTIONS[sectionKey];
  if (!base) return undefined;
  const override = await prisma.sectionConfig.findUnique({ where: { sectionKey } });
  if (!override) return base;
  return {
    ...base,
    name: override.displayName || base.name,
    tagline: override.tagline || base.tagline,
    description: override.description || base.description,
  };
}

export function getAllSectionKeys(): string[] {
  return Object.keys(PRIMARY_SECTIONS);
}

export function getSectionMetaByCategorySlug(slug: string): SectionMeta | undefined {
  const clean = slug.toLowerCase();
  return Object.values(PRIMARY_SECTIONS).find(
    (s) => s.id === clean || s.categoryKey.toLowerCase().replace(/[^a-z0-9]+/g, '-') === clean,
  );
}

/**
 * Stage 02 (H-02, H-03) — the ONE resolver for a category archive's editorial
 * identity, shared by `/categories/[slug]` metadata and its rendered view.
 *
 * THE DEFECT IT REPLACES. `/[section]` applied the administrator's
 * `SectionConfig` override through `getSectionMeta`, while `/categories/[slug]`
 * called the synchronous `getSectionMetaByCategorySlug`, which reads
 * `config/routes.ts` and nothing else. The same section rendered under two
 * public URLs disagreed about its own name and description, and the
 * administrator-editable `Category.description` was read by neither.
 *
 * PRECEDENCE, highest first. Each field resolves independently, and an empty
 * string never wins — a blank override falls through to the next source:
 *
 *   NAME         SectionConfig.displayName → Category.name → config name → slug
 *   DESCRIPTION  SectionConfig.description → Category.description → config description
 *
 * `EntitySeo` sits ABOVE both and is applied later by `mergeSeoMeta`, so an
 * explicit SEO title/description override stays authoritative for metadata.
 * That ordering is deliberate: `SectionConfig` is the per-section presentation
 * override an administrator set in Settings, `Category` is the general
 * editorial record, and `config/routes.ts` is the shipped default for the five
 * foundational sections.
 *
 * `known` is false only when the slug names NEITHER a canonical section NOR a
 * managed category — the Stage 01 (B-01) noindex condition, now computed once
 * instead of at each call site.
 */
export interface CategoryArchiveIdentity {
  known: boolean;
  /** Canonical section key when this slug is one of the five, else null. */
  sectionKey: string | null;
  /** Managed `Category.id` when a row exists — the key for EntitySeo and FAQs. */
  categoryId: string | null;
  /** The name articles are classified under, used to select them. */
  categoryKey: string | null;
  name: string;
  description: string;
}

export async function resolveCategoryArchive(slug: string): Promise<CategoryArchiveIdentity> {
  const section = getSectionMetaByCategorySlug(slug);
  const [row, override] = await Promise.all([
    prisma.category.findUnique({
      where: { slug },
      select: { id: true, name: true, description: true },
    }),
    section
      ? prisma.sectionConfig.findUnique({ where: { sectionKey: section.id } })
      : Promise.resolve(null),
  ]);

  const pick = (...candidates: (string | null | undefined)[]): string =>
    candidates.find((c) => typeof c === 'string' && c.trim().length > 0)?.trim() ?? '';

  const name = pick(override?.displayName, row?.name, section?.name, slug.replace(/-/g, ' '));
  const description = pick(override?.description, row?.description, section?.description);

  return {
    known: !!section || !!row,
    sectionKey: section?.id ?? null,
    categoryId: row?.id ?? null,
    // Articles are classified by the section's canonical key when there is one,
    // otherwise by the managed category's own name.
    categoryKey: section?.categoryKey ?? row?.name ?? null,
    name,
    description,
  };
}

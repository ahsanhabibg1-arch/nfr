import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { PRIMARY_SECTIONS } from '../../config/routes';
import { normalizeQuery, highlightTokens, buildExcerpt } from './query';
import type {
  PublicSearchResult,
  SearchFilters,
  SearchResponse,
  SearchSort,
  SearchTypeFilter,
} from './types';

/**
 * Public internal-search engine (Batch 07 §3–§5). Server-only.
 *
 * Articles use PostgreSQL full-text search over a DB-managed weighted `tsvector`
 * (title=A, deck/excerpt=B, subcategory/articleType=C) with a GIN index, ranked by
 * `ts_rank_cd`. Queries are PARAMETERIZED via `websearch_to_tsquery`, which both
 * prevents SQL injection and gives safe, Google-like operator handling of quotes,
 * OR/‑term, and stray punctuation (§5 special-character/Unicode/long-query cases).
 *
 * Disciplines (7) and primary sections (5) are a tiny, bounded set, so they are
 * ranked in-memory with a deterministic, explainable scorer — never an unbounded
 * wildcard body scan. Only entities with a real public canonical URL are returned.
 *
 * RANKING (documented): articles → `ts_rank_cd('{D,C,B,A}', vector, query)` with
 * weights {A:1.0, B:0.4, C:0.2, D:0.1}; ties broken by publishedAt desc then id desc
 * (deterministic pagination). "Newest" sort orders purely by publishedAt desc, id desc.
 */

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 50;
const SIDE_LIMIT = 6; // max discipline/section results shown alongside articles

interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  deck: string | null;
  excerpt: string;
  heroImageUrl: string | null;
  publishedAt: Date | null;
  updatedAt: Date | null;
  categoryName: string;
  categorySlug: string;
  rank: number;
}

function clampPage(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
}
function clampPageSize(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return PAGE_SIZE_DEFAULT;
  return Math.min(PAGE_SIZE_MAX, Math.max(1, Math.floor(v)));
}
function normType(t: unknown): SearchTypeFilter {
  return t === 'article' || t === 'discipline' || t === 'section' || t === 'rodeo' ? t : 'all';
}
function normSort(s: unknown): SearchSort {
  return s === 'newest' ? 'newest' : 'relevance';
}

/** Deterministic, explainable scorer for the small discipline/section sets. */
function scoreText(haystacks: (string | null | undefined)[], tokens: string[], normalized: string): number {
  let score = 0;
  for (const raw of haystacks) {
    const h = (raw ?? '').toLowerCase();
    if (!h) continue;
    if (h === normalized) score += 10;
    else if (h.startsWith(normalized)) score += 4;
    else if (normalized.length >= 2 && h.includes(normalized)) score += 3;
    for (const t of tokens) if (h.includes(t)) score += 1;
  }
  return score;
}

export async function runPublicSearch(input: Partial<SearchFilters> & { q?: string }): Promise<SearchResponse> {
  const { text: q } = normalizeQuery(input.q ?? '');
  const tokens = highlightTokens(q);
  const type = normType(input.type);
  const sort = normSort(input.sort);
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const category = (input.category || null) as string | null;
  const discipline = (input.discipline || null) as string | null;

  const filters: SearchFilters = { q, type, category, discipline, sort, page, pageSize };
  const empty: SearchResponse = {
    query: input.q ?? '', normalizedQuery: q, tokens, filters, emptyQuery: true,
    articles: { rows: [], total: 0, page, pageSize, totalPages: 0 },
    disciplines: [], sections: [], rodeo: [], totalResults: 0, zeroResult: false,
  };
  if (!q) return empty;

  const wantArticles = type === 'all' || type === 'article';
  const wantDisciplines = type === 'all' || type === 'discipline';
  const wantSections = type === 'all' || type === 'section';
  const wantRodeo = type === 'all' || type === 'rodeo';

  // ---- Articles: PostgreSQL FTS (parameterized) ----
  let articles = { rows: [] as PublicSearchResult[], total: 0, page, pageSize, totalPages: 0 };
  if (wantArticles) {
    const tsq = Prisma.sql`websearch_to_tsquery('english', ${q})`;
    const catCond = category ? Prisma.sql`AND c.slug = ${category}` : Prisma.empty;
    const discCond = discipline
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM "ArticleDiscipline" ad JOIN "Discipline" d ON d.id = ad."disciplineId" WHERE ad."articleId" = a.id AND d.slug = ${discipline})`
      : Prisma.empty;
    const where = Prisma.sql`a."workflowStatus"::text = 'PUBLISHED' AND a."searchVector" @@ ${tsq} ${catCond} ${discCond}`;
    const orderBy = sort === 'newest'
      ? Prisma.sql`ORDER BY a."publishedAt" DESC NULLS LAST, a.id DESC`
      : Prisma.sql`ORDER BY rank DESC, a."publishedAt" DESC NULLS LAST, a.id DESC`;
    const skip = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<ArticleRow[]>(Prisma.sql`
        SELECT a.id, a.slug, a.title, a.deck, a.excerpt,
               a."heroImageUrl" AS "heroImageUrl", a."publishedAt" AS "publishedAt",
               a."updatedAt" AS "updatedAt", c.name AS "categoryName", c.slug AS "categorySlug",
               ts_rank_cd('{0.1,0.2,0.4,1.0}', a."searchVector", ${tsq}) AS rank
        FROM "Article" a JOIN "Category" c ON c.id = a."categoryId"
        WHERE ${where}
        ${orderBy}
        LIMIT ${pageSize} OFFSET ${skip}
      `),
      prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT count(*)::bigint AS count
        FROM "Article" a JOIN "Category" c ON c.id = a."categoryId"
        WHERE ${where}
      `),
    ]);
    const total = Number(countRows[0]?.count ?? 0);
    articles = {
      rows: rows.map((r) => ({
        type: 'article' as const,
        id: r.id,
        title: r.title,
        url: `/articles/${r.slug}/`,
        excerpt: buildExcerpt(r.excerpt || r.deck || '', tokens),
        contentType: 'Article',
        category: r.categoryName,
        imageUrl: r.heroImageUrl,
        date: (r.publishedAt ?? r.updatedAt)?.toISOString() ?? null,
        rank: Number(r.rank) || 0,
        analyticsEntityType: 'ARTICLE',
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ---- Disciplines (bounded, in-memory) ----
  let disciplines: PublicSearchResult[] = [];
  if (wantDisciplines) {
    const rows = await prisma.discipline.findMany({
      select: { id: true, slug: true, name: true, shortName: true, summary: true, tagline: true, category: true, image: true },
      orderBy: { sortOrder: 'asc' },
    });
    disciplines = rows
      .map((d) => ({
        row: d,
        score: scoreText([d.name, d.shortName, d.summary, d.tagline, d.category], tokens, q),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
      .slice(0, SIDE_LIMIT)
      .map((x) => ({
        type: 'discipline' as const,
        id: x.row.id,
        title: x.row.name,
        url: `/disciplines/${x.row.slug}/`,
        excerpt: buildExcerpt(x.row.summary || x.row.tagline || '', tokens),
        contentType: 'Discipline Guide',
        category: x.row.category ?? null,
        imageUrl: x.row.image ?? null,
        date: null,
        rank: x.score,
        analyticsEntityType: 'DISCIPLINE',
      }));
  }

  // ---- Primary sections (static config, bounded) ----
  let sections: PublicSearchResult[] = [];
  if (wantSections) {
    sections = Object.values(PRIMARY_SECTIONS)
      .map((s) => ({ s, score: scoreText([s.name, s.categoryKey, s.tagline, s.description], tokens, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
      .slice(0, SIDE_LIMIT)
      .map((x) => ({
        type: 'section' as const,
        id: x.s.id,
        title: x.s.name,
        url: x.s.path,
        excerpt: buildExcerpt(x.s.description || x.s.tagline || '', tokens),
        contentType: 'Section',
        category: null,
        imageUrl: null,
        date: null,
        rank: x.score,
        analyticsEntityType: 'SECTION',
      }));
  }

  // ---- Rodeo hubs / events / editions (bounded, in-memory) ----
  let rodeo: PublicSearchResult[] = [];
  if (wantRodeo) {
    const [hubs, events, editions] = await Promise.all([
      prisma.rodeoHub.findMany({ select: { id: true, slug: true, title: true, region: true, description: true } }),
      prisma.rodeoEvent.findMany({ select: { id: true, slug: true, name: true, location: true, description: true } }),
      prisma.rodeoEventEdition.findMany({ select: { id: true, editionSlug: true, label: true, event: { select: { slug: true, name: true } } } }),
    ]);
    const scored: (PublicSearchResult & { _s: number })[] = [];
    for (const h of hubs) {
      const s = scoreText([h.title, h.region, h.description], tokens, q);
      if (s > 0) scored.push({ type: 'rodeo', id: h.id, title: h.title, url: `/rodeo-events/${h.slug}/`, excerpt: buildExcerpt(h.description || '', tokens), contentType: 'Rodeo Hub', category: h.region ?? null, imageUrl: null, date: null, rank: s, analyticsEntityType: 'RODEO_HUB', _s: s });
    }
    for (const e of events) {
      const s = scoreText([e.name, e.location, e.description], tokens, q);
      if (s > 0) scored.push({ type: 'rodeo', id: e.id, title: e.name, url: `/rodeo-events/${e.slug}/`, excerpt: buildExcerpt(e.description || '', tokens), contentType: 'Rodeo Event', category: e.location ?? null, imageUrl: null, date: null, rank: s, analyticsEntityType: 'RODEO_EVENT', _s: s });
    }
    for (const ed of editions) {
      const s = scoreText([ed.label, ed.event.name], tokens, q);
      if (s > 0) scored.push({ type: 'rodeo', id: ed.id, title: `${ed.event.name}: ${ed.label}`, url: `/rodeo-events/${ed.event.slug}/${ed.editionSlug}/`, excerpt: '', contentType: 'Rodeo Edition', category: null, imageUrl: null, date: null, rank: s, analyticsEntityType: 'RODEO_EDITION', _s: s });
    }
    rodeo = scored.sort((a, b) => b._s - a._s || a.title.localeCompare(b.title)).slice(0, SIDE_LIMIT).map(({ _s, ...r }) => { void _s; return r; });
  }

  const totalResults = articles.total + disciplines.length + sections.length + rodeo.length;
  return {
    query: input.q ?? '',
    normalizedQuery: q,
    tokens,
    filters,
    emptyQuery: false,
    articles,
    disciplines,
    sections,
    rodeo,
    totalResults,
    zeroResult: totalResults === 0,
  };
}

/** Lightweight category list for the search filter dropdown. */
export async function getSearchFacets(): Promise<{
  categories: { slug: string; name: string }[];
  disciplines: { slug: string; name: string }[];
}> {
  const [categories, disciplines] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true } }),
    prisma.discipline.findMany({ orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true } }),
  ]);
  return { categories, disciplines };
}

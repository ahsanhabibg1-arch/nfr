/**
 * Public internal-search contracts (Batch 07 §3/§4). Only content that has a real
 * public canonical URL is representable here: articles, disciplines, and primary
 * sections. Rodeo hubs/events/editions have no public detail route yet, so they are
 * intentionally NOT returned as clickable results (they would 404). See
 * INTERNAL_SEARCH_ENGINE.md and KNOWN_LIMITATIONS.md.
 */
export type SearchResultType = 'article' | 'discipline' | 'section' | 'rodeo';
export type SearchSort = 'relevance' | 'newest';
export type SearchTypeFilter = 'all' | SearchResultType;

export interface PublicSearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  url: string;
  excerpt: string;
  contentType: string; // human label, e.g. "Article", "Discipline Guide", "Section"
  category: string | null;
  imageUrl: string | null;
  date: string | null; // ISO (published or updated), when meaningful
  rank: number;
  /** AnalyticsEntityType for click tracking (ARTICLE/DISCIPLINE/SECTION/RODEO_*). */
  analyticsEntityType: string;
}

export interface SearchFilters {
  q: string;
  type: SearchTypeFilter;
  category: string | null; // category slug (articles only)
  discipline: string | null; // discipline slug (articles only)
  sort: SearchSort;
  page: number;
  pageSize: number;
}

export interface PagedArticles {
  rows: PublicSearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SearchResponse {
  query: string;
  normalizedQuery: string;
  tokens: string[];
  filters: SearchFilters;
  emptyQuery: boolean; // no query supplied — show the browse/empty state, do not log
  articles: PagedArticles;
  disciplines: PublicSearchResult[];
  sections: PublicSearchResult[];
  rodeo: PublicSearchResult[];
  totalResults: number; // sum of what was actually returned under the active filter
  zeroResult: boolean; // a real query that matched nothing
}

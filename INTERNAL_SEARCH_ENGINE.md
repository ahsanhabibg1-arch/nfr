# Internal Search Engine (Batch 07)

PostgreSQL-native full-text search. No Elasticsearch/Algolia/Meilisearch.

## Index

A DB-managed generated column on `Article`:

```sql
"searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english'::regconfig, coalesce("title",'')),       'A') ||
  setweight(to_tsvector('english'::regconfig, coalesce("deck",'')),        'B') ||
  setweight(to_tsvector('english'::regconfig, coalesce("excerpt",'')),     'B') ||
  setweight(to_tsvector('english'::regconfig, coalesce("subcategory",'')), 'C') ||
  setweight(to_tsvector('english'::regconfig, coalesce("articleType",'')), 'C')
) STORED;
CREATE INDEX "Article_searchVector_idx" ON "Article" USING GIN ("searchVector");
```

`to_tsvector` is IMMUTABLE here (explicit `regconfig` literal), which a generated column
requires. STORED + generated means no trigger and always-consistent. The column is NOT
represented in the Prisma schema; it is queried via parameterized `$queryRaw`.

## Query parsing

User input → `normalizeQuery` (trim, whitespace-collapse, length bound 160) →
`websearch_to_tsquery('english', $1)`. `websearch_to_tsquery` safely handles quotes
(phrases), `-term` (NOT), `OR`, and stray punctuation, and **AND-combines** bare terms.
Parameterization prevents SQL injection; special-character/Unicode/over-long inputs are
handled without error.

## Ranking formula (documented)

```
rank = ts_rank_cd('{0.1, 0.2, 0.4, 1.0}', "searchVector", websearch_to_tsquery('english', q))
          weights are {D, C, B, A}  →  A(title)=1.0, B(deck/excerpt)=0.4, C=0.2, D=0.1
ORDER BY rank DESC, "publishedAt" DESC NULLS LAST, id DESC      -- deterministic pagination
```

`sort=newest` orders purely by `publishedAt DESC, id DESC`. A title match outranks an
excerpt-only match (verified in tests).

## Scope & visibility

- Articles: `workflowStatus = 'PUBLISHED'` enforced in-query (drafts never leak).
- Disciplines (7) and primary sections (5): bounded, deterministic in-memory scoring
  (exact=10, prefix=4, substring=3, per-token=1). These have real public URLs.
- Rodeo hubs/events/editions: **not returned** — no public detail route exists yet; they
  would 404. They participate in content-gap cross-referencing instead.

## Filters & pagination

Content-type (`all|article|discipline|section`), category (slug, articles), discipline
(slug, articles), sort (`relevance|newest`), page/pageSize (default 10, max 50). Pagination
applies to the article list. `/search/` is `noindex, follow` so results are not indexed and
do not create duplicate indexable URLs.

## Highlighting safety

`highlightSegments()` returns DATA segments (not HTML); the renderer emits matched segments
as `<mark>` React nodes. Tokens are alphanumeric-only, so the query cannot inject markup —
there is no `dangerouslySetInnerHTML`.

# Search Intelligence & Content-Gap Detection (Batch 07)

Turns real internal-search events into editorial signals. All reports require
`search.analytics.view`; all evidence is observed, never fabricated.

## Reports (`lib/cms/analyticsService.ts`)

- **Popular terms** — `groupBy normalizedQuery` with search count, click count (joined from
  `SearchResultClickEvent`), CTR (clicks ÷ searches), avg results per query.
- **Zero-result queries** — `SearchQueryEvent where zeroResult = true`, grouped.
- **Weak engagement** — terms with ≥3 searches and 0 clicks.
- **Demand by content type** — grouped by the content-type filter in effect at search time.
- **Totals** — searches, zero-results, clicks, overall CTR.

All bounded by the selected date range (indexed on `createdAt`).

## Content gaps (§12)

`getContentGaps(actor, days)`:

1. Take the top zero-result terms in the period (redaction placeholders excluded).
2. For each, cross-reference published articles (`title`/`excerpt` ILIKE, bounded `take: 3`).
3. Classify: **missing coverage** (no match) vs **coverage exists but didn't surface**.
4. Emit: term, demand (count), evidence period, existing coverage links, suggested action.

No article is created or published automatically. Demand is never invented — a term only
appears if it was really searched.

## SEO integration (§15)

`getSearchInformedSeo(actor, days)`: articles that received real search-click demand AND
still have OPEN SEO findings (categories content/structured_data/technical/image). This is
an advisory observation that links Batch 06 findings to live demand. The 37 SEO rules are
unchanged; nothing is rewritten automatically.

## Honesty rules

- Empty periods return empty lists with a clear note; the dashboard says so.
- When collection is disabled, these reports are correctly empty (nothing was recorded).
- Internal search impressions are never presented as Google impressions.

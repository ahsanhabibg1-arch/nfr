/**
 * Search, filter and sort for the Page Manager directory (PM-01).
 *
 * Kept out of the React component and free of any import from it, so the rules
 * can be tested directly rather than through rendered markup. A directory
 * control that quietly disagrees with the database is worse than no control at
 * all — an operator filters to "Published" and concludes the other pages are
 * not live — so every predicate here reads the same fields the public renderer
 * and the sitemap read.
 */

/** The subset of a directory row these rules depend on. */
export interface DirectoryRow {
  slug: string;
  dbTitle: string | null;
  defaultTitle: string | null;
  dbStatus: string | null;
  dbUpdatedAt: string | null;
  isLegacy: boolean;
  isLive: boolean;
  hasUnpublishedChanges: boolean;
  isProtected: boolean;
  isArchived: boolean;
  pageType: string;
}

export const PAGE_FILTERS = [
  'all', 'live', 'pending-changes', 'draft', 'in-review',
  'approved', 'archived', 'system', 'custom', 'protected',
] as const;
export type PageFilter = (typeof PAGE_FILTERS)[number];

export const FILTER_LABELS: Record<PageFilter, string> = {
  all: 'All pages',
  live: 'Published (live)',
  'pending-changes': 'Live, edits pending',
  draft: 'Draft',
  'in-review': 'In review',
  approved: 'Approved',
  archived: 'Archived',
  system: 'System pages',
  custom: 'Custom pages',
  protected: 'Protected',
};

export const PAGE_SORTS = ['updated-desc', 'updated-asc', 'title-asc', 'title-desc', 'published-desc'] as const;
export type PageSort = (typeof PAGE_SORTS)[number];

export const SORT_LABELS: Record<PageSort, string> = {
  'updated-desc': 'Recently updated',
  'updated-asc': 'Oldest updated',
  'title-asc': 'Title A–Z',
  'title-desc': 'Title Z–A',
  'published-desc': 'Publication date',
};

/** The title an operator actually sees, which is what search must match. */
export function displayTitle(row: DirectoryRow): string {
  return row.dbTitle || row.defaultTitle || row.slug;
}

/** `Legacy` / `CMS` as rendered, so "type" search matches what is on screen. */
function typeWords(row: DirectoryRow): string {
  return [
    row.isLegacy ? 'legacy' : 'cms',
    row.pageType.toLowerCase(),
    row.isProtected ? 'protected' : '',
    row.isArchived ? 'archived' : '',
  ].join(' ');
}

export function matchesQuery(row: DirectoryRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    displayTitle(row).toLowerCase().includes(q) ||
    row.slug.toLowerCase().includes(q) ||
    typeWords(row).includes(q)
  );
}

/**
 * ARCHIVED IS A SEPARATE AXIS, and that is the one judgement call here.
 *
 * Every filter except `all` and `archived` excludes archived pages. An archived
 * page can still carry a stale `DRAFT` status, so without this an operator
 * filtering to "Draft" would be shown pages they have already withdrawn, mixed
 * in with the ones they are actually working on. `all` keeps them, because
 * hiding a page from the only unfiltered view is how it gets forgotten about.
 */
export function matchesFilter(row: DirectoryRow, filter: PageFilter): boolean {
  if (filter === 'archived') return row.isArchived;
  if (filter !== 'all' && row.isArchived) return false;

  switch (filter) {
    case 'all': return true;
    case 'live': return row.isLive;
    case 'pending-changes': return row.isLive && row.hasUnpublishedChanges;
    case 'draft': return row.dbStatus === 'DRAFT';
    case 'in-review': return row.dbStatus === 'PENDING_REVIEW';
    case 'approved': return row.dbStatus === 'APPROVED';
    case 'system': return row.pageType === 'SYSTEM';
    case 'custom': return row.pageType === 'CUSTOM';
    case 'protected': return row.isProtected;
    default: return true;
  }
}

const time = (v: string | null): number => (v ? new Date(v).getTime() : 0);

export function sortRows<T extends DirectoryRow>(rows: T[], sort: PageSort): T[] {
  const out = [...rows];
  switch (sort) {
    case 'title-asc':
      return out.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)));
    case 'title-desc':
      return out.sort((a, b) => displayTitle(b).localeCompare(displayTitle(a)));
    case 'updated-asc':
      /**
       * A page never saved through the CMS has no timestamp. It sorts LAST in
       * both directions rather than counting as "oldest", because epoch zero is
       * missing data, not a date — and in "Oldest updated" it would otherwise
       * fill the top of the list with the pages nobody has touched.
       */
      return out.sort((a, b) => {
        const x = time(a.dbUpdatedAt), y = time(b.dbUpdatedAt);
        if (!x || !y) return (y ? 1 : 0) - (x ? 1 : 0);
        return x - y;
      });
    case 'published-desc':
      // Live pages first, newest first; everything else keeps its relative order.
      return out.sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        return time(b.dbUpdatedAt) - time(a.dbUpdatedAt);
      });
    case 'updated-desc':
    default:
      return out.sort((a, b) => time(b.dbUpdatedAt) - time(a.dbUpdatedAt));
  }
}

export function applyDirectory<T extends DirectoryRow>(
  rows: T[],
  opts: { query: string; filter: PageFilter; sort: PageSort },
): T[] {
  return sortRows(rows.filter((r) => matchesFilter(r, opts.filter) && matchesQuery(r, opts.query)), opts.sort);
}

/** Live counts per filter, from the same predicates the list uses. */
export function filterCounts(rows: DirectoryRow[]): Record<PageFilter, number> {
  const out = {} as Record<PageFilter, number>;
  for (const f of PAGE_FILTERS) out[f] = rows.filter((r) => matchesFilter(r, f)).length;
  return out;
}

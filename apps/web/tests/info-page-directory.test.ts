import { describe, it, expect } from 'vitest';
import {
  applyDirectory, filterCounts, matchesFilter, matchesQuery, sortRows,
  PAGE_FILTERS, type DirectoryRow,
} from '../lib/cms/infoPageDirectory';

/**
 * PM-01 — the directory controls.
 *
 * Tested here rather than through rendered markup, because what matters is the
 * RULES: a control that silently disagrees with the database is worse than no
 * control, since an operator filters to "Published" and concludes the rest are
 * not live.
 */
function row(over: Partial<DirectoryRow> = {}): DirectoryRow {
  return {
    slug: 'about', dbTitle: 'About NFRGuide', defaultTitle: null,
    dbStatus: 'PUBLISHED', dbUpdatedAt: '2026-11-01T00:00:00.000Z',
    isLegacy: true, isLive: true, hasUnpublishedChanges: false,
    isProtected: true, isArchived: false, pageType: 'SYSTEM', ...over,
  };
}

describe('PM-01 — Page Manager search, filter and sort', () => {
  it('searches title, slug and the type words shown on screen', () => {
    const r = row({ slug: 'privacy', dbTitle: 'Privacy Policy' });
    expect(matchesQuery(r, 'privacy')).toBe(true);
    expect(matchesQuery(r, 'POLICY')).toBe(true);       // case-insensitive
    expect(matchesQuery(r, 'legacy')).toBe(true);       // the Type column
    expect(matchesQuery(r, 'protected')).toBe(true);    // the badge
    expect(matchesQuery(r, 'rodeo')).toBe(false);
    expect(matchesQuery(r, '   ')).toBe(true);          // blank matches everything
  });

  it('falls back to the title an operator actually sees', () => {
    // A legacy page with no DB row still has a visible title to search by.
    const r = row({ dbTitle: null, defaultTitle: 'Corrections Policy' });
    expect(matchesQuery(r, 'corrections')).toBe(true);
  });

  it('separates LIVE from the draft status, because they are different things', () => {
    // A page can be live while its draft sits at DRAFT — someone is editing it.
    const editing = row({ isLive: true, hasUnpublishedChanges: true, dbStatus: 'DRAFT' });
    expect(matchesFilter(editing, 'live')).toBe(true);
    expect(matchesFilter(editing, 'pending-changes')).toBe(true);
    expect(matchesFilter(editing, 'draft')).toBe(true);

    const notLive = row({ isLive: false, dbStatus: 'DRAFT' });
    expect(matchesFilter(notLive, 'live')).toBe(false);
    expect(matchesFilter(notLive, 'pending-changes')).toBe(false);
  });

  it('keeps archived pages out of every filter except All and Archived', () => {
    /*
      An archived page can still carry a stale DRAFT status. Without this an
      operator filtering to "Draft" would be shown pages they had already
      withdrawn, mixed in with live work.
    */
    const archived = row({ isArchived: true, dbStatus: 'DRAFT', isLive: false, isProtected: false });
    expect(matchesFilter(archived, 'archived')).toBe(true);
    expect(matchesFilter(archived, 'all')).toBe(true);
    for (const f of PAGE_FILTERS) {
      if (f === 'all' || f === 'archived') continue;
      expect(matchesFilter(archived, f), `archived must not appear under "${f}"`).toBe(false);
    }
  });

  it('separates system from custom pages', () => {
    expect(matchesFilter(row({ pageType: 'SYSTEM' }), 'system')).toBe(true);
    expect(matchesFilter(row({ pageType: 'SYSTEM' }), 'custom')).toBe(false);
    expect(matchesFilter(row({ pageType: 'CUSTOM', isProtected: false }), 'custom')).toBe(true);
  });

  it('sorts by title in both directions', () => {
    const rows = [row({ slug: 'c', dbTitle: 'Charlie' }), row({ slug: 'a', dbTitle: 'Alpha' }), row({ slug: 'b', dbTitle: 'Bravo' })];
    expect(sortRows(rows, 'title-asc').map((r) => r.dbTitle)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(sortRows(rows, 'title-desc').map((r) => r.dbTitle)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('puts never-saved pages LAST in both update orders, not first in "oldest"', () => {
    /*
      A page with no timestamp is missing data, not a 1970 date. Treating it as
      oldest would fill the top of "Oldest updated" with the pages nobody has
      ever touched.
    */
    const rows = [
      row({ slug: 'new', dbUpdatedAt: '2026-11-10T00:00:00.000Z' }),
      row({ slug: 'never', dbUpdatedAt: null }),
      row({ slug: 'old', dbUpdatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(sortRows(rows, 'updated-asc').map((r) => r.slug)).toEqual(['old', 'new', 'never']);
    expect(sortRows(rows, 'updated-desc').map((r) => r.slug)).toEqual(['new', 'old', 'never']);
  });

  it('puts live pages first when sorting by publication date', () => {
    const rows = [
      row({ slug: 'draft-only', isLive: false, dbUpdatedAt: '2026-11-20T00:00:00.000Z' }),
      row({ slug: 'live', isLive: true, dbUpdatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(sortRows(rows, 'published-desc').map((r) => r.slug)).toEqual(['live', 'draft-only']);
  });

  it('applies search, filter and sort together', () => {
    const rows = [
      row({ slug: 'privacy', dbTitle: 'Privacy Policy', isLive: true, dbUpdatedAt: '2026-11-02T00:00:00.000Z' }),
      row({ slug: 'terms', dbTitle: 'Terms of Use', isLive: false, dbUpdatedAt: '2026-11-03T00:00:00.000Z' }),
      row({ slug: 'policy-archive', dbTitle: 'Policy Archive', isLive: true, isArchived: true, dbUpdatedAt: '2026-11-04T00:00:00.000Z' }),
    ];
    // "policy" matches two live rows, but one is archived and must drop out.
    const out = applyDirectory(rows, { query: 'policy', filter: 'live', sort: 'updated-desc' });
    expect(out.map((r) => r.slug)).toEqual(['privacy']);
  });

  it('reports counts from the same predicates the list uses', () => {
    const rows = [
      row({ slug: 'a', isLive: true }),
      row({ slug: 'b', isLive: true, hasUnpublishedChanges: true }),
      row({ slug: 'c', isLive: false, isArchived: true, isProtected: false }),
    ];
    const counts = filterCounts(rows);
    expect(counts.all).toBe(3);
    expect(counts.live).toBe(2);
    expect(counts['pending-changes']).toBe(1);
    expect(counts.archived).toBe(1);
    // Every count must equal what the list would actually render.
    for (const f of PAGE_FILTERS) {
      expect(applyDirectory(rows, { query: '', filter: f, sort: 'updated-desc' }).length, f).toBe(counts[f]);
    }
  });
});

import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';

/**
 * Stage 03 Task D — content deduplication invariant.
 *
 * BEHAVIOUR ASSERTED: no entity appears more than once across a resolved page's
 * content slots.
 *
 * THIS INVARIANT CURRENTLY FAILS, BY DESIGN OF THIS STAGE.
 *
 * The defect is real and live. Verified over HTTP against the running site
 * during the Stage 02 audit: the homepage rendered
 *   3x /articles/how-to-watch-nfr-streaming-cable-cord-cutters/
 *   2x five further articles
 * Root cause: `shownInHero` (lib/cms/homepageData.ts) is passed as an exclusion
 * to the `latest-coverage` slot only, and is never extended after the hero, so
 * sibling category slots cannot deduplicate against the hero or each other.
 *
 * Stage 03 CAPTURES this; Stage 05 FIXES it. The test is therefore written as a
 * normal assertion and is expected to FAIL once a database is available. It is
 * deliberately NOT marked `.skip` or `.todo`, because suppressing it would
 * reproduce exactly the reporting failure this programme exists to correct.
 *
 * See docs/stage-03/STAGE_03_KNOWN_DEFECTS_AND_EXEMPTIONS.md (KD-01).
 */

let available = false;
let skipReason = 'no isolated test database (TEST_DATABASE_URL unset)';
let prisma: PrismaClient;
let resolveHomepageSlots: typeof import('../lib/cms/homepageData').resolveHomepageSlots;
let getPublishedSections: typeof import('../lib/cms/pageLayoutService').getPublishedSections;

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    // Full-row read: the resolvers read whole rows, so a narrow select would
    // pass against a database missing columns they need.
    await prisma.pageLayout.findFirst();
    ({ resolveHomepageSlots } = await import('../lib/cms/homepageData'));
    ({ getPublishedSections } = await import('../lib/cms/pageLayoutService'));
    available = true;
  } catch (err) {
    skipReason = `homepage resolution unavailable — test database is behind the schema (${String(err).replace(/\s+/g, ' ').slice(0, 120)})`;
  }
}

/** Collect every article id appearing in any resolved slot's data. */
function collectArticleIds(slots: { data: Record<string, unknown> }[]): string[] {
  const ids: string[] = [];
  const visit = (v: unknown): void => {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      // An article-shaped object: has an id and a slug.
      if (typeof o.id === 'string' && typeof o.slug === 'string' && typeof o.title === 'string') ids.push(o.id);
      Object.values(o).forEach(visit);
    }
  };
  for (const s of slots) visit(s.data);
  return ids;
}

export function findDuplicates(ids: string[]): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id, count]) => ({ id, count }));
}

describe('Stage 03 Task D — duplicate detection helper', () => {
  it('detects a repeated id', () => {
    expect(findDuplicates(['a', 'b', 'a', 'c', 'a'])).toEqual([{ id: 'a', count: 3 }]);
  });

  it('reports nothing when every id is unique', () => {
    expect(findDuplicates(['a', 'b', 'c'])).toEqual([]);
  });

  it('reports every distinct duplicate', () => {
    expect(findDuplicates(['a', 'a', 'b', 'b', 'c']).map((d) => d.id).sort()).toEqual(['a', 'b']);
  });
});

describe.skipIf(!available)('Stage 03 Task D — homepage deduplication invariant (KNOWN FAILING, Stage 05)', () => {
  it('no article appears more than once across resolved homepage slots', async () => {
    const sections = await getPublishedSections('homepage');
    const slots = await resolveHomepageSlots(sections);
    const dupes = findDuplicates(collectArticleIds(slots as never));

    expect(
      dupes,
      `KNOWN DEFECT (KD-01, scheduled for Stage 05): ${dupes.length} article(s) resolved into more than one homepage slot — ` +
      `${dupes.map((d) => `${d.id} x${d.count}`).join(', ')}. ` +
      'Root cause: shownInHero is passed only to latest-coverage in lib/cms/homepageData.ts and never extended after the hero.',
    ).toEqual([]);
  });
});

describe('Stage 03 Task D — environment', () => {
  it('reports whether the invariant could be evaluated', () => {
    if (!available) {
      console.warn(`[stage03] dedup invariant NOT EVALUATED — ${skipReason}`);
      console.warn('[stage03] KD-01 remains an unverified-but-known defect; see STAGE_03_KNOWN_DEFECTS_AND_EXEMPTIONS.md');
    }
    expect(typeof available).toBe('boolean');
  });
});

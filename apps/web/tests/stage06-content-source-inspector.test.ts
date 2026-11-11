import { describe, it, expect } from 'vitest';

/**
 * Stage 06 Task 8 + Task 12.16 — content source inspector accuracy.
 *
 * BEHAVIOUR PROVEN: the plain-language summary shown beside `featuredIds` and
 * `articleCount` reports the selection mode and counts the resolver will
 * actually use, explains the deduplication shortfall, and never advertises a
 * source mode or filter that does not exist.
 *
 * Accuracy here is not cosmetic. Stage 05 established that a slot may
 * legitimately render FEWER items than its count when unique content runs out,
 * and noted that an operator would reasonably read that as a bug. This summary
 * is the fix, so its wording is load-bearing and tested as behaviour.
 *
 * The counts come from `numProp`/`idListProp` — the resolvers' own readers, now
 * shared through `lib/cms/slotProps.ts` — so a disagreement between this text
 * and the rendered page would require changing code both sides use.
 */

const { describeContentSource } = await import('../lib/cms/contentSourceSummary');
const { numProp, idListProp } = await import('../lib/cms/slotProps');
const slotUtils = await import('../lib/cms/slotUtils');
const { HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS, DETAIL_TEMPLATE_SECTIONS } = await import('../lib/cms/sectionRegistry');

type Def = { editableProps: readonly { key: string; min?: number; max?: number }[]; defaultProps?: Record<string, unknown> };

const def = (type: string): Def =>
  [...HOMEPAGE_SECTIONS, ...SECTION_LANDING_SECTIONS, ...DETAIL_TEMPLATE_SECTIONS].find((d) => d.type === type) as unknown as Def;

const LATEST = def('latest-coverage');       // featuredIds + articleCount (max 12)
const PLAN = def('plan-and-watch');          // featuredIds + articleCount (max 8)
const HERO = def('editorial-hero');          // featuredIds, no articleCount
const GRID = def('landing-grid');            // articleCount only, no picker
const RELATED = def('detail-related');       // articleCount only (max 6)
const QUICK = def('quick-access');           // no content source at all

/* ── Shared readers, not a second implementation ───────────────────── */

describe('Stage 06 — the inspector uses the resolvers own readers', () => {
  it('slotUtils still exports the readers, so every existing importer works', () => {
    expect(slotUtils.numProp).toBe(numProp);
    expect(slotUtils.idListProp).toBe(idListProp);
    expect(typeof slotUtils.limitList).toBe('function');
  });

  it('the shared reader clamps exactly as the resolver relies on', () => {
    expect(numProp({ articleCount: 99 }, 'articleCount', 6, 0, 12)).toBe(12);
    expect(numProp({ articleCount: -5 }, 'articleCount', 6, 0, 12)).toBe(0);
    expect(numProp({}, 'articleCount', 6, 0, 12)).toBe(6);
  });
});

/* ── The premises these tests rest on ──────────────────────────────── */

describe('Stage 06 — registry premises for the inspector', () => {
  it('latest-coverage really declares both a picker and a count', () => {
    expect(LATEST.editableProps.some((p) => p.key === 'featuredIds')).toBe(true);
    expect(LATEST.editableProps.some((p) => p.key === 'articleCount')).toBe(true);
  });

  it('landing-grid really declares a count and NO picker', () => {
    expect(GRID.editableProps.some((p) => p.key === 'articleCount')).toBe(true);
    expect(GRID.editableProps.some((p) => p.key === 'featuredIds')).toBe(false);
  });

  it('editorial-hero really declares a picker and NO count', () => {
    expect(HERO.editableProps.some((p) => p.key === 'featuredIds')).toBe(true);
    expect(HERO.editableProps.some((p) => p.key === 'articleCount')).toBe(false);
  });
});

/* ── Mode detection ────────────────────────────────────────────────── */

describe('Stage 06 Task 8 — selection mode is reported accurately', () => {
  it('reports no feed for a block that has none', () => {
    const d = describeContentSource('quick-access', {}, QUICK);
    expect(d.configurable).toBe(false);
    expect(d.mode).toBe('none');
  });

  it('reports AUTOMATIC when nothing is pinned', () => {
    const d = describeContentSource('latest-coverage', { articleCount: 6 }, LATEST);
    expect(d.mode).toBe('automatic');
    expect(d.pickedCount).toBe(0);
    expect(d.requestedCount).toBe(6);
    expect(d.headline).toContain('6');
    expect(d.headline).toContain('newest published articles');
  });

  it('reports MANUAL when the picks fill the block', () => {
    const d = describeContentSource('latest-coverage', { articleCount: 2, featuredIds: 'a,b' }, LATEST);
    expect(d.mode).toBe('manual');
    expect(d.headline).toContain('in your order');
  });

  it('reports MIXED when picks partly fill the block, with the right split', () => {
    const d = describeContentSource('plan-and-watch', { articleCount: 4, featuredIds: 'a,b' }, PLAN);
    expect(d.mode).toBe('mixed');
    expect(d.headline).toContain('2 pinned articles first');
    expect(d.headline).toContain('2 more chosen automatically');
    expect(d.headline).toContain('Plan & Watch');
  });

  it('reports EMPTY when the count is zero, and says nothing will appear', () => {
    const d = describeContentSource('latest-coverage', { articleCount: 0 }, LATEST);
    expect(d.mode).toBe('empty');
    expect(d.headline).toContain('Nothing will appear here');
  });

  it('counts an array-valued picker the same as a comma string', () => {
    const a = describeContentSource('latest-coverage', { articleCount: 4, featuredIds: ['a', 'b'] }, LATEST);
    const b = describeContentSource('latest-coverage', { articleCount: 4, featuredIds: 'a,b' }, LATEST);
    expect(a.pickedCount).toBe(2);
    expect(a.headline).toBe(b.headline);
  });

  it('ignores blank entries in the picker, as the resolver does', () => {
    const d = describeContentSource('latest-coverage', { articleCount: 4, featuredIds: 'a,,  ,b' }, LATEST);
    expect(d.pickedCount).toBe(2);
  });
});

/* ── Over-pinning and clamping ─────────────────────────────────────── */

describe('Stage 06 Task 8 — the inspector warns about settings that silently drop content', () => {
  it('warns when more articles are pinned than the count will show', () => {
    const d = describeContentSource('latest-coverage', { articleCount: 2, featuredIds: 'a,b,c,d' }, LATEST);
    expect(d.mode).toBe('manual');
    expect(d.notes.join(' ')).toContain('pinned 4 articles but the count is 2');
    expect(d.notes.join(' ')).toContain('Raise the count');
  });

  it('describes the CLAMPED count, not the raw stored value', () => {
    // Stored 99 against a max of 12 — the page will show 12, so must the text.
    const d = describeContentSource('latest-coverage', { articleCount: 99 }, LATEST);
    expect(d.requestedCount).toBe(12);
    expect(d.headline).toContain('12');
    expect(d.headline).not.toContain('99');
  });

  it('respects a tighter family maximum', () => {
    const d = describeContentSource('detail-related', { articleCount: 99 }, RELATED);
    expect(d.requestedCount).toBe(6);
  });

  it('falls back to the registry default when the prop is absent', () => {
    const d = describeContentSource('latest-coverage', {}, LATEST);
    expect(d.requestedCount).toBe(LATEST.defaultProps!.articleCount);
  });
});

/* ── Deduplication explanation (the Stage 05 carry-over) ───────────── */

describe('Stage 06 Task 8 — the deduplication shortfall is explained, not left as a mystery', () => {
  it('explains it on an automatic feed', () => {
    const d = describeContentSource('latest-coverage', { articleCount: 6 }, LATEST);
    const notes = d.notes.join(' ');
    expect(notes).toContain('already shown by another section');
    expect(notes).toContain('fewer items can appear than the count asks for');
    expect(notes).toContain('deliberate');
  });

  it('explains it on a mixed feed too', () => {
    const d = describeContentSource('plan-and-watch', { articleCount: 4, featuredIds: 'a' }, PLAN);
    expect(d.notes.join(' ')).toContain('never shown twice on one page');
  });

  it('explains it on a FULLY MANUAL feed too', () => {
    /**
     * Added because mutation M9 exposed the gap: deleting the deduplication note
     * from the manual branch broke no test. The automatic and mixed branches
     * were covered and the manual one was not, so the inspector could have
     * silently stopped explaining the shortfall for pinned-only blocks.
     *
     * The note genuinely belongs here. `pickedThenAuto`'s first guard skips a
     * manual pick that an earlier section already placed, so a fully manual slot
     * can render fewer items than its count exactly as an automatic one can.
     */
    const d = describeContentSource('latest-coverage', { articleCount: 2, featuredIds: 'a,b' }, LATEST);
    expect(d.mode).toBe('manual');
    expect(d.notes.join(' ')).toContain('already shown by another section');
    expect(d.notes.join(' ')).toContain('fewer items can appear than the count asks for');
  });

  it('explains it on an over-pinned feed as well', () => {
    const d = describeContentSource('latest-coverage', { articleCount: 2, featuredIds: 'a,b,c,d' }, LATEST);
    expect(d.notes.join(' ')).toContain('already shown by another section');
  });

  it('attaches the deduplication note to EVERY configured feed, in every mode', () => {
    // A single assertion that no future branch can be added without the note.
    const cases = [
      describeContentSource('latest-coverage', { articleCount: 6 }, LATEST),
      describeContentSource('latest-coverage', { articleCount: 2, featuredIds: 'a,b' }, LATEST),
      describeContentSource('latest-coverage', { articleCount: 2, featuredIds: 'a,b,c' }, LATEST),
      describeContentSource('plan-and-watch', { articleCount: 4, featuredIds: 'a' }, PLAN),
      describeContentSource('editorial-hero', {}, HERO),
      describeContentSource('editorial-hero', { featuredIds: 'a' }, HERO),
      describeContentSource('landing-grid', { articleCount: 9 }, GRID),
      describeContentSource('detail-related', { articleCount: 3 }, RELATED),
    ];
    for (const d of cases) {
      expect(d.mode, 'premise: these are all configured feeds').not.toBe('none');
      expect(d.notes.join(' '), `${d.mode} feed is missing the deduplication note`).toContain(
        'already shown by another section',
      );
    }
  });

  it('warns that an unpublished pick is skipped, whenever picks exist', () => {
    const d = describeContentSource('latest-coverage', { articleCount: 4, featuredIds: 'a' }, LATEST);
    expect(d.notes.join(' ')).toContain('unpublished, scheduled or deleted is skipped');
  });

  it('does not raise the pick caveat when there are no picks', () => {
    const d = describeContentSource('latest-coverage', { articleCount: 4 }, LATEST);
    expect(d.notes.join(' ')).not.toContain('unpublished, scheduled or deleted');
  });
});

/* ── Single-item feeds ─────────────────────────────────────────────── */

describe('Stage 06 Task 8 — single-item blocks are described correctly', () => {
  it('describes an unset hero as automatic, naming the real fallback', () => {
    const d = describeContentSource('editorial-hero', {}, HERO);
    expect(d.mode).toBe('automatic');
    expect(d.requestedCount).toBeNull();
    expect(d.headline).toContain('lead hero');
  });

  it('describes a single pick without inventing a count', () => {
    const d = describeContentSource('editorial-hero', { featuredIds: 'a' }, HERO);
    expect(d.mode).toBe('manual');
    expect(d.headline).toBe('Showing the article you picked.');
  });

  it('calls the first of several hero picks the lead', () => {
    const d = describeContentSource('editorial-hero', { featuredIds: 'a,b,c' }, HERO);
    expect(d.headline).toContain('the first is the lead');
  });

  it('describes an automatic-only grid without implying a picker exists', () => {
    const d = describeContentSource('landing-grid', { articleCount: 9 }, GRID);
    expect(d.mode).toBe('automatic');
    expect(d.headline).toContain('9');
    expect(d.headline.toLowerCase()).not.toContain('pin');
  });
});

/* ── No speculative features ───────────────────────────────────────── */

describe('Stage 06 Task 8 — the inspector advertises nothing that does not exist', () => {
  const ALL = [
    describeContentSource('latest-coverage', { articleCount: 6 }, LATEST),
    describeContentSource('latest-coverage', { articleCount: 2, featuredIds: 'a,b,c' }, LATEST),
    describeContentSource('plan-and-watch', { articleCount: 4, featuredIds: 'a' }, PLAN),
    describeContentSource('editorial-hero', {}, HERO),
    describeContentSource('landing-grid', { articleCount: 9 }, GRID),
    describeContentSource('detail-related', { articleCount: 3 }, RELATED),
    describeContentSource('latest-coverage', { articleCount: 0 }, LATEST),
  ];

  const FORBIDDEN = [
    'fallback policy', 'fallbackPolicy', 'empty behavior', 'emptyBehavior',
    'upcoming', 'tag filter', 'author filter', 'date range', 'sort order',
    'randomi', 'trending', 'most read', 'personalis', 'personaliz',
  ];

  it('mentions no unimplemented source mode or filter', () => {
    for (const d of ALL) {
      const text = `${d.headline} ${d.notes.join(' ')}`.toLowerCase();
      for (const term of FORBIDDEN) {
        expect(text, `"${term}" is not a real control but appears in: ${text}`).not.toContain(term.toLowerCase());
      }
    }
  });

  it('writes every headline in plain language, with no raw property keys', () => {
    for (const d of ALL) {
      expect(d.headline).not.toContain('featuredIds');
      expect(d.headline).not.toContain('articleCount');
      expect(d.headline.length).toBeGreaterThan(20);
    }
  });

  it('always ends the headline as a sentence', () => {
    for (const d of ALL) expect(d.headline.trim().endsWith('.')).toBe(true);
  });
});

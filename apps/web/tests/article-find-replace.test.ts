import { describe, it, expect } from 'vitest';

/**
 * Find and replace: the arithmetic, in isolation.
 *
 * WHY THIS IS THE PART WORTH TESTING. The editor's job is to collect the body's
 * text with the document position each block starts at; everything that can
 * corrupt an article lives in what happens next. An off-by-one maps a match
 * onto neighbouring characters, and a "replace all" that applies its edits in
 * the wrong order writes into positions that have already moved — both of which
 * silently damage the prose rather than failing visibly.
 *
 * The browser test covers the wiring (the panel, the selection, the undo step);
 * these cover the cases a browser test would never reliably reach, such as 500
 * matches or a term that is a prefix of itself.
 */

const { findMatches, nextMatchIndex, replacementPlan, MAX_MATCHES } =
  await import('../lib/content/articleFindReplace');

/** Two paragraphs, as the editor would collect them. */
const BODY = [
  { start: 1, text: 'The rodeo season opens in Fort Worth.' },
  { start: 40, text: 'Fort Worth hosts the rodeo again in March.' },
];

describe('finding', () => {
  it('reports every occurrence in document order', () => {
    // 'rodeo' is at offset 4 of the first block (start 1) and offset 21 of the
    // second (start 40).
    expect(findMatches(BODY, 'rodeo')).toEqual([
      { from: 5, to: 10 },
      { from: 61, to: 66 },
    ]);
  });

  it('maps an offset to a document position through the block start', () => {
    // 'Fort' is at offset 26 of the first block, whose text starts at 1.
    const [first] = findMatches([BODY[0]], 'Fort');
    expect(first).toEqual({ from: 27, to: 31 });
    expect(BODY[0].text.slice(26, 30)).toBe('Fort');
  });

  it('is case-insensitive by default and exact on request', () => {
    expect(findMatches(BODY, 'FORT')).toHaveLength(2);
    expect(findMatches(BODY, 'FORT', { caseSensitive: true })).toHaveLength(0);
    expect(findMatches(BODY, 'Fort', { caseSensitive: true })).toHaveLength(2);
  });

  it('treats the term as literal text, never as a pattern', () => {
    // An author searching for "(3)" or "a.m." means those characters. Accepting
    // a pattern would also accept a catastrophically backtracking one.
    const blocks = [{ start: 1, text: 'Scores (3) and (4). Also a.m. and axm.' }];
    expect(findMatches(blocks, '(3)')).toHaveLength(1);
    expect(findMatches(blocks, 'a.m.')).toHaveLength(1);
    expect(findMatches(blocks, '.*')).toHaveLength(0);
  });

  it('does not report overlapping matches', () => {
    // "aa" in "aaaa" is two matches, not three — which is what makes replacing
    // all of them well defined.
    expect(findMatches([{ start: 1, text: 'aaaa' }], 'aa')).toEqual([
      { from: 1, to: 3 },
      { from: 3, to: 5 },
    ]);
  });

  it('never matches across two blocks', () => {
    // Two paragraphs are two sentences to a reader; a replacement spanning
    // them would be a structural edit disguised as a text one.
    const blocks = [{ start: 1, text: 'Fort' }, { start: 10, text: 'Worth' }];
    expect(findMatches(blocks, 'FortWorth')).toEqual([]);
  });

  it('finds nothing for an empty term', () => {
    expect(findMatches(BODY, '')).toEqual([]);
    expect(findMatches(BODY, '', { caseSensitive: true })).toEqual([]);
  });

  it('stops at a bounded number of matches', () => {
    const blocks = [{ start: 1, text: 'x'.repeat(MAX_MATCHES + 50) }];
    expect(findMatches(blocks, 'x')).toHaveLength(MAX_MATCHES);
  });
});

describe('stepping through matches', () => {
  const matches = [{ from: 5, to: 10 }, { from: 61, to: 66 }];

  it('finds the first match at or after the caret', () => {
    expect(nextMatchIndex(matches, 0)).toBe(0);
    expect(nextMatchIndex(matches, 5)).toBe(0);
    expect(nextMatchIndex(matches, 6)).toBe(1);
  });

  it('wraps to the start past the last match', () => {
    // An author at the end of an article must still reach the first occurrence
    // rather than being told there are none.
    expect(nextMatchIndex(matches, 999)).toBe(0);
  });

  it('reports -1 only when there is nothing to step through', () => {
    expect(nextMatchIndex([], 0)).toBe(-1);
  });
});

describe('replacing', () => {
  it('orders the edits last-first', () => {
    // Each edit changes the document's length, so front-to-back would shift
    // every later range by the accumulated difference.
    const plan = replacementPlan([{ from: 5, to: 10 }, { from: 61, to: 66 }, { from: 30, to: 35 }]);
    expect(plan.map((r) => r.from)).toEqual([61, 30, 5]);
  });

  it('does not mutate the matches it was given', () => {
    const matches = [{ from: 5, to: 10 }, { from: 61, to: 66 }];
    replacementPlan(matches);
    expect(matches.map((m) => m.from)).toEqual([5, 61]);
  });

  it('produces a plan whose ranges, applied in order, never overlap an earlier edit', () => {
    /*
      The property that matters: after applying each range in plan order, no
      remaining range refers to a position past an edit that has happened.
      Simulated here on a plain string, which is exactly what the editor does
      to the document.
     */
    let text = 'one two three two one';
    const blocks = [{ start: 0, text }];
    for (const range of replacementPlan(findMatches(blocks, 'two'))) {
      text = text.slice(0, range.from) + 'TWO' + text.slice(range.to);
    }
    expect(text).toBe('one TWO three TWO one');
  });

  it('handles a replacement longer and shorter than the term', () => {
    for (const replacement of ['', 'a', 'a much longer phrase']) {
      let text = 'ab ab ab';
      const blocks = [{ start: 0, text }];
      for (const range of replacementPlan(findMatches(blocks, 'ab'))) {
        text = text.slice(0, range.from) + replacement + text.slice(range.to);
      }
      expect(text).toBe([replacement, replacement, replacement].join(' '));
    }
  });
});

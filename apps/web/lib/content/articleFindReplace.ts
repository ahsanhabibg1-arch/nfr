/**
 * Find and replace over the article body.
 *
 * WHY THE ALGORITHM LIVES HERE, AWAY FROM THE EDITOR. Matching and position
 * arithmetic is where this feature goes wrong — an off-by-one maps a match onto
 * the wrong characters and a "replace all" quietly corrupts the article. So the
 * part worth testing is pure: it takes the text of each block with the document
 * position its text starts at, and returns document ranges. The editor's only
 * job is to collect those blocks and apply the ranges.
 *
 * MATCHING IS LITERAL, NEVER A REGULAR EXPRESSION. An author searching for
 * "(3)" or "a.m." means those characters. Accepting a pattern would also mean
 * accepting a catastrophically backtracking one typed by accident, which would
 * hang the editor on a long article.
 *
 * A match never spans two blocks. Two adjacent paragraphs are two sentences to
 * a reader, and a replacement that merged them would be a structural edit
 * disguised as a text one.
 */

export interface SearchableBlock {
  /** Document position of the block's FIRST character. */
  start: number;
  /**
   * The block's text, where every inline leaf (a hard break, say) contributes
   * exactly one character — so an offset into this string is always
   * `start + offset` in the document.
   */
  text: string;
}

export interface MatchRange {
  from: number;
  to: number;
}

/** The most matches reported for one search. */
export const MAX_MATCHES = 500;

/**
 * Every occurrence of `query`, in document order.
 *
 * Overlapping matches are not reported: the search advances past each hit, so
 * "aa" in "aaaa" is two matches, not three. That is what makes replacing all of
 * them well defined.
 */
export function findMatches(
  blocks: readonly SearchableBlock[],
  query: string,
  options: { caseSensitive?: boolean } = {},
): MatchRange[] {
  const needle = options.caseSensitive ? query : query.toLowerCase();
  if (!needle) return [];

  const out: MatchRange[] = [];
  for (const block of blocks) {
    const haystack = options.caseSensitive ? block.text : block.text.toLowerCase();
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      out.push({ from: block.start + at, to: block.start + at + needle.length });
      if (out.length >= MAX_MATCHES) return out;
      at = haystack.indexOf(needle, at + needle.length);
    }
  }
  return out;
}

/**
 * The index of the first match at or after `pos`, wrapping to the start.
 *
 * Returns -1 only when there are no matches at all. Wrapping is what makes
 * "Next" usable: an author at the end of an article still reaches the first
 * occurrence rather than being told there are none.
 */
export function nextMatchIndex(matches: readonly MatchRange[], pos: number): number {
  if (matches.length === 0) return -1;
  const found = matches.findIndex((m) => m.from >= pos);
  return found === -1 ? 0 : found;
}

/**
 * The ranges to rewrite, ordered LAST FIRST.
 *
 * Applying replacements in reverse is not a style choice: each one changes the
 * length of the document, so replacing front-to-back would shift every later
 * range by the accumulated difference and write into the wrong place. Reverse
 * order means no range is ever affected by an earlier edit.
 */
export function replacementPlan(matches: readonly MatchRange[]): MatchRange[] {
  return [...matches].sort((a, b) => b.from - a.from);
}

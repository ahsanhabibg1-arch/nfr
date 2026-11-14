/**
 * Inline formatting for article body text.
 *
 * THE PROBLEM THIS SOLVES. Until now a body paragraph was
 * `{ type: 'paragraph'; text: string }` and the public renderer emitted
 * `{block.text}` as a React child. There was therefore nowhere to put bold,
 * italic, underline, strikethrough or an inline link: the editor could offer
 * such buttons, but nothing would survive a save. A toolbar over that model
 * would be exactly the editor that "looks like a rich-text editor but cannot
 * safely save its formatting".
 *
 * THE DESIGN: A PROJECTION, NOT A REPLACEMENT.
 *
 *   `text`  stays the AUTHORITATIVE PLAIN-TEXT PROJECTION of the block.
 *   `runs`  is OPTIONAL inline detail that refines it.
 *
 * `text` must always equal the concatenation of `runs[].text`. That single
 * invariant is what makes the change additive rather than a migration:
 *
 *   - `lib/seo-intel/orchestrator.ts` counts body words from `data.text`;
 *   - `articleService` computes read time from `.text`;
 *   - the draft preview, the revision viewer and any future consumer that only
 *     wants words keep reading `.text`;
 *   - a block saved before this change simply has no `runs`, and renders
 *     exactly as it did.
 *
 * Nothing has to be rewritten, no stored row changes shape, and
 * `ArticleBlock.data` is already `Json`, so there is NO database migration.
 *
 * WHY RUNS RATHER THAN AN HTML STRING. Storing markup would mean trusting it on
 * the way out, and the current model is XSS-safe by construction because React
 * escapes text children. Runs keep that property: the renderer maps each run to
 * a React element (`<strong>`, `<em>`, `<u>`, `<s>`, `<a>`), so the article body
 * never injects raw markup and there is no sanitizer to get wrong. The mark
 * vocabulary is a closed allowlist (see `INLINE_MARKS`); an unrecognised mark
 * cannot be represented, let alone rendered.
 */

/**
 * The complete, closed set of inline marks. Adding one is a deliberate change.
 *
 * `sup` and `sub` were added for editorial copy that genuinely needs them —
 * footnote markers, ordinals, units and formulae — and they are safe for the
 * same reason the first four are: each maps to one React element (`<sup>`,
 * `<sub>`), so no markup is ever injected. A mark outside this list cannot be
 * stored, let alone rendered.
 */
export const INLINE_MARKS = ['bold', 'italic', 'underline', 'strike', 'sup', 'sub'] as const;
export type InlineMark = (typeof INLINE_MARKS)[number];

/**
 * One contiguous span of body text with uniform formatting.
 *
 * `href` makes the span a link. A run may be both linked and marked (a bold
 * link is one run with `marks: ['bold']` and an `href`).
 */
export interface InlineRun {
  text: string;
  marks?: InlineMark[];
  href?: string;
}

export function isInlineMark(v: unknown): v is InlineMark {
  return typeof v === 'string' && (INLINE_MARKS as readonly string[]).includes(v);
}

/**
 * Whether a URL may be stored as an inline link target.
 *
 * ALLOWED: a site-relative path (`/articles/x/`, optionally with `?query` or
 * `#fragment`), a bare fragment (`#section`), `https:`, and `mailto:`.
 *
 * REFUSED: everything else, which specifically includes `javascript:`,
 * `data:`, `vbscript:` and `file:`. Plain `http:` is refused too — the site is
 * HTTPS-only, so an `http:` link is either a mistake or a downgrade.
 *
 * Checked by PARSING rather than by pattern-matching the string, because
 * `java\nscript:`, `JaVaScRiPt:` and percent-encoded variants all defeat a
 * regex.
 */
export function isSafeHref(href: unknown): href is string {
  if (typeof href !== 'string') return false;
  const raw = href.trim();
  if (!raw || raw.length > 2048) return false;
  // Relative and fragment links never carry a scheme.
  if (raw.startsWith('/') || raw.startsWith('#')) return !/[\u0000-\u001f]/.test(raw);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === 'https:' || url.protocol === 'mailto:';
}

/** The plain-text projection of a run list. */
export function runsToPlainText(runs: readonly InlineRun[]): string {
  return runs.map((r) => r.text).join('');
}

/** A single unformatted run, for text that has never been formatted. */
export function plainTextToRuns(text: string): InlineRun[] {
  return text ? [{ text }] : [];
}

const sameFormatting = (a: InlineRun, b: InlineRun): boolean => {
  if ((a.href ?? null) !== (b.href ?? null)) return false;
  const am = [...(a.marks ?? [])].sort();
  const bm = [...(b.marks ?? [])].sort();
  return am.length === bm.length && am.every((m, i) => m === bm[i]);
};

/**
 * Validates and canonicalises a run list.
 *
 * Unknown input is accepted (it arrives from a client) and reduced to something
 * representable: non-string text is dropped, unknown marks are dropped, an
 * unsafe `href` is dropped while KEEPING the text, duplicate marks collapse,
 * marks are sorted, empty runs disappear and adjacent runs with identical
 * formatting merge.
 *
 * Dropping an unsafe href rather than the whole run is deliberate: a pasted
 * `javascript:` link must not silently delete the author's sentence. The words
 * survive, the dangerous target does not.
 *
 * Canonicalising here means the same document always serialises identically, so
 * a round trip through the editor does not produce a spurious diff — which is
 * what makes the adapter's equivalence tests meaningful.
 */
export function normalizeRuns(input: unknown): InlineRun[] {
  if (!Array.isArray(input)) return [];
  const out: InlineRun[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.text !== 'string' || r.text === '') continue;

    const marks = Array.isArray(r.marks)
      ? [...new Set(r.marks.filter(isInlineMark))].sort()
      : [];
    const href = isSafeHref(r.href) ? r.href.trim() : undefined;

    const run: InlineRun = { text: r.text };
    if (marks.length) run.marks = marks;
    if (href) run.href = href;

    const prev = out[out.length - 1];
    if (prev && sameFormatting(prev, run)) prev.text += run.text;
    else out.push(run);
  }
  return out;
}

/**
 * Whether a run list carries formatting worth storing.
 *
 * A single unmarked, unlinked run is just the plain text again, so storing
 * `runs` for it would add bytes and a second thing to keep in step for no gain.
 * The editor omits `runs` in that case and the block stays byte-identical to
 * what the old editor would have written.
 */
export function runsCarryFormatting(runs: readonly InlineRun[]): boolean {
  return runs.some((r) => (r.marks?.length ?? 0) > 0 || !!r.href);
}

/**
 * Whether a block carries inline formatting that a plain-text edit would
 * destroy.
 *
 * WHY THIS MATTERS. The Blocks view edits a paragraph with a plain `<textarea>`
 * and writes back `{ ...block, text: newValue }`. That keeps `runs` while
 * changing `text`, so the projection no longer matches and `reconcileInline`
 * discards the formatting on save — silently. The owner's decision is that this
 * loss is prohibited, so the Blocks view asks this question first and offers
 * "Edit in Write" instead of a destructive field.
 *
 * Deliberately checks the DATA, not the block type, so a future text-bearing
 * block is covered without this list being updated.
 */
export function blockHasInlineFormatting(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false;
  const b = block as Record<string, unknown>;
  for (const key of ['runs', 'quoteRuns'] as const) {
    const v = b[key];
    if (Array.isArray(v) && runsCarryFormatting(normalizeRuns(v))) return true;
  }
  const items = b.itemRuns;
  if (Array.isArray(items)) {
    for (const entry of items) {
      if (Array.isArray(entry) && runsCarryFormatting(normalizeRuns(entry))) return true;
    }
  }
  return false;
}

/**
 * Reconciles `runs` against `text` and returns the pair to store.
 *
 * `text` wins on disagreement, because every existing consumer reads it and a
 * block whose projection lies would make SEO word counts and read time wrong.
 * If they disagree the runs are discarded and the plain text is kept — losing
 * formatting rather than corrupting the text, which is the safer failure.
 */
export function reconcileInline(
  text: string,
  runs: unknown,
): { text: string; runs?: InlineRun[] } {
  const normalized = normalizeRuns(runs);
  if (!normalized.length) return { text };
  if (runsToPlainText(normalized) !== text) return { text };
  if (!runsCarryFormatting(normalized)) return { text };
  return { text, runs: normalized };
}

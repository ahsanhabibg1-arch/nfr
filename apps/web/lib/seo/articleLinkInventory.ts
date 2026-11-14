import { isSafeHref, normalizeRuns, type InlineRun } from '../content/articleInline';

/**
 * The canonical inventory of links in an article body.
 *
 * WHY THIS EXISTS — AND WHAT IT REPLACES. SEO link analysis used to be fed by a
 * generic walk over every string value in a block's JSON, scanned with a regex
 * for anything that looked like a path or an absolute URL. That was measured
 * against a body containing inline links, and it was wrong in both directions:
 *
 *   FALSE POSITIVE  A path merely MENTIONED in prose ("our policy lives at
 *                   /articles/not-a-link/") was counted as a link. It is not a
 *                   link on the public page.
 *   MISSED          A `mailto:` href was not detected at all, although the
 *                   renderer turns it into a real anchor.
 *   NO ANCHOR TEXT  Only hrefs survived the scan, so an empty or unhelpful
 *                   anchor could not be evaluated.
 *   NO PROVENANCE   A flat `string[]` cannot say which block a link came from,
 *                   so a finding could not point an editor at it.
 *   CITATIONS MIXED IN  `sourceLink.url` landed in the same bucket as editorial
 *                   links, so the two could not be counted separately.
 *
 * This module reads the fields that ACTUALLY carry links — `runs`, `quoteRuns`,
 * `itemRuns`, the runs inside a question-and-answer set or a notes block, and
 * `sourceLink.url` — so SEO analysis sees exactly what
 * `InlineText` renders. That is the requirement that the public page, the saved
 * content and the analysis all describe the same link data.
 *
 * It classifies nothing about reachability: that is the route index's job. Here
 * a link is only located, attributed and described.
 */

/** Where a link came from, so a finding can point at it. */
export interface ArticleLinkSite {
  blockIndex: number;
  blockType: string;
  field: 'runs' | 'quoteRuns' | 'itemRuns' | 'answerRuns' | 'noteRuns' | 'url';
  /** Set for the positional fields: which list item, answer or note. */
  itemIndex?: number;
}

/**
 * Editorial links are prose links an author wrote into the body. Citations are
 * formal source references. They are counted separately because conflating them
 * overstates editorial linking and understates sourcing.
 */
export type ArticleLinkRole = 'editorial' | 'citation';

export interface ArticleLink extends ArticleLinkSite {
  href: string;
  /** The linked words. Empty when the run carried no text. */
  anchor: string;
  role: ArticleLinkRole;
  /** False when the stored href would not render as a link (see `isSafeHref`). */
  renderable: boolean;
}

const runsOf = (v: unknown): InlineRun[] => (Array.isArray(v) ? normalizeRuns(v) : []);

function pushRunLinks(
  runs: InlineRun[],
  site: ArticleLinkSite,
  out: ArticleLink[],
): void {
  for (const r of runs) {
    if (!r.href) continue;
    out.push({
      ...site,
      href: r.href,
      anchor: r.text ?? '',
      role: 'editorial',
      renderable: isSafeHref(r.href),
    });
  }
}

/**
 * Every link in a body, in document order.
 *
 * Deliberately NOT deduplicated: the same destination linked twice is two
 * editorial links, and two anchors to evaluate. Callers that need a unique
 * destination set build it themselves, which keeps the two questions — "how
 * many links" and "which destinations" — from being answered by one number.
 */
export function collectArticleLinks(blocks: readonly unknown[]): ArticleLink[] {
  const out: ArticleLink[] = [];

  blocks.forEach((raw, blockIndex) => {
    if (!raw || typeof raw !== 'object') return;
    const b = raw as Record<string, unknown>;
    const blockType = typeof b.type === 'string' ? b.type : 'unknown';
    const site = { blockIndex, blockType } as const;

    // Paragraph / heading / callout inline links.
    pushRunLinks(runsOf(b.runs), { ...site, field: 'runs' }, out);

    // Quote body inline links.
    pushRunLinks(runsOf(b.quoteRuns), { ...site, field: 'quoteRuns' }, out);

    // List items: positional and sparse, so the index matters for the finding.
    if (Array.isArray(b.itemRuns)) {
      b.itemRuns.forEach((entry, itemIndex) => {
        pushRunLinks(runsOf(entry), { ...site, field: 'itemRuns', itemIndex }, out);
      });
    }

    /**
     * Inline links inside a question-and-answer set or a notes block.
     *
     * These two block types hold an ARRAY of text-bearing items, each with its
     * own runs — so like `itemRuns` the position matters, and a finding says
     * which answer or which note it is about. Without this, a link an author
     * wrote into an answer rendered on the page but was invisible to the link
     * counts and the anchor audit: reported as neither good nor bad, which is
     * the silence this inventory exists to remove.
     */
    for (const [key, field] of [
      ['items', 'answerRuns'],
      ['items', 'noteRuns'],
    ] as const) {
      // Both live under `items`; which runs key to read depends on the block.
      const runsKey = field === 'answerRuns' ? 'answerRuns' : 'runs';
      if (blockType !== (field === 'answerRuns' ? 'faq' : 'footnotes')) continue;
      const items = b[key];
      if (!Array.isArray(items)) continue;
      items.forEach((item, itemIndex) => {
        if (!item || typeof item !== 'object') return;
        const runs = runsOf((item as Record<string, unknown>)[runsKey]);
        pushRunLinks(runs, { ...site, field, itemIndex }, out);
      });
    }

    /**
     * A citation. `ArticleBody` renders `sourceLink.url` as a real anchor, so it
     * is a link — but it is a FORMAL SOURCE REFERENCE, not an editorial link,
     * and the two must not be added together. Its anchor is the citation title.
     */
    if (blockType === 'sourceLink' && typeof b.url === 'string' && b.url.trim()) {
      out.push({
        ...site,
        field: 'url',
        href: b.url.trim(),
        anchor: typeof b.title === 'string' ? b.title : '',
        role: 'citation',
        renderable: isSafeHref(b.url.trim()),
      });
    }
  });

  return out;
}

/**
 * Anchors that say nothing about their destination.
 *
 * A deliberately tiny, closed list of the well-known offenders. It is NOT a
 * quality score and NOT a threshold — it flags the specific phrases that are
 * unusable out of context for a screen-reader user scanning a link list.
 */
const NON_DESCRIPTIVE_ANCHORS = new Set([
  'click here', 'here', 'read more', 'more', 'link', 'this', 'this link',
  'learn more', 'see more', 'details',
]);

/** Whether an anchor carries no readable content at all. */
export function isEmptyAnchor(anchor: string): boolean {
  return !/[\p{L}\p{N}]/u.test(anchor ?? '');
}

/** Whether an anchor is one of the known context-free phrases. */
export function isNonDescriptiveAnchor(anchor: string): boolean {
  const a = (anchor ?? '').trim().toLowerCase().replace(/[.,;:!?]+$/, '');
  return NON_DESCRIPTIVE_ANCHORS.has(a);
}

export interface ArticleLinkCounts {
  /** Editorial links whose destination is on this site. */
  internalEditorial: number;
  /** Editorial links pointing off-site (any non-site scheme or host). */
  externalEditorial: number;
  /** Formal source references, counted apart from editorial links. */
  citations: number;
  /** Stored hrefs the renderer would refuse to turn into a link. */
  unrenderable: number;
  /** Distinct internal destinations — not the same thing as the link count. */
  distinctInternalTargets: number;
}

/**
 * Counts, split by role and destination.
 *
 * `classify` is injected rather than imported so this module stays free of the
 * route index and remains a pure description of the body. The orchestrator
 * passes the same `classifyLink` the analyzer uses, which is what keeps the
 * counts and the findings consistent.
 */
export function countArticleLinks(
  links: readonly ArticleLink[],
  classify: (href: string) => { kind: string },
): ArticleLinkCounts {
  const distinct = new Set<string>();
  let internalEditorial = 0;
  let externalEditorial = 0;
  let citations = 0;
  let unrenderable = 0;

  for (const l of links) {
    if (!l.renderable) { unrenderable += 1; continue; }
    const kind = classify(l.href).kind;
    if (l.role === 'citation') { citations += 1; continue; }
    if (kind === 'internal') { internalEditorial += 1; distinct.add(l.href); }
    else externalEditorial += 1;
  }

  return {
    internalEditorial,
    externalEditorial,
    citations,
    unrenderable,
    distinctInternalTargets: distinct.size,
  };
}

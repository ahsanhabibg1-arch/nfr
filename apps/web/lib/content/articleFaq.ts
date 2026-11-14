import type { ContentBlock } from '../../types';

/**
 * The article's questions and answers, read from its body.
 *
 * WHY THE FAQ LIVES IN THE BODY AND NOT IN ITS OWN TABLE.
 *
 * A separate table was the other option, and it would have bought a migration,
 * a second save path, a second revision story and a second place for an answer
 * to go stale — in exchange for nothing a reader can see. An article's FAQ IS
 * part of the article: it is read in sequence after the prose, it is restored
 * with the article's revisions, it travels through the editor's own
 * round-trip, and the public renderer already draws it.
 *
 * So the dedicated FAQ panel in the editor is a VIEW over one body block, not a
 * separate store. That is what keeps the three places that care — the editor
 * panel, the rendered page and the structured data — reading the same rows
 * rather than three copies that can disagree.
 *
 * THE STRUCTURED DATA RULE. `faqPageJsonLd` must describe exactly what the page
 * shows. This module is therefore the single source for both: the renderer
 * draws what `collectArticleFaqs` returns, and the JSON-LD is built from the
 * same call. A question that is not on the page can never reach the markup,
 * which is the line between accurate structured data and cloaking.
 */

export interface ArticleFaqEntry {
  question: string;
  answer: string;
}

type FaqItem = Extract<ContentBlock, { type: 'faq' }>['items'][number];

/**
 * The items of ONE question set that are complete enough to publish.
 *
 * The renderer and the structured data both call this, which is the whole
 * point: a question with no answer must reach NEITHER. An earlier version
 * filtered only in the structured data, and the page then rendered a question
 * with an empty answer underneath it — so the page and the markup described
 * different content, which is the disagreement this module exists to prevent.
 * Caught by `tests/article-faq.test.ts`, not by reading the code.
 */
export function completeFaqItems(
  block: Extract<ContentBlock, { type: 'faq' }> | null | undefined,
): FaqItem[] {
  return (block?.items ?? []).filter(
    (i) => (i?.question ?? '').trim() !== '' && (i?.answer ?? '').trim() !== '',
  );
}

/** The FAQ blocks in a body, in document order. */
export function articleFaqBlocks(
  blocks: readonly ContentBlock[] | null | undefined,
): Extract<ContentBlock, { type: 'faq' }>[] {
  return (blocks ?? []).filter(
    (b): b is Extract<ContentBlock, { type: 'faq' }> => b?.type === 'faq',
  );
}

/**
 * Every complete question and answer the article publishes, in order.
 *
 * Incomplete pairs are dropped. A question with no answer is not a question a
 * reader can use, and in structured data it is invalid markup rather than
 * merely thin — schema.org requires an `acceptedAnswer`. Dropping it here means
 * the page and the markup agree on what exists.
 */
export function collectArticleFaqs(
  blocks: readonly ContentBlock[] | null | undefined,
): ArticleFaqEntry[] {
  const out: ArticleFaqEntry[] = [];
  for (const block of articleFaqBlocks(blocks)) {
    for (const item of completeFaqItems(block)) {
      out.push({ question: item.question.trim(), answer: item.answer.trim() });
    }
  }
  return out;
}

/**
 * Questions asked more than once, case-insensitively.
 *
 * Duplicates are not refused — an author may be mid-edit, and losing their
 * typing to a validation rule would be worse than the duplicate. They are
 * reported, because a repeated question reads as an error to a reader and is
 * exactly what `EntityFaq` blocks at its own boundary for the entity pages.
 */
export function duplicateFaqQuestions(entries: readonly ArticleFaqEntry[]): string[] {
  const seen = new Map<string, number>();
  for (const e of entries) {
    const key = e.question.trim().toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([q]) => q);
}

'use client';

import React from 'react';
import type { ContentBlock } from '../../../types';
import { articleFaqBlocks, collectArticleFaqs, duplicateFaqQuestions } from '../../../lib/content/articleFaq';

/**
 * The article's FAQ, edited directly below the body.
 *
 * WHY A DEDICATED PANEL WHEN THE BODY ALREADY HAS AN FAQ BLOCK.
 *
 * Discoverability, and position. A question set is something an author decides
 * to add at the END of writing, and an Insert menu is the wrong place to look
 * for it — this panel is where the work finishes, so it is where the questions
 * belong. It also keeps the FAQ in one place: an article should have one
 * question set, not three scattered through the prose.
 *
 * It is a VIEW over a body block, not a second store. That is deliberate — see
 * `lib/content/articleFaq.ts` for why the FAQ is part of the body — and it is
 * what lets the rendered page and the FAQPage structured data read exactly what
 * is edited here.
 *
 * THE BLOCK IS KEPT LAST. A reader meets questions after the article, not in
 * the middle of it, so a set created here is appended to the body. An FAQ block
 * inserted deliberately mid-body from the Insert menu is left where the author
 * put it, and edited in place — this panel does not move an author's own
 * arrangement, it only decides where a NEW one goes.
 */

export interface ArticleFaqPanelProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  disabled?: boolean;
}

type FaqBlock = Extract<ContentBlock, { type: 'faq' }>;

const EMPTY_ITEM = { question: '', answer: '' };

export const ArticleFaqPanel: React.FC<ArticleFaqPanelProps> = ({ blocks, onChange, disabled = false }) => {
  const faqBlocks = articleFaqBlocks(blocks);
  const index = blocks.findIndex((b) => b.type === 'faq');
  const faq: FaqBlock | null = index >= 0 ? (blocks[index] as FaqBlock) : null;
  const items = faq?.items ?? [];

  const published = collectArticleFaqs(blocks);
  const duplicates = duplicateFaqQuestions(published);
  const incomplete = items.filter((i) => {
    const q = (i.question ?? '').trim();
    const a = (i.answer ?? '').trim();
    // Half-filled, rather than simply untouched: an untouched blank row is a
    // row the author just added, not a mistake to warn about.
    return (q && !a) || (!q && a);
  }).length;

  /** Replaces the FAQ block, or appends one when the article has none yet. */
  const write = (next: FaqBlock) => {
    if (index >= 0) {
      const copy = [...blocks];
      copy[index] = next;
      onChange(copy);
      return;
    }
    onChange([...blocks, next]);
  };

  const setItems = (nextItems: FaqBlock['items']) => {
    // Removing the last question removes the block: an empty FAQ heading with
    // nothing under it is not something to publish.
    if (nextItems.length === 0) {
      if (index >= 0) onChange(blocks.filter((_, i) => i !== index));
      return;
    }
    write({ type: 'faq', ...(faq ?? {}), items: nextItems } as FaqBlock);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
  };

  return (
    <section
      data-testid="article-faq-panel"
      aria-labelledby="article-faq-heading"
      className="bg-white border border-stone-200 rounded-sm p-6 shadow-2xs space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <h3 id="article-faq-heading" className="text-xs font-mono uppercase tracking-wider text-ink-muted font-bold">
            Article FAQ
          </h3>
          <span
            data-testid="article-faq-count"
            className="text-[10px] font-mono px-1.5 py-0.5 rounded-xs bg-stone-100 text-stone-700"
          >
            {published.length} published
          </span>
        </div>
        <span className="text-[11px] font-sans text-stone-500">
          Rendered after the article body · emitted as FAQPage structured data
        </span>
      </div>

      {/*
        WHAT THIS PANEL PROMISES, STATED PLAINLY.

        An author needs to know that what they type here is both what a reader
        sees and what search engines are told — and that the two cannot differ,
        because they are built from the same rows.
      */}
      <p className="text-[11px] font-sans text-stone-500">
        Questions a reader is likely to ask about this article. They appear at the end of the
        published page and are described to search engines exactly as shown — a question with no
        answer is published nowhere, including in the structured data.
      </p>

      {duplicates.length > 0 && (
        <p role="status" data-testid="article-faq-duplicate" className="text-[11px] text-amber-700 font-sans">
          The same question is asked more than once ({duplicates.join(', ')}). A reader meets it twice.
        </p>
      )}
      {incomplete > 0 && (
        <p role="status" data-testid="article-faq-incomplete" className="text-[11px] text-amber-700 font-sans">
          {incomplete} question{incomplete === 1 ? ' is' : 's are'} missing a question or an answer and
          will not be published.
        </p>
      )}
      {faqBlocks.length > 1 && (
        <p role="status" className="text-[11px] text-amber-700 font-sans">
          This article has more than one question set in its body. This panel edits the first;
          the others are editable as cards in the writing surface.
        </p>
      )}

      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-[11px] font-mono text-stone-400">
            No questions yet. An article does not need one — add them only where a reader would ask.
          </p>
        )}

        {items.map((item, i) => (
          <div key={i} className="p-3 bg-stone-50 border border-stone-200 rounded-xs space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-mono text-[10px] text-ink-muted pt-2.5 w-6 shrink-0">Q{i + 1}</span>
              <input
                type="text"
                value={item.question}
                disabled={disabled}
                aria-label={`Question ${i + 1}`}
                onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, question: e.target.value } : it)))}
                placeholder="The question a reader actually asks…"
                className="flex-1 text-xs font-sans font-semibold text-stone-900 bg-white border border-stone-200 rounded-xs p-2 focus:outline-none focus:border-[#D4A757]"
              />
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={disabled || i === 0}
                  title={`Move question ${i + 1} up`}
                  aria-label={`Move question ${i + 1} up`}
                  onClick={() => move(i, i - 1)}
                  className="px-1.5 py-1 text-xs text-stone-500 hover:text-stone-900 disabled:opacity-25"
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  disabled={disabled || i === items.length - 1}
                  title={`Move question ${i + 1} down`}
                  aria-label={`Move question ${i + 1} down`}
                  onClick={() => move(i, i + 1)}
                  className="px-1.5 py-1 text-xs text-stone-500 hover:text-stone-900 disabled:opacity-25"
                >
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  title={`Remove question ${i + 1}`}
                  aria-label={`Remove question ${i + 1}`}
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                  className="px-1.5 py-1 text-sm text-stone-500 hover:text-rose-600 disabled:opacity-25"
                >
                  &times;
                </button>
              </div>
            </div>
            <textarea
              rows={2}
              value={item.answer}
              disabled={disabled}
              aria-label={`Answer ${i + 1}`}
              onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, answer: e.target.value } : it)))}
              placeholder="Answer it directly, in a sentence or two…"
              className="w-full text-xs font-sans text-stone-800 bg-white border border-stone-200 rounded-xs p-2 resize-y focus:outline-none focus:border-[#D4A757]"
            />
            {/*
              `answerRuns` carries inline formatting for this answer. It is
              preserved by `setItems` spreading the existing item, but a plain
              edit here would make it disagree with the text — so the author is
              told where the formatted version is edited instead.
            */}
            {item.answerRuns && item.answerRuns.length > 0 && (
              <p className="text-[10px] font-mono text-stone-400">
                This answer has inline formatting. Editing it here keeps the words; the formatting is
                edited on the question card in the writing surface.
              </p>
            )}
          </div>
        ))}

        <button
          type="button"
          disabled={disabled}
          data-testid="article-faq-add"
          onClick={() => setItems([...items, { ...EMPTY_ITEM }])}
          className="text-xs font-mono text-[#8B5E3C] hover:underline disabled:opacity-40"
        >
          + Add question
        </button>
      </div>
    </section>
  );
};

export default ArticleFaqPanel;

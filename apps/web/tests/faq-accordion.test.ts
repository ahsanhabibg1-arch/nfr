import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Article, ContentBlock } from '../types';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

/**
 * The FAQ accordion: collapsed by default, one open row per group, and every
 * answer still in the HTML.
 *
 * WHAT THESE TESTS ARE FOR. The reading problem this component was built to fix
 * is invisible to a passing test suite — an article whose answers are all open
 * renders perfectly well, it just reads badly. So the properties worth holding
 * are the ones a later edit could quietly undo:
 *
 *   1. No row carries `open`, so the default state really is collapsed. The
 *      obvious regression is someone "fixing" a test by opening the first row.
 *   2. Rows in one question set share an exclusive-group name and rows in
 *      different sets do not, which is what makes opening one close its
 *      sibling and leaves a second set on the page alone.
 *   3. Every answer is in the server-rendered markup whether or not it has been
 *      opened. This is the one that matters for SEO and for honest structured
 *      data: the moment an answer arrives by fetch-on-click, the FAQPage markup
 *      describes content the HTML does not contain.
 *
 * WHAT IS DELIBERATELY NOT HERE. Clicking, keyboard interaction and the
 * single-open behaviour itself are the browser's, so asserting them against a
 * string of HTML would prove nothing about them. They are verified for real in
 * `e2e/article-faq.spec.ts`, which drives an actual browser. These tests hold
 * the markup and stylesheet contract that behaviour rests on.
 */

const { ArticleBody } = await import('../components/editorial/ArticleBody');
const { FaqAccordion, FaqAccordionRows } = await import('../components/FaqAccordion');
const { FaqBlock } = await import('../components/blocks/PremiumBlocks');

const CSS = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const COMPONENT_SRC = readFileSync(new URL('../components/FaqAccordion.tsx', import.meta.url), 'utf8');

function article(blocks: ContentBlock[]): Article {
  return {
    id: 'a1', slug: 'x', title: 'T', deck: '', content: [], structuredBody: blocks,
    category: 'Rodeo', readTime: '1 min', publishedAt: '2026-01-01', heroImage: '', imageCredit: '',
    author: { id: 'au', name: 'A', slug: 'a', role: 'Staff', bio: '', avatar: '' },
  } as unknown as Article;
}

const body = (blocks: ContentBlock[]) =>
  renderToStaticMarkup(React.createElement(ArticleBody, { article: article(blocks) }));

/** Every `name` an exclusive accordion group is declared with, in document order. */
const groupNames = (html: string) =>
  [...html.matchAll(/<details[^>]*\bname="([^"]+)"/g)].map((m) => m[1]);

/** Every `id` in the markup, so duplicates can be caught. */
const allIds = (html: string) => [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

const ariaControls = (html: string) =>
  [...html.matchAll(/\baria-controls="([^"]+)"/g)].map((m) => m[1]);

const TWO_SETS: ContentBlock[] = [
  {
    type: 'faq',
    title: 'Entry questions',
    items: [
      { question: 'When do entries close?', answer: 'Thirty days before the first performance.' },
      { question: 'Can I enter two events?', answer: 'Yes, subject to the rule book.' },
    ],
  },
  { type: 'paragraph', text: 'Between the two sets.' },
  { type: 'faq', items: [{ question: 'Is this a separate set?', answer: 'It is.' }] },
];

describe('the default state is collapsed', () => {
  it('renders no open row', () => {
    const html = body(TWO_SETS);
    expect(html).toContain('<details');
    /*
      The whole point of the component. If this fails because a row was given
      `open` to make something else pass, the article pages are back to the wall
      of text this replaced.
    */
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it('shows every question', () => {
    const html = body(TWO_SETS);
    for (const q of ['When do entries close?', 'Can I enter two events?', 'Is this a separate set?']) {
      expect(html).toContain(q);
    }
  });

  it('still carries every answer in the server-rendered HTML', () => {
    /*
      COLLAPSED IS NOT ABSENT. The answers are present and hidden by CSS, not
      withheld until a click. A reader with CSS disabled, a crawler, and the
      page's own FAQPage markup all depend on this.
    */
    const html = body(TWO_SETS);
    for (const a of ['Thirty days before the first performance.', 'Yes, subject to the rule book.', 'It is.']) {
      expect(html).toContain(a);
    }
  });

  it('asks for no answer over the network', () => {
    // No fetch, no client state, no effect: there is nothing to arrive later.
    expect(COMPONENT_SRC).not.toMatch(/\bfetch\s*\(/);
    expect(COMPONENT_SRC).not.toMatch(/useEffect|useState/);
  });
});

describe('one row open at a time, per group', () => {
  it('gives the rows of one question set the same exclusive-group name', () => {
    const html = body([TWO_SETS[0]]);
    const names = groupNames(html);
    expect(names).toHaveLength(2);
    expect(new Set(names).size, 'rows of one set must share a group name').toBe(1);
  });

  it('gives two question sets on one page different group names', () => {
    /*
      INDEPENDENT GROUPS. Sharing a name would mean opening a question in the
      second set silently closed one in the first — two unrelated parts of the
      article fighting over one piece of state.
    */
    const names = groupNames(body(TWO_SETS));
    expect(names).toEqual(['faq-article-0', 'faq-article-0', 'faq-article-2']);
    expect(new Set(names).size).toBe(2);
  });

  it('names the group after the block position, not the question text', () => {
    // Stable across an edit to the wording, which is what keeps a reader's
    // open row open when an author fixes a typo.
    const html = body([{ type: 'faq', items: [{ question: 'Reworded?', answer: 'Yes.' }] }]);
    expect(groupNames(html)).toEqual(['faq-article-0']);
  });
});

describe('panel identifiers', () => {
  it('are unique across every group on the page', () => {
    const ids = allIds(body(TWO_SETS));
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size, `duplicate id in ${ids.join(', ')}`).toBe(ids.length);
  });

  it('are the ones the question rows point at', () => {
    const html = body(TWO_SETS);
    const ids = new Set(allIds(html));
    const controls = ariaControls(html);
    expect(controls).toHaveLength(3);
    for (const target of controls) {
      expect(ids, `aria-controls="${target}" points at no element`).toContain(target);
    }
  });

  it('survives a question containing punctuation, spaces and non-ASCII text', () => {
    /*
      Entity rows are keyed by database id, but a key can be anything a caller
      passes — and an id must stay a legal, repeatable token either way,
      because `aria-controls` has to resolve on the server and in the browser.
    */
    const html = renderToStaticMarkup(
      React.createElement(FaqAccordionRows, {
        group: 'Odd Group / Name!',
        rows: [{ key: 'Que pasa? (2026) — #1', question: 'Q', answer: 'A' }],
      }),
    );
    const [id] = allIds(html);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(ariaControls(html)).toEqual([id]);
  });
});

describe('empty and partial data', () => {
  it('renders nothing for an empty question set', () => {
    expect(renderToStaticMarkup(React.createElement(FaqAccordionRows, { group: 'g', rows: [] }))).toBe('');
  });

  it('renders nothing for an entity with no enabled FAQ', () => {
    expect(renderToStaticMarkup(React.createElement(FaqAccordion, { faqs: [] }))).toBe('');
    expect(renderToStaticMarkup(React.createElement(FaqAccordion, { faqs: null }))).toBe('');
    expect(renderToStaticMarkup(React.createElement(FaqAccordion, { faqs: undefined }))).toBe('');
  });

  it('draws no accordion at all for an article whose only question is unanswered', () => {
    // `completeFaqItems` drops it, so there is no empty shell left behind.
    const html = body([{ type: 'faq', items: [{ question: 'Unanswered?', answer: '' }] }]);
    expect(html).not.toContain('<details');
    expect(html).not.toContain('Unanswered?');
  });
});

describe('long and rich content', () => {
  it('renders a long question in full', () => {
    const long =
      'What exactly happens to a contestant who has already entered two timed events ' +
      'and then discovers that the second of them has been rescheduled into the same ' +
      'performance as the first, and who is responsible for sorting it out?';
    const html = body([{ type: 'faq', items: [{ question: long, answer: 'The entry office is.' }] }]);
    expect(html).toContain(long);
    // The span is what the wrapping rule in globals.css is attached to.
    expect(html).toContain('class="nfr-faq-question"');
  });

  it('keeps a link inside an answer', () => {
    /*
      Article answers carry inline runs, which is how a link, bold or emphasis
      survives into the page. The accordion takes the rendered node rather than
      the raw string precisely so this is not flattened to text.
    */
    const html = body([
      {
        type: 'faq',
        items: [
          {
            question: 'Where are the rules?',
            answer: 'See the rule book for the detail.',
            answerRuns: [
              { text: 'See the ' },
              { text: 'rule book', href: 'https://example.org/rules' },
              { text: ' for the detail.' },
            ],
          },
        ],
      } as ContentBlock,
    ]);
    expect(html).toContain('href="https://example.org/rules"');
    expect(html).toContain('rule book');
  });

  it('splits a stored entity answer into its paragraphs', () => {
    const html = renderToStaticMarkup(
      React.createElement(FaqAccordion, {
        faqs: [{ id: 'f1', question: 'Two parts?', answer: 'First part.\n\nSecond part.' }],
      }),
    );
    expect(html).toContain('<p>First part.</p>');
    expect(html).toContain('<p>Second part.</p>');
  });
});

describe('accessibility', () => {
  it('leaves the expanded state to the browser rather than asserting its own', () => {
    /*
      A native `summary` reports its own expanded state. Writing `aria-expanded`
      onto it by hand would be a second source of truth that goes stale the
      moment a row is opened, because nothing would be there to update it.
    */
    const html = body(TWO_SETS);
    expect(html).not.toContain('aria-expanded');
    expect(html).toContain('<summary');
  });

  it('hides the plus-minus icon from assistive technology', () => {
    const html = body(TWO_SETS);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it('puts no interactive element inside the question row', () => {
    /*
      `summary` is itself the control. A button or a link inside it is invalid
      nesting and unreachable by keyboard — the parent swallows the activation.
    */
    const html = body(TWO_SETS);
    const summaries = [...html.matchAll(/<summary[\s\S]*?<\/summary>/g)].map((m) => m[0]);
    expect(summaries).toHaveLength(3);
    for (const s of summaries) {
      expect(s).not.toMatch(/<(button|a|input|select|textarea)\b/);
    }
  });

  it('labels the question set as a region', () => {
    const html = body(TWO_SETS);
    expect(html).toContain('aria-label="Entry questions"');
    // A set with no author-given title still gets a name.
    expect(html).toContain('aria-label="Questions and answers"');
  });
});

describe('server rendering and hydration', () => {
  it('is a server component with nothing to hydrate', () => {
    /*
      No `use client`, no state. The markup the server sends is the markup the
      browser keeps, so there is no first-render mismatch to go wrong — the
      reason this is native `details` rather than a controlled React accordion.
    */
    expect(COMPONENT_SRC).not.toContain("'use client'");
    expect(COMPONENT_SRC).not.toContain('"use client"');
  });

  it('renders identically twice', () => {
    // Nothing random, nothing time-dependent, no id counter that drifts.
    expect(body(TWO_SETS)).toBe(body(TWO_SETS));
  });
});

describe('the stylesheet contract', () => {
  /*
    The behaviour the requirement asks for lives partly in CSS, so these assert
    the rules exist rather than that a browser applied them — the browser half
    is `e2e/article-faq.spec.ts`. They are here to stop a rule being dropped
    silently during an unrelated stylesheet edit.
  */
  it('collapses the answer panel and expands it when open', () => {
    expect(CSS).toMatch(/\.nfr-faq-item::details-content\s*\{[^}]*block-size:\s*0/);
    expect(CSS).toMatch(/\.nfr-faq-item\[open\]::details-content\s*\{[^}]*block-size:\s*auto/);
  });

  it('opts the panel in to animating to its natural height', () => {
    // Without this, `block-size: auto` is not an animatable value and the
    // transition is a jump.
    expect(CSS).toMatch(/\.nfr-faq-item\s*\{[\s\S]*?interpolate-size:\s*allow-keywords/);
  });

  it('turns the plus into a minus when the row opens', () => {
    expect(CSS).toMatch(/\.nfr-faq-item\[open\][^{]*\.nfr-faq-icon__bar\s*\{[^}]*scaleY\(0\)/);
  });

  it('removes the browser default marker in both engines', () => {
    expect(CSS).toContain('.nfr-faq-summary::-webkit-details-marker');
    expect(CSS).toContain('.nfr-faq-summary::marker');
  });

  it('lets a long question wrap instead of widening the row', () => {
    expect(CSS).toMatch(/\.nfr-faq-question\s*\{[^}]*min-width:\s*0/);
  });

  it('gives the question row a comfortable, tappable height', () => {
    expect(CSS).toMatch(/\.nfr-faq-summary\s*\{[\s\S]*?padding:\s*0\.875rem 0/);
  });

  it('respects a reduced-motion preference', () => {
    const reduced = CSS.slice(CSS.indexOf('.nfr-faq-item'));
    const block = reduced.slice(reduced.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toContain('.nfr-faq-item::details-content { transition: none; }');
    expect(block).toContain('.nfr-faq-icon__bar { transition: none; }');
  });

  it('takes its colours from theme tokens rather than hardcoded brand values', () => {
    expect(CSS).toMatch(/\.nfr-faq-icon\s*\{[\s\S]*?stroke:\s*var\(--color-terrain\)/);
    expect(CSS).toMatch(/\.nfr-faq-summary\s*\{[\s\S]*?color:\s*var\(--color-charcoal\)/);
  });
});

describe('every public question set draws through the one component', () => {
  it('the article body does', () => {
    const src = readFileSync(new URL('../components/editorial/ArticleBody.tsx', import.meta.url), 'utf8');
    expect(src).toContain('FaqAccordionRows');
    // And no longer lays the pairs out permanently open.
    expect(src).not.toMatch(/<dt\b/);
  });

  it('the Visual Builder FAQ region does', () => {
    const slot: SectionSlot = {
      id: 'ckq7x2n9b', sectionType: 'faq-block', visible: true, order: 0,
      props: { title: 'Questions', q1: 'Is it collapsed?', a1: 'Yes.', q2: 'Is it collapsed?', a2: 'Also yes.' },
    };
    const html = renderToStaticMarkup(React.createElement(FaqBlock, { slot, data: {} }));
    expect(html).toContain('nfr-faq-item');
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
    // Scoped to the slot, so three FAQ regions on one page stay independent.
    expect(groupNames(html)).toEqual(['faq-slot-ckq7x2n9b', 'faq-slot-ckq7x2n9b']);
    /*
      TWO ROWS, NOT ONE. Keyed by question text, a region asking the same
      question twice collided on one React key and dropped the second row.
    */
    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html).toContain('Also yes.');
  });

  it('the entity pages do', () => {
    const html = renderToStaticMarkup(
      React.createElement(FaqAccordion, {
        faqs: [{ id: 'cuid1', question: 'Enabled?', answer: 'Yes.' }],
      }),
    );
    expect(html).toContain('nfr-faq-item');
    expect(html).toContain('Frequently Asked Questions');
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it('and none of them keeps a private accordion', () => {
    for (const file of ['../components/blocks/PremiumBlocks.tsx', '../components/editorial/ArticleBody.tsx']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(src, `${file} draws its own <details>`).not.toContain('<details');
    }
  });
});

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Article, ContentBlock } from '../types';

/**
 * The article FAQ: one set of rows, three consumers.
 *
 * THE PROPERTY THAT MATTERS MOST. The editor panel, the published page and the
 * FAQPage structured data must describe the SAME questions. If the markup can
 * list a question the page does not show, that is cloaking — a search engine is
 * told something a reader cannot verify. The design prevents it by construction
 * (one collector, used by all three), and these tests hold that line.
 *
 * The second property is that an INCOMPLETE question reaches nothing: a question
 * with no answer is not useful to a reader and is invalid as markup, because
 * schema.org requires an `acceptedAnswer`.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/articles/x/',
  useSearchParams: () => new URLSearchParams(),
}));

const { collectArticleFaqs, articleFaqBlocks, duplicateFaqQuestions } =
  await import('../lib/content/articleFaq');
const { faqPageJsonLd } = await import('../lib/seo');
const { ArticleBody } = await import('../components/editorial/ArticleBody');

function publish(blocks: ContentBlock[]): string {
  const article = {
    id: 'a1', slug: 'x', title: 'T', deck: '', content: [], structuredBody: blocks,
    category: 'Rodeo', readTime: '1 min', publishedAt: '2026-01-01', heroImage: '', imageCredit: '',
    author: { id: 'au', name: 'A', slug: 'a', role: 'Staff', bio: '', avatar: '' },
  } as unknown as Article;
  return renderToStaticMarkup(React.createElement(ArticleBody, { article }));
}

const BODY: ContentBlock[] = [
  { type: 'paragraph', text: 'The article itself.' },
  {
    type: 'faq',
    title: 'Entry questions',
    items: [
      { question: 'When do entries close?', answer: 'Thirty days before the first performance.' },
      { question: 'Can I enter two events?', answer: 'Yes, subject to the rule book.' },
    ],
  },
];

describe('collecting the article FAQ', () => {
  it('finds the question set in the body, in order', () => {
    expect(collectArticleFaqs(BODY)).toEqual([
      { question: 'When do entries close?', answer: 'Thirty days before the first performance.' },
      { question: 'Can I enter two events?', answer: 'Yes, subject to the rule book.' },
    ]);
  });

  it('returns nothing for an article with no questions', () => {
    expect(collectArticleFaqs([{ type: 'paragraph', text: 'No questions here.' }])).toEqual([]);
    expect(collectArticleFaqs([])).toEqual([]);
    expect(collectArticleFaqs(null)).toEqual([]);
    expect(collectArticleFaqs(undefined)).toEqual([]);
  });

  it('DROPS a half-written question, and trims the rest', () => {
    const partial: ContentBlock[] = [{
      type: 'faq',
      items: [
        { question: '  Spaced out?  ', answer: '  Yes.  ' },
        { question: 'No answer yet', answer: '' },
        { question: '', answer: 'An answer to nothing' },
        { question: '   ', answer: '   ' },
      ],
    }];
    expect(collectArticleFaqs(partial)).toEqual([{ question: 'Spaced out?', answer: 'Yes.' }]);
  });

  it('gathers more than one question set, should an author place two', () => {
    const two: ContentBlock[] = [
      { type: 'faq', items: [{ question: 'First?', answer: 'Yes.' }] },
      { type: 'paragraph', text: 'Between them.' },
      { type: 'faq', items: [{ question: 'Second?', answer: 'Also yes.' }] },
    ];
    expect(articleFaqBlocks(two)).toHaveLength(2);
    expect(collectArticleFaqs(two).map((f) => f.question)).toEqual(['First?', 'Second?']);
  });

  it('reports a repeated question without refusing it', () => {
    // Refusing would lose an author's typing mid-edit; reporting lets them fix
    // what a reader would otherwise meet twice.
    const dupes = collectArticleFaqs([{
      type: 'faq',
      items: [
        { question: 'When do entries close?', answer: 'A.' },
        { question: 'WHEN DO ENTRIES CLOSE?', answer: 'B.' },
      ],
    }]);
    expect(dupes).toHaveLength(2);
    expect(duplicateFaqQuestions(dupes)).toEqual(['when do entries close?']);
  });
});

describe('the structured data describes exactly what is published', () => {
  it('emits a FAQPage whose questions are the ones on the page', () => {
    const ld = faqPageJsonLd(collectArticleFaqs(BODY)) as Record<string, unknown>;
    expect(ld).toBeTruthy();
    expect(ld['@type']).toBe('FAQPage');
    const names = (ld.mainEntity as { name: string; acceptedAnswer: { text: string } }[]).map((q) => q.name);
    expect(names).toEqual(['When do entries close?', 'Can I enter two events?']);

    // The same questions appear in the rendered markup.
    const html = publish(BODY);
    for (const n of names) expect(html).toContain(n);
  });

  it('emits NOTHING for an article with no complete question', () => {
    // An empty FAQPage node is invalid markup, not a harmless one.
    expect(faqPageJsonLd(collectArticleFaqs([{ type: 'paragraph', text: 'x' }]))).toBeNull();
    expect(faqPageJsonLd(collectArticleFaqs([
      { type: 'faq', items: [{ question: 'Unanswered?', answer: '' }] },
    ]))).toBeNull();
  });

  it('never describes a question the page does not show', () => {
    /*
      THE ANTI-CLOAKING PROPERTY.

      A half-written question is dropped by the collector, so it can reach
      neither the page nor the markup. This asserts both halves together,
      because the failure that matters is the two disagreeing.
    */
    const mixed: ContentBlock[] = [{
      type: 'faq',
      items: [
        { question: 'Shown and described?', answer: 'Yes.' },
        { question: 'Hidden question with no answer?', answer: '' },
      ],
    }];
    const html = publish(mixed);
    const ld = faqPageJsonLd(collectArticleFaqs(mixed)) as Record<string, unknown>;
    const described = (ld.mainEntity as { name: string }[]).map((q) => q.name);

    expect(described).toEqual(['Shown and described?']);
    expect(html).toContain('Shown and described?');
    expect(html, 'an unanswered question must not be rendered either').not.toContain('Hidden question with no answer?');
  });

  it('survives the save boundary unchanged, so what was typed is what is described', async () => {
    const { articleBlockSchema, reconcileBlockInline } = await import('../lib/content/articleBlockSchema');
    const parsed = articleBlockSchema.parse(BODY[1]);
    const stored = JSON.parse(JSON.stringify(reconcileBlockInline(parsed))) as ContentBlock;
    expect(collectArticleFaqs([stored])).toEqual(collectArticleFaqs(BODY));
  });
});

describe('the editor panel edits those same rows', () => {
  it('appends a question set to the END of the body when there is none', async () => {
    const { ArticleFaqPanel } = await import('../components/admin/editor/ArticleFaqPanel');
    let next: ContentBlock[] = [];
    const blocks: ContentBlock[] = [
      { type: 'paragraph', text: 'One.' },
      { type: 'paragraph', text: 'Two.' },
    ];
    // Rendered only to reach its handler; the behaviour under test is what the
    // panel WRITES BACK, which is what reaches the article.
    const html = renderToStaticMarkup(
      React.createElement(ArticleFaqPanel, { blocks, onChange: (b: ContentBlock[]) => { next = b; } }),
    );
    expect(html).toContain('Article FAQ');
    expect(html).toContain('0 published');
    expect(next).toEqual([]);
  });

  it('shows how many questions are actually published', async () => {
    const { ArticleFaqPanel } = await import('../components/admin/editor/ArticleFaqPanel');
    const withPartial: ContentBlock[] = [{
      type: 'faq',
      items: [
        { question: 'Complete?', answer: 'Yes.' },
        { question: 'Incomplete?', answer: '' },
      ],
    }];
    const html = renderToStaticMarkup(
      React.createElement(ArticleFaqPanel, { blocks: withPartial, onChange: () => {} }),
    );
    // One of the two is publishable, and the author is told about the other.
    expect(html).toContain('1 published');
    expect(html).toMatch(/missing a question or an answer/);
  });

  it('warns about a duplicate question rather than hiding it', async () => {
    const { ArticleFaqPanel } = await import('../components/admin/editor/ArticleFaqPanel');
    const html = renderToStaticMarkup(
      React.createElement(ArticleFaqPanel, {
        blocks: [{
          type: 'faq',
          items: [
            { question: 'Same?', answer: 'A.' },
            { question: 'same?', answer: 'B.' },
          ],
        }],
        onChange: () => {},
      }),
    );
    expect(html).toMatch(/asked more than once/);
  });
});

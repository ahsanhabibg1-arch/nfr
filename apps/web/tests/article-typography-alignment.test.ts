import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Article, ContentBlock } from '../types';

/**
 * Typography, alignment and checklists: the whole vertical path.
 *
 * WHAT THIS FILE IS FOR. Each of these three features touches five layers —
 * the storage vocabulary, the zod boundary, the editor adapter, the inline
 * renderer and the public article renderer. A unit test of any single layer
 * would pass while the feature was still broken end to end (an h4 the schema
 * accepts but the renderer draws as an h3 is worse than no h4 at all), so the
 * assertions here follow a value from the stored block to the published markup.
 *
 * The editor surface itself is covered in the browser by
 * `e2e/article-editor-richtext.spec.ts`; what cannot be checked there is the
 * exact stored shape, which is what these tests pin.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/articles/x/',
  useSearchParams: () => new URLSearchParams(),
}));

const {
  BLOCK_ALIGNMENTS, alignmentClass, isBlockAlignment, storableAlignment, toBodyHeadingLevel,
} = await import('../lib/content/articleBlockStyle');
const { articleBlockSchema, reconcileBlockInline } = await import('../lib/content/articleBlockSchema');
const { INLINE_MARKS, normalizeRuns } = await import('../lib/content/articleInline');
const { blocksToDoc, docToBlocks } = await import('../lib/content/articleRichTextAdapter');
const { ArticleBody } = await import('../components/editorial/ArticleBody');

/** Parses and reconciles a block exactly as the save path does. */
function throughSave(input: unknown): unknown {
  const parsed = articleBlockSchema.parse(input);
  return JSON.parse(JSON.stringify(reconcileBlockInline(parsed)));
}

/** Renders a body through the real public renderer. */
function publish(blocks: ContentBlock[]): string {
  const article = {
    id: 'a1', slug: 'x', title: 'T', deck: '', content: [], structuredBody: blocks,
    category: 'Rodeo', readTime: '1 min', publishedAt: '2026-01-01', heroImage: '', imageCredit: '',
    author: { id: 'au', name: 'A', slug: 'a', role: 'Staff', bio: '', avatar: '' },
  } as unknown as Article;
  return renderToStaticMarkup(React.createElement(ArticleBody, { article }));
}

// ---------------------------------------------------------------------------
// The shared vocabulary
// ---------------------------------------------------------------------------

describe('the block style vocabulary', () => {
  it('offers exactly four alignments', () => {
    expect([...BLOCK_ALIGNMENTS]).toEqual(['left', 'center', 'right', 'justify']);
  });

  it('treats left as the default, so it is never stored', () => {
    // This is what keeps an untouched article byte-identical after an edit.
    expect(storableAlignment('left')).toBeUndefined();
    expect(storableAlignment(undefined)).toBeUndefined();
    expect(storableAlignment('center')).toBe('center');
  });

  it('refuses an alignment it cannot draw', () => {
    for (const bad of ['middle', 'start', 'CENTER', '', null, 7, {}]) {
      expect(isBlockAlignment(bad)).toBe(false);
      expect(storableAlignment(bad)).toBeUndefined();
    }
  });

  it('emits no class for the default alignment', () => {
    // An empty class means the published paragraph's markup is unchanged from
    // before alignment existed, so no stylesheet rule is overridden by accident.
    expect(alignmentClass(undefined)).toBe('');
    expect(alignmentClass('left')).toBe('');
    expect(alignmentClass('center')).toBe('text-center');
    expect(alignmentClass('justify')).toBe('text-justify');
  });

  it('corrects an out-of-range heading level rather than losing the heading', () => {
    expect(toBodyHeadingLevel(2)).toBe(2);
    expect(toBodyHeadingLevel(3)).toBe(3);
    expect(toBodyHeadingLevel(4)).toBe(4);
    expect(toBodyHeadingLevel('4')).toBe(4);
    // An h1 would collide with the article headline, an h5 is deeper than the
    // renderer draws: both become h2 — still a heading, just not that depth.
    expect(toBodyHeadingLevel(1)).toBe(2);
    expect(toBodyHeadingLevel(5)).toBe(2);
    expect(toBodyHeadingLevel('nonsense')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Superscript and subscript
// ---------------------------------------------------------------------------

describe('superscript and subscript', () => {
  it('are part of the closed mark allowlist', () => {
    expect([...INLINE_MARKS]).toEqual(['bold', 'italic', 'underline', 'strike', 'sup', 'sub']);
  });

  it('still refuses a mark outside the allowlist', () => {
    const runs = normalizeRuns([{ text: 'x', marks: ['sup', 'blink', 'script'] }]);
    expect(runs).toEqual([{ text: 'x', marks: ['sup'] }]);
  });

  it('survive the save boundary on a paragraph', () => {
    const stored = throughSave({
      type: 'paragraph',
      text: 'E = mc2 and H2O',
      runs: [
        { text: 'E = mc' },
        { text: '2', marks: ['sup'] },
        { text: ' and H' },
        { text: '2', marks: ['sub'] },
        { text: 'O' },
      ],
    });
    expect(stored).toMatchObject({
      text: 'E = mc2 and H2O',
      runs: [
        { text: 'E = mc' },
        { text: '2', marks: ['sup'] },
        { text: ' and H' },
        { text: '2', marks: ['sub'] },
        { text: 'O' },
      ],
    });
  });

  it('publish as sup and sub elements', () => {
    const html = publish([
      {
        type: 'paragraph', text: 'x2 and y2',
        runs: [{ text: 'x' }, { text: '2', marks: ['sup'] }, { text: ' and y' }, { text: '2', marks: ['sub'] }],
      },
    ]);
    expect(html).toContain('<sup>2</sup>');
    expect(html).toContain('<sub>2</sub>');
  });

  it('nest inside a bold phrase rather than wrapping it', () => {
    // A bold footnote marker is <strong><sup>3</sup></strong>: the shift belongs
    // to the character, the weight to the phrase.
    const html = publish([
      { type: 'paragraph', text: '3', runs: [{ text: '3', marks: ['bold', 'sup'] }] },
    ]);
    expect(html).toContain('<strong><sup>3</sup></strong>');
  });

  it('render as superscript when stored data somehow carries both marks', () => {
    // The editor makes them mutually exclusive; stored data could still carry
    // both, and raised-and-lowered-at-once is not drawable.
    const html = publish([
      { type: 'paragraph', text: '1', runs: [{ text: '1', marks: ['sup', 'sub'] }] },
    ]);
    expect(html).toContain('<sup>1</sup>');
    expect(html).not.toContain('<sub>');
  });
});

// ---------------------------------------------------------------------------
// H4
// ---------------------------------------------------------------------------

describe('h4 body headings', () => {
  it('are accepted by the schema and refused above h4', () => {
    expect(() => articleBlockSchema.parse({ type: 'heading', level: 4, text: 'Sub-point' })).not.toThrow();
    expect(() => articleBlockSchema.parse({ type: 'heading', level: 1, text: 'No' })).toThrow();
    expect(() => articleBlockSchema.parse({ type: 'heading', level: 5, text: 'No' })).toThrow();
  });

  it('publish as a real h4, not a restyled h3', () => {
    const html = publish([
      { type: 'heading', level: 2, text: 'Section' },
      { type: 'heading', level: 3, text: 'Topic' },
      { type: 'heading', level: 4, text: 'Sub-point' },
    ]);
    expect(html).toMatch(/<h2[^>]*>Section<\/h2>/);
    expect(html).toMatch(/<h3[^>]*>Topic<\/h3>/);
    expect(html).toMatch(/<h4[^>]*>Sub-point<\/h4>/);
  });

  it('keep their anchor id, so an in-page link still resolves', () => {
    const html = publish([{ type: 'heading', level: 4, text: 'Fees', id: 'fees' }]);
    expect(html).toMatch(/<h4[^>]*id="fees"/);
  });
});

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

describe('alignment', () => {
  it('is dropped when it is the default, and kept otherwise', () => {
    const centred = throughSave({ type: 'paragraph', text: 'Centred.', align: 'center' });
    expect(centred).toEqual({ type: 'paragraph', text: 'Centred.', align: 'center' });

    const plain = throughSave({ type: 'paragraph', text: 'Plain.', align: 'left' });
    // No `align` key at all — not `align: 'left'`.
    expect(plain).toEqual({ type: 'paragraph', text: 'Plain.' });
    expect(Object.keys(plain as object)).not.toContain('align');
  });

  it('is refused outright when it is not a drawable value', () => {
    expect(() => articleBlockSchema.parse({ type: 'paragraph', text: 'x', align: 'middle' })).toThrow();
  });

  it('round-trips through the editor document for paragraphs and headings', () => {
    const blocks: ContentBlock[] = [
      { type: 'paragraph', text: 'Centred.', align: 'center' },
      { type: 'heading', level: 3, text: 'Right.', align: 'right' },
      { type: 'paragraph', text: 'Justified.', align: 'justify' },
      { type: 'paragraph', text: 'Default.' },
    ];
    expect(docToBlocks(blocks ? blocksToDoc(blocks) : null)).toEqual(blocks);
  });

  it('publishes as a text-align class on the element itself', () => {
    const html = publish([
      { type: 'paragraph', text: 'Centred.', align: 'center' },
      { type: 'heading', level: 2, text: 'Right.', align: 'right' },
    ]);
    expect(html).toMatch(/<p class="[^"]*text-center[^"]*">Centred\.<\/p>/);
    expect(html).toMatch(/<h2 class="[^"]*text-right/);
  });

  it('adds no alignment class to an unaligned paragraph', () => {
    const html = publish([{ type: 'paragraph', text: 'Plain.' }]);
    expect(html).not.toContain('text-center');
    expect(html).not.toContain('text-left');
    expect(html).not.toContain('text-justify');
  });
});

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

describe('checklists', () => {
  it('are a list, not a new block type', () => {
    const stored = throughSave({
      type: 'list', items: ['Entered', 'Paid'], checklist: true, checked: [true, false],
    });
    expect(stored).toEqual({
      type: 'list', items: ['Entered', 'Paid'], checklist: true, checked: [true, false],
    });
  });

  it('keeps `checked` exactly as long as `items`', () => {
    // A mismatched array would shift every tick after an edited item onto the
    // wrong line — the list would still render, against the wrong content.
    const short = throughSave({
      type: 'list', items: ['A', 'B', 'C'], checklist: true, checked: [true],
    }) as { checked: boolean[] };
    expect(short.checked).toEqual([true, false, false]);

    const long = throughSave({
      type: 'list', items: ['A'], checklist: true, checked: [false, true, true],
    }) as { checked: boolean[] };
    expect(long.checked).toEqual([false]);
  });

  it('drops `checked` from a list that is not a checklist', () => {
    const stored = throughSave({ type: 'list', items: ['A'], checked: [true] });
    expect(stored).toEqual({ type: 'list', items: ['A'] });
  });

  it('round-trips through the editor document, ticks included', () => {
    const blocks: ContentBlock[] = [
      { type: 'list', items: ['Done', 'Pending'], checklist: true, checked: [true, false] },
    ];
    expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks);
  });

  it('becomes a task list in the editor document, not a bulleted list', () => {
    const doc = blocksToDoc([
      { type: 'list', items: ['One'], checklist: true, checked: [true] },
    ]);
    expect(doc.content[0]?.type).toBe('taskList');
    expect(doc.content[0]?.content?.[0]?.attrs?.checked).toBe(true);
  });

  it('leaves an ordinary list alone', () => {
    const blocks: ContentBlock[] = [{ type: 'list', items: ['One'], ordered: true }];
    const doc = blocksToDoc(blocks);
    expect(doc.content[0]?.type).toBe('orderedList');
    expect(docToBlocks(doc)).toEqual(blocks);
  });

  it('publishes a state a screen reader can read, and no dead form control', () => {
    const html = publish([
      { type: 'list', items: ['Entered', 'Paid'], checklist: true, checked: [true, false] },
    ]);
    // The published article is static: an input would be announced as a control
    // the reader cannot use, and a click on it would save nothing.
    expect(html).not.toContain('<input');
    // The state is in the text, not only in a glyph.
    expect(html).toContain('Done: ');
    expect(html).toContain('Not done: ');
    expect(html).toContain('Entered');
    expect(html).toContain('Paid');
    // The decorative tick is hidden from assistive technology.
    expect(html).toMatch(/aria-hidden="true"[^>]*>\s*✓/);
  });

  it('publishes inline formatting inside a checklist item', () => {
    const html = publish([
      {
        type: 'list', items: ['Pay the fee'], checklist: true, checked: [false],
        itemRuns: [[{ text: 'Pay the ' }, { text: 'fee', marks: ['bold'] }]],
      },
    ]);
    expect(html).toContain('<strong>fee</strong>');
  });
});

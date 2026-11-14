import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { ContentBlock } from '../types';

/**
 * The rich-text adapter's round trip — the data-loss gate.
 *
 * The editor edits a ProseMirror document; the database stores typed JSON
 * blocks. If the conversion between them loses anything, opening and saving an
 * article silently damages it. So the property these tests assert is the one
 * that matters: blocks -> document -> blocks must come back equivalent, for
 * prose, for structured editorial blocks, and for block types the adapter has
 * never heard of.
 *
 * "Equivalent", not "byte-identical": the adapter canonicalises harmlessly
 * (sorting marks, merging adjacent identical runs, dropping a `runs` array that
 * carries no formatting). Comparing raw JSON strings would fail on those and
 * prove nothing, so each test states the property it actually depends on.
 */

const { blocksToDoc, docToBlocks, OPAQUE_BLOCK_NODE, isProseBlock } =
  await import('../lib/content/articleRichTextAdapter');

const roundTrip = (blocks: ContentBlock[]) => docToBlocks(blocksToDoc(blocks));

// ---------------------------------------------------------------------------
// Prose round trips
// ---------------------------------------------------------------------------

describe('prose round trip', () => {
  it('plain paragraphs survive unchanged', () => {
    const blocks: ContentBlock[] = [
      { type: 'paragraph', text: 'First paragraph.' },
      { type: 'paragraph', text: 'Second paragraph.' },
    ];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('inline formatting survives, including a link', () => {
    const blocks: ContentBlock[] = [{
      type: 'paragraph',
      text: 'A bold word and a link.',
      runs: [
        { text: 'A ' },
        { text: 'bold', marks: ['bold'] },
        { text: ' word and a ' },
        { text: 'link', href: '/articles/x/' },
        { text: '.' },
      ],
    }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('every mark survives individually and in combination', () => {
    const blocks: ContentBlock[] = [{
      type: 'paragraph',
      text: 'abcde',
      runs: [
        { text: 'a', marks: ['bold'] },
        { text: 'b', marks: ['italic'] },
        { text: 'c', marks: ['underline'] },
        { text: 'd', marks: ['strike'] },
        { text: 'e', marks: ['bold', 'italic'] },
      ],
    }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('h2 and h3 survive, with their anchor id', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', level: 2, text: 'Section', id: 'section' },
      { type: 'heading', level: 3, text: 'Subsection' },
    ];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('bulleted and numbered lists survive, with per-item formatting', () => {
    const blocks: ContentBlock[] = [
      { type: 'list', items: ['one', 'two'] },
      { type: 'list', items: ['first', 'second'], ordered: true },
      {
        type: 'list',
        items: ['plain', 'bold'],
        itemRuns: [null, [{ text: 'bold', marks: ['bold'] }]],
      },
    ];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('a bare quote survives as prose; an attributed quote is preserved opaquely', () => {
    const bare: ContentBlock[] = [{ type: 'quote', quote: 'Just words.', attribution: '' }];
    expect(roundTrip(bare)).toEqual(bare);

    // The cite line has no blockquote equivalent, so the block must NOT become
    // prose — otherwise the attribution would vanish on the next save.
    const attributed: ContentBlock[] = [
      { type: 'quote', quote: 'Eight seconds.', attribution: 'A Rider', role: 'Bull riding' },
    ];
    expect(isProseBlock(attributed[0])).toBe(false);
    expect(roundTrip(attributed)).toEqual(attributed);
  });

  it('a divider survives', () => {
    expect(roundTrip([{ type: 'divider' }])).toEqual([{ type: 'divider' }]);
  });

  it('a drop-cap paragraph keeps its flag', () => {
    // `isDropCap` has no rich-text equivalent; losing it would change the
    // published article's opening paragraph.
    const blocks: ContentBlock[] = [{ type: 'paragraph', text: 'Opening.', isDropCap: true }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });
});

// ---------------------------------------------------------------------------
// Structured editorial blocks must survive untouched
// ---------------------------------------------------------------------------

describe('structured editorial blocks pass through losslessly', () => {
  const structured: ContentBlock[] = [
    { type: 'table', headers: ['A', 'B'], rows: [['1', '2'], ['3', '4']], caption: 'A table' },
    { type: 'callout', variant: 'takeaway', title: 'Key point', text: 'The takeaway.' },
    { type: 'image', src: '/media/x.jpg', alt: 'Alt text', caption: 'Cap', credit: 'Photographer' },
    { type: 'sourceLink', title: 'Source', url: 'https://example.com/', publisher: 'Pub', note: 'n' },
    { type: 'disclosure', text: 'Affiliate note.', variant: 'affiliate' },
  ];

  it('each one is carried opaquely and returned identical', () => {
    for (const block of structured) {
      expect(isProseBlock(block), `${block.type} must not be treated as prose`).toBe(false);
      expect(roundTrip([block])).toEqual([block]);
    }
  });

  it('they appear in the document as opaque nodes, not as paragraphs', () => {
    const doc = blocksToDoc(structured);
    expect(doc.content).toHaveLength(structured.length);
    for (const node of doc.content) expect(node.type).toBe(OPAQUE_BLOCK_NODE);
  });

  it('ORDER is preserved when prose and structured blocks are interleaved', () => {
    const mixed: ContentBlock[] = [
      { type: 'paragraph', text: 'Intro.' },
      structured[2],                                   // image
      { type: 'heading', level: 2, text: 'Middle' },
      structured[0],                                   // table
      { type: 'paragraph', text: 'Outro.' },
    ];
    expect(roundTrip(mixed)).toEqual(mixed);
  });
});

// ---------------------------------------------------------------------------
// The guarantee for content the adapter does not understand
// ---------------------------------------------------------------------------

describe('unknown and legacy content is never flattened', () => {
  it('an unrecognised block type survives an edit untouched', () => {
    const future = { type: 'embeddedScoreboard', eventId: 'x', season: 2026 } as unknown as ContentBlock;
    expect(roundTrip([future])).toEqual([future]);
  });

  it('unknown KEYS on a known prose block are preserved via the opaque path', () => {
    /*
      A heading whose level IS modelled but which carries a field this adapter
      cannot express must still travel opaquely, or `extra` would be dropped on
      the next save.

      This test used to use `level: 4` as its vehicle, because an unmodelled
      heading level forced the opaque path on its own. Once h4 became a real
      body level that side effect disappeared, so the adapter now checks the
      block's KEYS directly — which is what this asserts.
    */
    const odd = { type: 'heading', level: 2, text: 'Deep', extra: 'keep' } as unknown as ContentBlock;
    expect(isProseBlock(odd)).toBe(false);
    expect(roundTrip([odd])).toEqual([odd]);
  });

  it('a heading at a level the document does not model travels opaquely', () => {
    // h1 would collide with the article headline; h5 is deeper than the public
    // renderer draws. Neither is coerced to h2 — they are carried untouched.
    for (const level of [1, 5, 6]) {
      const deep = { type: 'heading', level, text: `Level ${level}` } as unknown as ContentBlock;
      expect(isProseBlock(deep)).toBe(false);
      expect(roundTrip([deep])).toEqual([deep]);
    }
  });

  it('every field the adapter claims to model is actually round-tripped', () => {
    /*
      A GUARD AGAINST THE NEXT FIELD.

      `MODELLED_KEYS` is what lets a prose block skip the opaque path, so a key
      listed there that the converter does not actually carry becomes silent
      data loss. This builds one block per prose type with every modelled field
      populated and asserts the round trip returns it unchanged — so adding a
      key to that list without teaching both converters fails here.
    */
    const populated: ContentBlock[] = [
      {
        type: 'heading', level: 4, text: 'Deep section', id: 'deep-section', align: 'center',
        runs: [{ text: 'Deep ', marks: ['bold'] }, { text: 'section' }],
      },
      {
        type: 'paragraph', text: 'Aligned and formatted.', align: 'justify',
        runs: [{ text: 'Aligned', marks: ['italic'] }, { text: ' and formatted.' }],
      },
      {
        type: 'list', items: ['Ticked', 'Not ticked'], checklist: true, checked: [true, false],
        itemRuns: [[{ text: 'Ticked', marks: ['sup'] }], null],
      },
      { type: 'quote', quote: 'Unattributed.', attribution: '' },
      { type: 'divider' },
    ];

    for (const block of populated) {
      expect(isProseBlock(block), `${block.type} should be prose`).toBe(true);
    }
    expect(roundTrip(populated)).toEqual(populated);
  });

  it('an empty document produces no blocks', () => {
    expect(docToBlocks({ type: 'doc', content: [] })).toEqual([]);
    expect(docToBlocks(null)).toEqual([]);
    expect(docToBlocks(undefined)).toEqual([]);
  });

  it('a trailing empty paragraph is not persisted', () => {
    // TipTap keeps one for the cursor; storing it would add a blank <p> to the
    // published article on every save.
    const doc = { type: 'doc' as const, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Real.' }] },
      { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'text', text: '   ' }] },
    ] };
    expect(docToBlocks(doc)).toEqual([{ type: 'paragraph', text: 'Real.' }]);
  });
});

// ---------------------------------------------------------------------------
// Safety across the adapter
// ---------------------------------------------------------------------------

describe('the adapter is a safety boundary too', () => {
  it('an unsafe link in the document never becomes a stored href', () => {
    const doc = { type: 'doc' as const, content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
    }] };
    const blocks = docToBlocks(doc) as { type: string; text: string; runs?: unknown }[];
    expect(blocks[0].text).toBe('click');        // the words survive
    expect(blocks[0].runs).toBeUndefined();      // the target does not
  });

  it('a mark no extension should have produced is ignored, not stored', () => {
    const doc = { type: 'doc' as const, content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'x', marks: [{ type: 'blink' }, { type: 'bold' }] }],
    }] };
    const blocks = docToBlocks(doc) as { runs?: { marks?: string[] }[] }[];
    expect(blocks[0].runs?.[0].marks).toEqual(['bold']);
  });

  it('the projection invariant holds after every round trip', () => {
    const blocks = roundTrip([{
      type: 'paragraph', text: 'ab',
      runs: [{ text: 'a', marks: ['bold'] }, { text: 'b' }],
    }]) as { text: string; runs?: { text: string }[] }[];
    for (const b of blocks) {
      if (b.runs) expect(b.runs.map((r) => r.text).join('')).toBe(b.text);
    }
  });
});

// ---------------------------------------------------------------------------
// Real stored articles (the compatibility gate)
// ---------------------------------------------------------------------------

const dbUrl = process.env.DATABASE_URL ?? '';
const dbSuite = dbUrl ? describe : describe.skip;

dbSuite('every stored article survives an editor round trip', () => {
  it('opening and re-saving any real article changes nothing', async () => {
    const prisma = new PrismaClient();
    try {
      const articles = await prisma.article.findMany({
        select: { slug: true, blocks: { orderBy: { sortOrder: 'asc' }, select: { data: true } } },
      });
      const withBody = articles.filter((a) => a.blocks.length);
      expect(withBody.length, 'expected articles with a body to test against').toBeGreaterThan(0);

      for (const a of withBody) {
        const before = a.blocks.map((b) => b.data) as unknown as ContentBlock[];
        expect(roundTrip(before), `article "${a.slug}" must survive a round trip`).toEqual(before);
      }
    } finally {
      await prisma.$disconnect();
    }
  });
});

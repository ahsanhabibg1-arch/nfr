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

const {
  blocksToDoc, docToBlocks, OPAQUE_BLOCK_NODE, isProseBlock,
  TABLE_NODE, TABLE_ROW_NODE, TABLE_HEADER_NODE, TABLE_CELL_NODE,
} = await import('../lib/content/articleRichTextAdapter');

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
  /*
    `table` USED TO BE IN THIS LIST AND IS NOT ANY MORE.

    A table is now a real document node so that an author can type into its
    cells, which is the whole point of the change. Its lossless guarantee did
    not go away — it moved: the table round-trip tests below assert it directly,
    and a table carrying anything the document cannot model still travels the
    opaque path, which the "stays opaque" tests assert.
  */
  const structured: ContentBlock[] = [
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
      {
        type: 'table', caption: 'Every modelled table field',
        headers: ['Left', 'Centred', 'Right'],
        rows: [['a', 'b', 'c'], ['d', 'e', 'f']],
        columnAlign: ['left', 'center', 'right'],
      },
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

// ---------------------------------------------------------------------------
// Tables as real document nodes
// ---------------------------------------------------------------------------

/**
 * A table is the one structured element an author types into, so it is the one
 * that became a document node rather than a card. These tests hold the two
 * promises that change rests on:
 *
 *   1. a table that the document CAN model round-trips exactly;
 *   2. a table it CANNOT model is still carried opaquely, untouched.
 *
 * The second is what makes the change safe for articles written before it.
 */
describe('tables round trip through the document', () => {
  const cell = (kind: string, text: string, attrs: Record<string, unknown> = {}) => ({
    type: kind,
    attrs: { colspan: 1, rowspan: 1, colwidth: null, cellAlign: null, ...attrs },
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }],
  });

  it('a plain table survives unchanged', () => {
    const blocks: ContentBlock[] = [
      { type: 'table', headers: ['Event', 'Round'], rows: [['Bull riding', '1'], ['Tie-down', '2']] },
    ];
    expect(isProseBlock(blocks[0])).toBe(true);
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('caption and per-column alignment survive', () => {
    const blocks: ContentBlock[] = [{
      type: 'table',
      caption: 'Payouts by round',
      headers: ['Round', 'Payout'],
      rows: [['1', '$30,000']],
      columnAlign: ['left', 'right'],
    }];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('becomes a real table node, not an opaque card', () => {
    const doc = blocksToDoc([
      { type: 'table', headers: ['A'], rows: [['1']] },
    ]);
    expect(doc.content[0].type).toBe(TABLE_NODE);
    expect(doc.content[0].type).not.toBe(OPAQUE_BLOCK_NODE);
    const [headerRow, bodyRow] = doc.content[0].content ?? [];
    expect(headerRow.type).toBe(TABLE_ROW_NODE);
    expect(headerRow.content?.[0].type).toBe(TABLE_HEADER_NODE);
    expect(bodyRow.content?.[0].type).toBe(TABLE_CELL_NODE);
  });

  it('a ragged stored table is squared to the header width', () => {
    // A short row would otherwise produce a document the table machinery
    // cannot operate on, and a long one would publish data with no heading.
    const ragged = {
      type: 'table', headers: ['A', 'B', 'C'], rows: [['1'], ['1', '2', '3', '4']],
    } as unknown as ContentBlock;
    expect(roundTrip([ragged])).toEqual([
      { type: 'table', headers: ['A', 'B', 'C'], rows: [['1', '', ''], ['1', '2', '3']] },
    ]);
  });

  it('merged cells are expanded into the right columns, never shifted left', () => {
    /*
      THE DEFECT THIS LOCKS OUT. The old paste path read cells in source order
      and ignored colspan/rowspan, so every value after a merged cell moved one
      column left and was published under the wrong heading, silently.

      Here `Vegas` spans two columns and `Dec` spans two rows. The reserved
      positions become empty cells and nothing moves.
    */
    const doc = { type: 'doc' as const, content: [{
      type: TABLE_NODE,
      attrs: { caption: null },
      content: [
        { type: TABLE_ROW_NODE, content: [
          cell(TABLE_HEADER_NODE, 'Month'),
          cell(TABLE_HEADER_NODE, 'Vegas', { colspan: 2 }),
        ] },
        { type: TABLE_ROW_NODE, content: [
          cell(TABLE_CELL_NODE, 'Dec', { rowspan: 2 }),
          cell(TABLE_CELL_NODE, 'Thomas & Mack'),
          cell(TABLE_CELL_NODE, '10 rounds'),
        ] },
        { type: TABLE_ROW_NODE, content: [
          cell(TABLE_CELL_NODE, 'South Point'),
          cell(TABLE_CELL_NODE, 'Cowboy Christmas'),
        ] },
      ],
    }] };
    expect(docToBlocks(doc)).toEqual([{
      type: 'table',
      headers: ['Month', 'Vegas', ''],
      rows: [
        ['Dec', 'Thomas & Mack', '10 rounds'],
        ['', 'South Point', 'Cowboy Christmas'],
      ],
    }]);
  });

  it('an alignment set on the paragraph inside a cell is not lost', () => {
    // The ordinary align button acts on textblocks, so it lands on the
    // paragraph inside the cell rather than on the cell itself.
    const doc = { type: 'doc' as const, content: [{
      type: TABLE_NODE,
      attrs: { caption: null },
      content: [
        { type: TABLE_ROW_NODE, content: [
          { type: TABLE_HEADER_NODE, attrs: { colspan: 1, rowspan: 1, colwidth: null, cellAlign: null },
            content: [{ type: 'paragraph', attrs: { textAlign: 'right' }, content: [{ type: 'text', text: 'Payout' }] }] },
        ] },
        { type: TABLE_ROW_NODE, content: [cell(TABLE_CELL_NODE, '$30,000')] },
      ],
    }] };
    expect(docToBlocks(doc)).toEqual([{
      type: 'table', headers: ['Payout'], rows: [['$30,000']], columnAlign: ['right'],
    }]);
  });

  it('an empty table is dropped rather than published as a blank grid', () => {
    const doc = { type: 'doc' as const, content: [{
      type: TABLE_NODE,
      attrs: { caption: null },
      content: [
        { type: TABLE_ROW_NODE, content: [cell(TABLE_HEADER_NODE, ''), cell(TABLE_HEADER_NODE, '')] },
        { type: TABLE_ROW_NODE, content: [cell(TABLE_CELL_NODE, ''), cell(TABLE_CELL_NODE, '')] },
      ],
    }] };
    expect(docToBlocks(doc)).toEqual([]);
  });
});

describe('a table the document cannot model stays opaque', () => {
  const cases: { why: string; block: unknown }[] = [
    { why: 'carries a field this adapter does not model', block: { type: 'table', headers: ['A'], rows: [['1']], sourceNote: 'keep me' } },
    { why: 'has no columns', block: { type: 'table', headers: [], rows: [] } },
    { why: 'holds a cell that is not a string', block: { type: 'table', headers: ['A'], rows: [[42]] } },
    { why: 'has an alignment outside the storable vocabulary', block: { type: 'table', headers: ['A'], rows: [['1']], columnAlign: ['diagonal'] } },
  ];

  for (const { why, block } of cases) {
    it(`a table that ${why} is returned byte-for-byte`, () => {
      expect(isProseBlock(block as ContentBlock)).toBe(false);
      expect(blocksToDoc([block as ContentBlock]).content[0].type).toBe(OPAQUE_BLOCK_NODE);
      expect(roundTrip([block as ContentBlock])).toEqual([block]);
    });
  }
});

describe('inline formatting inside table cells', () => {
  const bold = (text: string) => [{ text, marks: ['bold'] as const }];

  it('a formatted header and a formatted cell both survive', () => {
    const blocks: ContentBlock[] = [{
      type: 'table',
      headers: ['Round', 'Payout'],
      rows: [['1', '$30,000'], ['2', '$30,000']],
      headerRuns: [null, bold('Payout')],
      cellRuns: [[null, bold('$30,000')], [null, null]],
    } as unknown as ContentBlock];
    expect(isProseBlock(blocks[0])).toBe(true);
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('a link in a cell survives with its href', () => {
    const blocks: ContentBlock[] = [{
      type: 'table',
      headers: ['Source'],
      rows: [['PRCA']],
      cellRuns: [[[{ text: 'PRCA', href: 'https://example.com/' }]]],
    } as unknown as ContentBlock];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('a table with no formatting never grows the runs keys', () => {
    // A plain table must serialise exactly as every earlier editor wrote it,
    // or every untouched article would show a diff on its next save.
    const plain: ContentBlock[] = [{ type: 'table', headers: ['A'], rows: [['1']] }];
    const out = roundTrip(plain);
    expect(out).toEqual(plain);
    expect(Object.keys(out[0])).toEqual(['type', 'headers', 'rows']);
  });

  it('the Blocks view reports a formatted table as formatted, so it protects it', async () => {
    const { blockHasInlineFormatting } = await import('../lib/content/articleInline');
    expect(blockHasInlineFormatting({ type: 'table', headers: ['A'], rows: [['1']] })).toBe(false);
    expect(blockHasInlineFormatting({
      type: 'table', headers: ['A'], rows: [['1']], cellRuns: [[bold('1')]],
    })).toBe(true);
    expect(blockHasInlineFormatting({
      type: 'table', headers: ['A'], rows: [['1']], headerRuns: [bold('A')],
    })).toBe(true);
  });

  it('the write boundary keeps the words when a cell is edited as plain text', async () => {
    /*
      The Blocks grid writes a cell back as a plain string. If the runs for that
      cell were left in place they would no longer match, and a mismatch must
      lose the FORMATTING, never the words — the rule the rest of the model
      already follows.
    */
    const { articleBlockSchema, reconcileBlockInline } = await import('../lib/content/articleBlockSchema');
    const parsed = articleBlockSchema.parse({
      type: 'table',
      headers: ['Round'],
      rows: [['edited in the grid']],
      cellRuns: [[bold('the original text')]],
    });
    const fixed = reconcileBlockInline(parsed) as { rows: string[][]; cellRuns?: unknown };
    expect(fixed.rows[0][0]).toBe('edited in the grid');
    expect(fixed.cellRuns).toBeUndefined();
  });
});

describe('a body that ends with a table', () => {
  it('gets a trailing paragraph to type into, and does not store it', () => {
    const blocks: ContentBlock[] = [
      { type: 'paragraph', text: 'Before the table.' },
      { type: 'table', headers: ['A'], rows: [['1']] },
    ];
    const doc = blocksToDoc(blocks);
    // Without this the caret has nowhere to go after the table, and the next
    // thing typed lands inside its last cell.
    expect(doc.content[doc.content.length - 1].type).toBe('paragraph');
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('does not add one when the body already ends in prose', () => {
    const blocks: ContentBlock[] = [
      { type: 'table', headers: ['A'], rows: [['1']] },
      { type: 'paragraph', text: 'After the table.' },
    ];
    const doc = blocksToDoc(blocks);
    expect(doc.content).toHaveLength(2);
    expect(roundTrip(blocks)).toEqual(blocks);
  });
});

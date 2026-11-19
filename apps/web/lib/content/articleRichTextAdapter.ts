import type { ContentBlock } from '../../types';
import {
  normalizeRuns, runsToPlainText, runsCarryFormatting,
  isSafeHref, type InlineMark, type InlineRun,
} from './articleInline';
import {
  BODY_HEADING_LEVELS, isBlockAlignment, storableAlignment, toBodyHeadingLevel,
  type BlockAlignment,
} from './articleBlockStyle';

/**
 * Adapter between the stored block model and a ProseMirror/TipTap document.
 *
 * WHY AN ADAPTER AT ALL. The stored model is the authority and is not changing:
 * typed JSON blocks that the public renderer, the SEO engine and every revision
 * already understand. TipTap wants a ProseMirror document. So this file is the
 * only place that knows both shapes, and it is a pure function pair with no
 * React and no editor imports — which is what makes it testable without
 * mounting an editor.
 *
 * WHAT IT CARRIES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * The CONTINUOUS-PROSE blocks round-trip through the rich-text document:
 * paragraph, heading (h2/h3), list (bullet/ordered), blockquote and divider.
 * Those are the ones an author expects to type into a flowing page, and the
 * ones where "one block per paragraph" was the tedium worth removing.
 *
 * The STRUCTURED-EDITORIAL blocks — table, callout, image, sourceLink,
 * disclosure — stay with their existing dedicated form controls. They are not
 * prose: each has required metadata (alt text, credit, publisher, variant)
 * whose rules the SEO gate and the rights gate enforce, and turning them into
 * free-form editor nodes would either lose that metadata or rebuild those forms
 * inside the editor for no benefit. They travel through the editor as OPAQUE
 * PLACEHOLDER nodes that preserve their payload byte-for-byte.
 *
 * THE OPAQUE PLACEHOLDER IS THE KEY TO LOSSLESSNESS. An unrecognised or
 * non-prose block becomes a single placeholder node holding the ORIGINAL block
 * object. On the way back out, the original is returned unchanged. So a block
 * type this adapter has never heard of — a future type, or a legacy one — is
 * carried through an edit untouched rather than silently flattened into a
 * paragraph. That is the guarantee the round-trip tests assert.
 */

/** The marks TipTap/ProseMirror uses, mapped to our stored vocabulary. */
const PM_MARK_TO_INLINE: Record<string, InlineMark> = {
  bold: 'bold', strong: 'bold',
  italic: 'italic', em: 'italic',
  underline: 'underline',
  strike: 'strike', s: 'strike',
  superscript: 'sup', sup: 'sup',
  subscript: 'sub', sub: 'sub',
};

/** The stored mark name, mapped back to the editor's extension name. */
const INLINE_TO_PM_MARK: Record<InlineMark, string> = {
  bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strike',
  sup: 'superscript', sub: 'subscript',
};

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export interface PmDoc {
  type: 'doc';
  content: PmNode[];
}

/** The node type that carries a non-prose block through the editor untouched. */
export const OPAQUE_BLOCK_NODE = 'structuredBlock';

/**
 * Block types this adapter represents as editable rich text.
 *
 * `table` JOINED THIS SET DELIBERATELY. It used to travel opaquely, which kept
 * its payload safe but made a table the one thing an author could see in the
 * writing surface and not type into: editing meant clicking the card and
 * filling a grid of single-line inputs, and pasting a document that contained a
 * table dropped everything around it. A table is now a real document node, so
 * the cursor goes into the cells, Tab moves along them, and a pasted table
 * arrives with the prose that surrounded it.
 *
 * The safety that opacity used to provide is not lost: it comes from
 * `carriesUnmodelledKeys` instead. A stored table carrying a field this adapter
 * does not model still travels opaquely and is still edited in the grid, so no
 * existing article can lose data by being opened in the new surface.
 */
const PROSE_TYPES = new Set(['paragraph', 'heading', 'list', 'quote', 'divider', 'table']);

/**
 * Whether a block can be represented as editable rich text WITHOUT losing
 * anything.
 *
 * This is the single authoritative predicate: `blocksToDoc` asks it rather than
 * repeating the conditions, because an earlier version had the checks in both
 * places and they drifted — `isProseBlock` said an attributed quote was prose
 * while the converter correctly carried it opaquely. A caller trusting the
 * predicate would have been misled, so there is now one answer.
 *
 * A block is prose only when every field it carries has a rich-text equivalent:
 *
 *   - a heading must be a body level (h2-h4), the only levels the document
 *     models — an `h1` or an `h5` in stored data is carried opaquely rather
 *     than silently promoted;
 *   - a drop-cap paragraph is excluded, because `isDropCap` has no equivalent
 *     and losing it changes the published article's opening;
 *   - an attributed quote is excluded, because the cite line cannot live in a
 *     blockquote node and would vanish on the next save.
 */
export function isProseBlock(block: ContentBlock): boolean {
  if (!PROSE_TYPES.has(block.type)) return false;
  if (carriesUnmodelledKeys(block)) return false;
  if (block.type === 'heading' && !BODY_HEADING_LEVELS.includes(block.level)) return false;
  if (block.type === 'paragraph' && block.isDropCap) return false;
  if (block.type === 'quote' && (block.attribution || block.role)) return false;
  if (block.type === 'table' && !isRepresentableTable(block)) return false;
  return true;
}

/**
 * Whether a stored table can become a document node without losing anything.
 *
 * The document models a rectangular grid of plain-text cells with an optional
 * caption and one alignment per column. Anything else — a table with no
 * columns, a cell holding something other than a string, an alignment outside
 * the storable vocabulary — goes down the opaque path, where it keeps its exact
 * payload and stays editable in the Blocks grid. This is the check that lets
 * `table` join the modelled types without putting existing articles at risk.
 */
function isRepresentableTable(block: ContentBlock & { type: 'table' }): boolean {
  if (!Array.isArray(block.headers) || block.headers.length === 0) return false;
  if (!block.headers.every((h) => typeof h === 'string')) return false;
  if (!Array.isArray(block.rows)) return false;
  if (!block.rows.every((row) => Array.isArray(row) && row.every((c) => typeof c === 'string'))) {
    return false;
  }
  if (block.caption !== undefined && typeof block.caption !== 'string') return false;
  const align = (block as { columnAlign?: unknown }).columnAlign;
  if (align !== undefined) {
    if (!Array.isArray(align)) return false;
    if (!align.every((a) => a === undefined || a === null || isBlockAlignment(a))) return false;
  }
  return true;
}

/**
 * Every field this adapter can carry through the rich-text document, by block
 * type. A key outside its type's list has no representation in the document, so
 * it would be dropped on the way back out.
 */
const MODELLED_KEYS: Record<string, readonly string[]> = {
  paragraph: ['type', 'text', 'isDropCap', 'align', 'runs'],
  heading: ['type', 'level', 'text', 'id', 'align', 'runs'],
  list: ['type', 'items', 'ordered', 'checklist', 'checked', 'itemRuns'],
  quote: ['type', 'quote', 'attribution', 'role', 'quoteRuns'],
  divider: ['type'],
  table: ['type', 'headers', 'rows', 'caption', 'columnAlign', 'headerRuns', 'cellRuns'],
};

/**
 * Whether a prose-shaped block carries a field this adapter cannot represent.
 *
 * WHY THE CHECK IS EXPLICIT NOW. Lossless carriage of unknown fields used to be
 * a side effect: a stored heading with an extra key happened to be at a level
 * the document did not model, so it travelled through the opaque node and its
 * extra key survived. The schema keeps `.passthrough()` precisely because real
 * articles may carry fields nothing in this codebase models, and the moment h4
 * became a modelled level, that heading became "prose" and its extra key would
 * have been silently dropped on the next save.
 *
 * So the guarantee is stated rather than inherited: a block whose keys are not
 * all representable goes through the opaque path, whatever its type. It is
 * still fully editable in the Blocks view; it is only the rich-text surface
 * that treats it as a card, which is the correct trade against losing data.
 *
 * A key explicitly set to `undefined` does not count: that is an absent field
 * in JSON, not content.
 */
function carriesUnmodelledKeys(block: ContentBlock): boolean {
  const known = MODELLED_KEYS[block.type];
  if (!known) return true;
  const record = block as unknown as Record<string, unknown>;
  return Object.keys(record).some((k) => !known.includes(k) && record[k] !== undefined);
}

// ---------------------------------------------------------------------------
// blocks -> document
// ---------------------------------------------------------------------------

function runsToPmText(text: string, runs?: InlineRun[] | null): PmNode[] {
  const list = runs && runs.length ? runs : null;
  if (!list) return text ? [{ type: 'text', text }] : [];
  return list
    .filter((r) => r.text)
    .map((r) => {
      const marks: { type: string; attrs?: Record<string, unknown> }[] = [];
      for (const m of r.marks ?? []) marks.push({ type: INLINE_TO_PM_MARK[m] ?? m });
      if (r.href && isSafeHref(r.href)) marks.push({ type: 'link', attrs: { href: r.href } });
      return marks.length ? { type: 'text', text: r.text, marks } : { type: 'text', text: r.text };
    });
}

/**
 * The document node names for a table, kept in one place.
 *
 * These are the names TipTap's table extension registers. The adapter is
 * deliberately free of editor imports (that is what makes it testable without
 * mounting an editor), so the names are stated here rather than read from the
 * extension — and asserted by the round-trip tests.
 */
export const TABLE_NODE = 'table';
export const TABLE_ROW_NODE = 'tableRow';
export const TABLE_HEADER_NODE = 'tableHeader';
export const TABLE_CELL_NODE = 'tableCell';

/** One cell of a document table, with whatever inline formatting it carries. */
function tableCellNode(
  kind: string,
  text: string,
  align: BlockAlignment | null,
  runs?: InlineRun[] | null,
): PmNode {
  const inline = runsToPmText(text, runs);
  return {
    type: kind,
    attrs: { colspan: 1, rowspan: 1, colwidth: null, cellAlign: align },
    content: [inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' }],
  };
}

function tableToNode(block: ContentBlock & { type: 'table' }): PmNode {
  const columnAlign = (block as { columnAlign?: unknown[] }).columnAlign ?? [];
  const alignAt = (i: number): BlockAlignment | null => {
    const raw = columnAlign[i];
    return isBlockAlignment(raw) ? raw : null;
  };
  const width = block.headers.length;
  const headerRuns = (block as { headerRuns?: (InlineRun[] | null)[] }).headerRuns;
  const cellRuns = (block as { cellRuns?: (InlineRun[] | null)[][] }).cellRuns;
  const rows: PmNode[] = [
    {
      type: TABLE_ROW_NODE,
      content: block.headers.map((h, i) =>
        tableCellNode(TABLE_HEADER_NODE, h, alignAt(i), headerRuns?.[i] ?? null)),
    },
  ];
  block.rows.forEach((row, r) => {
    rows.push({
      type: TABLE_ROW_NODE,
      // Every row is drawn to the header's width. A stored row that is short or
      // long would otherwise produce a ragged document, which ProseMirror's
      // table machinery cannot operate on.
      content: Array.from({ length: width }, (_, i) =>
        tableCellNode(
          TABLE_CELL_NODE,
          typeof row[i] === 'string' ? row[i] : '',
          alignAt(i),
          cellRuns?.[r]?.[i] ?? null,
        )),
    });
  });
  return {
    type: TABLE_NODE,
    attrs: { caption: typeof block.caption === 'string' ? block.caption : null },
    content: rows,
  };
}

function opaque(block: ContentBlock): PmNode {
  return { type: OPAQUE_BLOCK_NODE, attrs: { block: JSON.parse(JSON.stringify(block)) } };
}

export function blocksToDoc(blocks: readonly ContentBlock[]): PmDoc {
  const content: PmNode[] = [];

  for (const block of blocks) {
    if (!isProseBlock(block)) { content.push(opaque(block)); continue; }

    switch (block.type) {
      case 'paragraph': {
        const inline = runsToPmText(block.text, block.runs);
        // The attribute is set to `null` rather than omitted when unaligned:
        // that is the value TextAlign itself uses for "no alignment", so a
        // round trip produces no spurious attribute difference.
        const attrs = { textAlign: storableAlignment(block.align) ?? null };
        content.push(
          inline.length
            ? { type: 'paragraph', attrs, content: inline }
            : { type: 'paragraph', attrs },
        );
        break;
      }
      case 'heading': {
        // `id` is an anchor target used by in-page links; preserve it as an attr.
        const attrs: Record<string, unknown> = {
          level: block.level,
          textAlign: storableAlignment(block.align) ?? null,
        };
        if (block.id) attrs.anchorId = block.id;
        content.push({ type: 'heading', attrs, content: runsToPmText(block.text, block.runs) });
        break;
      }
      case 'list': {
        /**
         * A checklist becomes a TipTap task list, so the author gets real
         * tickable boxes rather than a bulleted list they must remember is one.
         * `ordered` is ignored for a checklist: a numbered set of checkboxes is
         * not a thing the renderer draws, and honouring both would mean storing
         * a combination nothing can display.
         */
        if (block.checklist) {
          content.push({
            type: 'taskList',
            content: block.items.map((item, i) => ({
              type: 'taskItem',
              attrs: { checked: block.checked?.[i] === true },
              content: [{ type: 'paragraph', content: runsToPmText(item, block.itemRuns?.[i] ?? null) }],
            })),
          });
          break;
        }
        content.push({
          type: block.ordered ? 'orderedList' : 'bulletList',
          content: block.items.map((item, i) => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: runsToPmText(item, block.itemRuns?.[i] ?? null) }],
          })),
        });
        break;
      }
      case 'quote': {
        content.push({
          type: 'blockquote',
          content: [{ type: 'paragraph', content: runsToPmText(block.quote, block.quoteRuns) }],
        });
        break;
      }
      case 'table':
        content.push(tableToNode(block));
        break;
      case 'divider':
        content.push({ type: 'horizontalRule' });
        break;
      default:
        content.push(opaque(block));
    }
  }

  /**
   * A document must never END with a table.
   *
   * A table is the last thing in the body of plenty of articles, and without a
   * paragraph after it there is nowhere for the caret to go: pressing
   * Ctrl+End, or clicking past the end, lands INSIDE the last cell, and
   * everything typed next — including a new heading — goes into that cell
   * instead of into the article. Found in the browser suite, where a test that
   * followed one ending in a table silently wrote its paragraph into a cell.
   *
   * The trailing paragraph is a document-only affordance, not content: it is
   * empty, and `docToBlocks` drops empty paragraphs, so nothing is added to
   * what gets stored or published.
   */
  if (content.length && content[content.length - 1].type === TABLE_NODE) {
    content.push({ type: 'paragraph' });
  }

  return { type: 'doc', content };
}

// ---------------------------------------------------------------------------
// document -> blocks
// ---------------------------------------------------------------------------

function pmTextToRuns(nodes: readonly PmNode[] | undefined): { text: string; runs?: InlineRun[] } {
  const raw: InlineRun[] = [];
  for (const n of nodes ?? []) {
    if (n.type !== 'text' || typeof n.text !== 'string') continue;
    const marks: InlineMark[] = [];
    let href: string | undefined;
    for (const m of n.marks ?? []) {
      const mapped = PM_MARK_TO_INLINE[m.type];
      if (mapped) marks.push(mapped);
      else if (m.type === 'link') {
        const h = m.attrs?.href;
        if (isSafeHref(h)) href = h;
      }
      // Any other mark is ignored: the stored vocabulary is a closed allowlist,
      // so an extension that slipped in cannot invent a stored mark.
    }
    const run: InlineRun = { text: n.text };
    if (marks.length) run.marks = marks;
    if (href) run.href = href;
    raw.push(run);
  }

  const runs = normalizeRuns(raw);
  const text = runsToPlainText(runs);
  return runsCarryFormatting(runs) ? { text, runs } : { text };
}

/**
 * One table cell's text and inline formatting.
 *
 * A cell holds paragraphs. Only a single-paragraph cell can keep its runs,
 * because joining two paragraphs inserts a space that the run offsets know
 * nothing about — and a runs array that disagrees with the text is discarded
 * at the write boundary anyway. Losing the marks on a two-paragraph cell is
 * the honest outcome; losing the words would not be.
 */
function cellContent(cell: PmNode): { text: string; runs?: InlineRun[] } {
  const paragraphs = (cell.content ?? []).filter((c) => c.type === 'paragraph');
  if (paragraphs.length === 1) {
    const { text, runs } = pmTextToRuns(paragraphs[0].content);
    return { text: text.trim(), ...(runs && text.trim() === text ? { runs } : {}) };
  }
  const parts: string[] = [];
  for (const p of paragraphs) {
    const { text } = pmTextToRuns(p.content);
    if (text) parts.push(text);
  }
  return { text: parts.join(' ').trim() };
}

/**
 * The alignment a cell carries, from its own attribute or, failing that, from
 * the paragraph inside it.
 *
 * The fallback is not redundant. The column-alignment control writes
 * `cellAlign`, but the ordinary block-alignment command acts on textblocks and
 * would land on the paragraph inside the cell. Reading both means an author who
 * reaches for the familiar align button does not silently lose the alignment on
 * save.
 */
function cellAlignment(cell: PmNode): BlockAlignment | null {
  const own = cell.attrs?.cellAlign;
  if (isBlockAlignment(own)) return own;
  for (const child of cell.content ?? []) {
    if (child.type === 'paragraph' && isBlockAlignment(child.attrs?.textAlign)) {
      return child.attrs.textAlign as BlockAlignment;
    }
  }
  return null;
}

/**
 * A document table, flattened to the stored rectangular model.
 *
 * MERGED CELLS ARE EXPANDED, NOT DROPPED. The stored model has no concept of a
 * cell spanning rows or columns, and a pasted table frequently has them. The
 * old paste path read cells in source order and ignored the spans, so the data
 * after a merged cell shifted left and was published under the wrong heading —
 * silently. Here the spans are walked properly: the spanned area is reserved,
 * the text stays in the cell's true first column, and the covered positions
 * become empty cells. Nothing is misfiled; what cannot be represented (the
 * merge itself) is visibly absent rather than quietly corrupting the row.
 *
 * The first row supplies the headers, which is what the stored model and the
 * public renderer both require. A table whose first row is `<td>` rather than
 * `<th>` is still read this way: a table has to have headings, and the author
 * can see and edit them in the first row.
 */
function nodeToTable(node: PmNode): ContentBlock | null {
  const rowNodes = (node.content ?? []).filter((r) => r.type === TABLE_ROW_NODE);
  if (!rowNodes.length) return null;

  const grid: string[][] = [];
  const runGrid: (InlineRun[] | null)[][] = [];
  const alignGrid: (BlockAlignment | null)[][] = [];
  const taken: boolean[][] = [];
  const at = <T,>(g: T[][], r: number): T[] => (g[r] ??= []);

  rowNodes.forEach((row, r) => {
    let c = 0;
    for (const cell of row.content ?? []) {
      if (cell.type !== TABLE_CELL_NODE && cell.type !== TABLE_HEADER_NODE) continue;
      while (at(taken, r)[c]) c += 1;
      const colspan = Math.max(1, Number(cell.attrs?.colspan) || 1);
      const rowspan = Math.max(1, Number(cell.attrs?.rowspan) || 1);
      const { text, runs } = cellContent(cell);
      const align = cellAlignment(cell);
      for (let dr = 0; dr < rowspan; dr += 1) {
        for (let dc = 0; dc < colspan; dc += 1) {
          const origin = dr === 0 && dc === 0;
          at(taken, r + dr)[c + dc] = true;
          at(grid, r + dr)[c + dc] = origin ? text : '';
          at(runGrid, r + dr)[c + dc] = origin ? runs ?? null : null;
          at(alignGrid, r + dr)[c + dc] = align;
        }
      }
      c += colspan;
    }
  });

  const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
  if (!width) return null;
  const rect = grid.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ''));

  const runRect = grid.map((_, r) => Array.from({ length: width }, (_, i) => runGrid[r]?.[i] ?? null));

  const [headers, ...rows] = rect;
  const [headerRuns, ...cellRuns] = runRect;
  // A table that is nothing but an empty header row is an empty table: the
  // author inserted one and typed nothing. Storing it would publish a blank
  // grid, so it is dropped the way an empty paragraph is.
  if (!headers.some((h) => h.trim()) && !rows.some((row) => row.some((cell) => cell.trim()))) {
    return null;
  }

  const columnAlign = Array.from({ length: width }, (_, i) => alignGrid[0]?.[i] ?? null);
  const caption = typeof node.attrs?.caption === 'string' ? node.attrs.caption.trim() : '';

  return {
    type: 'table',
    headers,
    rows,
    ...(caption ? { caption } : {}),
    // Sparse arrays are written only when something is actually formatted, so
    // a plain table serialises exactly as it always has.
    ...(headerRuns.some(Boolean) ? { headerRuns } : {}),
    ...(cellRuns.some((row) => row.some(Boolean)) ? { cellRuns } : {}),
    // Written only when at least one column is not the default, so a plain
    // table does not grow an attribute it never had.
    ...(columnAlign.some((a) => a && a !== 'left')
      ? { columnAlign: columnAlign.map((a) => a ?? 'left') }
      : {}),
  } as ContentBlock;
}

export function docToBlocks(doc: PmDoc | null | undefined): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const node of doc?.content ?? []) {
    switch (node.type) {
      case OPAQUE_BLOCK_NODE: {
        const original = node.attrs?.block;
        // Returned exactly as it arrived. This is what makes a block type the
        // adapter does not understand survive an edit.
        if (original && typeof original === 'object') out.push(original as ContentBlock);
        break;
      }
      case 'paragraph': {
        const { text, runs } = pmTextToRuns(node.content);
        // An empty paragraph is dropped rather than stored: TipTap keeps a
        // trailing empty paragraph for the cursor, and persisting it would add
        // a blank <p> to the published article on every save.
        if (!text.trim()) break;
        const align = storableAlignment(node.attrs?.textAlign);
        out.push({ type: 'paragraph', text, ...(align ? { align } : {}), ...(runs ? { runs } : {}) });
        break;
      }
      case 'heading': {
        const { text, runs } = pmTextToRuns(node.content);
        if (!text.trim()) break;
        const level = toBodyHeadingLevel(node.attrs?.level);
        const anchorId = node.attrs?.anchorId;
        const align = storableAlignment(node.attrs?.textAlign);
        out.push({
          type: 'heading', level, text,
          ...(typeof anchorId === 'string' && anchorId ? { id: anchorId } : {}),
          ...(align ? { align } : {}),
          ...(runs ? { runs } : {}),
        });
        break;
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        const items: string[] = [];
        const itemRuns: (InlineRun[] | null)[] = [];
        const checked: boolean[] = [];
        for (const li of node.content ?? []) {
          // A list item wraps its text in paragraphs; concatenating them keeps a
          // multi-paragraph item as one item rather than dropping the remainder.
          const inline: PmNode[] = [];
          for (const child of li.content ?? []) {
            if (child.type === 'paragraph') inline.push(...(child.content ?? []));
          }
          const { text, runs } = pmTextToRuns(inline);
          if (!text.trim()) continue;
          items.push(text);
          itemRuns.push(runs ?? null);
          checked.push(li.attrs?.checked === true);
        }
        if (!items.length) break;
        out.push({
          type: 'list',
          items,
          ...(node.type === 'orderedList' ? { ordered: true } : {}),
          // `checked` is written in full, including all-false, because for a
          // checklist "nothing is ticked yet" is real editorial state, not an
          // absent field.
          ...(node.type === 'taskList' ? { checklist: true, checked } : {}),
          ...(itemRuns.some(Boolean) ? { itemRuns } : {}),
        });
        break;
      }
      case 'blockquote': {
        const inline: PmNode[] = [];
        for (const child of node.content ?? []) {
          if (child.type === 'paragraph') inline.push(...(child.content ?? []));
        }
        const { text, runs } = pmTextToRuns(inline);
        if (!text.trim()) break;
        out.push({ type: 'quote', quote: text, attribution: '', ...(runs ? { quoteRuns: runs } : {}) });
        break;
      }
      case TABLE_NODE: {
        const table = nodeToTable(node);
        if (table) out.push(table);
        break;
      }
      case 'horizontalRule':
        out.push({ type: 'divider' });
        break;
      default:
        // An unknown NODE (not block) is skipped: it cannot be stored, and
        // guessing a block type for it would invent content.
        break;
    }
  }
  return out;
}

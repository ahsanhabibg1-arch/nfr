import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { selectedRect } from '@tiptap/pm/tables';
import type { EditorState } from '@tiptap/pm/state';
import {
  BLOCK_ALIGNMENTS, isBlockAlignment, storableAlignment, type BlockAlignment,
} from '../../../lib/content/articleBlockStyle';

/**
 * The editor extensions this project owns, rather than depends on.
 *
 * WHY LOCAL INSTEAD OF THREE MORE PACKAGES. TipTap publishes
 * `@tiptap/extension-superscript`, `-subscript` and `-text-align`, and each
 * would have been a new third-party dependency in a production release for
 * roughly twenty lines of code apiece. These three are small, their behaviour
 * is exactly what this article model needs, and writing them here means the
 * storable vocabulary (`BLOCK_ALIGNMENTS`) is enforced by the editor itself
 * rather than by a package that has never heard of it.
 *
 * Nothing here is novel: the parse and render rules are the standard ones, so a
 * document pasted from elsewhere behaves as an author expects.
 */

/**
 * Superscript and subscript.
 *
 * `excludes` makes them mutually exclusive. The stored model COULD represent a
 * run carrying both marks — `INLINE_MARKS` has no such rule — but nothing can
 * draw text that is raised and lowered at once, so the editor refuses to create
 * the combination instead of storing something undrawable.
 */
export const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'superscript subscript',
  parseHTML() {
    return [
      { tag: 'sup' },
      {
        style: 'vertical-align',
        getAttrs: (value) => (value === 'super' ? {} : false),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes), 0];
  },
  addKeyboardShortcuts() {
    return { 'Mod-.': () => this.editor.commands.toggleMark(this.name) };
  },
});

export const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript subscript',
  parseHTML() {
    return [
      { tag: 'sub' },
      {
        style: 'vertical-align',
        getAttrs: (value) => (value === 'sub' ? {} : false),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['sub', mergeAttributes(HTMLAttributes), 0];
  },
  addKeyboardShortcuts() {
    return { 'Mod-,': () => this.editor.commands.toggleMark(this.name) };
  },
});

/** The node types that may carry an alignment. */
const ALIGNABLE = ['paragraph', 'heading'] as const;

declare module '@tiptap/core' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    blockAlign: {
      /** Aligns every alignable textblock in the selection. */
      setBlockAlign: (align: BlockAlignment) => ReturnType;
      /** Returns the selection to the default (left) alignment. */
      unsetBlockAlign: () => ReturnType;
    };
  }
}

/**
 * Block alignment, as a global attribute on paragraphs and headings.
 *
 * WHY A TRANSACTION RATHER THAN `updateAttributes`. `updateAttributes(type)`
 * acts on one node type and reports success even when the selection contains
 * none of it, so aligning a mixed selection of paragraphs and headings either
 * missed nodes or claimed a change it had not made. Walking the selection and
 * marking up each alignable textblock aligns exactly what the author selected
 * and returns an honest `false` when there was nothing to align — which is what
 * keeps the toolbar button from reporting a state it did not reach.
 *
 * `left` is stored as `null`, not as the string: the default must be absence,
 * so an author who never aligns anything never adds an attribute to a block.
 */
export const BlockAlign = Extension.create({
  name: 'blockAlign',

  addGlobalAttributes() {
    return [
      {
        types: [...ALIGNABLE],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => storableAlignment(element.style.textAlign) ?? null,
            renderHTML: (attributes) => {
              const align = storableAlignment(attributes.textAlign);
              return align ? { style: `text-align: ${align}` } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const apply = (value: BlockAlignment | null) =>
      ({ state, tr, dispatch }: {
        state: import('@tiptap/pm/state').EditorState;
        tr: import('@tiptap/pm/state').Transaction;
        dispatch?: (tr: import('@tiptap/pm/state').Transaction) => void;
      }) => {
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!(ALIGNABLE as readonly string[]).includes(node.type.name)) return;
          // The attribute only exists on types this extension registered it
          // for, so a node that cannot carry it is skipped rather than throwing.
          if (!node.type.spec.attrs?.textAlign) return;
          if ((node.attrs.textAlign ?? null) === value) return;
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: value });
          changed = true;
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };

    return {
      setBlockAlign: (align: BlockAlignment) => (props) => {
        if (!isBlockAlignment(align)) return false;
        return apply(storableAlignment(align) ?? null)(props);
      },
      unsetBlockAlign: () => (props) => apply(null)(props),
    };
  },
});

/**
 * The alignments offered in the toolbar, with their accessible names.
 *
 * The glyphs are letters rather than arrows on purpose: the arrow characters
 * (`⇤`, `⇥`) are already the list indent and outdent buttons two groups along,
 * and two toolbar buttons showing the same glyph is a usability bug even when
 * their accessible names differ. The glyph is `aria-hidden`; the name a screen
 * reader and a speech-input user get is the `title` below.
 */
export const ALIGN_CHOICES: { value: BlockAlignment; glyph: string; title: string }[] =
  BLOCK_ALIGNMENTS.map((value) => ({
    value,
    glyph: value === 'left' ? 'L' : value === 'center' ? 'C' : value === 'right' ? 'R' : 'J',
    title:
      value === 'left' ? 'Align left (default)'
        : value === 'center' ? 'Align centre'
          : value === 'right' ? 'Align right'
            : 'Justify',
  }));

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * The table, as a real part of the document rather than a card.
 *
 * WHAT THIS REPLACES. A table used to travel through the writing surface as an
 * opaque atom: it was drawn, but the cursor could not enter it, so editing one
 * meant clicking it and filling a grid of single-line inputs in a panel. That
 * is the step authors described as slow, and it is also why pasting a document
 * that contained a table was lossy — the paste handler pulled the tables out
 * and dropped everything around them.
 *
 * With the official table nodes registered, TipTap parses `<table>` from the
 * clipboard itself: header cells, merged cells and the prose around the table
 * all arrive the way the author copied them, and the cursor goes into the
 * cells. The stored shape has not changed at all — `articleRichTextAdapter`
 * converts between these nodes and the same `table` block the schema, the
 * renderer and every stored revision already use.
 *
 * TWO ATTRIBUTES ARE OURS, AND BOTH EXIST BECAUSE THE STORED MODEL HAS THEM:
 *
 *   `caption`     — the table's editorial title. It is an attribute rather than
 *                   a node inside the table because prosemirror-tables builds
 *                   its grid map from the table's children: a caption child
 *                   would have to be excluded from every row calculation, and
 *                   getting that wrong corrupts tables rather than just looking
 *                   wrong. The toolbar edits it when the cursor is in a table.
 *
 *   `cellAlign`   — alignment per cell, which the adapter reads from the header
 *                   row to produce the stored per-column `columnAlign`. It
 *                   renders as `text-align` so the author sees in the editor
 *                   what a reader will see, and it PARSES from a pasted cell's
 *                   own `style`/`align`, so alignment copied from Word or Docs
 *                   is kept rather than flattened to the left.
 */
const alignedCellAttributes = {
  cellAlign: {
    default: null as BlockAlignment | null,
    parseHTML: (element: HTMLElement) => {
      const inline = storableAlignment(element.style.textAlign);
      if (inline) return inline;
      const attr = element.getAttribute('align');
      return storableAlignment(attr) ?? null;
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const align = storableAlignment(attributes.cellAlign);
      return align ? { style: `text-align: ${align}` } : {};
    },
  },
};

export const articleTableExtensions = [
  Table.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        caption: {
          default: null,
          parseHTML: (element: HTMLElement) =>
            element.querySelector(':scope > caption')?.textContent?.trim() || null,
          // Kept out of the editor DOM: the caption is shown and edited in the
          // toolbar, and rendering it inside the table element would put text
          // in the grid that prosemirror-tables does not know about.
          rendered: false,
        },
      };
    },
  }).configure({
    // A table pasted or inserted here is editorial content, not a layout tool:
    // the public renderer sizes the columns, so stored column widths would be
    // a promise the published page does not keep.
    resizable: false,
    allowTableNodeSelection: true,
  }),
  TableRow,
  TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...alignedCellAttributes }; } }),
  TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...alignedCellAttributes }; } }),
];

declare module '@tiptap/core' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    tableColumnAlign: {
      /** Aligns every cell of the column(s) the selection touches. */
      setTableColumnAlign: (align: BlockAlignment) => ReturnType;
    };
  }
}

/**
 * Column alignment, applied to the whole column.
 *
 * WHY NOT JUST ALIGN THE CELL. The stored model holds ONE alignment per column
 * (`columnAlign`), because that is what a published data table needs — a
 * currency column reads right-aligned all the way down or it reads as a
 * mistake. If the editor aligned single cells, an author could produce a state
 * the save could not keep, and the alignment would appear to be discarded.
 * Aligning the column is both what they want and what can be stored.
 *
 * Merged cells appear at several positions in the table map, so a cell may be
 * visited more than once; writing the same attribute twice is harmless and
 * costs nothing, which is cheaper than deduplicating positions.
 */
export const TableColumnAlign = Extension.create({
  name: 'tableColumnAlign',
  addCommands() {
    return {
      setTableColumnAlign: (align: BlockAlignment) => ({ state, tr, dispatch }) => {
        if (!isBlockAlignment(align)) return false;
        let rect: ReturnType<typeof selectedRect>;
        try {
          rect = selectedRect(state);
        } catch {
          return false; // the selection is not inside a table
        }
        const stored = align === 'left' ? null : align;
        let changed = false;
        for (let col = rect.left; col < rect.right; col += 1) {
          for (let row = 0; row < rect.map.height; row += 1) {
            const pos = rect.map.map[row * rect.map.width + col] + rect.tableStart;
            const cell = tr.doc.nodeAt(pos);
            if (!cell) continue;
            if ((cell.attrs.cellAlign ?? null) === stored) continue;
            // Positions are stable: `setNodeMarkup` changes attributes only,
            // so the document size does not shift under the loop.
            tr.setNodeMarkup(pos, undefined, { ...cell.attrs, cellAlign: stored });
            changed = true;
          }
        }
        if (changed && dispatch) dispatch(tr);
        return changed;
      },
    };
  },
});

/**
 * Puts the cursor in the cell that was just created.
 *
 * WHY THIS IS NOT OPTIONAL POLISH. prosemirror-tables inserts a row or column
 * and leaves the selection exactly where it was, so an author who pressed
 * "Insert row below" and started typing filled in the row they came FROM. In
 * the browser run that looked like the button had silently done nothing —
 * the row existed but the text went somewhere else.
 *
 * It is run AFTER the insert command, as a separate step rather than a link in
 * the same chain, because a chain shares one transaction: a command inside it
 * would read the table map from before the insert and aim at the wrong cell.
 */
export function focusInsertedCell(
  editor: { state: EditorState; chain: () => { focus: () => { setTextSelection: (p: number) => { run: () => boolean } } } },
  where: 'rowAbove' | 'rowBelow' | 'columnLeft' | 'columnRight',
): void {
  let rect: ReturnType<typeof selectedRect>;
  try {
    rect = selectedRect(editor.state as EditorState);
  } catch {
    return;
  }
  const row = where === 'rowBelow' ? rect.bottom
    : where === 'rowAbove' ? rect.top - 1
      : rect.top;
  const column = where === 'columnRight' ? rect.right
    : where === 'columnLeft' ? rect.left - 1
      : rect.left;
  if (row < 0 || column < 0 || row >= rect.map.height || column >= rect.map.width) return;
  const cell = rect.map.map[row * rect.map.width + column];
  if (cell === undefined) return;
  // +1 steps inside the cell, onto the first position of its paragraph.
  editor.chain().focus().setTextSelection(rect.tableStart + cell + 1).run();
}

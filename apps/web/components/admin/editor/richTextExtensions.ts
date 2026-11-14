import { Extension, Mark, mergeAttributes } from '@tiptap/core';
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

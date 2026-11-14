'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { NodeSelection } from '@tiptap/pm/state';
import { RichBlockEditor } from './RichBlockEditor';
import { MediaPickerModal } from './MediaPickerModal';
import {
  Superscript, Subscript, BlockAlign, ALIGN_CHOICES,
} from './richTextExtensions';
import type { ContentBlock } from '../../../types';
import {
  blocksToDoc, docToBlocks, OPAQUE_BLOCK_NODE, type PmDoc,
} from '../../../lib/content/articleRichTextAdapter';
import { isSafeHref } from '../../../lib/content/articleInline';
import { parseVideoReference } from '../../../lib/content/articleEmbeds';
import {
  findMatches, nextMatchIndex, replacementPlan, MAX_MATCHES,
  type MatchRange, type SearchableBlock,
} from '../../../lib/content/articleFindReplace';
import {
  INSERTABLE_BLOCKS, insertableBlock, matchSlashCommand,
  type InsertableBlockDef, type InsertableBlockType,
} from '../../../lib/content/articleBlockTemplates';
import { searchInternalLinksAction } from '../../../app/admin/internal-link-actions';
import type { InternalLinkResult } from '../../../lib/cms/internalLinkSearch';

/**
 * The article body writing surface.
 *
 * WHAT CHANGED AND WHY. The previous editor asked an author to create a
 * separate Paragraph block for every paragraph, which is the tedium this
 * replaces: body prose is now one continuous document with real text selection
 * and formatting that persists.
 *
 * THE AUTHORITY IS STILL THE BLOCK MODEL. This component is a view over
 * `ContentBlock[]`. It converts to a ProseMirror document on mount, and back to
 * blocks on every change, through `articleRichTextAdapter` — the only place
 * that knows both shapes. Nothing new is stored: formatting rides in the
 * `runs` projection the schema already validates.
 *
 * STRUCTURED EDITORIAL BLOCKS ARE NOT TURNED INTO PROSE. Tables, callouts,
 * images, citations and disclosures keep their existing dedicated forms, which
 * is where their required metadata (alt text, credit, publisher, variant) is
 * captured and where the SEO and rights gates expect it. Inside this editor
 * they appear as non-editable cards that preserve their payload exactly and can
 * be reordered and removed. Clicking one hands editing back to the structured
 * panel below.
 */

/**
 * The node that carries a structured block through the document untouched.
 *
 * `atom: true` makes it a single indivisible unit: the cursor cannot get inside
 * it, so no keystroke can corrupt the payload. The whole block object lives in
 * one attribute and is written back byte-for-byte.
 */
const StructuredBlock = Node.create({
  name: OPAQUE_BLOCK_NODE,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      block: {
        default: null,
        // Kept out of the DOM: this is editor-only transport, and serialising
        // a whole JSON payload into an attribute would be both large and a
        // tempting thing for something else to parse.
        rendered: false,
      },
    };
  },
  parseHTML() {
    return [{ tag: `div[data-structured-block]` }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-structured-block': '' })];
  },
  addNodeView() {
    return ({ node }) => {
      const block = node.attrs.block as ContentBlock | null;
      const dom = document.createElement('div');
      dom.setAttribute('data-structured-block', '');
      dom.setAttribute('contenteditable', 'false');
      dom.className =
        'my-3 px-3 py-2 border border-dashed border-stone-300 bg-stone-50 rounded-xs text-[11px] font-mono text-stone-600 select-none';
      const label = block?.type ?? 'unknown';
      const detail =
        block && 'text' in block && typeof (block as { text?: string }).text === 'string'
          ? ` — ${(block as { text: string }).text.slice(0, 60)}`
          : block && 'alt' in block && typeof (block as { alt?: string }).alt === 'string'
            ? ` — ${(block as { alt: string }).alt.slice(0, 60)}`
            : block && 'title' in block && typeof (block as { title?: string }).title === 'string'
              ? ` — ${(block as { title: string }).title.slice(0, 60)}`
              : '';
      // "Click to edit" is the instruction, and it is true: selecting the card
      // opens the structured panel above the writing surface. It used to say
      // "edit below", which pointed at the Blocks view — a detour this surface
      // no longer requires.
      dom.textContent = `[${label}]${detail}  — click to edit`;
      return { dom };
    };
  },
});

const BTN =
  'px-2 py-1 text-xs font-sans rounded-xs border border-stone-200 hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent';
const BTN_ON = 'bg-[#0F1115] text-[#D4A757] border-[#0F1115] hover:bg-[#0F1115]';

type ToolbarButton = {
  label: string;
  title: string;
  isActive?: (e: Editor) => boolean;
  run: (e: Editor) => void;
  disabled?: (e: Editor) => boolean;
};

/** Groups follow the brief: Text style | Headings | Lists | Links | Insert | History. */
const GROUPS: { name: string; buttons: ToolbarButton[] }[] = [
  {
    name: 'Text style',
    buttons: [
      { label: 'B', title: 'Bold (Ctrl/Cmd+B)', isActive: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
      { label: 'I', title: 'Italic (Ctrl/Cmd+I)', isActive: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
      { label: 'U', title: 'Underline (Ctrl/Cmd+U)', isActive: (e) => e.isActive('underline'), run: (e) => e.chain().focus().toggleUnderline().run() },
      { label: 'S', title: 'Strikethrough', isActive: (e) => e.isActive('strike'), run: (e) => e.chain().focus().toggleStrike().run() },
      { label: 'x²', title: 'Superscript', isActive: (e) => e.isActive('superscript'), run: (e) => e.chain().focus().toggleMark('superscript').run() },
      { label: 'x₂', title: 'Subscript', isActive: (e) => e.isActive('subscript'), run: (e) => e.chain().focus().toggleMark('subscript').run() },
      {
        label: 'Tx',
        title: 'Clear formatting from the selection',
        /**
         * `unsetAllMarks` strips bold/italic/underline/strike/sup/sub and the
         * link mark; `clearNodes` returns a heading, list item or blockquote to
         * a plain paragraph. Both are needed: an author who asks for clean text
         * means the words, not a bold heading with its marks removed.
         */
        run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run(),
      },
    ],
  },
  {
    name: 'Headings',
    buttons: [
      // No H1: the article headline is the page's only h1.
      { label: 'H2', title: 'H2 section heading', isActive: (e) => e.isActive('heading', { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
      { label: 'H3', title: 'H3 section heading', isActive: (e) => e.isActive('heading', { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
      { label: 'H4', title: 'H4 sub-section heading', isActive: (e) => e.isActive('heading', { level: 4 }), run: (e) => e.chain().focus().toggleHeading({ level: 4 }).run() },
      { label: '¶', title: 'Body paragraph', isActive: (e) => e.isActive('paragraph'), run: (e) => e.chain().focus().setParagraph().run() },
    ],
  },
  {
    name: 'Alignment',
    buttons: ALIGN_CHOICES.map((a) => ({
      label: a.glyph,
      title: a.title,
      /**
       * `left` is active when NO alignment is set, because absence is the
       * default — otherwise the Left button would look unselected on every
       * ordinary paragraph in the article.
       */
      isActive: (e: Editor) =>
        a.value === 'left'
          ? !e.isActive({ textAlign: 'center' }) && !e.isActive({ textAlign: 'right' }) && !e.isActive({ textAlign: 'justify' })
          : e.isActive({ textAlign: a.value }),
      run: (e: Editor) =>
        a.value === 'left'
          ? e.chain().focus().unsetBlockAlign().run()
          : e.chain().focus().setBlockAlign(a.value).run(),
    })),
  },
  {
    name: 'Lists',
    buttons: [
      { label: '• List', title: 'Bulleted list', isActive: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
      { label: '# List', title: 'Numbered list', isActive: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
      { label: '☑ List', title: 'Checklist', isActive: (e) => e.isActive('taskList'), run: (e) => e.chain().focus().toggleTaskList().run() },
      { label: '⇥', title: 'Nest list item (Tab)', run: (e) => e.chain().focus().sinkListItem('listItem').run(), disabled: (e) => !e.can().sinkListItem('listItem') },
      { label: '⇤', title: 'Outdent list item (Shift+Tab)', run: (e) => e.chain().focus().liftListItem('listItem').run(), disabled: (e) => !e.can().liftListItem('listItem') },
    ],
  },
  {
    name: 'Insert',
    buttons: [
      { label: 'Quote', title: 'Quote block', isActive: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
      { label: '―', title: 'Divider', run: (e) => e.chain().focus().setHorizontalRule().run() },
    ],
  },
  {
    name: 'History',
    buttons: [
      { label: '↶', title: 'Undo (Ctrl/Cmd+Z)', run: (e) => e.chain().focus().undo().run(), disabled: (e) => !e.can().undo() },
      { label: '↷', title: 'Redo (Ctrl/Cmd+Shift+Z)', run: (e) => e.chain().focus().redo().run(), disabled: (e) => !e.can().redo() },
    ],
  },
];

/**
 * The contextual toolbar that appears over a mouse (or keyboard) selection.
 *
 * WHY A SEPARATE SURFACE. The owner asked for WordPress-style editing: select a
 * phrase, click Bold, done — without travelling to the top of the page. The
 * sticky toolbar already does everything; this puts the four most common
 * actions where the eye already is.
 *
 * IT USES THE SAME COMMANDS AND THE SAME `onMouseDown` GUARD as the main
 * toolbar. That guard is not optional: pressing a button blurs the editor on
 * `mousedown`, collapsing the selection before `click` fires, so the command
 * would apply to an empty range. Preventing the default keeps the selection,
 * which is exactly the bug this editor hit once already.
 *
 * Positioned from the selection's own client rectangle rather than the mouse,
 * so a keyboard selection (Shift+Arrow) gets the toolbar too.
 */
const FLOATING_ACTIONS: { label: string; title: string; mark: string; run: (e: Editor) => void }[] = [
  { label: 'B', title: 'Bold', mark: 'bold', run: (e) => e.chain().focus().toggleBold().run() },
  { label: 'I', title: 'Italic', mark: 'italic', run: (e) => e.chain().focus().toggleItalic().run() },
  { label: 'U', title: 'Underline', mark: 'underline', run: (e) => e.chain().focus().toggleUnderline().run() },
  { label: 'S', title: 'Strikethrough', mark: 'strike', run: (e) => e.chain().focus().toggleStrike().run() },
];

const SelectionToolbar: React.FC<{
  editor: Editor;
  onLink: () => void;
  disabled: boolean;
}> = ({ editor, onLink, disabled }) => {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const update = () => {
      if (disabled) { setBox(null); return; }
      const { state, view } = editor;
      const { from, to, empty } = state.selection;
      // Nothing selected, or the selection is an atom (a structured block card):
      // there is no text to format, so no toolbar.
      if (empty || from === to || !view.hasFocus()) { setBox(null); return; }
      if (!state.doc.textBetween(from, to, ' ').trim()) { setBox(null); return; }

      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to, -1);
      const host = view.dom.closest('[data-rt-host]') as HTMLElement | null;
      if (!host) { setBox(null); return; }
      const hostRect = host.getBoundingClientRect();
      setBox({
        top: Math.min(start.top, end.top) - hostRect.top,
        left: (start.left + end.right) / 2 - hostRect.left,
      });
    };

    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    editor.on('blur', () => setBox(null));
    editor.on('focus', update);
    update();
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
      editor.off('focus', update);
    };
  }, [editor, disabled]);

  if (!box) return null;

  return (
    <div
      role="toolbar"
      aria-label="Selection formatting"
      data-testid="rt-selection-toolbar"
      style={{ top: box.top, left: box.left }}
      className="absolute z-20 -translate-x-1/2 -translate-y-full mb-1 flex items-center gap-0.5 p-1 rounded-xs border border-stone-700 bg-[#0F1115] shadow-lg"
    >
      {FLOATING_ACTIONS.map((a) => (
        <button
          key={a.label}
          type="button"
          title={a.title}
          aria-label={a.title}
          aria-pressed={editor.isActive(a.mark)}
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => a.run(editor)}
          className={`px-2 py-0.5 text-xs font-sans rounded-xs ${
            editor.isActive(a.mark) ? 'bg-[#D4A757] text-[#0F1115] font-bold' : 'text-stone-200 hover:bg-stone-800'
          }`}
        >
          <span aria-hidden="true">{a.label}</span>
        </button>
      ))}
      <span aria-hidden className="mx-0.5 h-4 w-px bg-stone-700" />
      <button
        type="button"
        title="Link the selected text"
        aria-label="Link the selected text"
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={onLink}
        className="px-2 py-0.5 text-xs font-sans rounded-xs text-stone-200 hover:bg-stone-800"
      >
        Link
      </button>
    </div>
  );
};

/**
 * Inserts a structured editorial block at the cursor as an opaque atom.
 *
 * THIS IS THE WHOLE REASON INSERTING IS SAFE. The block travels through the
 * document in the same `structuredBlock` node the adapter already uses for
 * content it does not model, and `docToBlocks` returns its payload
 * byte-for-byte. So an inserted table or callout reaches the database as the
 * exact shape `articleBlockSchema` validates — no new storage, no new
 * renderer branch, no migration.
 *
 * A trailing paragraph is added after the atom when it lands at the end of the
 * document, so the caret has somewhere to go: without it an author who inserts
 * a table as the last element cannot type after it.
 */
function insertStructuredBlock(editor: Editor, def: InsertableBlockDef): void {
  const block = def.build();
  const chain = editor.chain().focus();
  chain.insertContent({ type: OPAQUE_BLOCK_NODE, attrs: { block } });
  chain.run();
  const { state } = editor;
  const atEnd = state.selection.$to.pos >= state.doc.content.size - 1;
  if (atEnd) editor.chain().focus().insertContent({ type: 'paragraph' }).run();
}

/**
 * The insertables that are ordinary prose, inserted as editable nodes.
 *
 * WHY NOT INSERT THESE AS CARDS TOO. A divider and a plain bulleted list are
 * both types the adapter already round-trips as real ProseMirror nodes
 * (`PROSE_TYPES`). Inserting them as opaque cards would store the identical
 * payload, but the author would get a read-only card that only became editable
 * after a save and reload — confusing for no gain. Everything the adapter does
 * NOT model as prose (tables, callouts, images, citations, disclosures, and a
 * quote that carries an attribution) goes in as a card, which is the only way
 * its metadata survives.
 */
const PROSE_INSERTERS: Partial<Record<InsertableBlockType, (e: Editor) => void>> = {
  divider: (e) => e.chain().focus().setHorizontalRule().run(),
  list: (e) => e.chain().focus().toggleBulletList().run(),
};

/** One entry point for both the Insert menu and the slash menu. */
function insertByDefinition(editor: Editor, def: InsertableBlockDef): void {
  const prose = PROSE_INSERTERS[def.key];
  if (prose) prose(editor);
  else insertStructuredBlock(editor, def);
}

/**
 * Collects the document's text as blocks whose offsets map to positions.
 *
 * `textBetween` is given a one-character `leafText`, so an inline leaf such as
 * a hard break takes exactly one position — which is what keeps an offset in
 * the returned string equal to `start + offset` in the document. Using
 * `textContent` here instead would silently skip those leaves and shift every
 * match after one.
 *
 * Structured cards are skipped: their payload is edited in the panel, and
 * rewriting a table cell through a text search would bypass the schema.
 */
function searchableBlocks(editor: Editor): SearchableBlock[] {
  const out: SearchableBlock[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === OPAQUE_BLOCK_NODE) return false;
    if (!node.isTextblock) return true;
    out.push({ start: pos + 1, text: node.textBetween(0, node.content.size, '\n', '\n') });
    return false;
  });
  return out;
}

/**
 * Moves a top-level node one place up or down.
 *
 * It rebuilds the document's top-level order rather than splicing positions,
 * because position arithmetic across a move is exactly where an off-by-one
 * drops or duplicates a block. The node is then re-selected at its new index,
 * so the panel editing it stays open and the author can move it again.
 */
function moveTopLevelNode(editor: Editor, pos: number, direction: 'up' | 'down'): void {
  const { doc } = editor.state;
  const index = doc.resolve(pos).index(0);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= doc.childCount) return;

  const json = editor.getJSON() as unknown as PmDoc;
  const content = [...(json.content ?? [])];
  const moved = content[index];
  content[index] = content[target];
  content[target] = moved;
  editor.chain().setContent({ type: 'doc', content }).run();

  let at = 0;
  for (let i = 0; i < target; i += 1) at += editor.state.doc.child(i).nodeSize;
  editor.chain().setNodeSelection(at).run();
}

/**
 * The structured block the author has selected, if any.
 *
 * A structured block is an atom, so clicking it gives ProseMirror's own
 * `NodeSelection` — no custom click handling, no second notion of "selected"
 * that could disagree with the editor's. That selection is what opens the
 * editing panel, and it is why the panel cannot be open for a block that is no
 * longer there: if the node is deleted, the selection goes with it.
 */
function structuredSelection(editor: Editor): { pos: number; block: ContentBlock } | null {
  const sel = editor.state.selection as { node?: { type: { name: string }; attrs: Record<string, unknown> }; from: number };
  const node = sel.node;
  if (!node || node.type.name !== OPAQUE_BLOCK_NODE) return null;
  const block = node.attrs.block as ContentBlock | null;
  if (!block || typeof block !== 'object') return null;
  return { pos: sel.from, block };
}

export interface RichTextBodyEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  disabled?: boolean;
  /** Rendered beside the word count — used for the structured-block insert menu. */
  actions?: React.ReactNode;
}

export const RichTextBodyEditor: React.FC<RichTextBodyEditorProps> = ({
  blocks, onChange, disabled = false, actions,
}) => {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  /** Insert menu (toolbar) and the slash menu share one definition list. */
  const [insertOpen, setInsertOpen] = useState(false);
  /** Open while the Media Library is choosing an image to insert at the cursor. */
  const [imagePicker, setImagePicker] = useState(false);

  /** The video-embed dialog. */
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoRef, setVideoRef] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoError, setVideoError] = useState<string | null>(null);

  /** Find and replace. `matches` is recomputed from the document, never cached across edits. */
  const [findOpen, setFindOpen] = useState(false);
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [findNote, setFindNote] = useState<string | null>(null);

  /**
   * Full-screen writing.
   *
   * A long article is edited in a column beside a sidebar; this takes the
   * editor to the whole viewport so the author can see the piece. It is a
   * presentation state only — the document, the selection and the dirty state
   * are untouched, which is why it is safe to toggle mid-sentence.
   */
  const [fullscreen, setFullscreen] = useState(false);
  /**
   * Slash menu state.
   *
   * `query` is the text typed after `/`. It is driven from the editor's own
   * document rather than from keystrokes, so pasting, undo and clicking
   * elsewhere cannot leave a stale menu open.
   */
  const [slash, setSlash] = useState<
    { query: string; from: number; top: number; left: number } | null
  >(null);
  const [slashIndex, setSlashIndex] = useState(0);

  // Internal link search state.
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<InternalLinkResult[]>([]);
  const [searching, setSearching] = useState(false);

  /**
   * Debounced internal search.
   *
   * 250 ms, and the in-flight result is discarded if the term changed while it
   * was away (`cancelled`), so a fast typist cannot have an older response
   * overwrite a newer one.
   */
  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) { setSearchResults([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const res = await searchInternalLinksAction(term);
      if (cancelled) return;
      setSearching(false);
      setSearchResults(res.ok ? res.results : []);
      if (!res.ok) setLinkError(res.error);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchTerm]);

  /**
   * The document the editor is initialised with.
   *
   * Computed ONCE from the incoming blocks. Re-deriving it on every `blocks`
   * change would destroy and rebuild the document on each keystroke, which is
   * exactly how a rich-text editor loses the caret — the failure the brief
   * calls out ("must not lose focus or cursor position during normal state
   * updates"). After mount the editor owns the document and reports upward.
   */
  const initialDoc = useMemo<PmDoc>(() => blocksToDoc(blocks), []);

  const emit = useRef(onChange);
  emit.current = onChange;

  /**
   * The last body this component reported upward, as canonical JSON.
   *
   * WHY THIS EXISTS. TipTap emits `onUpdate` while normalising the document it
   * was given — before the author has typed anything. Reporting that upward
   * marked the article dirty on mount, which was not cosmetic: the
   * "Unsaved Changes" badge was always showing, the browser's beforeunload
   * warning nagged on every navigation away from an untouched article, and the
   * badge reappeared immediately after a successful save, so the editor always
   * looked unsaved. Browser-verified before and after.
   *
   * The baseline is the ROUND-TRIPPED form of the incoming blocks, not the raw
   * input, because normalisation legitimately changes some things (a trailing
   * empty paragraph is dropped, marks are sorted). Comparing against the raw
   * input would therefore always differ and defeat the check.
   */
  const lastEmitted = useRef<string>(JSON.stringify(docToBlocks(initialDoc)));

  const editor = useEditor({
    editable: !disabled,
    /**
     * THE TOOLBAR MUST REFLECT THE CURRENT SELECTION.
     *
     * TipTap 3 stopped re-rendering the React component on every transaction by
     * default, for performance. The consequence here was a toolbar whose state
     * was stale: `aria-pressed` on the formatting buttons and the `disabled`
     * state of Unlink are computed from `editor.isActive(...)` at render time,
     * so without a re-render on selection change they kept their previous
     * values. Browser-verified: selecting a linked word left Unlink disabled,
     * and a screen reader would have been told the wrong state.
     *
     * Opting back in costs a render per transaction on one admin screen, which
     * is the right trade for controls that tell the truth.
     */
    shouldRerenderOnTransaction: true,
    // Next renders this on the server first; TipTap needs to be told so it does
    // not warn about a hydration mismatch it cannot avoid.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // The headline is the article's h1; body headings start at h2 and go to
        // h4, which is as deep as the public renderer draws.
        heading: { levels: [2, 3, 4] },
        // `link` ships in StarterKit v3 and is configured separately below, so
        // the duplicate would throw at runtime.
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: false,
        // Defence at the editor boundary as well as at the schema and the
        // renderer: a pasted or typed scheme that could execute never becomes a
        // link mark in the first place.
        isAllowedUri: (url) => isSafeHref(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      }),
      /**
       * `Underline` is NOT imported separately: StarterKit v3 already bundles
       * it. Registering it again produced a runtime warning —
       * "Duplicate extension names found: ['underline']" — which TipTap warns
       * "can lead to issues". Caught in the dev server log, not by a test.
       */
      Superscript,
      Subscript,
      BlockAlign,
      /**
       * Task lists come from `@tiptap/extension-list`, which StarterKit already
       * builds on, so this adds no new runtime — only the two node types the
       * bundle does not register by default.
       *
       * `nested: false` is deliberate: the stored `list` block is a flat
       * `items: string[]`, so a nested checklist would have nowhere to go and
       * its indented items would be flattened on the next save.
       */
      TaskList,
      TaskItem.configure({ nested: false }),
      StructuredBlock,
    ],
    content: initialDoc,
    editorProps: {
      attributes: {
        class:
          'prose-editor min-h-[22rem] max-w-[46rem] mx-auto px-1 py-2 outline-none text-stone-900 font-sans text-base leading-[1.75] focus:outline-none',
        'aria-label': 'Article body',
      },
    },
    onUpdate: ({ editor: e }) => {
      const next = docToBlocks(e.getJSON() as unknown as PmDoc);
      const serialized = JSON.stringify(next);
      // Only a real content change is reported, so the dirty state means what
      // it says and the editor does not fight its own save.
      if (serialized === lastEmitted.current) return;
      lastEmitted.current = serialized;
      emit.current(next);
    },
  });

  // Keep editability in step with the permission/workflow state.
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  /**
   * Word count and reading time, derived from the editor's own plain text.
   *
   * Taken from `getText()` rather than by serialising the document to JSON on
   * each keystroke, which is the expensive path the brief warns about.
   */
  const [stats, setStats] = useState({ words: 0, minutes: 1 });
  useEffect(() => {
    if (!editor) return;
    const recompute = () => {
      const words = editor.getText().trim().split(/\s+/).filter(Boolean).length;
      setStats({ words, minutes: Math.max(1, Math.ceil(words / 225)) });
    };
    recompute();
    editor.on('update', recompute);
    return () => { editor.off('update', recompute); };
  }, [editor]);

  const openLink = useCallback(() => {
    if (!editor) return;
    setLinkValue((editor.getAttributes('link').href as string) ?? '');
    setLinkError(null);
    setLinkOpen(true);
  }, [editor]);

  /**
   * Applies a specific href, used by the internal-search results.
   *
   * Separate from `applyLink` so a result can be clicked without first
   * round-tripping through the input's state — React would not have committed
   * `setLinkValue` by the time the click handler runs.
   */
  const applyLinkTo = useCallback((href: string) => {
    if (!editor) return;
    if (!isSafeHref(href)) {
      setLinkError('That target is not a supported link.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
    setSearchTerm('');
    setSearchResults([]);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const href = linkValue.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkOpen(false);
      return;
    }
    if (!isSafeHref(href)) {
      setLinkError('Use a site path like /articles/slug/, an https:// address, or mailto:.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
  }, [editor, linkValue]);

  /**
   * Replaces the structured block at `pos` with what the panel produced.
   *
   * THE SELECTION MUST SURVIVE A FIELD EDIT. The ordinary case is one block in,
   * one block out — typing in a table cell — and that is done with
   * `setNodeMarkup`, which leaves the node at the same position, plus an
   * explicit re-assertion of the node selection. Without that the selection
   * would collapse on the first keystroke, the panel would close, and the
   * author would have to re-click the card for every character.
   *
   * It deliberately does NOT focus the editor: focus belongs to the input the
   * author is typing in, and stealing it back would make the panel unusable.
   *
   * The count can change — Duplicate makes two, Delete makes none — and those
   * cases replace the node's range instead, which does end the selection and
   * close the panel. That is the right outcome: the block the panel was editing
   * no longer exists.
   */
  const replaceStructuredAt = useCallback((pos: number, next: ContentBlock[]) => {
    if (!editor) return;
    if (next.length === 1) {
      editor
        .chain()
        .command(({ tr }) => {
          const node = tr.doc.nodeAt(pos);
          if (!node || node.type.name !== OPAQUE_BLOCK_NODE) return false;
          tr.setNodeMarkup(pos, undefined, { block: next[0] });
          tr.setSelection(NodeSelection.create(tr.doc, pos));
          return true;
        })
        .run();
      return;
    }
    if (next.length === 0) {
      editor.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run();
      return;
    }
    editor.chain().focus().insertContentAt({ from: pos, to: pos + 1 }, blocksToDoc(next).content).run();
  }, [editor]);

  /**
   * Inserts from the toolbar menu.
   *
   * An image is the one case that asks a question first: an image block with no
   * `src` and no alt text is exactly what the publication and rights gates
   * refuse, so the Media Library opens and the block is built from the chosen
   * asset. Choosing nothing inserts nothing, which is better than leaving an
   * empty frame in the article.
   */
  const insertFromMenu = useCallback((def: InsertableBlockDef) => {
    if (!editor) return;
    setInsertOpen(false);
    if (def.requiresSetup === 'image') { setImagePicker(true); return; }
    if (def.requiresSetup === 'video') { setVideoOpen(true); return; }
    insertByDefinition(editor, def);
  }, [editor]);

  /**
   * Replaces the typed `/command` with the block it names.
   *
   * The typed text is deleted FIRST, in its own transaction, so the block is
   * never inserted next to a stray "/table" the author then has to clean up.
   */
  const insertFromSlash = useCallback((def: InsertableBlockDef) => {
    if (!editor || !slash) return;
    const to = Math.min(slash.from + 1 + slash.query.length, editor.state.doc.content.size);
    editor.chain().focus().deleteRange({ from: slash.from, to }).run();
    setSlash(null);
    // Same rule as the Insert menu: an image is chosen from the library and a
    // video reference is asked for, so neither is inserted empty.
    if (def.requiresSetup === 'image') { setImagePicker(true); return; }
    if (def.requiresSetup === 'video') { setVideoOpen(true); return; }
    insertByDefinition(editor, def);
  }, [editor, slash]);

  /**
   * Slash-menu detection, driven from the document rather than from keystrokes.
   *
   * THE TRIGGER IS DELIBERATELY NARROW: the `/` must be the first character of
   * an otherwise empty paragraph. Anchoring it to the paragraph start is what
   * keeps the menu out of the way of ordinary prose — "and/or", a date like
   * "9/11" and a pasted "https://…" all contain a slash, and a looser rule
   * would open a block menu in the middle of a sentence.
   *
   * Reading the state on every selection and document change (instead of
   * listening for the "/" key) means undo, paste and clicking elsewhere all
   * close the menu by themselves; there is no way to leave it open over text
   * that no longer starts with a slash.
   */
  useEffect(() => {
    if (!editor) return;
    const detect = () => {
      const { state, view } = editor;
      const sel = state.selection;
      if (!sel.empty || disabled) { setSlash(null); return; }
      const $from = sel.$from;
      if ($from.parent.type.name !== 'paragraph') { setSlash(null); return; }
      const start = $from.start();
      const before = state.doc.textBetween(start, $from.pos, '\n', '￼');
      const m = before.match(/^\/([A-Za-z]{0,24})$/);
      if (!m) { setSlash(null); return; }

      const host = view.dom.closest('[data-rt-host]') as HTMLElement | null;
      if (!host) { setSlash(null); return; }
      const caret = view.coordsAtPos($from.pos);
      const hostRect = host.getBoundingClientRect();
      setSlash((prev) => {
        const next = {
          query: m[1],
          from: $from.pos - m[0].length,
          top: caret.bottom - hostRect.top + 4,
          left: caret.left - hostRect.left,
        };
        // Resetting the highlighted row only when the query itself changed
        // keeps arrow-key navigation from jumping back to the first result on
        // every unrelated transaction.
        if (!prev || prev.query !== next.query) setSlashIndex(0);
        return next;
      });
    };
    detect();
    editor.on('selectionUpdate', detect);
    editor.on('update', detect);
    editor.on('blur', () => setSlash(null));
    return () => {
      editor.off('selectionUpdate', detect);
      editor.off('update', detect);
    };
  }, [editor, disabled]);

  const slashMatches = useMemo(
    () => (slash ? matchSlashCommand(slash.query).slice(0, 8) : []),
    [slash],
  );

  /**
   * Keyboard control of the slash menu.
   *
   * Bound to the editor's own DOM node in a capturing listener so it runs
   * before ProseMirror's own key handling: Enter must choose a block instead of
   * splitting the paragraph, and the arrow keys must move the highlight instead
   * of the caret. The listener is torn down whenever the menu closes, so normal
   * typing is never intercepted.
   */
  useEffect(() => {
    if (!editor || !slash || slashMatches.length === 0) return;
    const dom = editor.view.dom;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        setSlashIndex((i) => (i + 1) % slashMatches.length);
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
      } else if (ev.key === 'Enter' || ev.key === 'Tab') {
        ev.preventDefault();
        insertFromSlash(slashMatches[Math.min(slashIndex, slashMatches.length - 1)]);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        setSlash(null);
      }
    };
    dom.addEventListener('keydown', onKey, true);
    return () => dom.removeEventListener('keydown', onKey, true);
  }, [editor, slash, slashMatches, slashIndex, insertFromSlash]);

  /**
   * Finds the next occurrence and selects it.
   *
   * The matches are recomputed from the live document on every press rather
   * than cached when the panel opened: the author can type between presses, and
   * a cached list would point at positions that have moved.
   */
  const findNext = useCallback(() => {
    if (!editor) return;
    const term = findTerm;
    if (!term) { setFindNote(null); return; }
    const matches = findMatches(searchableBlocks(editor), term, { caseSensitive });
    if (matches.length === 0) {
      setFindNote(`No match for “${term}”.`);
      return;
    }
    const from = editor.state.selection.to;
    const index = nextMatchIndex(matches, from);
    const hit = matches[index];
    editor.chain().focus().setTextSelection({ from: hit.from, to: hit.to }).scrollIntoView().run();
    setFindNote(
      `Match ${index + 1} of ${matches.length}${matches.length >= MAX_MATCHES ? '+' : ''}.`,
    );
  }, [editor, findTerm, caseSensitive]);

  /** Replaces the current selection when it is a match, then advances. */
  const replaceCurrent = useCallback(() => {
    if (!editor || !findTerm) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, '\n', '\n');
    const same = caseSensitive ? selected === findTerm : selected.toLowerCase() === findTerm.toLowerCase();
    if (!same) {
      // Nothing is replaced until the author is looking at a match — otherwise
      // pressing Replace with the caret anywhere would overwrite whatever text
      // happened to be selected.
      findNext();
      return;
    }
    editor.chain().focus().insertContentAt({ from, to }, replaceTerm).run();
    setFindNote('Replaced.');
  }, [editor, findTerm, replaceTerm, caseSensitive, findNext]);

  /**
   * Replaces every occurrence in one undoable step.
   *
   * The ranges are applied last-first (`replacementPlan`), because each edit
   * changes the document's length and front-to-back would write into positions
   * that have already moved. All of it goes in ONE transaction, so a single
   * Ctrl+Z puts the article back — an author who replaces the wrong word across
   * a long piece must not have to undo it forty times.
   */
  const replaceAll = useCallback(() => {
    if (!editor || !findTerm) return;
    const matches: MatchRange[] = findMatches(searchableBlocks(editor), findTerm, { caseSensitive });
    if (matches.length === 0) {
      setFindNote(`No match for “${findTerm}”.`);
      return;
    }
    editor
      .chain()
      .command(({ tr }) => {
        for (const range of replacementPlan(matches)) {
          if (replaceTerm) tr.insertText(replaceTerm, range.from, range.to);
          else tr.delete(range.from, range.to);
        }
        return true;
      })
      .run();
    setFindNote(
      `Replaced ${matches.length}${matches.length >= MAX_MATCHES ? ` (the first ${MAX_MATCHES})` : ''} occurrence${matches.length === 1 ? '' : 's'}.`,
    );
  }, [editor, findTerm, replaceTerm, caseSensitive]);

  /** Escape leaves full screen, so the author is never trapped there. */
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  /** The Insert menu closes on an outside click and on Escape. */
  useEffect(() => {
    if (!insertOpen) return;
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t?.closest('[data-rt-insert]')) return;
      setInsertOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setInsertOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [insertOpen]);

  /**
   * Derived at render time, not stored in state.
   *
   * The editor re-renders on every transaction (`shouldRerenderOnTransaction`),
   * so reading the selection here cannot go stale — whereas a second copy in
   * React state could disagree with the document, which is how a panel ends up
   * editing a block the author already deleted.
   */
  const structured = editor ? structuredSelection(editor) : null;

  if (!editor) {
    return (
      <div className="border border-stone-200 rounded-sm bg-white p-4 text-xs text-stone-500">
        Loading the editor…
      </div>
    );
  }

  return (
    <div
      data-testid="rt-shell"
      data-fullscreen={fullscreen ? 'true' : 'false'}
      className={
        fullscreen
          // `inset-0` + its own scroll container, so the toolbar stays sticky at
          // the top of the editor rather than scrolling away with the page.
          ? 'fixed inset-0 z-50 overflow-y-auto border border-stone-200 bg-white'
          : 'border border-stone-200 rounded-sm bg-white'
      }
    >
      {/* ---- toolbar ---- */}
      <div
        role="toolbar"
        aria-label="Article body formatting"
        aria-controls="article-body-surface"
        className="flex flex-wrap items-center gap-1 p-2 border-b border-stone-200 bg-stone-50/80 sticky top-0 z-10 rounded-t-sm"
      >
        {GROUPS.map((group, gi) => (
          <React.Fragment key={group.name}>
            {gi > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-stone-200" />}
            <span className="sr-only">{group.name}</span>
            {group.buttons.map((b) => {
              const active = b.isActive?.(editor) ?? false;
              return (
                <button
                  key={b.label}
                  type="button"
                  title={b.title}
                  aria-label={b.title}
                  aria-pressed={b.isActive ? active : undefined}
                  disabled={disabled || (b.disabled?.(editor) ?? false)}
                  /**
                   * THE SELECTION MUST SURVIVE THE CLICK.
                   *
                   * Pressing a toolbar button blurs the editor on `mousedown`,
                   * which collapses the text selection before `click` fires —
                   * so the command then applies to an empty range and nothing
                   * happens. Browser-verified: without this, selecting a word
                   * and pressing Bold produced no `<strong>` at all.
                   *
                   * Preventing the default on `mousedown` keeps focus and the
                   * selection in the document; the command still runs on
                   * `click`, and keyboard activation is unaffected because it
                   * never fires `mousedown`.
                   */
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => b.run(editor)}
                  className={`${BTN} ${active ? BTN_ON : 'bg-white text-stone-700'}`}
                >
                  {/*
                    THE GLYPH IS DECORATIVE; THE NAME COMES FROM `aria-label`.

                    Axe flagged `label-content-name-mismatch` (serious) on this
                    toolbar: a button showing "¶" or "↶" with an accessible name
                    of "Body paragraph" or "Undo" violates WCAG 2.5.3, because a
                    speech-input user saying the visible label cannot activate
                    it. Marking the glyph `aria-hidden` leaves one unambiguous
                    name — the full description — which is the standard
                    icon-button pattern and what the tooltip already shows.
                  */}
                  <span aria-hidden="true">{b.label}</span>
                </button>
              );
            })}
          </React.Fragment>
        ))}

        <span aria-hidden className="mx-1 h-5 w-px bg-stone-200" />
        <span className="sr-only">Links</span>
        <button
          type="button"
          title="Insert or edit link"
          aria-label="Insert or edit link"
          aria-pressed={editor.isActive('link')}
          disabled={disabled}
          // Same reason as the formatting buttons: the selection the link will
          // be applied to must not be collapsed by the click itself.
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={openLink}
          className={`${BTN} ${editor.isActive('link') ? BTN_ON : 'bg-white text-stone-700'}`}
        >
          Link
        </button>
        <button
          type="button"
          title="Unlink: remove the link from the selection"
          aria-label="Unlink: remove the link from the selection"
          disabled={disabled || !editor.isActive('link')}
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
          className={`${BTN} bg-white text-stone-700`}
        >
          Unlink
        </button>

        {/*
          ---- INSERT MENU ----

          Every structured editorial element is reachable from here, which is
          the point: before this, a table, a callout, an image, a citation or a
          disclosure could only be created by leaving the writing surface for
          the Blocks composer. The same list backs the `/` menu, so the two can
          never drift apart.
        */}
        <span aria-hidden className="mx-1 h-5 w-px bg-stone-200" />
        <span className="sr-only">Insert elements</span>
        <div data-rt-insert className="relative">
          <button
            type="button"
            title="Insert an editorial element"
            aria-label="Insert an editorial element"
            aria-haspopup="menu"
            aria-expanded={insertOpen}
            disabled={disabled}
            data-testid="rt-insert-toggle"
            // The caret position decides where the block lands, so it must
            // survive the click that opens the menu.
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => setInsertOpen((o) => !o)}
            className={`${BTN} ${insertOpen ? BTN_ON : 'bg-white text-stone-700'}`}
          >
            Insert <span aria-hidden="true">▾</span>
          </button>
          {insertOpen && (
            <div
              role="menu"
              aria-label="Insert an editorial element"
              data-testid="rt-insert-menu"
              className="absolute left-0 top-full z-30 mt-1 w-72 max-h-80 overflow-y-auto border border-stone-300 bg-white shadow-lg rounded-xs py-1"
            >
              {INSERTABLE_BLOCKS.map((def) => (
                <button
                  key={def.key}
                  type="button"
                  role="menuitem"
                  data-testid={`rt-insert-${def.key}`}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => insertFromMenu(def)}
                  className="w-full text-left px-3 py-1.5 hover:bg-stone-50 focus:bg-stone-50 focus:outline-none"
                >
                  <span className="block text-xs font-sans text-stone-900">{def.label}</span>
                  <span className="block text-[11px] text-stone-500">{def.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---- document tools ---- */}
        <span aria-hidden className="mx-1 h-5 w-px bg-stone-200" />
        <span className="sr-only">Document tools</span>
        <button
          type="button"
          title="Find and replace"
          aria-label="Find and replace"
          aria-pressed={findOpen}
          aria-controls="rt-find-panel"
          data-testid="rt-find-toggle"
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => { setFindOpen((o) => !o); setFindNote(null); }}
          className={`${BTN} ${findOpen ? BTN_ON : 'bg-white text-stone-700'}`}
        >
          Find
        </button>
        <button
          type="button"
          title={fullscreen ? 'Leave full screen (Esc)' : 'Write in full screen'}
          aria-label={fullscreen ? 'Leave full screen' : 'Write in full screen'}
          aria-pressed={fullscreen}
          data-testid="rt-fullscreen-toggle"
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => setFullscreen((f) => !f)}
          className={`${BTN} ${fullscreen ? BTN_ON : 'bg-white text-stone-700'}`}
        >
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>

      {/* ---- find and replace ---- */}
      {findOpen && (
        <div id="rt-find-panel" data-testid="rt-find-panel" className="p-3 border-b border-stone-200 bg-stone-50 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label htmlFor="rt-find" className="block text-[10px] font-mono uppercase text-stone-500">Find</label>
              <input
                id="rt-find"
                value={findTerm}
                onChange={(e) => { setFindTerm(e.target.value); setFindNote(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); findNext(); }
                  if (e.key === 'Escape') { e.preventDefault(); setFindOpen(false); }
                }}
                className="w-56 p-2 text-xs bg-white border border-stone-200 rounded-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="rt-replace" className="block text-[10px] font-mono uppercase text-stone-500">Replace with</label>
              <input
                id="rt-replace"
                value={replaceTerm}
                onChange={(e) => setReplaceTerm(e.target.value)}
                className="w-56 p-2 text-xs bg-white border border-stone-200 rounded-xs"
              />
            </div>
            <button type="button" disabled={disabled || !findTerm} onClick={findNext} data-testid="rt-find-next" className={`${BTN} bg-white`}>
              Next
            </button>
            <button type="button" disabled={disabled || !findTerm} onClick={replaceCurrent} data-testid="rt-replace-one" className={`${BTN} bg-white`}>
              Replace
            </button>
            <button type="button" disabled={disabled || !findTerm} onClick={replaceAll} data-testid="rt-replace-all" className={`${BTN} bg-white`}>
              Replace all
            </button>
            <label className="flex items-center gap-1.5 text-[11px] text-stone-600">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => { setCaseSensitive(e.target.checked); setFindNote(null); }}
                className="rounded-xs text-[#D4A757] focus:ring-0"
              />
              Match case
            </label>
          </div>
          {/*
            `role="status"` rather than `role="alert"`: "no match" is
            information, not an error, and an alert would interrupt a screen
            reader mid-word on every keystroke.
          */}
          <p role="status" data-testid="rt-find-note" className="text-[11px] text-stone-600 min-h-[1rem]">
            {findNote ?? 'Searches the body text. Structured blocks are edited in their own panel.'}
          </p>
        </div>
      )}

      {/* ---- link dialog ---- */}
      {linkOpen && (
        <div className="p-3 border-b border-stone-200 bg-[#F7F3EA] space-y-2">
          <label htmlFor="rt-link" className="block text-[10px] font-mono uppercase text-stone-500">
            Link target
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="rt-link"
              autoFocus
              value={linkValue}
              onChange={(e) => { setLinkValue(e.target.value); setLinkError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                if (e.key === 'Escape') { e.preventDefault(); setLinkOpen(false); }
              }}
              placeholder="/articles/some-slug/  or  https://example.com/"
              className="flex-1 min-w-[16rem] p-2 text-xs bg-white border border-stone-200 rounded-xs"
            />
            <button type="button" onClick={applyLink} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">
              Apply
            </button>
            <button type="button" onClick={() => setLinkOpen(false)} className={`${BTN} bg-white`}>
              Cancel
            </button>
          </div>
          {linkError
            ? <p role="alert" data-testid="rt-link-error" className="text-[11px] text-rose-700">{linkError}</p>
            : <p className="text-[11px] text-stone-500">Internal paths stay in the site; https:// links open in a new tab.</p>}

          {/*
            INTERNAL LINK SEARCH.

            Results come from `searchInternalLinkTargets`, which builds every
            URL from `config/routes.ts` — the same helpers the public pages and
            the sitemap use. The editor therefore never guesses a path, which is
            how an author ends up linking to a 404.

            Articles are restricted to the published set. A target that exists
            but is thin (a category with no published articles) is still offered,
            with its warning shown, because the author knows their publishing
            plan better than this search does.
          */}
          <div className="pt-2 border-t border-[#8B5E3C]/20 space-y-2">
            <label htmlFor="rt-link-search" className="block text-[10px] font-mono uppercase text-stone-500">
              Or find internal content
            </label>
            <input
              id="rt-link-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search articles, sections, categories, disciplines, events…"
              className="w-full p-2 text-xs bg-white border border-stone-200 rounded-xs"
            />
            {searching && <p className="text-[11px] text-stone-500">Searching…</p>}
            {!searching && searchTerm.trim().length >= 2 && searchResults.length === 0 && (
              <p className="text-[11px] text-stone-500">No published content matches that.</p>
            )}
            {searchResults.length > 0 && (
              <ul data-testid="rt-link-results" className="max-h-56 overflow-y-auto border border-stone-200 rounded-xs bg-white divide-y divide-stone-100">
                {searchResults.map((r) => (
                  <li key={`${r.kind}-${r.id}`}>
                    <button
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => { setLinkValue(r.url); setLinkError(null); applyLinkTo(r.url); }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-stone-50"
                    >
                      <span className="text-[9px] font-mono uppercase tracking-wider text-[#8B5E3C] mr-1.5">{r.kind}</span>
                      <span className="text-xs font-sans text-stone-900">{r.label}</span>
                      {r.detail && <span className="text-[11px] text-stone-500"> · {r.detail}</span>}
                      <span className="block font-mono text-[10px] text-stone-400">{r.url}</span>
                      {r.warning && <span className="block text-[10px] text-amber-700">{r.warning}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/*
        ---- STRUCTURED BLOCK PANEL ----

        Opens when the author selects a structured card in the document, and
        edits that one block with the SAME forms the Blocks view uses. This is
        what makes Write a complete surface: a table's cells, an image's alt
        text, a callout's variant and a citation's publisher are all editable
        without leaving the article.

        It is a panel rather than fields inside the card because these forms are
        where the metadata the SEO and rights gates read is captured, and they
        must be identical in both views — so there is one component, used twice,
        not two implementations that drift.
      */}
      {structured && (
        <div
          data-testid="rt-block-panel"
          className="p-3 border-b border-stone-200 bg-[#F7F3EA] space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500">
              Editing {structured.block.type} block
            </span>
            <div className="flex items-center gap-1">
              {/*
                MOVE LIVES HERE, NOT IN THE CARD BELOW.

                The panel edits ONE block, so the reused block editor's own
                up/down controls are correctly disabled (it is both the first
                and the last block of its list). Moving is a change to the
                DOCUMENT, so these act on the document's top-level order and
                then re-select the block, which keeps this panel open and lets
                the author move it again.
              */}
              <button
                type="button"
                title="Move this block up"
                aria-label="Move this block up"
                data-testid="rt-block-up"
                disabled={disabled}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => moveTopLevelNode(editor, structured.pos, 'up')}
                className={`${BTN} bg-white text-stone-700`}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                title="Move this block down"
                aria-label="Move this block down"
                data-testid="rt-block-down"
                disabled={disabled}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => moveTopLevelNode(editor, structured.pos, 'down')}
                className={`${BTN} bg-white text-stone-700`}
              >
                <span aria-hidden="true">↓</span>
              </button>
              <button
                type="button"
                title="Add a paragraph after this block"
                aria-label="Add a paragraph after this block"
                data-testid="rt-block-after"
                disabled={disabled}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() =>
                  editor.chain().focus()
                    .insertContentAt(structured.pos + 1, { type: 'paragraph' })
                    .setTextSelection(structured.pos + 2)
                    .run()
                }
                className={`${BTN} bg-white text-stone-700`}
              >
                ¶ after
              </button>
              <button
                type="button"
                // Returns the caret to the document. Without a way out, the panel
                // would stay open until the author clicked into the prose, which
                // is not obvious from looking at it.
                onClick={() => editor.chain().focus().setTextSelection(structured.pos + 1).run()}
                className={`${BTN} bg-white text-stone-700`}
              >
                Done
              </button>
            </div>
          </div>
          <RichBlockEditor
            compact
            blocks={[structured.block]}
            onChange={(next) => replaceStructuredAt(structured.pos, next)}
          />
        </div>
      )}

      {/*
        ---- VIDEO EMBED DIALOG ----

        The author pastes the link they have; `parseVideoReference` extracts a
        provider and an id from it and the pasted string itself is discarded.
        Only the two validated values are stored, and the public renderer builds
        the iframe URL from them — so no content, pasted or imported, can choose
        the origin of a frame on the page.

        The title is required because a frame with no accessible name is
        announced to a screen reader as "frame" and nothing else.
      */}
      {videoOpen && (
        <div data-testid="rt-video-dialog" className="p-3 border-b border-stone-200 bg-[#F7F3EA] space-y-2">
          <label htmlFor="rt-video-ref" className="block text-[10px] font-mono uppercase text-stone-500">
            YouTube or Vimeo link
          </label>
          <input
            id="rt-video-ref"
            autoFocus
            value={videoRef}
            onChange={(e) => { setVideoRef(e.target.value); setVideoError(null); }}
            placeholder="https://www.youtube.com/watch?v=…  or  https://vimeo.com/123456789"
            className="w-full p-2 text-xs bg-white border border-stone-200 rounded-xs"
          />
          <label htmlFor="rt-video-title" className="block text-[10px] font-mono uppercase text-stone-500">
            What the video shows (used as the frame&rsquo;s accessible name)
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="rt-video-title"
              value={videoTitle}
              onChange={(e) => { setVideoTitle(e.target.value); setVideoError(null); }}
              placeholder="Short description of the video"
              className="flex-1 min-w-[16rem] p-2 text-xs bg-white border border-stone-200 rounded-xs"
            />
            <button
              type="button"
              data-testid="rt-video-insert"
              onClick={() => {
                const parsed = parseVideoReference(videoRef);
                if (!parsed) {
                  setVideoError('That is not a YouTube or Vimeo video link.');
                  return;
                }
                if (!videoTitle.trim()) {
                  setVideoError('Describe what the video shows, so it has an accessible name.');
                  return;
                }
                const block: ContentBlock = {
                  type: 'video',
                  provider: parsed.provider,
                  videoId: parsed.id,
                  title: videoTitle.trim(),
                };
                insertStructuredBlock(editor, { ...insertableBlock('video')!, build: () => block });
                setVideoOpen(false);
                setVideoRef('');
                setVideoTitle('');
              }}
              className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs"
            >
              Insert video
            </button>
            <button
              type="button"
              onClick={() => { setVideoOpen(false); setVideoError(null); }}
              className={`${BTN} bg-white`}
            >
              Cancel
            </button>
          </div>
          {videoError
            ? <p role="alert" data-testid="rt-video-error" className="text-[11px] text-rose-700">{videoError}</p>
            : <p className="text-[11px] text-stone-500">Only YouTube and Vimeo are approved for embedding.</p>}
        </div>
      )}

      {/*
        ---- MEDIA LIBRARY, FOR INSERTING AN IMAGE AT THE CURSOR ----

        The block is built from the chosen asset, so it arrives with a source,
        alt text, caption and credit already filled — the fields the rights gate
        checks. Inserting an empty image frame and hoping the author returns to
        it is how an article reaches the publication gate and fails there.
      */}
      <MediaPickerModal
        isOpen={imagePicker}
        onClose={() => setImagePicker(false)}
        onSelect={(media) => {
          setImagePicker(false);
          const block: ContentBlock = {
            type: 'image',
            src: media.url,
            alt: media.altText,
            ...(media.caption ? { caption: media.caption } : {}),
            ...(media.credit ? { credit: media.credit } : {}),
          };
          insertStructuredBlock(editor, { ...insertableBlock('image')!, build: () => block });
        }}
      />

      {/* ---- writing surface ---- */}
      {/*
        `data-rt-host` + `relative` give the selection toolbar a positioning
        context, so it is placed relative to this panel rather than the page and
        stays correct while the page scrolls.
      */}
      <div id="article-body-surface" data-rt-host className="relative px-3 sm:px-6">
        <SelectionToolbar editor={editor} onLink={openLink} disabled={disabled} />
        <EditorContent editor={editor} />

        {/*
          ---- SLASH MENU ----

          Typing "/" on an empty line offers the same elements as the Insert
          menu, at the caret. It is a convenience over that menu, never the only
          way in: an author who never discovers "/" loses nothing.

          Not a focus trap. The editor keeps focus throughout — the menu is
          driven by the keydown listener above — so the caret stays where the
          block is going, and clicking a row works as well as pressing Enter.
        */}
        {slash && slashMatches.length > 0 && (
          <div
            role="listbox"
            aria-label="Insert an editorial element"
            data-testid="rt-slash-menu"
            style={{ top: slash.top, left: slash.left }}
            className="absolute z-30 w-72 max-h-72 overflow-y-auto border border-stone-300 bg-white shadow-lg rounded-xs py-1"
          >
            {slashMatches.map((def, i) => (
              <button
                key={def.key}
                type="button"
                role="option"
                aria-selected={i === slashIndex}
                data-testid={`rt-slash-${def.key}`}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => insertFromSlash(def)}
                className={`w-full text-left px-3 py-1.5 ${
                  i === slashIndex ? 'bg-[#F7F3EA]' : 'hover:bg-stone-50'
                }`}
              >
                <span className="block text-xs font-sans text-stone-900">{def.label}</span>
                <span className="block text-[10px] font-mono text-stone-400">/{def.slash[0]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- status bar ---- */}
      <div
        // Named so a test (and a screen reader) can address the editor's own
        // counters rather than any other text on the page that mentions words.
        role="status"
        aria-label="Article body statistics"
        className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-stone-200 bg-stone-50/80 text-[11px] font-mono text-stone-500 rounded-b-sm"
      >
        <span data-testid="rt-word-count">{stats.words} words</span>
        <span aria-hidden>·</span>
        <span>{stats.minutes} min read</span>
        <span aria-hidden>·</span>
        <span>Shift+Enter for a line break</span>
        {actions && <span className="ml-auto flex items-center gap-2">{actions}</span>}
      </div>
    </div>
  );
};

export default RichTextBodyEditor;

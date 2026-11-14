import type { ContentBlock } from '../../types';
import {
  normalizeRuns, runsToPlainText, runsCarryFormatting,
  isSafeHref, type InlineMark, type InlineRun,
} from './articleInline';
import {
  BODY_HEADING_LEVELS, storableAlignment, toBodyHeadingLevel,
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

/** Block types this adapter represents as editable rich text. */
const PROSE_TYPES = new Set(['paragraph', 'heading', 'list', 'quote', 'divider']);

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
      case 'divider':
        content.push({ type: 'horizontalRule' });
        break;
      default:
        content.push(opaque(block));
    }
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

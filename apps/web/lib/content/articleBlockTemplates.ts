import type { ContentBlock } from '../../types';

/**
 * Starter payloads for the structured editorial blocks an author can insert
 * from the Write surface.
 *
 * WHY TEMPLATES RATHER THAN EMPTY NODES. Every one of these block types is
 * already validated end to end — schema, adapter, public renderer, revisions —
 * so inserting one is safe. What was missing was a way to create one without
 * leaving Write for the Blocks composer. A template gives the block a shape the
 * schema accepts on the very first save, so an author can insert, keep writing,
 * and fill in the details later without the article becoming unsaveable in the
 * meantime.
 *
 * THE PLACEHOLDER TEXT IS DELIBERATE AND VISIBLE. An inserted block says what
 * it needs ("Describe this image…"), because a silently empty callout or an
 * image with no alt text is exactly what the publication and rights gates
 * refuse — better that the author sees the gap while writing than at publish
 * time.
 *
 * NOTHING HERE INVENTS A FIELD. Each template contains only keys the existing
 * `articleBlockSchema` already models, which is why no migration and no schema
 * change is involved.
 */

export type InsertableBlockType =
  | 'image' | 'table' | 'comparisonTable' | 'callout' | 'takeaway'
  | 'sourceLink' | 'disclosure' | 'quote' | 'divider' | 'list' | 'checklist'
  | 'faq' | 'footnotes' | 'gallery' | 'video';

export interface InsertableBlockDef {
  /** Stable id used by the toolbar and the slash menu. */
  key: InsertableBlockType;
  label: string;
  /** What the author types after `/` to reach it. */
  slash: string[];
  /** One line shown in the insert menu. */
  hint: string;
  /**
   * The editor asks a question before inserting, instead of dropping an empty
   * block into the article.
   *
   *   `image` — opens the Media Library, so the block arrives with a source and
   *     alt text rather than an empty frame the rights gate will later refuse;
   *   `video` — asks for the video reference, which is parsed and validated
   *     into a provider and an id before anything is stored.
   *
   * `build()` still returns a saveable starting payload for both, so an insert
   * that is cancelled or completed later never leaves the article unsaveable.
   */
  requiresSetup?: 'image' | 'video';
  build: () => ContentBlock;
}

/**
 * A comparison table is a `table` with a caption naming it as one.
 *
 * It is NOT a separate block type: the stored shape is identical, and inventing
 * a `comparisonTable` type would mean a new schema entry, a new renderer branch
 * and a new revision path for a table with a different caption. The editorial
 * distinction lives in the caption, where a reader also sees it.
 */
const comparisonTable = (): ContentBlock => ({
  type: 'table',
  caption: 'Comparison',
  headers: ['Option', 'Detail A', 'Detail B'],
  rows: [
    ['First option', '', ''],
    ['Second option', '', ''],
  ],
});

export const INSERTABLE_BLOCKS: readonly InsertableBlockDef[] = [
  {
    key: 'image',
    label: 'Image',
    slash: ['image', 'img', 'photo', 'picture'],
    hint: 'Insert an image from the Media Library',
    requiresSetup: 'image',
    // `src` and `alt` are required by the schema; both are filled by the
    // Media Library picker, which is why this is never inserted bare.
    build: () => ({ type: 'image', src: '', alt: '' }),
  },
  {
    key: 'gallery',
    label: 'Image gallery',
    slash: ['gallery', 'images', 'photos'],
    hint: 'Several images shown together, each with its own alt text',
    /*
      INSERTED EMPTY, ON PURPOSE.

      The Media Library picker chooses one asset at a time, so a gallery is
      built by adding images to it from its own panel rather than by answering a
      multi-select dialog that does not exist. An empty gallery is saveable and
      renders nothing, so an author can place it and fill it as the piece comes
      together.
    */
    build: () => ({ type: 'gallery', layout: 'grid', images: [] }),
  },
  {
    key: 'video',
    label: 'Video embed',
    slash: ['video', 'youtube', 'vimeo', 'embed'],
    hint: 'An approved YouTube or Vimeo embed',
    requiresSetup: 'video',
    // The provider is a placeholder and the id is empty until the dialog
    // supplies a real reference; an empty id is saveable and renders nothing.
    build: () => ({ type: 'video', provider: 'youtube', videoId: '', title: '' }),
  },
  {
    key: 'faq',
    label: 'Questions and answers',
    slash: ['faq', 'questions', 'qa'],
    hint: 'A question-and-answer set, rendered as a description list',
    build: () => ({
      type: 'faq',
      title: 'Frequently asked',
      items: [
        { question: 'What does a reader most often ask here?', answer: 'Answer it in a sentence or two.' },
      ],
    }),
  },
  {
    key: 'footnotes',
    label: 'Notes / footnotes',
    slash: ['footnote', 'notes', 'endnote'],
    hint: 'Numbered notes; mark the reference in the prose with superscript',
    build: () => ({
      type: 'footnotes',
      items: [{ text: 'The note a superscript marker in the prose refers to.' }],
    }),
  },
  {
    key: 'table',
    label: 'Table',
    slash: ['table', 'grid'],
    hint: 'A simple table with a header row',
    build: () => ({
      type: 'table',
      headers: ['Column 1', 'Column 2'],
      rows: [['', ''], ['', '']],
    }),
  },
  {
    key: 'comparisonTable',
    label: 'Comparison table',
    slash: ['comparison', 'compare', 'versus', 'vs'],
    hint: 'A table set up to compare options side by side',
    build: comparisonTable,
  },
  {
    key: 'takeaway',
    label: 'Key takeaway',
    slash: ['takeaway', 'key', 'summary'],
    hint: 'A highlighted editorial takeaway',
    build: () => ({
      type: 'callout',
      variant: 'takeaway',
      title: 'Key takeaway',
      text: 'State the single most important point for a reader in a hurry.',
    }),
  },
  {
    key: 'callout',
    label: 'Callout',
    slash: ['callout', 'note', 'info', 'warning'],
    hint: 'An informational or cautionary aside',
    build: () => ({
      type: 'callout',
      variant: 'info',
      title: '',
      text: 'Add the context a reader needs at this point in the article.',
    }),
  },
  {
    key: 'quote',
    label: 'Attributed quote',
    slash: ['quote', 'pullquote', 'blockquote'],
    hint: 'A quotation with an attribution line',
    build: () => ({ type: 'quote', quote: 'The quotation.', attribution: 'Who said it', role: '' }),
  },
  {
    key: 'sourceLink',
    label: 'Citation / source reference',
    slash: ['citation', 'cite', 'source', 'reference'],
    hint: 'A formal source reference, kept distinct from an editorial link',
    /**
     * THE PLACEHOLDER URL MUST BE A VALID ONE.
     *
     * This template started as `url: 'https://'`, which looks like an obvious
     * "fill me in" and is not a parseable URL — so `isSafeHref` refused it and
     * the schema rejected the block. The effect was that inserting a Citation
     * made the whole article unsaveable, reported as "Article body block N
     * cannot be saved", with nothing pointing at the control responsible.
     * Caught by `tests/article-block-templates.test.ts`, which parses every
     * template through the real save boundary for exactly this reason.
     *
     * `example.com` is deliberate: it is reserved for documentation, so it can
     * never be a real source, and if one ever reached a published article it
     * would be visible to a reader and reported by the link analysis rather
     * than failing silently.
     */
    build: () => ({
      type: 'sourceLink',
      title: 'Source title',
      url: 'https://example.com/replace-with-the-real-source',
      publisher: '',
    }),
  },
  {
    key: 'disclosure',
    label: 'Disclosure',
    slash: ['disclosure', 'affiliate', 'disclaimer'],
    hint: 'An affiliate, editorial or partner disclosure',
    build: () => ({
      type: 'disclosure',
      variant: 'editorial',
      text: 'State the relationship a reader should know about.',
    }),
  },
  {
    key: 'list',
    label: 'Key list',
    slash: ['keylist', 'bullets'],
    hint: 'A standalone bulleted key list',
    build: () => ({ type: 'list', items: ['First point', 'Second point'] }),
  },
  {
    key: 'divider',
    label: 'Divider',
    slash: ['divider', 'hr', 'rule', 'separator'],
    hint: 'A section separator',
    build: () => ({ type: 'divider' }),
  },
];

/** Look a definition up by key. */
export function insertableBlock(key: string): InsertableBlockDef | undefined {
  return INSERTABLE_BLOCKS.find((b) => b.key === key);
}

/**
 * Definitions matching a slash query, ranked so an exact alias wins.
 *
 * An empty query lists everything, which is what makes `/` on its own a
 * discoverable menu rather than a guessing game.
 */
export function matchSlashCommand(query: string): InsertableBlockDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...INSERTABLE_BLOCKS];
  const scored = INSERTABLE_BLOCKS.map((b) => {
    const exact = b.slash.some((a) => a === q);
    const prefix = b.slash.some((a) => a.startsWith(q)) || b.label.toLowerCase().startsWith(q);
    const loose = b.slash.some((a) => a.includes(q)) || b.label.toLowerCase().includes(q);
    return { b, score: exact ? 0 : prefix ? 1 : loose ? 2 : 3 };
  });
  return scored.filter((s) => s.score < 3).sort((a, b) => a.score - b.score).map((s) => s.b);
}

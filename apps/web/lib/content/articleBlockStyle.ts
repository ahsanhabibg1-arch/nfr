/**
 * Block-level presentation vocabulary shared by the schema, the adapter, the
 * editor and the public renderer.
 *
 * WHY A SEPARATE MODULE. Alignment and heading depth are decided in the editor,
 * validated by the schema, carried by the adapter and finally drawn by the
 * public renderer. Four files needed the same closed list, and the schema is not
 * a safe home for it: `ArticleBody` is rendered on the public pages, and
 * importing the schema there would pull zod into that path for two string
 * constants. So the vocabulary lives here, with no dependencies at all.
 *
 * THE DEFAULT IS ABSENCE. `left` for alignment and `2` for a heading are the
 * defaults, and a block at its default stores NO field. That keeps every
 * existing article byte-identical after an edit: an author who never touches
 * alignment never adds an `align` key to a single block.
 */

/** The complete, closed set of block alignments. */
export const BLOCK_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
export type BlockAlignment = (typeof BLOCK_ALIGNMENTS)[number];

export function isBlockAlignment(v: unknown): v is BlockAlignment {
  return typeof v === 'string' && (BLOCK_ALIGNMENTS as readonly string[]).includes(v);
}

/**
 * Normalises an alignment for STORAGE.
 *
 * Returns `undefined` for `left`, for an unknown value and for nothing at all,
 * which is what keeps the default out of the stored payload.
 */
export function storableAlignment(v: unknown): BlockAlignment | undefined {
  if (!isBlockAlignment(v) || v === 'left') return undefined;
  return v;
}

/**
 * The Tailwind class for an alignment, for the public renderer.
 *
 * `left` returns an empty string rather than `text-left` so an unaligned
 * paragraph's markup is unchanged from before this feature existed.
 */
export function alignmentClass(v: unknown): string {
  switch (storableAlignment(v)) {
    case 'center': return 'text-center';
    case 'right': return 'text-right';
    case 'justify': return 'text-justify';
    default: return '';
  }
}

/** Body heading depths. The article headline is the page's only `h1`. */
export const BODY_HEADING_LEVELS = [2, 3, 4] as const;
export type BodyHeadingLevel = (typeof BODY_HEADING_LEVELS)[number];

/**
 * Coerces a stored or editor-supplied heading level to a body level.
 *
 * Anything unrecognised becomes 2. A heading that arrived as an `h1` or an `h5`
 * is therefore still a heading — it is only its depth that is corrected, which
 * is the right failure: losing the heading entirely would change the article.
 */
export function toBodyHeadingLevel(v: unknown): BodyHeadingLevel {
  const n = Number(v);
  return n === 3 ? 3 : n === 4 ? 4 : 2;
}

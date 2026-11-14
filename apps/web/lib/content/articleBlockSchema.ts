import { z } from 'zod';
import { INLINE_MARKS, isSafeHref, reconcileInline, type InlineRun } from './articleInline';
import { BLOCK_ALIGNMENTS, storableAlignment } from './articleBlockStyle';
import { VIDEO_PROVIDERS, isVideoId } from './articleEmbeds';

/**
 * The server-side contract for article body blocks.
 *
 * WHAT THIS REPLACES, AND WHY IT MATTERS. The schema was
 * `z.object({ type: z.string() }).passthrough()` — any object with a string
 * `type` was accepted and stored verbatim by `cleanJson`. There was no
 * allowlist of block types and no validation of any field, so a client could
 * persist arbitrary JSON into `ArticleBlock.data`. That was tolerable only
 * because the public renderer emitted plain strings as React children, which
 * made unknown data inert rather than dangerous.
 *
 * Inline formatting removes that accident of safety: `runs` is structured data
 * the renderer interprets, and link targets come from it. So the boundary now
 * validates properly — a closed list of block types, a known shape per type,
 * and a four-mark allowlist with parsed-and-checked URLs.
 *
 * PRESERVATION IS A FIRST-CLASS REQUIREMENT. Stored articles were written
 * against a schema that validated nothing, so some will carry fields this file
 * does not model. Every block type therefore keeps `.passthrough()` on its own
 * object: unknown KEYS on a KNOWN block type survive untouched. What is refused
 * is an unknown block type — something the renderer could not draw anyway — and
 * malformed values in the fields that are modelled.
 *
 * `strict()` would have been the tidier choice and the wrong one: it would
 * silently strip fields from real articles on their next save.
 */

/**
 * A run is STRICT, while blocks are permissive — a deliberate asymmetry.
 *
 * Blocks keep `.passthrough()` because stored articles predate any real
 * validation and may carry fields this file does not model; stripping them on
 * the next save would be silent data loss. Runs have no such history: they are
 * introduced by this change, so no stored run can carry an unknown key, and
 * dropping unknown keys (zod's default) keeps the stored shape exactly as
 * modelled. It also gives the inferred type no index signature, so run data
 * flows through the inline helpers without casts.
 */
const runSchema = z.object({
  text: z.string(),
  marks: z.array(z.enum(INLINE_MARKS)).optional(),
  /**
   * Validated by parsing, not by shape. A string that merely looks like a URL
   * is refused here rather than being stored and re-checked at render time —
   * though the renderer checks again anyway, because storage is not the only
   * way data arrives in a database.
   */
  href: z.string().refine(isSafeHref, 'Unsupported or unsafe link target').optional(),
});

const runsSchema = z.array(runSchema).max(2000).optional();

/** Text-bearing blocks share a cap so one block cannot carry a whole article. */
const bodyText = z.string().max(20000);

/**
 * Alignment is validated but never required, and `left` is not storable (see
 * `storableAlignment`), so a block an author has not aligned carries no key.
 */
const alignment = z.enum(BLOCK_ALIGNMENTS).optional();

const heading = z.object({
  type: z.literal('heading'),
  /**
   * h2-h4. h4 was added for genuinely three-deep reference articles; h1 is
   * still refused because the article headline is the page's only h1 and a
   * second one would break the document outline.
   */
  level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  text: bodyText,
  id: z.string().max(200).optional(),
  align: alignment,
  runs: runsSchema,
}).passthrough();

const paragraph = z.object({
  type: z.literal('paragraph'),
  text: bodyText,
  isDropCap: z.boolean().optional(),
  align: alignment,
  runs: runsSchema,
}).passthrough();

const quote = z.object({
  type: z.literal('quote'),
  quote: bodyText,
  attribution: z.string().max(300).default(''),
  role: z.string().max(200).optional(),
  quoteRuns: runsSchema,
}).passthrough();

const list = z.object({
  type: z.literal('list'),
  items: z.array(z.string().max(5000)).max(500),
  ordered: z.boolean().optional(),
  /**
   * A checklist is still a `list`, not a new block type: the items, their
   * formatting and their order are identical, and only the marker changes. A
   * separate type would have meant a new schema entry, a new renderer branch
   * and a new revision path for a list drawn with boxes.
   */
  checklist: z.boolean().optional(),
  /** Positional and parallel to `items`; shorter or longer arrays are reconciled. */
  checked: z.array(z.boolean()).max(500).optional(),
  /** Positional and sparse: `null` means "this item has no formatting". */
  itemRuns: z.array(z.array(runSchema).nullable()).max(500).optional(),
}).passthrough();

const table = z.object({
  type: z.literal('table'),
  headers: z.array(z.string().max(500)).max(50),
  rows: z.array(z.array(z.string().max(2000)).max(50)).max(500),
  caption: z.string().max(500).optional(),
}).passthrough();

const callout = z.object({
  type: z.literal('callout'),
  variant: z.enum(['info', 'takeaway', 'warning', 'curator']).optional(),
  title: z.string().max(300).optional(),
  text: bodyText,
  runs: runsSchema,
}).passthrough();

const image = z.object({
  type: z.literal('image'),
  src: z.string().max(2048),
  alt: z.string().max(600),
  caption: z.string().max(1000).optional(),
  credit: z.string().max(300).optional(),
}).passthrough();

const sourceLink = z.object({
  type: z.literal('sourceLink'),
  title: z.string().max(500),
  /**
   * A formal citation target. Held to the same safety rule as an inline link,
   * but kept a DISTINCT block type: a citation is not an editorial hyperlink,
   * and collapsing the two would lose the distinction the sources panel and
   * structured data depend on.
   */
  url: z.string().refine(isSafeHref, 'Unsupported or unsafe citation URL'),
  publisher: z.string().max(300).optional(),
  note: z.string().max(1000).optional(),
}).passthrough();

const disclosure = z.object({
  type: z.literal('disclosure'),
  text: bodyText,
  variant: z.enum(['affiliate', 'editorial', 'partner']).optional(),
}).passthrough();

const divider = z.object({ type: z.literal('divider') }).passthrough();

/**
 * THE FOUR BLOCK TYPES BELOW ARE STRICT, NOT PASSTHROUGH.
 *
 * Every type above keeps `.passthrough()` because real articles were stored
 * against a schema that validated nothing and may carry fields this file does
 * not model. These four are introduced here, so no stored block can carry an
 * unknown key, and dropping unknown keys (zod's default) keeps the stored
 * shape exactly as modelled — the same reasoning that makes `runs` strict.
 */

/**
 * A question-and-answer set.
 *
 * One block holds the whole set rather than one block per pair, because a
 * reader meets them as a single list and the renderer needs to know where it
 * starts and ends. The answer carries `runs`, so a link or an emphasis inside
 * an answer is as expressive as it is in body prose.
 */
const faq = z.object({
  type: z.literal('faq'),
  title: z.string().max(300).optional(),
  items: z.array(z.object({
    question: z.string().max(500),
    answer: bodyText,
    answerRuns: runsSchema,
  })).max(100),
});

/**
 * End-of-section notes.
 *
 * WHAT THIS IS AND IS NOT. The notes are numbered by their position here, and
 * the author marks the reference in the prose with the superscript mark. There
 * is no automatic two-way link between a marker and its note: that would need
 * an identifier inside the inline run model, and inventing one would change the
 * `runs` contract every stored article already satisfies. So this models the
 * notes themselves honestly, and the marker stays the author's to place.
 */
const footnotes = z.object({
  type: z.literal('footnotes'),
  title: z.string().max(300).optional(),
  items: z.array(z.object({
    text: bodyText,
    runs: runsSchema,
  })).max(200),
});

/**
 * Several images presented together.
 *
 * Each image keeps the same fields as a standalone `image` block — alt text is
 * required per image, not per gallery, because a reader using a screen reader
 * meets each one separately and "gallery of six photographs" tells them
 * nothing.
 */
const gallery = z.object({
  type: z.literal('gallery'),
  layout: z.enum(['grid', 'row']).optional(),
  caption: z.string().max(1000).optional(),
  images: z.array(z.object({
    src: z.string().max(2048),
    alt: z.string().max(600),
    caption: z.string().max(1000).optional(),
    credit: z.string().max(300).optional(),
  })).max(60),
});

/**
 * An approved third-party video embed.
 *
 * The provider is a closed list and the id is an opaque token the renderer
 * turns into an embed URL itself (see `articleEmbeds.ts`). No URL and no markup
 * is stored, so there is no route by which content could choose the origin of
 * an iframe on the page.
 */
const video = z.object({
  type: z.literal('video'),
  provider: z.enum(VIDEO_PROVIDERS),
  videoId: z.string().max(64),
  /** Required: an embedded frame with no accessible name is unusable. */
  title: z.string().max(300),
  caption: z.string().max(1000).optional(),
}).superRefine((val, ctx) => {
  /*
    AN EMPTY ID IS ALLOWED; A MALFORMED ONE IS NOT.

    Empty means "inserted, not yet filled in" — the same state a freshly
    inserted image block is in, and the reason a block can be inserted mid-
    sentence and completed later without making the article unsaveable. The
    renderer draws nothing for it. Anything non-empty must be a real id for the
    declared provider, because that value goes into an iframe URL.
  */
  if (val.videoId !== '' && !isVideoId(val.provider, val.videoId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['videoId'],
      message: `Not a valid ${val.provider} video id`,
    });
  }
});

/** Every block type the public renderer can draw. */
export const ARTICLE_BLOCK_TYPES = [
  'heading', 'paragraph', 'quote', 'list', 'table',
  'callout', 'image', 'sourceLink', 'disclosure', 'divider',
  'faq', 'footnotes', 'gallery', 'video',
] as const;

export const articleBlockSchema = z.discriminatedUnion('type', [
  heading, paragraph, quote, list, table, callout, image, sourceLink, disclosure, divider,
  faq, footnotes, gallery, video,
]);

export type ValidatedArticleBlock = z.infer<typeof articleBlockSchema>;

/**
 * Enforces the `text` = concatenation-of-`runs` projection on a validated
 * block, dropping formatting that disagrees with the text.
 *
 * Runs through `reconcileInline`, so the rule lives in exactly one place and
 * the failure mode is "lose the formatting, keep the words" rather than a block
 * whose plain-text projection lies to the SEO word count.
 */
export function reconcileBlockInline(block: ValidatedArticleBlock): ValidatedArticleBlock {
  const fix = (text: string, runs: unknown) => reconcileInline(text, runs);

  switch (block.type) {
    case 'heading':
    case 'paragraph': {
      const r = fix(block.text, block.runs);
      return {
        ...block,
        text: r.text,
        // `left` is the default and is dropped, so an unaligned block stores no
        // `align` key and stays byte-identical to what the old editor wrote.
        align: storableAlignment(block.align),
        ...(r.runs ? { runs: r.runs } : { runs: undefined }),
      };
    }
    case 'callout': {
      const r = fix(block.text, block.runs);
      return { ...block, text: r.text, ...(r.runs ? { runs: r.runs } : { runs: undefined }) };
    }
    case 'quote': {
      const r = fix(block.quote, block.quoteRuns);
      return { ...block, quote: r.text, ...(r.runs ? { quoteRuns: r.runs } : { quoteRuns: undefined }) };
    }
    case 'list': {
      const itemRuns = block.itemRuns
        ? block.items.map((item, i) => fix(item, block.itemRuns?.[i] ?? null).runs ?? null)
        : null;

      /**
       * `checked` is made exactly as long as `items`, and only kept at all on a
       * checklist. A mismatched array would otherwise shift every tick mark
       * after an edited item — the list would still render, but against the
       * wrong lines, which is worse than losing the ticks.
       */
      const checked = block.checklist
        ? block.items.map((_, i) => block.checked?.[i] === true)
        : undefined;

      return {
        ...block,
        ...(block.checklist ? { checklist: true, checked } : { checklist: undefined, checked: undefined }),
        // Drop the array entirely when nothing is formatted, so an unformatted
        // list serialises exactly as the old editor wrote it.
        itemRuns: itemRuns && itemRuns.some(Boolean) ? (itemRuns as (InlineRun[] | null)[]) : undefined,
      };
    }
    default:
      return block;
  }
}

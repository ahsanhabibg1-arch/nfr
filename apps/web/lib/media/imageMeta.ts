/**
 * MED-01B / MED-01C — the single source of truth for "what ALT text, caption and
 * responsive sources does this image actually get?"
 *
 * WHY THIS MODULE EXISTS. Before it, the SEO Intelligence engine and the public
 * renderer answered that question differently. `IMG_NO_ALT` passed whenever
 * `Article.imageAltText` or `MediaAsset.altText` held words — while
 * `ArticleHeader` rendered `alt={article.title}` and ignored both. The engine
 * reported a page as healthy at the same moment its HTML was shipping the
 * headline as ALT text. Two implementations of one rule will always drift, so
 * there is now exactly one, and both sides import it.
 *
 * It is deliberately pure — no Prisma, no `server-only`, no URL construction of
 * its own (the caller passes a `toUrl`) — so it can be unit-tested directly and
 * used from the analyzer, the mapper and a component alike.
 */

// ---------------------------------------------------------------- ALT text

export type AltSource = 'usage' | 'article' | 'media' | 'fallback';

export interface AltInput {
  /** Per-usage override — `ArticleMedia.altText` for this usageKey. */
  usage?: string | null;
  /** Per-article value — `Article.imageAltText`. */
  article?: string | null;
  /** The reusable default on the asset — `MediaAsset.altText`. */
  media?: string | null;
  /** Last resort, used only when nothing above is set at all. */
  fallback?: string | null;
}

export interface AltResult {
  /** What belongs in the `alt` attribute. `''` means intentionally empty. */
  alt: string;
  /** True when an editor explicitly marked the image decorative. */
  decorative: boolean;
  /** Which level supplied the value — drives both tests and SEO findings. */
  source: AltSource;
}

/**
 * Resolve ALT text by precedence:
 *
 *   per-usage override → article-level → media default → fallback
 *
 * **`null`/`undefined` means "not set" and the chain continues. An empty string
 * means "deliberately empty" and the chain STOPS.** That distinction is the
 * whole mechanism for decorative images, and it needs no extra column: the two
 * states are already representable. It does mean a service that rewrites `''`
 * to `null` destroys an editor's decision, which is why `updateMediaMetadata`
 * now preserves an empty `altText` (and only `altText`).
 *
 * THE FALLBACK IS NOT SILENT. When nothing is set, callers pass the headline so
 * a screen-reader user still hears something useful — an empty `alt` on an
 * informative hero would be worse. But `source: 'fallback'` is returned so the
 * SEO engine can report `IMG_NO_ALT` for exactly that case. No text is
 * fabricated or keyword-stuffed here; the fallback is the caller's own title.
 */
export function effectiveAlt(input: AltInput): AltResult {
  const levels: [AltSource, string | null | undefined][] = [
    ['usage', input.usage],
    ['article', input.article],
    ['media', input.media],
  ];
  for (const [source, value] of levels) {
    if (value === null || value === undefined) continue; // not set — keep looking
    const trimmed = value.trim();
    if (trimmed === '') return { alt: '', decorative: true, source }; // explicit
    return { alt: trimmed, decorative: false, source };
  }
  return { alt: (input.fallback ?? '').trim(), decorative: false, source: 'fallback' };
}

// ---------------------------------------------------------------- Caption

export interface CaptionInput {
  usage?: string | null;
  article?: string | null;
  media?: string | null;
}

/**
 * Resolve a caption by the same precedence, with one deliberate difference:
 * **there is no fallback.** A caption is optional editorial copy, so when none
 * is set the figure renders without one. `ArticleHeader` used to synthesise
 * `Editorial Dispatch: <title>` for every article — a caption nobody wrote,
 * shown under every hero, which is exactly the "automatic SEO text fabrication"
 * this work is meant to remove.
 */
export function effectiveCaption(input: CaptionInput): string | undefined {
  for (const value of [input.usage, input.article, input.media]) {
    if (value === null || value === undefined) continue;
    const trimmed = value.trim();
    if (trimmed === '') return undefined; // explicitly cleared
    return trimmed;
  }
  return undefined;
}

// ---------------------------------------------------------------- Responsive

export interface DerivativeRecord {
  key: string;
  width: number;
  height: number;
  bytes: number;
}

export interface ResponsiveSources {
  /** `srcset` value, or undefined when there is nothing useful to offer. */
  srcSet?: string;
  /** Widths included, ascending — for assertions and diagnostics. */
  widths: number[];
}

/**
 * The original may be included in `srcset` only while it is no more than this
 * multiple of the largest derivative.
 *
 * WHY A CAP AT ALL. The original has to be a candidate in one common case: a
 * modest upload (say 600px wide) produces only a `thumb`, because
 * `processImage` skips any variant that would upscale. A `srcset` of
 * "thumb 320w" alone would make the browser pick 320px for a full-width hero,
 * which is worse than shipping no `srcset`.
 *
 * WHY NOT ALWAYS. A 48 MP original is ~8000px wide. On a high-density display
 * with a generous `sizes`, the browser would dutifully choose it and download
 * the whole thing. Capping at 2× the largest derivative keeps the small-original
 * case correct while refusing to offer a candidate nobody should receive; above
 * the cap the `lg` derivative (1600px) is the ceiling, and a 2× display
 * upscales it slightly — invisible on a 16/9 editorial photograph.
 */
const ORIGINAL_WIDTH_MULTIPLE_CAP = 2;

/** Variants we are willing to advertise, smallest first. */
const VARIANT_ORDER = ['thumb', 'md', 'lg'] as const;

function isDerivative(v: unknown): v is DerivativeRecord {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return typeof d.key === 'string' && d.key.length > 0 && typeof d.width === 'number' && d.width > 0;
}

/**
 * Build a `srcset` from the derivatives the upload pipeline already generated.
 *
 * The pipeline has been producing WebP `thumb`/`md`/`lg` variants on every
 * upload since Batch 05, storing their keys on the asset — and the public site
 * then served the original and ignored all three. This is where that work
 * finally reaches a visitor.
 *
 * Returns `undefined` for anything it cannot do safely:
 *  - legacy assets with no `derivatives` map (nothing to advertise),
 *  - malformed entries (missing key or width),
 *  - a map that yields fewer than two distinct widths once the original is
 *    considered — a single-candidate `srcset` is pointless.
 *
 * Every URL goes through the caller's `toUrl`, which is the SAME gated
 * `/api/media/<key>` proxy the original already uses, so visibility rules are
 * unchanged: a DRAFT asset's derivatives are no more reachable than its
 * original.
 */
export function buildResponsiveSources(
  derivatives: unknown,
  original: { key?: string | null; url?: string | null; width?: number | null } | null,
  toUrl: (key: string) => string,
): ResponsiveSources {
  const map = (derivatives && typeof derivatives === 'object' ? derivatives : {}) as Record<string, unknown>;

  const entries: { url: string; width: number }[] = [];
  for (const name of VARIANT_ORDER) {
    const d = map[name];
    if (!isDerivative(d)) continue;
    entries.push({ url: toUrl(d.key), width: Math.round(d.width) });
  }
  if (entries.length === 0) return { widths: [] };

  const largestDerivative = Math.max(...entries.map((e) => e.width));
  const originalWidth = typeof original?.width === 'number' ? Math.round(original.width) : 0;
  const originalUrl = original?.key ? toUrl(original.key) : original?.url || '';

  if (
    originalWidth > largestDerivative &&
    originalWidth <= largestDerivative * ORIGINAL_WIDTH_MULTIPLE_CAP &&
    originalUrl
  ) {
    entries.push({ url: originalUrl, width: originalWidth });
  }

  // Ascending, one candidate per width (a duplicate width makes srcset invalid).
  const byWidth = new Map<number, string>();
  for (const e of entries.sort((a, b) => a.width - b.width)) {
    if (!byWidth.has(e.width)) byWidth.set(e.width, e.url);
  }
  const widths = [...byWidth.keys()].sort((a, b) => a - b);
  if (widths.length < 2) return { widths: [] };

  return {
    srcSet: widths.map((w) => `${byWidth.get(w)} ${w}w`).join(', '),
    widths,
  };
}

/**
 * `sizes` values for the places an editorial image appears.
 *
 * `sizes` tells the browser how wide the image will RENDER, which is what makes
 * it pick the right candidate. Declaring too little ships a blurry image;
 * declaring too much ships a needlessly large one. These are deliberately
 * conservative — they describe the layout's own breakpoints and fall back to
 * `100vw`, which can only ever over-fetch, never under-serve.
 */
export const IMAGE_SIZES = {
  /** Article hero: full content column, which is capped by the prose container. */
  hero: '(min-width: 1280px) 860px, (min-width: 768px) 80vw, 100vw',
  /** Homepage lead image: full width of its panel. */
  lead: '(min-width: 1280px) 760px, (min-width: 768px) 70vw, 100vw',
  /** Cards in a 2-3 column grid. */
  card: '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
  /** An image inside the article body, same column as the hero. */
  body: '(min-width: 1280px) 860px, (min-width: 768px) 80vw, 100vw',
} as const;

'use client';

import React, { useState } from 'react';

interface ImageWithCreditProps {
  src: string;
  /**
   * The `alt` attribute, verbatim. An EMPTY STRING is meaningful and is passed
   * through unchanged: it marks a decorative image, which assistive technology
   * then skips. Callers must not substitute a headline for a missing value —
   * `lib/media/imageMeta.ts` resolves that on the server so the rule lives in
   * one place.
   */
  alt: string;
  credit?: string;
  className?: string;
  aspectRatioClass?: string;
  caption?: string;
  /**
   * MED-01C — mark the ONE image that is above the fold on this page (the LCP
   * candidate). It loads eagerly at high fetch priority; everything else is
   * lazy. This prop existed before and was never destructured, so it did
   * nothing at all — the hero competed with every other image on the page.
   */
  priority?: boolean;
  /** `srcset` of stored derivatives — see `buildResponsiveSources`. */
  srcSet?: string;
  /** How wide the image actually renders; required for `srcSet` to work well. */
  sizes?: string;
  /** Intrinsic pixel size of the source, for the `width`/`height` attributes. */
  width?: number;
  height?: number;
  /** Surface the caption/credit sit on, so their text keeps ≥ 4.5:1 contrast (Batch B). */
  tone?: 'light' | 'dark';
}

const TONE = {
  light: { caption: 'text-stone-700', credit: 'text-ink-muted' },
  dark: { caption: 'text-stone-300', credit: 'text-ink-inverse-muted' },
} as const;

export const ImageWithCredit: React.FC<ImageWithCreditProps> = ({
  src,
  alt,
  credit,
  className = '',
  aspectRatioClass = 'aspect-[16/9]',
  caption,
  priority = false,
  srcSet,
  sizes,
  width,
  height,
  tone = 'light',
}) => {
  const [hasError, setHasError] = useState(false);
  const t = TONE[tone];
  /**
   * D-A3 — a missing image must take the SAME path as a failed one.
   *
   * `Article.heroImage` is optional at publication (`z.string().optional()`),
   * so `src` can arrive as an empty string. React then omits the attribute
   * entirely, and a browser fires no `error` event for an `<img>` that has no
   * `src` at all — so `onError` never ran, `hasError` stayed false, and the
   * card rendered a permanently broken image instead of the fallback panel
   * that already exists below. Treating a blank value as unavailable up front
   * routes it to that panel, which shows "Image unavailable" plus the real alt
   * text. No placeholder artwork is invented and nothing changes for an image
   * that loads.
   */
  const missing = typeof src !== 'string' || src.trim() === '';

  return (
    <figure className="relative w-full overflow-hidden group">
      <div className={`relative w-full ${aspectRatioClass} bg-[#1E293B]/60 overflow-hidden`}>
        {!hasError && !missing ? (
          /**
           * MED-01C — serve the derivative the viewport actually needs.
           *
           * The upload pipeline has generated WebP thumb/md/lg variants on every
           * upload since Batch 05 and stored their keys on the asset; the public
           * site then served the original and ignored all three. `srcSet` is
           * built on the server from those stored keys (never guessed from the
           * original's name, which would 404 for legacy assets that have no
           * derivatives), so a phone fetches ~768px instead of a multi-megapixel
           * original.
           *
           * `width`/`height` are the intrinsic size, which lets the browser
           * reserve the right box before bytes arrive. Layout was already
           * protected by the fixed aspect-ratio wrapper, so this is about
           * correctness rather than a CLS fix.
           *
           * `loading`/`fetchPriority`: exactly one image per page should be
           * eager and high-priority — the LCP candidate. Everything else is
           * lazy, which is what stops a grid of cards from competing with the
           * hero for bandwidth.
           */
          <img
            src={src}
            srcSet={srcSet}
            sizes={srcSet ? sizes : undefined}
            width={width}
            height={height}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding={priority ? 'sync' : 'async'}
            referrerPolicy="no-referrer"
            onError={() => setHasError(true)}
            className={`w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02] ${className}`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#1E293B] p-6 text-center border border-white/10">
            <svg className="w-8 h-8 text-[#D4A757] mb-2 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs text-stone-300 font-sans tracking-wide">Image unavailable</span>
            <span className="text-[11px] text-ink-inverse-muted mt-1 max-w-xs">{alt}</span>
          </div>
        )}
      </div>

      {(caption || credit) && (
        <figcaption className="mt-1.5 flex items-center justify-between text-[11px] tracking-tight font-sans">
          {caption && <span className={`line-clamp-1 ${t.caption}`}>{caption}</span>}
          {credit && <span className={`ml-auto italic shrink-0 ${t.credit}`}>Photo: {credit}</span>}
        </figcaption>
      )}
    </figure>
  );
};

'use client';

import React, { useState } from 'react';

interface ImageWithCreditProps {
  src: string;
  alt: string;
  credit?: string;
  className?: string;
  aspectRatioClass?: string;
  caption?: string;
  priority?: boolean;
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
  tone = 'light',
}) => {
  const [hasError, setHasError] = useState(false);
  const t = TONE[tone];

  return (
    <figure className="relative w-full overflow-hidden group">
      <div className={`relative w-full ${aspectRatioClass} bg-[#1E293B]/60 overflow-hidden`}>
        {!hasError ? (
          <img
            src={src}
            alt={alt}
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

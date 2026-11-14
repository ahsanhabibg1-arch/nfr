'use client';

import React, { useState } from 'react';

/**
 * Responsive preview (PM-06 C).
 *
 * The page is rendered ONCE, by the server, and this only constrains how wide
 * its container is. That is the point: a preview built from a separate
 * mobile-specific render would be a drawing of the page rather than the page,
 * and would stop agreeing with production the first time a breakpoint changed.
 * Narrowing the real markup makes the site's own CSS do the work, so what is
 * previewed is what is served.
 */

const WIDTHS = [
  { key: 'desktop', label: 'Desktop', width: null as number | null },
  { key: 'tablet', label: 'Tablet', width: 768 },
  { key: 'mobile', label: 'Mobile', width: 390 },
] as const;

type WidthKey = (typeof WIDTHS)[number]['key'];

export function PreviewViewport({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<WidthKey>('desktop');
  const current = WIDTHS.find((w) => w.key === active)!;

  return (
    <div className="border border-stone-200 rounded-sm bg-stone-100">
      <div
        role="group"
        aria-label="Preview width"
        className="flex items-center gap-2 px-3 py-2 border-b border-stone-200 bg-white rounded-t-sm"
      >
        <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Preview at</span>
        {WIDTHS.map((w) => (
          <button
            key={w.key}
            type="button"
            aria-pressed={active === w.key}
            onClick={() => setActive(w.key)}
            className={`px-2.5 py-1 text-[11px] font-sans font-semibold rounded-xs border ${
              active === w.key
                ? 'bg-[#0F1115] text-[#D4A757] border-[#0F1115]'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
            }`}
          >
            {w.label}
            {w.width && <span className="ml-1 font-mono text-[10px] opacity-70">{w.width}</span>}
          </button>
        ))}
      </div>

      <div className="p-4 overflow-x-auto">
        <div
          data-testid="preview-frame"
          data-preview-width={current.key}
          className="bg-white border border-stone-200 rounded-sm mx-auto transition-[max-width] duration-150"
          style={current.width ? { maxWidth: `${current.width}px` } : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default PreviewViewport;

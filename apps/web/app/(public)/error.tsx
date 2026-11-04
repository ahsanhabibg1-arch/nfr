'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Public segment error boundary (Batch 18 §12 — error states).
 *
 * Rendered inside (public)/layout.tsx, so the header/footer persist while <main>
 * shows a branded, recoverable error instead of an unstyled crash. It never
 * exposes internal error details to the reader (only the opaque `digest`); the
 * full error is logged for operators. `reset()` retries the failed render.
 */
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Operators see the real error in server/browser logs; readers never do.
    console.error('[public] render error:', error);
  }, [error]);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-20" role="alert" aria-live="assertive">
      <div className="mx-auto max-w-xl bg-white border border-stone-200 rounded-xs p-8 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-[#8B5E3C]">Something went wrong</p>
        <h1 className="mt-3 font-serif text-2xl sm:text-3xl font-bold text-[#0F1115]">
          This page couldn&rsquo;t be loaded
        </h1>
        <p className="mt-3 text-sm text-stone-600">
          An unexpected error interrupted this page. You can try again, or head back to the homepage.
        </p>
        {error.digest && (
          <p className="mt-2 text-[11px] font-mono text-stone-400">Reference: {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold uppercase tracking-wider rounded-xs hover:bg-stone-800 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 border border-stone-300 text-stone-700 text-xs font-semibold uppercase tracking-wider rounded-xs hover:bg-stone-50 transition-colors"
          >
            Go to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}

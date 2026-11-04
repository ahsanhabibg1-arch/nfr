'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Admin segment error boundary (Batch 19 §B.A — admin error handling).
 *
 * Rendered inside (dashboard)/layout.tsx, so the sidebar/topbar persist while the
 * content area shows a recoverable error instead of an unstyled crash. `reset()`
 * retries the failed render; the operator can also jump back to the dashboard.
 * The full error is logged (operators), never surfaced to the UI beyond `digest`.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[admin] render error:', error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto py-16" role="alert" aria-live="assertive">
      <div className="bg-white border border-stone-200 rounded-sm p-8 text-center shadow-2xs">
        <p className="font-mono text-[11px] uppercase tracking-widest text-[#8B5E3C]">Admin error</p>
        <h1 className="mt-3 font-serif text-2xl font-bold text-stone-900">This screen couldn&rsquo;t be loaded</h1>
        <p className="mt-3 text-sm text-stone-600">
          An unexpected error interrupted this CMS view. If you were mid-save, re-open the record to confirm its current state before retrying — don&rsquo;t assume the change did or did not apply.
        </p>
        {error.digest && <p className="mt-2 text-[11px] font-mono text-stone-400">Reference: {error.digest}</p>}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold uppercase tracking-wider rounded-xs hover:bg-stone-800 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/admin/"
            className="inline-flex items-center px-4 py-2 border border-stone-300 text-stone-700 text-xs font-semibold uppercase tracking-wider rounded-xs hover:bg-stone-50 transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

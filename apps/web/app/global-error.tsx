'use client';

import { useEffect } from 'react';

/**
 * Root-level error boundary (Batch 18 §12). Only triggers when the ROOT layout
 * itself throws — it replaces the whole document, so it must render its own
 * <html>/<body>. Styles are inline (the normal stylesheet may not have loaded if
 * the root failed). This is the last-resort fallback; segment errors are handled
 * by (public)/error.tsx with the site chrome intact.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[global] root render error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0F1115',
          color: '#F7F3EA',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <p style={{ color: '#D4A757', fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>
            NFRGuide
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: '12px 0' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#A8A29E', margin: '0 0 24px' }}>
            The site hit an unexpected error. Please try again in a moment.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: '#57534D', fontFamily: 'monospace' }}>Reference: {error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 8,
              padding: '10px 20px',
              background: '#D4A757',
              color: '#0F1115',
              border: 'none',
              borderRadius: 2,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

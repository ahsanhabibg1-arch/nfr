/**
 * Public route-transition loading skeleton (Batch 18 §12 — loading states).
 *
 * Rendered inside (public)/layout.tsx, so the site header, footer and search
 * persist while only <main> shows this placeholder during a navigation to a
 * server-rendered/dynamic page. Purely presentational (no data fetch) so it
 * appears instantly; neutral enough to stand in for any public template without
 * causing layout shift. Announced to assistive tech via role="status".
 */
export default function PublicLoading() {
  const Bar = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse rounded-xs bg-stone-200/80 ${className}`} aria-hidden="true" />
  );

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-10" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>

      {/* Breadcrumb line */}
      <Bar className="h-3 w-48 mb-8" />

      {/* Headline + deck */}
      <Bar className="h-9 w-3/4 max-w-2xl mb-3" />
      <Bar className="h-9 w-1/2 max-w-xl mb-6" />
      <Bar className="h-4 w-40 mb-10" />

      {/* Hero / lead media */}
      <Bar className="h-56 sm:h-72 w-full mb-10" />

      {/* Content grid (cards or body) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Bar className="h-40 w-full" />
            <Bar className="h-4 w-5/6" />
            <Bar className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

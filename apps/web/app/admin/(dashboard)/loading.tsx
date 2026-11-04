/**
 * Admin route-transition loading skeleton (Batch 19 §B.A — admin loading states).
 *
 * Rendered inside (dashboard)/layout.tsx, so the sidebar and topbar persist while
 * only the content area shows this placeholder during navigation between CMS
 * modules. Presentational only (no data fetch) so it appears instantly, and
 * announced to assistive tech via role="status".
 */
export default function AdminLoading() {
  const Bar = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse rounded-xs bg-stone-200/80 ${className}`} aria-hidden="true" />
  );

  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>

      {/* Page header row */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Bar className="h-6 w-56" />
          <Bar className="h-3 w-80" />
        </div>
        <Bar className="h-9 w-32" />
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white border border-stone-200 rounded-sm p-4">
            <Bar className="h-7 w-12 mb-2" />
            <Bar className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Table / list placeholder */}
      <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-3">
        <Bar className="h-4 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Bar className="h-4 flex-1" />
            <Bar className="h-4 w-24" />
            <Bar className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

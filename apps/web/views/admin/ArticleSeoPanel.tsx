import Link from 'next/link';
import { roleHasPermission, type RoleKey } from '@/lib/auth/rbac';
import { listFindings } from '@/lib/cms/seoService';

/**
 * Non-invasive SEO diagnostics panel for the article editor (Batch 06 §19).
 * Server component rendered BELOW the eight-field editor — it reads existing
 * findings for this article (advisory only; never blocks publishing) and does
 * not alter the editor's field structure. Runs no audit on load.
 */
const SEV: Record<string, string> = {
  CRITICAL: 'text-rose-700', HIGH: 'text-orange-700', MEDIUM: 'text-amber-700', LOW: 'text-stone-600', INFO: 'text-sky-700',
  WARNING: 'text-amber-700', NOTICE: 'text-stone-600',
};

export async function ArticleSeoPanel({ articleId, userId, roles }: { articleId: string; userId: string; roles: RoleKey[] }) {
  if (!roleHasPermission(roles, 'seo.audit.view')) return null;
  // listFindings defaults to active findings when no concrete status filter is given.
  const res = await listFindings({ id: userId, roles }, { articleId, pageSize: 50 }).catch(() => null);
  const rows = res?.rows ?? [];

  return (
    <section className="mt-6 bg-white border border-stone-200 rounded-sm p-4 font-sans">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">SEO diagnostics <span className="font-normal text-stone-400">(advisory)</span></h3>
        <Link href={`/admin/seo/?q=${articleId}`} className="text-[11px] text-[#8B5E3C] hover:underline">Open in SEO Intelligence →</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-stone-400">No active SEO findings for this article. Run a full audit from SEO Intelligence to analyze all content. These diagnostics are advisory and never block publishing.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {rows.slice(0, 12).map((f) => (
            <li key={f.id} className="flex gap-2">
              <span className={`font-mono text-[10px] ${SEV[f.severity] || ''}`}>{f.severity}</span>
              <span className="text-stone-700"><strong>{f.title}:</strong> {f.evidence}{f.recommendation ? <em className="text-stone-500"> — {f.recommendation}</em> : null}</span>
            </li>
          ))}
          {rows.length > 12 && <li className="text-stone-400">+{rows.length - 12} more…</li>}
        </ul>
      )}
    </section>
  );
}

export default ArticleSeoPanel;

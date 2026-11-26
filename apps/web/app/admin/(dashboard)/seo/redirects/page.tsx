import { requirePermissionPage } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { getRedirectAudit, listRedirects, SAMPLE_REDIRECT_CSV, type RedirectFilters } from '@/lib/cms/redirectAdminService';
import { AdminRedirectsPage } from '@/views/admin/AdminRedirectsPage';

const one = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermissionPage('redirect.view');
  const sp = await searchParams;
  const actor = { id: user.id, roles: user.roles };
  const rawStatus = one(sp.status);
  const rawOrigin = one(sp.origin);
  const rawSort = one(sp.sort);
  const rawStatusCode = Number(one(sp.statusCode));
  const rawPage = Number(one(sp.page));
  const rawQuery = one(sp.q) || '';
  const filterWarning = rawQuery.length > 200 ? 'Search text was limited to 200 characters.' : undefined;
  const filters: RedirectFilters = {
    q: rawQuery.slice(0, 200),
    statusCode: [301, 302, 307, 308].includes(rawStatusCode) ? rawStatusCode : undefined,
    status: rawStatus === 'ACTIVE' || rawStatus === 'DISABLED' ? rawStatus : undefined,
    origin: rawOrigin === 'AUTOMATIC' || rawOrigin === 'MANUAL' || rawOrigin === 'LEGACY' ? rawOrigin : undefined,
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    sort: rawSort === 'updated-asc' || rawSort === 'source-asc' ? rawSort : 'updated-desc',
  };
  const [list, audit] = await Promise.all([
    listRedirects(actor, filters),
    getRedirectAudit(actor),
  ]);
  return <AdminRedirectsPage list={list} filters={filters} filterWarning={filterWarning} audit={audit} sampleCsv={SAMPLE_REDIRECT_CSV} permissions={{
    manage: roleHasPermission(user.roles, 'redirect.manage'), import: roleHasPermission(user.roles, 'redirect.import'),
    export: roleHasPermission(user.roles, 'redirect.export'), delete: roleHasPermission(user.roles, 'redirect.delete'),
    diagnostics: roleHasPermission(user.roles, 'redirect.diagnostics'),
  }} />;
}

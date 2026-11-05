import { requireCmsAccess } from '@/lib/auth/currentUser';
import { primaryRoleLabel } from '@/lib/auth/rbac';
import { visibleModuleIds } from '@/lib/auth/permissions';
import { AdminLayout } from '@/components/admin/AdminLayout';

/**
 * Authenticated CMS shell + server-side authorization gate (Batch 03 §3, hardened in
 * Batch 24). `requireCmsAccess()` redirects to /admin/login/ when there is no valid
 * session AND redirects any authenticated non-staff user (e.g. a public `reader`) to
 * the public site — a reader session must never reach the admin shell. Every protected
 * mutation additionally re-checks permissions server-side.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCmsAccess();
  return (
    <AdminLayout
      user={{ name: user.name, email: user.email, roleLabel: primaryRoleLabel(user.roles) }}
      visibleModules={visibleModuleIds(user.roles)}
    >
      {children}
    </AdminLayout>
  );
}

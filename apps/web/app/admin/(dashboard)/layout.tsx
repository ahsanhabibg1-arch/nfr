import { requireUser } from '@/lib/auth/currentUser';
import { primaryRoleLabel } from '@/lib/auth/rbac';
import { AdminLayout } from '@/components/admin/AdminLayout';

/**
 * Authenticated CMS shell + server-side auth gate (Batch 03 §3). `requireUser()`
 * redirects to /admin/login/ when there is no valid session. Every protected
 * mutation additionally re-checks permissions server-side.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AdminLayout
      user={{ name: user.name, email: user.email, roleLabel: primaryRoleLabel(user.roles) }}
    >
      {children}
    </AdminLayout>
  );
}

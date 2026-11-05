import { requireCmsAccess } from '@/lib/auth/currentUser';
import { getSessionToken } from '@/lib/auth/session';
import { listOwnSessions } from '@/lib/cms/teamService';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AccountSecurity } from '@/components/admin/AccountSecurity';

/** Personal account security — available to ANY authenticated staff member (§11/§13).
 *  Staff-only: a non-staff (reader) session is bounced to the public site. */
export default async function Page() {
  const user = await requireCmsAccess();
  const token = await getSessionToken();
  const sessions = await listOwnSessions({ id: user.id, roles: user.roles }, token);
  return (
    <div className="space-y-6">
      <AdminPageHeader title="My Account & Security" description="Change your password and manage your active sessions." breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Account' }]} />
      <AccountSecurity sessions={sessions} />
    </div>
  );
}

import { requireUser } from '@/lib/auth/currentUser';
import { getSessionToken } from '@/lib/auth/session';
import { listOwnSessions } from '@/lib/cms/teamService';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AccountSecurity } from '@/components/admin/AccountSecurity';

/** Personal account security — available to ANY authenticated staff member (§11/§13). */
export default async function Page() {
  const user = await requireUser();
  const token = await getSessionToken();
  const sessions = await listOwnSessions({ id: user.id, roles: user.roles }, token);
  return (
    <div className="space-y-6">
      <AdminPageHeader title="My Account & Security" description="Change your password and manage your active sessions." breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Account' }]} />
      <AccountSecurity sessions={sessions} />
    </div>
  );
}

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { listReaders, readerCounts } from '@/lib/cms/readerAdminService';
import { AdminReadersPage } from '@/views/admin/AdminReadersPage';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!roleHasPermission(user.roles, 'reader.view')) redirect('/admin/?denied=1');
  const actor = { id: user.id, roles: user.roles };
  const sp = await searchParams;
  const status = str(sp.status);
  const q = str(sp.q);
  const [readers, counts] = await Promise.all([
    listReaders(actor, { status, q }),
    readerCounts(actor),
  ]);
  return (
    <AdminReadersPage
      readers={readers}
      counts={counts}
      canManage={roleHasPermission(user.roles, 'reader.manage')}
      filters={{ status: status ?? '', q: q ?? '' }}
    />
  );
}

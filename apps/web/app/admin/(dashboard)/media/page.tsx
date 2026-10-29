import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { listMedia } from '@/lib/cms/mediaService';
import { AdminMediaPage } from '@/views/admin/AdminMediaPage';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = {
    q: str(sp.q),
    type: str(sp.type),
    visibility: str(sp.visibility),
    usage: (str(sp.usage) as 'used' | 'unused' | undefined) ?? undefined,
    uploadedWithin: (str(sp.uploadedWithin) as '7d' | '30d' | '365d' | undefined) ?? undefined,
    page: Number(str(sp.page)) || 1,
  };
  const result = await listMedia({ id: user.id, roles: user.roles }, filters);
  return (
    <AdminMediaPage
      result={result}
      filters={filters}
      viewerId={user.id}
      canUpload={roleHasPermission(user.roles, 'media.upload')}
      canDelete={roleHasPermission(user.roles, 'media.delete')}
      canEditAny={roleHasPermission(user.roles, 'media.edit.any')}
    />
  );
}

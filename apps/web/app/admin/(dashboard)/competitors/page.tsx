import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import {
  listCompetitors, getCompetitorDetail, listDisciplinesForSelect, listEditionsForSelect,
} from '@/lib/cms/competitorService';
import { AdminCompetitorsPage } from '@/views/admin/AdminCompetitorsPage';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!roleHasPermission(user.roles, 'cms.access')) redirect('/admin/?denied=1');
  const canManage = roleHasPermission(user.roles, 'rodeo.manage');
  const actor = { id: user.id, roles: user.roles };
  const id = str((await searchParams).id);

  const [competitors, disciplineOptions, editionOptions] = await Promise.all([
    listCompetitors(), listDisciplinesForSelect(), listEditionsForSelect(),
  ]);
  const detail = id && canManage ? await getCompetitorDetail(actor, id).catch(() => null) : null;

  return (
    <AdminCompetitorsPage
      competitors={competitors}
      detail={detail}
      disciplineOptions={disciplineOptions}
      editionOptions={editionOptions}
      canManage={canManage}
    />
  );
}

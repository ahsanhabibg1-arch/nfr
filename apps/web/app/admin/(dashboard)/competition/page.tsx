import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import {
  listSessionsAdmin, listResultsAdmin, listStandingsAdmin,
  listEligibleCompetitors, listDisciplinesForSelect,
} from '@/lib/cms/competitionService';
import { listEditionsForSelect } from '@/lib/cms/competitorService';
import { AdminCompetitionPage } from '@/views/admin/AdminCompetitionPage';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!roleHasPermission(user.roles, 'cms.access')) redirect('/admin/?denied=1');
  const canManage = roleHasPermission(user.roles, 'rodeo.manage');
  const actor = { id: user.id, roles: user.roles };
  const editionId = str((await searchParams).edition);

  const [editions, disciplines] = await Promise.all([listEditionsForSelect(), listDisciplinesForSelect()]);
  let detail = null;
  if (editionId && canManage) {
    const [sessions, results, standings, competitors] = await Promise.all([
      listSessionsAdmin(actor, editionId), listResultsAdmin(actor, editionId),
      listStandingsAdmin(actor, editionId), listEligibleCompetitors(actor, editionId),
    ]);
    detail = { editionId, sessions, results, standings, competitors };
  }

  return <AdminCompetitionPage editions={editions} disciplines={disciplines} detail={detail} canManage={canManage} />;
}

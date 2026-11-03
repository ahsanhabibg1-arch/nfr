import { redirect } from 'next/navigation';
import type { CoverageStatus, CoverageVerification, StandingCategory } from '@prisma/client';
import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import {
  listSessionsAdmin, listResultsAdmin, listStandingsAdmin,
  listEligibleCompetitors, listDisciplinesForSelect, type CoverageFilters,
} from '@/lib/cms/competitionService';
import { listEditionsForSelect } from '@/lib/cms/competitorService';
import { AdminCompetitionPage } from '@/views/admin/AdminCompetitionPage';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!roleHasPermission(user.roles, 'cms.access')) redirect('/admin/?denied=1');
  const canManage = roleHasPermission(user.roles, 'rodeo.manage');
  const actor = { id: user.id, roles: user.roles };
  const sp = await searchParams;
  const editionId = str(sp.edition);

  const filters: CoverageFilters = {
    disciplineId: str(sp.fDiscipline),
    coverageStatus: str(sp.fStatus) as CoverageStatus | undefined,
    verification: str(sp.fVerify) as CoverageVerification | undefined,
    competitorId: str(sp.fCompetitor),
    category: str(sp.fCategory) as StandingCategory | undefined,
  };

  const [editions, disciplines] = await Promise.all([listEditionsForSelect(), listDisciplinesForSelect()]);
  let detail = null;
  if (editionId && canManage) {
    const [sessions, results, standings, competitors] = await Promise.all([
      listSessionsAdmin(actor, editionId, filters), listResultsAdmin(actor, editionId, filters),
      listStandingsAdmin(actor, editionId, filters), listEligibleCompetitors(actor, editionId),
    ]);
    detail = { editionId, sessions, results, standings, competitors };
  }

  return <AdminCompetitionPage editions={editions} disciplines={disciplines} detail={detail} canManage={canManage} filters={{ fDiscipline: filters.disciplineId ?? '', fStatus: (filters.coverageStatus as string) ?? '', fVerify: (filters.verification as string) ?? '', fCompetitor: filters.competitorId ?? '', fCategory: (filters.category as string) ?? '' }} />;
}

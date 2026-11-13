import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { AdminRodeoCoveragePage } from '@/views/admin/AdminRodeoCoveragePage';
import {
  listHubs, listEvents, listEditions, listVenues, listDisciplinesRef,
  listEventsForSelect, listVenuesForSelect,
} from '@/lib/cms/rodeoService';
import {
  classificationRegistryState, listClassifications, listAssignableClassifications,
} from '@/lib/cms/disciplineClassificationService';

export default async function Page() {
  const user = await requireUser();
  const canManage = roleHasPermission(user.roles, 'rodeo.manage');

  const [hubs, events, editions, venues, disciplines, eventOptions, venueOptions] = await Promise.all([
    listHubs(), listEvents(), listEditions(), listVenues(), listDisciplinesRef(),
    listEventsForSelect(), listVenuesForSelect(),
  ]);

  /**
   * Batch 05 — managed classifications.
   *
   * Read separately and defensively: `classificationRegistryState` answers
   * "absent / not-initialised / database" without throwing, and the list is
   * only fetched when it can succeed, so this page still renders on an
   * environment where the migration has not been applied. `listClassifications`
   * is permission-gated, so an operator without `rodeo.manage` gets the
   * read-only tab with no rows rather than an error.
   */
  const classificationState = await classificationRegistryState();
  const usable = classificationState === 'database';
  const [classifications, assignableClassifications] = await Promise.all([
    usable && canManage
      ? listClassifications({ id: user.id, roles: user.roles })
      : Promise.resolve([]),
    usable ? listAssignableClassifications() : Promise.resolve([]),
  ]);

  return (
    <AdminRodeoCoveragePage
      hubs={hubs}
      events={events}
      editions={editions}
      venues={venues}
      disciplines={disciplines}
      eventOptions={eventOptions}
      venueOptions={venueOptions}
      canManage={canManage}
      classifications={classifications}
      assignableClassifications={assignableClassifications}
      classificationState={classificationState}
    />
  );
}

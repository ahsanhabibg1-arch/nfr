import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { AdminRodeoCoveragePage } from '@/views/admin/AdminRodeoCoveragePage';
import {
  listHubs, listEvents, listEditions, listVenues, listDisciplinesRef,
  listEventsForSelect, listVenuesForSelect,
} from '@/lib/cms/rodeoService';

export default async function Page() {
  const user = await requireUser();
  const [hubs, events, editions, venues, disciplines, eventOptions, venueOptions] = await Promise.all([
    listHubs(), listEvents(), listEditions(), listVenues(), listDisciplinesRef(),
    listEventsForSelect(), listVenuesForSelect(),
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
      canManage={roleHasPermission(user.roles, 'rodeo.manage')}
    />
  );
}

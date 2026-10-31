import { requirePermissionPage } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import * as mon from '@/lib/cms/monetizationService';
import { AdminMonetizationPage } from '@/views/admin/AdminMonetizationPage';

export default async function Page() {
  const user = await requirePermissionPage('monetization.view');
  const actor = { id: user.id, roles: user.roles };
  const caps = {
    partner: roleHasPermission(user.roles, 'monetization.partner.manage'),
    link: roleHasPermission(user.roles, 'monetization.link.manage'),
    placement: roleHasPermission(user.roles, 'monetization.placement.manage'),
    disclosure: roleHasPermission(user.roles, 'monetization.disclosure.manage'),
    config: roleHasPermission(user.roles, 'monetization.config'),
    report: roleHasPermission(user.roles, 'monetization.report.view'),
  };

  const [dashboard, partners, links, adPlacements, disclosures, sponsored] = await Promise.all([
    mon.getMonetizationDashboard(actor),
    mon.listPartners(actor),
    mon.listLinks(actor),
    mon.listAdPlacements(actor),
    mon.listDisclosures(actor),
    mon.listSponsored(actor),
  ]);
  const compliance = caps.report ? await mon.getCommercialCompliance(actor) : [];

  return (
    <AdminMonetizationPage
      dashboard={dashboard}
      partners={JSON.parse(JSON.stringify(partners))}
      links={JSON.parse(JSON.stringify(links))}
      adPlacements={JSON.parse(JSON.stringify(adPlacements))}
      disclosures={JSON.parse(JSON.stringify(disclosures))}
      sponsored={JSON.parse(JSON.stringify(sponsored))}
      compliance={compliance}
      caps={caps}
    />
  );
}

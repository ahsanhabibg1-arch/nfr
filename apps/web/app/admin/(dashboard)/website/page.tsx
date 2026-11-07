import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { listNavItems } from '@/lib/cms/navigationService';
import { listPageLayouts } from '@/lib/cms/pageLayoutService';
import {
  HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS, DETAIL_TEMPLATE_SECTIONS, DIRECTORY_SECTIONS,
  KNOWN_PAGE_KEYS, PAGE_KEY_LABELS, ensureSlotIds,
} from '@/lib/cms/sectionRegistry';
import { listAnnouncements } from '@/lib/cms/announcementService';
import { listGlobalBlocks } from '@/lib/cms/globalBlockService';
import { listSiteConfigs } from '@/lib/cms/siteConfigService';
import { AdminWebsitePage } from '@/views/admin/AdminWebsitePage';

const toReg = (defs: typeof HOMEPAGE_SECTIONS) =>
  defs.map((s) => ({
    type: s.type,
    label: s.label,
    description: s.description,
    category: s.category,
    icon: s.icon,
    required: s.required,
    maxInstances: s.maxInstances,
    duplicatable: s.duplicatable,
    defaultProps: s.defaultProps,
    editableProps: s.editableProps,
  }));

export default async function Page() {
  const user = await requireUser();
  const [items, layouts, announcements, globalBlocks, siteConfigs] = await Promise.all([
    listNavItems(),
    listPageLayouts(),
    listAnnouncements(),
    listGlobalBlocks(),
    listSiteConfigs(),
  ]);
  const canNav = roleHasPermission(user.roles, 'navigation.manage');
  const canLayout = roleHasPermission(user.roles, 'system.config');

  const layoutRows = layouts.map((l) => ({
    pageKey: l.pageKey,
    draftSections: ensureSlotIds(l.draftSections as unknown as { id: string; sectionType: string; visible: boolean; order: number; props: Record<string, unknown> }[]),
    publishedAt: l.publishedAt?.toISOString() ?? null,
  }));

  const registries = {
    homepage: toReg(HOMEPAGE_SECTIONS),
    'section-landing': toReg(SECTION_LANDING_SECTIONS),
    'detail-template': toReg(DETAIL_TEMPLATE_SECTIONS),
    'directory': toReg(DIRECTORY_SECTIONS),
  };

  const knownPageKeys = KNOWN_PAGE_KEYS.map((k) => ({ key: k, label: PAGE_KEY_LABELS[k] ?? k }));

  return (
    <AdminWebsitePage
      items={items}
      canNav={canNav}
      layouts={layoutRows}
      registries={registries}
      canLayout={canLayout}
      knownPageKeys={knownPageKeys}
      announcements={announcements}
      globalBlocks={globalBlocks}
      siteConfigs={siteConfigs}
    />
  );
}

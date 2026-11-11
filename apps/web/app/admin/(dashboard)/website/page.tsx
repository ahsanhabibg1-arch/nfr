import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { listNavItems } from '@/lib/cms/navigationService';
import { listPageLayouts } from '@/lib/cms/pageLayoutService';
import {
  HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS, DETAIL_TEMPLATE_SECTIONS, DIRECTORY_SECTIONS,
  ADMIN_VISIBLE_PAGE_KEYS, PAGE_KEY_LABELS, ensureSlotIds,
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
    /**
     * Stage 06: `retired` was NOT passed through, so the editor received the
     * raw family array with no way to tell a retired block from a live one and
     * listed the retired newsletter block in "Add a Block". The server-level
     * `getAvailableBlockTypes` filter was never in this path. See the comment
     * on `addableBlocks` in AdminPageLayoutEditor.
     */
    retired: s.retired,
    /**
     * Stage 07 additions. Each one exists because the editor computes something
     * the SERVER also computes, and the two must not diverge:
     *
     *  - `familyLimits`  the editor shows "2/2" and disables Add at the cap. It
     *                    was reading `maxInstances` only, so a per-family cap
     *                    (Stage 04 Task B) was displayed wrong and enforced only
     *                    on save. Stage 07 adds per-family caps to the detail
     *                    and directory families, which made that material.
     *  - `excludeFromDefaultsIn`  the tree builds its own copy of the DEFAULT
     *                    layout while the canvas renders the server's. Without
     *                    this field the tree would list four appendage blocks
     *                    the page does not actually have — and Stage 06 proved
     *                    that a tree/canvas mismatch silently breaks
     *                    click-to-select.
     *  - `systemContent` the inspector tells the operator what a block's content
     *                    comes from; the directory listing's comes from the
     *                    database, not its props.
     *  - `retiredBy`     two different owner decisions now retire blocks, and
     *                    the notice should say which.
     */
    familyLimits: s.familyLimits,
    excludeFromDefaultsIn: s.excludeFromDefaultsIn,
    systemContent: s.systemContent,
    retiredBy: s.retiredBy,
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
    scheduledAt: l.scheduledAt?.toISOString() ?? null,
    /**
     * Stage 08 Task B (KD-09): the optimistic-concurrency token.
     *
     * Without this field the editor could not send the version it loaded, so a
     * stale save silently overwrote whatever another operator had stored. The
     * editor now returns it on every save and the service compares it in the
     * same statement that writes.
     */
    version: l.version,
  }));

  const registries = {
    homepage: toReg(HOMEPAGE_SECTIONS),
    'section-landing': toReg(SECTION_LANDING_SECTIONS),
    'detail-template': toReg(DETAIL_TEMPLATE_SECTIONS),
    'directory': toReg(DIRECTORY_SECTIONS),
  };

  const knownPageKeys = ADMIN_VISIBLE_PAGE_KEYS.map((k) => ({ key: k, label: PAGE_KEY_LABELS[k] ?? k }));

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

import 'server-only';
import { z } from 'zod';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { ROUTES, PRIMARY_SECTIONS } from '../../config/routes';
import { NavLink, NavLocation, NAV_LOCATIONS, PublicNavigation } from './navTypes';

/**
 * Website & Navigation (Batch 04 §F). Requires `navigation.manage` to mutate;
 * public reads are open. Canonical primary-section and discipline routes are
 * preserved: `isSystem` rows cannot be deleted and keep their url/location.
 * The public read falls back to the built-in static menus when a location has
 * no rows, so the live site never renders an empty header/footer.
 */
const requireNav = (a: Actor) => { if (!roleHasPermission(a.roles, 'navigation.manage')) throw new ServiceError('forbidden', 'Not permitted to manage navigation'); };

// ---- Static fallbacks (mirror the pre-DB header/footer exactly) ----
const CANONICAL: Record<NavLocation, NavLink[]> = {
  header: Object.values(PRIMARY_SECTIONS).map((s) => ({ label: s.name, url: s.path, isExternal: false })),
  'footer-sections': [
    { label: 'NFR Competition & Disciplines', url: ROUTES.COMPETITION, isExternal: false },
    { label: 'NFR Entertainment & Concerts', url: ROUTES.ENTERTAINMENT, isExternal: false },
    { label: 'Cowboy Christmas & Shopping', url: ROUTES.EVENTS_SHOPPING, isExternal: false },
    { label: 'NFR Plan & Watch Guides', url: ROUTES.PLAN_WATCH, isExternal: false },
    { label: 'More Rodeo (Hubs & Major Events)', url: ROUTES.MORE_RODEO, isExternal: false },
  ],
  'footer-academy': [
    { label: 'The 8-Second Rule Explainer', url: ROUTES.ARTICLE('inside-the-chutes-nfr-roughstock-intensity'), isExternal: false },
    { label: '50/50 Scoring Mechanics', url: ROUTES.DISCIPLINE('saddle-bronc-riding'), isExternal: false },
    { label: 'The 10-Round Average Formula', url: ROUTES.ARTICLE('the-anatomy-of-the-10-round-average'), isExternal: false },
    { label: 'TV & Streaming Directory', url: ROUTES.ARTICLE('how-to-watch-nfr-streaming-cable-cord-cutters'), isExternal: false },
    { label: 'Thomas & Mack Venue Tips', url: ROUTES.ARTICLE('navigating-thomas-and-mack-center-guide'), isExternal: false },
  ],
};

/** Internal path (starts with `/`) or an absolute https URL. No javascript:/data: etc. */
function validateUrl(url: string, isExternal: boolean): string {
  const u = url.trim();
  if (isExternal) {
    let parsed: URL;
    try { parsed = new URL(u); } catch { throw new ServiceError('validation', 'External link must be a full URL.'); }
    if (parsed.protocol !== 'https:') throw new ServiceError('validation', 'External links must use https://');
    return parsed.toString();
  }
  if (!u.startsWith('/')) throw new ServiceError('validation', 'Internal links must start with “/”.');
  if (u.includes('//') || u.toLowerCase().includes('javascript:')) throw new ServiceError('validation', 'Invalid internal path.');
  return u;
}

// ---- Public read (used by the site layout) ----
export async function getPublicNavigation(): Promise<PublicNavigation> {
  const rows = await prisma.navigationItem.findMany({ where: { visible: true }, orderBy: [{ location: 'asc' }, { sortOrder: 'asc' }] });
  const pick = (loc: NavLocation): NavLink[] => {
    const forLoc = rows.filter((r) => r.location === loc);
    if (forLoc.length === 0) return CANONICAL[loc]; // static fallback
    return forLoc.map((r) => ({ label: r.label, url: r.url, isExternal: r.isExternal }));
  };
  return { header: pick('header'), footerSections: pick('footer-sections'), footerAcademy: pick('footer-academy') };
}

// ---- Admin ----
export interface NavItemRow { id: string; location: string; label: string; url: string; sortOrder: number; isExternal: boolean; isSystem: boolean; visible: boolean; }
export async function listNavItems(): Promise<NavItemRow[]> {
  const rows = await prisma.navigationItem.findMany({ orderBy: [{ location: 'asc' }, { sortOrder: 'asc' }] });
  return rows.map((r) => ({ id: r.id, location: r.location, label: r.label, url: r.url, sortOrder: r.sortOrder, isExternal: r.isExternal, isSystem: r.isSystem, visible: r.visible }));
}

const NavInput = z.object({
  location: z.enum(NAV_LOCATIONS),
  label: z.string().min(1).max(120),
  url: z.string().min(1).max(500),
  sortOrder: z.number().int().optional(),
  isExternal: z.boolean().optional(),
  visible: z.boolean().optional(),
});
export type NavInput = z.input<typeof NavInput>;

export async function createNavItem(actor: Actor, raw: NavInput): Promise<{ id: string }> {
  requireNav(actor);
  const v = NavInput.parse(raw);
  const url = validateUrl(v.url, v.isExternal ?? false);
  const r = await prisma.navigationItem.create({ data: { location: v.location, label: v.label, url, sortOrder: v.sortOrder ?? 99, isExternal: v.isExternal ?? false, visible: v.visible ?? true, isSystem: false } });
  await audit(actor.id, 'navigation.create', 'navigation_item', r.id, `${v.location}:${v.label}`);
  return { id: r.id };
}

export async function updateNavItem(actor: Actor, id: string, raw: NavInput): Promise<void> {
  requireNav(actor);
  const v = NavInput.parse(raw);
  const existing = await prisma.navigationItem.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('not_found', 'Navigation item not found');
  // Canonical (system) rows keep their url + location; only label/order/visibility change.
  const url = existing.isSystem ? existing.url : validateUrl(v.url, v.isExternal ?? false);
  await prisma.navigationItem.update({
    where: { id },
    data: {
      label: v.label,
      sortOrder: v.sortOrder ?? existing.sortOrder,
      visible: v.visible ?? existing.visible,
      ...(existing.isSystem ? {} : { location: v.location, url, isExternal: v.isExternal ?? false }),
    },
  });
  await audit(actor.id, 'navigation.update', 'navigation_item', id, v.label);
}

export async function deleteNavItem(actor: Actor, id: string): Promise<void> {
  requireNav(actor);
  const r = await prisma.navigationItem.findUnique({ where: { id } });
  if (!r) throw new ServiceError('not_found', 'Navigation item not found');
  if (r.isSystem) throw new ServiceError('forbidden', 'Canonical navigation links cannot be deleted — hide it instead.');
  await prisma.navigationItem.delete({ where: { id } });
  await audit(actor.id, 'navigation.delete', 'navigation_item', id, r.label);
}

export async function setNavVisible(actor: Actor, id: string, visible: boolean): Promise<void> {
  requireNav(actor);
  if (!(await prisma.navigationItem.findUnique({ where: { id } }))) throw new ServiceError('not_found', 'Navigation item not found');
  await prisma.navigationItem.update({ where: { id }, data: { visible } });
  await audit(actor.id, 'navigation.visibility', 'navigation_item', id, visible ? 'shown' : 'hidden');
}

/** Idempotently materialize the canonical static menus into the DB as system rows. */
export async function restoreCanonicalNav(actor: Actor): Promise<{ created: number }> {
  requireNav(actor);
  let created = 0;
  for (const location of NAV_LOCATIONS) {
    const links = CANONICAL[location];
    for (let i = 0; i < links.length; i++) {
      const id = `nav-${location}-${i + 1}`;
      const link = links[i];
      await prisma.navigationItem.upsert({
        where: { id },
        update: { label: link.label, url: link.url, location, sortOrder: i + 1, isSystem: true },
        create: { id, location, label: link.label, url: link.url, sortOrder: i + 1, isExternal: link.isExternal, isSystem: true, visible: true },
      });
      created++;
    }
  }
  await audit(actor.id, 'navigation.restore_canonical', 'navigation_item', undefined, `${created} rows`);
  return { created };
}

/**
 * Canonical navigation data + idempotent seed (Batch 04 §F, final sign-off §A).
 *
 * Plain module (NO `server-only`) so it is shared by the server navigationService,
 * the Prisma seed (`prisma/seed.ts`) and the test suite. Defines the built-in
 * static menus (used as the public fallback) and a deterministic, create-missing-
 * only seed that materializes them as protected `isSystem` rows.
 *
 * Seed guarantees (owner-approved decisions 4 & 5):
 *  - Idempotent: a row is created only when its deterministic id is absent.
 *  - Never overwrites an administrator's customized values (existing rows are
 *    left untouched — label/order/visibility edits survive re-seeding).
 *  - Never deletes existing navigation (custom or canonical).
 */
import type { PrismaClient } from '@prisma/client';
import { ROUTES, PRIMARY_SECTIONS } from '../../config/routes';
import { NavLink, NavLocation, NAV_LOCATIONS } from './navTypes';

/** Built-in static menus — mirror the pre-DB header/footer exactly. */
export const CANONICAL: Record<NavLocation, NavLink[]> = {
  header: Object.values(PRIMARY_SECTIONS).map((s) => ({ label: s.name, url: s.path, isExternal: false })),
  'footer-sections': [
    { label: 'NFR Competition & Disciplines', url: ROUTES.COMPETITION, isExternal: false },
    { label: 'NFR Entertainment & Concerts', url: ROUTES.ENTERTAINMENT, isExternal: false },
    { label: 'Cowboy Christmas & Shopping', url: ROUTES.EVENTS_SHOPPING, isExternal: false },
    { label: 'NFR Plan & Watch Guides', url: ROUTES.PLAN_WATCH, isExternal: false },
    { label: 'More Rodeo (Hubs & Major Events)', url: ROUTES.MORE_RODEO, isExternal: false },
  ],
  // Batch A: only routes that always exist (reference data / directories). The previous
  // entries pointed at Phase 0 demo article slugs, which 404 on any database without them.
  'footer-academy': [
    { label: 'Bull Riding Guide', url: ROUTES.DISCIPLINE('bull-riding'), isExternal: false },
    { label: 'Saddle Bronc Riding Guide', url: ROUTES.DISCIPLINE('saddle-bronc-riding'), isExternal: false },
    { label: 'Barrel Racing Guide', url: ROUTES.DISCIPLINE('barrel-racing'), isExternal: false },
    { label: 'Rodeo Events Directory', url: ROUTES.MORE_RODEO, isExternal: false },
    { label: 'Search NFRGuide', url: '/search/', isExternal: false },
  ],
  'quick-access': [],
};

export interface CanonicalNavSeedRow { id: string; location: NavLocation; label: string; url: string; sortOrder: number; isExternal: boolean; }

/** Deterministic canonical rows; stable ids (`nav-<location>-<n>`) make the seed idempotent. */
export const CANONICAL_NAV_SEED: CanonicalNavSeedRow[] = NAV_LOCATIONS.flatMap((location) =>
  CANONICAL[location].map((link, i) => ({ id: `nav-${location}-${i + 1}`, location, label: link.label, url: link.url, sortOrder: i + 1, isExternal: link.isExternal })),
);

/**
 * Create any missing canonical navigation rows as protected system rows.
 * Create-missing-only: existing rows (by id) are never updated or deleted, so
 * administrator customizations and any custom rows are preserved. Safe to run
 * repeatedly and from both the seed and the admin "restore" action.
 */
export async function seedCanonicalNavigation(db: Pick<PrismaClient, 'navigationItem'>): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const row of CANONICAL_NAV_SEED) {
    const existing = await db.navigationItem.findUnique({ where: { id: row.id } });
    if (existing) { skipped++; continue; }
    await db.navigationItem.create({
      data: { id: row.id, location: row.location, label: row.label, url: row.url, sortOrder: row.sortOrder, isExternal: row.isExternal, isSystem: true, visible: true },
    });
    created++;
  }
  return { created, skipped };
}

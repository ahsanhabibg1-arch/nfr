/**
 * Pure slot-property readers, shared by the resolvers and the Admin inspector
 * (Stage 06 Task 8).
 *
 * These three functions were part of `slotUtils.ts`, which carries
 * `import 'server-only'` because the rest of it queries the database. The
 * Builder's Content Source panel has to describe what a slot will actually do —
 * "showing the 6 newest articles", "your 2 picks then 4 automatic" — and it runs
 * in the browser, so it could not import them.
 *
 * Copying the logic into the Admin would have created a second interpretation of
 * the same stored props: the inspector could then claim one thing while the page
 * rendered another, which is precisely the class of divergence Stages 04 and 05
 * were spent removing. So the readers moved here, with no `server-only`, and
 * `slotUtils.ts` re-exports them. There is exactly one implementation, used by
 * both sides.
 */

/** Clamped integer read. An out-of-range stored value can never reach a query. */
export function numProp(props: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const raw = props[key];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Apply a slot's count property to a resolved list (Stage 04 Task D).
 *
 * `landing-grid.articleCount` was declared in the registry but ignored — the
 * resolver passed the whole secondary list through. An absent or zero value
 * keeps the previous "show everything" behaviour, so layouts stored before the
 * fix render exactly as they did.
 */
export function limitList<T>(items: T[], props: Record<string, unknown>, key: string, max: number): T[] {
  const requested = numProp(props, key, 0, 0, max);
  return requested > 0 ? items.slice(0, requested) : items;
}

/** Accepts a comma string or an array; trims and drops empties. */
export function idListProp(props: Record<string, unknown>, key: string): string[] {
  const raw = props[key];
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

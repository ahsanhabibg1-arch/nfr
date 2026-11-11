import 'server-only';
import { getPublishedArticlesByIds } from '../content';
import type { Article } from '../../types';

/**
 * The pure property readers now live in `./slotProps`, which carries no
 * `server-only` marker so the Admin's Content Source panel can use the SAME
 * implementation the resolvers use (Stage 06 Task 8). Re-exported here so every
 * existing importer of `slotUtils` is unaffected.
 */
export { numProp, limitList, idListProp } from './slotProps';
import { numProp, idListProp } from './slotProps';

/* ── Selection context (Stage 05 — the content-source contract) ──────
 *
 * One request-scoped record of which entities have already been placed on the
 * page. This is the piece the project was missing: `homepageData` tracked hero
 * articles in a one-way array, passed it to a single slot, and never extended
 * it — so sibling slots could not deduplicate against the hero or each other,
 * and the live homepage rendered one article three times (KD-01).
 *
 * The retired `contentSourceEngine.ts` had designed a `DeduplicationContext`
 * for exactly this and was never connected. This is that idea, reimplemented in
 * the pathway that actually serves pages, and nothing else from the engine was
 * carried over.
 *
 * Ordering rule: slots claim in resolution order, and the FIRST claim wins. A
 * later slot never displaces an earlier one, which makes the result
 * deterministic for the same data and configuration.
 */

export interface SelectionContext {
  /** Entity ids already placed on this page. */
  readonly shown: ReadonlySet<string>;
  /** Record ids as placed. Repeated or already-known ids are no-ops. */
  claim(ids: Iterable<string | null | undefined>): void;
  /** Snapshot for passing to a query's exclude list. */
  excluded(): string[];
  /** Whether an id has already been placed. */
  has(id: string): boolean;
}

export function createSelectionContext(initial?: Iterable<string | null | undefined>): SelectionContext {
  const shown = new Set<string>();
  const add = (ids: Iterable<string | null | undefined>) => {
    for (const id of ids) if (typeof id === 'string' && id.length > 0) shown.add(id);
  };
  if (initial) add(initial);
  return {
    shown,
    claim: add,
    excluded: () => [...shown],
    has: (id) => shown.has(id),
  };
}

/**
 * Hand-picked articles first (in picked order), then auto-fill up to `count`.
 *
 * With a `SelectionContext` this also deduplicates across slots:
 *
 *  - Manual picks are de-duplicated within the list (first occurrence wins) and
 *    any id already placed earlier on the page is dropped. Manual ordering is
 *    otherwise preserved exactly.
 *  - Auto-fill excludes everything already placed, so a slot is NEVER padded
 *    with an article the visitor has already seen just to reach its count. A
 *    slot may therefore return fewer than `count` items when unique eligible
 *    content runs out — which is the correct outcome, not a failure.
 *  - Missing or unpublished manual references simply drop out, because
 *    `getPublishedArticlesByIds` returns only published records.
 *
 * Without a context the behaviour is exactly as before, so callers that have
 * not been migrated are unaffected.
 */
export async function pickedThenAuto(
  props: Record<string, unknown>,
  count: number,
  auto: (need: number, excludeIds: string[]) => Promise<Article[]>,
  ctx?: SelectionContext,
): Promise<Article[]> {
  if (count <= 0) return [];

  const requestedIds = idListProp(props, 'featuredIds');
  const resolved = await getPublishedArticlesByIds(requestedIds);

  // De-duplicate within the pick list and against anything already placed.
  const seenHere = new Set<string>();
  const picked: Article[] = [];
  for (const a of resolved) {
    if (seenHere.has(a.id)) continue;
    if (ctx?.has(a.id)) continue;
    seenHere.add(a.id);
    picked.push(a);
    if (picked.length === count) break;
  }

  const need = count - picked.length;
  if (need <= 0) {
    ctx?.claim(picked.map((a) => a.id));
    return picked;
  }

  const exclude = ctx ? [...new Set([...ctx.excluded(), ...picked.map((a) => a.id)])] : picked.map((a) => a.id);
  const fill = await auto(need, exclude);

  // Guard the auto path too: a resolver that ignores its exclude list must not
  // be able to reintroduce a duplicate.
  const result = [...picked];
  for (const a of fill) {
    if (seenHere.has(a.id) || ctx?.has(a.id)) continue;
    seenHere.add(a.id);
    result.push(a);
    if (result.length === count) break;
  }

  ctx?.claim(result.map((a) => a.id));
  return result;
}

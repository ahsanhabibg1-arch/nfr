import { articleBlockSchema, reconcileBlockInline } from './articleBlockSchema';

/**
 * Lets ALREADY-STORED legacy blocks survive a save, without letting new
 * unvalidated content in.
 *
 * THE DEFECT THIS FIXES. The rich-text adapter carries a block type it does not
 * understand through the editor as an opaque atom, returning it byte-for-byte —
 * so the EDITOR preserved legacy content. But the server schema is a
 * discriminated union of the ten renderable types, so the SAVE refused it:
 *
 *   blocks.1.type -> Invalid discriminator value. Expected 'heading' | ...
 *
 * The two halves disagreed. An article containing a legacy or future block type
 * could be opened and edited but never saved — the editor would report a
 * validation error on every attempt, with no way for an author to resolve it.
 * An earlier report claimed such a block "survives an edit untouched"; that was
 * true of the adapter alone, not of the path that matters.
 *
 * THE RULE, AND WHY IT IS NARROW. A block that fails strict validation is
 * accepted only when a byte-identical payload is ALREADY STORED on that same
 * article. So:
 *
 *   - untouched legacy content round-trips and keeps its exact payload;
 *   - a modified legacy block is refused, because its payload no longer matches
 *     anything stored and nothing can vouch for the new shape;
 *   - a NEW block of an unknown type is refused outright — there is nothing
 *     stored to grandfather it against, so this cannot be used to smuggle
 *     arbitrary content past validation;
 *   - validation is not weakened for any of the ten known types; they are
 *     always strictly parsed and their inline projection always enforced.
 *
 * The comparison is on canonical JSON with object keys sorted, because
 * `JSON.stringify` is key-order sensitive and a round trip through the editor
 * and the database can legitimately reorder keys without changing meaning.
 */

/** Deterministic JSON: object keys sorted at every depth. */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const inner = (v as Record<string, unknown>)[k];
        if (inner === undefined) continue;
        out[k] = walk(inner);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export type BlockDecision =
  | { ok: true; block: unknown; grandfathered: boolean }
  | { ok: false; index: number; type: string; reason: string };

/**
 * Decides, for one incoming block, whether it may be stored.
 *
 * `storedCanonical` is the set of canonical payloads currently persisted for
 * the article being saved — empty for a new article, which is why a new article
 * can never contain an unknown block type.
 */
export function decideBlock(
  raw: unknown,
  index: number,
  storedCanonical: ReadonlySet<string>,
): BlockDecision {
  const parsed = articleBlockSchema.safeParse(raw);
  if (parsed.success) {
    // A known type: strictly validated, and its inline projection enforced.
    return { ok: true, block: reconcileBlockInline(parsed.data), grandfathered: false };
  }

  const type = typeof (raw as { type?: unknown })?.type === 'string'
    ? String((raw as { type: string }).type)
    : '(missing type)';

  // Not a known type. The only way through is to be exactly what is stored.
  if (storedCanonical.has(canonicalJson(raw))) {
    return { ok: true, block: raw, grandfathered: true };
  }

  return {
    ok: false,
    index,
    type,
    reason: parsed.error.issues[0]?.message ?? 'Unsupported block',
  };
}

export interface BlockResolution {
  blocks: unknown[];
  /** How many blocks were carried through as stored legacy content. */
  grandfathered: number;
}

/**
 * Validates every incoming block, grandfathering only untouched stored legacy
 * payloads. Throws nothing; the caller decides how to report a rejection so the
 * message can carry the service's own error type.
 */
export function resolveBlocks(
  incoming: readonly unknown[],
  stored: readonly unknown[],
): { ok: true; value: BlockResolution } | { ok: false; errors: Exclude<BlockDecision, { ok: true }>[] } {
  const storedCanonical = new Set(stored.map(canonicalJson));
  const out: unknown[] = [];
  const errors: Exclude<BlockDecision, { ok: true }>[] = [];
  let grandfathered = 0;

  for (let i = 0; i < incoming.length; i++) {
    const d = decideBlock(incoming[i], i, storedCanonical);
    if (d.ok) {
      out.push(d.block);
      if (d.grandfathered) grandfathered += 1;
    } else {
      errors.push(d);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: { blocks: out, grandfathered } };
}

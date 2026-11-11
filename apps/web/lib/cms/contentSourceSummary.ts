/**
 * Plain-language description of what a slot's content settings will actually do
 * (Stage 06 Task 8).
 *
 * The Builder exposes `featuredIds` and `articleCount` as raw fields. An
 * operator cannot tell from them whether a block is on automatic, whether their
 * picks will be honoured, or why a section that asks for four articles sometimes
 * shows two. This module answers those three questions in words.
 *
 * It describes ONLY the Stage 05 contract — manual picks in order, then
 * automatic fill, with cross-slot deduplication. There is no `fallbackPolicy`,
 * no `emptyBehavior` and no filter beyond what the resolvers implement, so none
 * is mentioned here. Advertising a control that does not exist would be the same
 * defect as a property that does not render.
 *
 * Counts are computed with `numProp` and `idListProp` — the resolvers' own
 * readers, imported from the one shared module — so this text cannot disagree
 * with what the page renders.
 */

import { numProp, idListProp } from './slotProps';

export type ContentSourceMode =
  /** No article feed on this block. */
  | 'none'
  /** A feed exists but the count is zero, so nothing renders. */
  | 'empty'
  /** No picks: everything chosen by the site. */
  | 'automatic'
  /** Enough picks to fill the block. */
  | 'manual'
  /** Some picks, remainder automatic. */
  | 'mixed';

export interface ContentSourceDescription {
  configurable: boolean;
  mode: ContentSourceMode;
  /** One sentence, written for a non-technical editor. */
  headline: string;
  /** Caveats that apply to the current configuration. */
  notes: string[];
  /** Resolved count, or null when the block has no count property. */
  requestedCount: number | null;
  /** How many articles the operator has pinned. */
  pickedCount: number;
}

interface MinimalPropDef {
  key: string;
  min?: number;
  max?: number;
}

export interface MinimalSectionDef {
  editableProps: readonly MinimalPropDef[];
  defaultProps?: Record<string, unknown>;
}

/**
 * Where each feed draws from, in the operator's language. Only types whose
 * resolver behaviour was verified in Stage 05 are named; anything else gets the
 * neutral phrase rather than a guess.
 */
const SOURCE_PHRASES: Record<string, string> = {
  'latest-coverage': 'the newest published articles',
  'plan-and-watch': 'the Plan & Watch section',
  entertainment: 'the Entertainment section',
  'events-shopping': 'the Events & Shopping section',
  learning: 'evergreen explainer articles',
  'landing-featured': 'the newest article in this section',
  'landing-grid': "this section's articles, newest first",
  'detail-related': 'articles related to this record',
  'editorial-hero': 'the article marked as lead hero, otherwise the newest article',
};

const DEDUP_NOTE =
  'An article already shown by another section on this page is skipped here, so fewer items can appear than the count asks for. ' +
  'That is deliberate: the same article is never shown twice on one page.';

const PICK_INTEGRITY_NOTE = 'A pick that is unpublished, scheduled or deleted is skipped automatically.';

function sourcePhrase(sectionType: string): string {
  return SOURCE_PHRASES[sectionType] ?? 'published articles';
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function describeContentSource(
  sectionType: string,
  props: Record<string, unknown>,
  def: MinimalSectionDef | undefined,
): ContentSourceDescription {
  const editable = def?.editableProps ?? [];
  const hasPicker = editable.some((p) => p.key === 'featuredIds');
  const countDef = editable.find((p) => p.key === 'articleCount');

  if (!hasPicker && !countDef) {
    return {
      configurable: false,
      mode: 'none',
      headline: 'This block has no article feed to configure.',
      notes: [],
      requestedCount: null,
      pickedCount: 0,
    };
  }

  const picked = idListProp(props, 'featuredIds').length;

  let requestedCount: number | null = null;
  if (countDef) {
    const fallbackRaw = def?.defaultProps?.articleCount;
    const fallback = typeof fallbackRaw === 'number' ? fallbackRaw : 0;
    requestedCount = numProp(props, 'articleCount', fallback, countDef.min ?? 0, countDef.max ?? 12);
  }

  const phrase = sourcePhrase(sectionType);

  /* ── A feed with no count property: a single-item block (hero, featured) ── */
  if (requestedCount === null) {
    if (picked === 0) {
      return {
        configurable: true,
        mode: 'automatic',
        headline: `On automatic — showing ${phrase}.`,
        notes: [DEDUP_NOTE],
        requestedCount: null,
        pickedCount: 0,
      };
    }
    return {
      configurable: true,
      mode: 'manual',
      headline:
        picked === 1
          ? 'Showing the article you picked.'
          : `Showing your ${picked} picks, in the order listed — the first is the lead.`,
      notes: [PICK_INTEGRITY_NOTE, DEDUP_NOTE],
      requestedCount: null,
      pickedCount: picked,
    };
  }

  /* ── A counted feed ── */
  if (requestedCount === 0) {
    return {
      configurable: true,
      mode: 'empty',
      headline: 'Nothing will appear here — the article count is set to 0.',
      notes: ['Set a count above zero, or hide the block instead, so the page does not keep an empty section.'],
      requestedCount: 0,
      pickedCount: picked,
    };
  }

  if (picked === 0) {
    return {
      configurable: true,
      mode: 'automatic',
      headline: `On automatic — showing the ${requestedCount} newest ${plural(requestedCount, 'article', 'articles')} from ${phrase}.`,
      notes: [DEDUP_NOTE],
      requestedCount,
      pickedCount: 0,
    };
  }

  if (picked >= requestedCount) {
    const notes = [PICK_INTEGRITY_NOTE, DEDUP_NOTE];
    if (picked > requestedCount) {
      notes.unshift(
        `You have pinned ${picked} articles but the count is ${requestedCount}, so only the first ${requestedCount} will appear. ` +
          'Raise the count to show the rest.',
      );
    }
    return {
      configurable: true,
      mode: 'manual',
      headline: `Fully manual — showing ${requestedCount} pinned ${plural(requestedCount, 'article', 'articles')}, in your order.`,
      notes,
      requestedCount,
      pickedCount: picked,
    };
  }

  const auto = requestedCount - picked;
  return {
    configurable: true,
    mode: 'mixed',
    headline:
      `Mixed — your ${picked} pinned ${plural(picked, 'article', 'articles')} first, ` +
      `then ${auto} more chosen automatically from ${phrase}.`,
    notes: [PICK_INTEGRITY_NOTE, DEDUP_NOTE],
    requestedCount,
    pickedCount: picked,
  };
}

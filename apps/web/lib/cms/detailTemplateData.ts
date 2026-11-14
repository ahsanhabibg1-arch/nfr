import 'server-only';
import { getRelatedPublishedArticles, getPublishedArticlesBySection, getPublishedArticlesByCategory } from '../content';
import { getPublishedSections, getDraftSections } from './pageLayoutService';
import { getKnownSectionTypes, type SectionSlot } from './sectionRegistry';
import { selectRenderableSlots } from './slotSelection';

export interface DetailSlotData {
  relatedArticles?: unknown[];
  ctaText?: string;
  ctaUrl?: string;
  [key: string]: unknown;
}

export interface ResolvedDetailSlot {
  slot: SectionSlot;
  data: DetailSlotData;
}

/**
 * Stage 04 Task C: `detail-related.articleCount` was `Number(..) || 3` with no
 * clamp, so a large stored value became an unbounded Prisma `take`. The
 * declared max is 6. A stored `0` previously fell through to 3; it now returns
 * the default too, because a visible related-content block showing nothing is
 * not a useful state.
 */
const RELATED_MIN = 1;
const RELATED_MAX = 6;
const RELATED_DEFAULT = 3;

function relatedCount(raw: unknown): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n === 0) return RELATED_DEFAULT;
  return Math.min(RELATED_MAX, Math.max(RELATED_MIN, n));
}

/** Stage 04 Task D: `detail-related.title` was declared but never passed through. */
function relatedTitle(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

/**
 * Every section type a detail template may legitimately contain (Stage 07
 * Task D).
 *
 * THE RESOLVER NO LONGER KEEPS ITS OWN ALLOWLIST. It previously emitted a
 * hardcoded pair — `detail-related` and `detail-cta` — and silently dropped
 * everything else, so a visible, saved, schema-valid block vanished from the
 * page with no error anywhere. The approved Stage 02 architecture §3.4 names
 * this defect exactly: "The registry, not the resolver, must decide what a
 * family can render."
 *
 * The registry now governs through the paths that should govern it:
 * `getAvailableBlockTypes` decides what an operator may ADD, and `saveDraft`'s
 * `validateSectionTypes` decides what may be SAVED. The resolver emits whatever
 * survived that, and `PageRenderer` is the single authority on what renders.
 * This list is kept for the capability tests, which assert that the family's
 * declared types and the renderer registry agree.
 */
const DETAIL_KNOWN_TYPES = getKnownSectionTypes('detail-template');

/** `detail-cta`'s two props, read the same way for all seven templates. */
function detailCta(slot: SectionSlot): DetailSlotData {
  return {
    ctaText: typeof slot.props.ctaText === 'string' ? slot.props.ctaText : '',
    ctaUrl: typeof slot.props.ctaUrl === 'string' ? slot.props.ctaUrl : '/',
  };
}

export async function resolveArticleTemplateSlots(
  articleId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:article', options);
  return resolveAppendageSlots(visible, (count) => getRelatedPublishedArticles(articleId, count));
}

/* ── Shared helper: resolve visible appendage slots for any template key ── */

function resolveAppendageSlots(
  visible: SectionSlot[],
  getRelated: (count: number) => Promise<unknown[]>,
): Promise<ResolvedDetailSlot[]> {
  const out: ResolvedDetailSlot[] = [];
  const tasks: Promise<void>[] = [];

  for (const slot of visible) {
    const t = slot.sectionType;
    if (t === 'detail-related') {
      const count = relatedCount(slot.props.articleCount);
      const idx = out.length;
      out.push({ slot, data: {} });
      tasks.push(getRelated(count).then((relatedArticles) => { out[idx].data = { relatedArticles, title: relatedTitle(slot.props.title) }; }));
    } else if (t === 'detail-cta') {
      out.push({ slot, data: detailCta(slot) });
    } else {
      /**
       * Every other recognised type, and every unrecognised one (Stage 07
       * Task D). The approved appendage blocks — `rich-text-block`,
       * `image-text-block`, `faq-block`, `cta-banner` — are entirely
       * prop-driven, so empty data is correct and complete for them: the block
       * reads its own slot props. Emitting them is the whole change that makes
       * the seven detail templates genuinely composable.
       *
       * A retired marker (`detail-hero`, `detail-body`, `detail-faq`) has no
       * renderer, so it is emitted here, contributes nothing to public HTML, and
       * shows the operator a removable notice in the Builder canvas.
       */
      out.push({ slot, data: {} });
    }
  }

  return Promise.all(tasks).then(() => out);
}

async function fetchVisibleSlots(pageKey: string, options?: { draft?: boolean }): Promise<SectionSlot[]> {
  const fetchSections = options?.draft ? getDraftSections : getPublishedSections;
  const layoutSections = await fetchSections(pageKey);
  // Stage 07 Task A: the one shared selection. Applied here so no related-article
  // query is issued for a hidden slot.
  return selectRenderableSlots(layoutSections);
}

/** Exported for the Stage 07 capability tests: what a detail template may hold. */
export function detailTemplateKnownTypes(): string[] {
  return [...DETAIL_KNOWN_TYPES.keys()];
}

/* ── Rodeo Hub / Event template ────────────────────────────────────────── */

export async function resolveRodeoHubTemplateSlots(
  _entityId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:rodeo-hub', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesBySection('rodeo-events', { limit: count }),
  );
}

/* ── Rodeo Edition template ────────────────────────────────────────────── */

export async function resolveRodeoEditionTemplateSlots(
  _editionId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:rodeo-edition', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesBySection('rodeo-events', { limit: count }),
  );
}

/* ── Discipline template ───────────────────────────────────────────────── */

export async function resolveDisciplineTemplateSlots(
  _disciplineId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:discipline', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesBySection('competition', { limit: count }),
  );
}

/* ── Category template ─────────────────────────────────────────────────── */

export async function resolveCategoryTemplateSlots(
  categorySlug: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:category', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesByCategory(categorySlug).then((a) => a.slice(0, count)),
  );
}

/* ── Information & policy page template ───────────────────────────────── */

/**
 * Presentation slots for an information page (PM-05).
 *
 * The ownership split is the whole reason this is a separate call rather than
 * fields on `InfoPage`: the page owns its facts, the Builder owns how they are
 * arranged, and neither stores the other's data. A layout change therefore
 * never edits page content, and editing page content never disturbs a layout.
 *
 * `options.draft` reaches the Builder's own draft/published layouts, which
 * already exist — so a layout being worked on is no more visible to readers
 * than a body being worked on.
 */
export async function resolveInfoPageTemplateSlots(
  _slug: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:info-page', options);
  /**
   * No related-articles feed is offered. A policy page is not an editorial
   * entry point, and appending "more like this" to a Privacy Policy is how a
   * legal document starts looking like a blog post. Slots that need an article
   * list resolve to an empty one rather than being silently dropped, so the
   * Builder still reports honestly what it is showing.
   */
  return resolveAppendageSlots(visible, async () => []);
}

/* ── Competitor template ───────────────────────────────────────────────── */

export async function resolveCompetitorTemplateSlots(
  _competitorId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:competitor', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesBySection('rodeo-events', { limit: count }),
  );
}

/* ── Venue template ────────────────────────────────────────────────────── */

export async function resolveVenueTemplateSlots(
  _venueId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:venue', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesBySection('rodeo-events', { limit: count }),
  );
}

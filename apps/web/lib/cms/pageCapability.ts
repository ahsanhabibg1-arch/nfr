/**
 * What the Page Builder can actually change, per page and per block
 * (Stage 06 Task 7 + Task 9).
 *
 * WHY THIS MODULE EXISTS
 *
 * The Builder lists 15 page keys and offers an editor for each, which implies
 * that every page composes from blocks. Six do. The other nine render a
 * structured template whose body is written in the route, and accept blocks
 * only as appendages or a single CTA. Until now nothing in the Admin said so,
 * so an operator could reasonably reorder blocks on a detail template and
 * expect the article layout to change.
 *
 * This is the single declaration of that truth. It is consumed by the Admin UI
 * and asserted by `tests/stage06-page-capability.test.ts`, which cross-checks
 * every claim here against the actual renderer registry — so a future stage
 * that adds or removes a renderer cannot leave this file quietly wrong.
 */

import { KNOWN_PAGE_KEYS, PAGE_KEY_LABELS, getAllFamilies, getPageFamily, isRetiredSectionType } from './sectionRegistry';

/** Every page family, so retirement is never checked in only some of them. */
const ALL_FAMILIES = getAllFamilies();

/* ─────────────────────────────────────────────────────────────────────────
 * Block-level support
 * ───────────────────────────────────────────────────────────────────────── */

export type BlockSupport =
  /** Has a definition and a renderer: fully editable and selectable on canvas. */
  | 'canvas'
  /** Props are read by the page/resolver into fixed markup; not canvas-selectable. */
  | 'server-composed'
  /** Not a visible block — a flag the resolver reads to show or hide something. */
  | 'resolver-flag'
  /** System-owned: injected by a resolver, no definition, cannot be added or removed. */
  | 'system'
  /** Retired by owner decision: stays saveable in a stored layout, renders nothing. */
  | 'retired'
  /** Has a definition but no renderer and no consumer: renders nothing. */
  | 'unsupported';

/**
 * Every section type that `components/blocks/registry.tsx` maps to a renderer.
 *
 * Mirrored here rather than imported so this module stays server-safe and does
 * not pull all 22 block components into the Admin bundle. The mirror is not
 * trusted: `stage06-page-capability.test.ts` asserts it equals
 * `Object.keys(blockRegistry)` exactly, in both directions, so drift fails the
 * suite instead of producing a quietly wrong Admin label.
 */
export const RENDERED_SECTION_TYPES: readonly string[] = [
  'competition',
  'cta-banner',
  'detail-cta',
  'detail-related',
  'directory-cta',
  // Stage 07 Task F gave both of these real renderers.
  'directory-grid',
  'directory-hero',
  'editorial-hero',
  'entertainment',
  'events-shopping',
  'faq-block',
  'image-text-block',
  'landing-competition-disciplines',
  'landing-empty',
  'landing-featured',
  'landing-grid',
  'landing-hero',
  'latest-coverage',
  'learning',
  'more-rodeo',
  'plan-and-watch',
  'quick-access',
  'rich-text-block',
  'stats-banner',
];

/**
 * Types whose props reach the page through something other than a renderer.
 * Each entry records the consuming code, so a reviewer can check the claim.
 */
export const NON_RENDERER_CONSUMERS: Record<string, { support: BlockSupport; via: string; note: string }> = {
  /**
   * `directory-hero` WAS here and was removed in Stage 07 Task F. It now has a
   * real renderer (`DirectoryHeroBlock`), so it is canvas-selectable and its
   * badge moves from "Text only" to "Editable". Leaving the entry would have
   * made `classifyBlockSupport` return `server-composed` for a block that
   * renders — the exact contradiction the Stage 06 handover warned about in §3.
   */
  'landing-stat-pills': {
    support: 'resolver-flag',
    via: 'lib/cms/sectionLandingData.ts',
    note:
      'Not a visible block. The section-landing resolver reads this slot to decide whether the hero shows its stat pills, ' +
      'then skips it when composing the render list. Its visibility toggle is the control; it has no appearance of its own.',
  },
};

/**
 * Types a resolver injects directly, with no definition, so they cannot be
 * added, reordered or removed in the Builder.
 *
 * `landing-competition-disciplines` LEFT this set in Stage 07 Task E. It now has
 * a real definition with editable kicker, heading and description, so it is an
 * ordinary canvas block. The resolver still injects it on the Competition
 * landing page when no stored slot exists, which keeps the current public page
 * intact — but an injected instance is a default, not a system-owned block an
 * operator may never touch.
 *
 * `landing-empty` genuinely remains system-owned: it is injected only when a
 * section has no published articles, and there is nothing for an operator to
 * configure about an empty state.
 */
export const SYSTEM_OWNED_SECTION_TYPES: readonly string[] = ['landing-empty'];

/**
 * How a given section type behaves in the Builder.
 *
 * @param sectionType the stored slot type
 * @param hasDefinition whether the type appears in the family registry — the
 *        caller supplies this because definitions are family-scoped.
 */
export function classifyBlockSupport(sectionType: string, hasDefinition: boolean): BlockSupport {
  if (SYSTEM_OWNED_SECTION_TYPES.includes(sectionType)) return 'system';
  const consumer = NON_RENDERER_CONSUMERS[sectionType];
  if (consumer) return consumer.support;
  const rendered = RENDERED_SECTION_TYPES.includes(sectionType);
  if (rendered) return hasDefinition ? 'canvas' : 'system';
  // Retirement is checked after renderers so a retired type that somehow
  // regains a renderer is reported as a contradiction by the test, not hidden.
  //
  // STAGE 07 FIX: this checked only `homepage` and `section-landing`. Stage 07
  // Task C retired three blocks in the DETAIL-TEMPLATE family under owner
  // decision D-02, and they would have been reported as `unsupported` ("No
  // renderer exists for this block") rather than `retired` ("Retired and no
  // longer rendered... you can remove it safely"). Both labels are true, but
  // only the second tells the operator the removal is expected and safe.
  if (ALL_FAMILIES.some((family) => isRetiredSectionType(family, sectionType))) {
    return 'retired';
  }
  return 'unsupported';
}

/** Short Admin badge text per support level. */
export const BLOCK_SUPPORT_LABELS: Record<BlockSupport, string> = {
  canvas: 'Editable',
  'server-composed': 'Text only',
  'resolver-flag': 'Show / hide',
  system: 'System',
  retired: 'Retired',
  unsupported: 'Not rendered',
};

/** One-line Admin explanation per support level. */
export const BLOCK_SUPPORT_HELP: Record<BlockSupport, string> = {
  canvas: 'Fully supported. Edit its properties and click it on the canvas to select it.',
  'server-composed':
    'Its text appears on the page, but the page builds that part itself — so you cannot click this block on the canvas, and reordering it changes nothing.',
  'resolver-flag':
    'Not a visible section. Use its visibility toggle to show or hide the feature it controls; it has no appearance of its own.',
  system:
    'Added automatically by the site, not by the Builder. It cannot be added, reordered or removed here.',
  retired:
    'Retired and no longer rendered. Visitors see nothing. It stays listed so this saved layout remains valid — you can remove it safely.',
  unsupported:
    'No renderer exists for this block, so visitors see nothing where it sits. Removing it will not change the live page.',
};

/* ─────────────────────────────────────────────────────────────────────────
 * Page-level capability
 * ───────────────────────────────────────────────────────────────────────── */

export type PageCompositionLevel =
  /** The whole page body is composed from Builder blocks, in Builder order. */
  | 'composed'
  /** A structured template owns the page; blocks are appended below it. */
  | 'template-appendage'
  /** A fixed listing page; the Builder controls the header text and one CTA. */
  | 'directory-limited';

export interface PageCapability {
  pageKey: string;
  label: string;
  family: string;
  level: PageCompositionLevel;
  /** Whether blocks on this page are clickable on the visual canvas. */
  canvasSelectable: boolean;
  /** One sentence the Admin shows above the canvas. */
  summary: string;
  /** What the Builder cannot change here. Shown as a list. */
  fixed: string[];
}

export const PAGE_COMPOSITION_LABELS: Record<PageCompositionLevel, string> = {
  composed: 'Fully composed page',
  'template-appendage': 'Structured template + extra sections',
  'directory-limited': 'Directory listing (limited slots)',
};

const COMPOSED_SUMMARY =
  'Every section on this page comes from the Builder. Reordering, hiding and adding blocks changes the live page directly.';

/**
 * STAGE 07 TASKS D/F/G — this copy changed because what the Builder can do
 * changed.
 *
 * The old detail summary said blocks were "added below the main content as
 * extra sections". True, but it undersold the page to the point of
 * discouraging use — and at the time only `detail-related` and `detail-cta`
 * rendered at all, while three further declared detail blocks did nothing.
 * Stage 07 Task D added four approved regions that genuinely render, so the
 * summary now names them.
 *
 * What this copy still refuses to claim: that the template itself is
 * composable. Owner decision D-02 was approved as Option B precisely to KEEP
 * the shared structured template, and D-03 settles layout at template level.
 * So the level stays `template-appendage`, and the fixed list still states that
 * the structured core is not editable here — because that is still true.
 */
const APPENDAGE_SUMMARY =
  'This page uses a shared structured template. The record\'s own title, body and facts are not Builder blocks — ' +
  'but you can add approved sections around them: an introduction, an image and text block, an FAQ, related content and a call to action. ' +
  'Reordering and hiding those sections changes every page that uses this template.';

const DIRECTORY_SUMMARY =
  'This is a generated listing page. You control the heading, where the listing sits, how many columns it uses, ' +
  'and any text or call-to-action around it. The entries themselves come from the database — the search form, ' +
  'filters and pagination are part of the listing block and cannot be removed.';

/** Fixed parts of every detail template, shown so reordering expectations are honest. */
const DETAIL_FIXED = [
  'The page title, body, metadata and breadcrumbs come from the CMS record, not the Builder.',
  'The structured template around that record cannot be reordered or removed here.',
  'The sections you add always render below the structured content.',
  'This layout is shared by every page of this type — there is no per-record override.',
];

const DIRECTORY_FIXED = [
  'The entries come from the database; they cannot be chosen or edited here.',
  'The search form, filters and pagination belong to the listing block and cannot be removed.',
  'The listing block is required, so it can be moved but not deleted.',
];

function buildCapability(pageKey: string): PageCapability {
  const family = getPageFamily(pageKey);
  const label = PAGE_KEY_LABELS[pageKey] ?? pageKey;

  if (family === 'homepage' || family === 'section-landing') {
    return {
      pageKey,
      label,
      family,
      level: 'composed',
      canvasSelectable: true,
      summary: COMPOSED_SUMMARY,
      fixed:
        family === 'section-landing'
          ? ['The site header, footer and the section\'s own intro heading are not Builder blocks.']
          : ['The site header and footer are managed under Navigation and Appearance, not here.'],
    };
  }

  if (family === 'detail-template') {
    return {
      pageKey,
      label,
      family,
      level: 'template-appendage',
      canvasSelectable: true,
      summary: APPENDAGE_SUMMARY,
      fixed: DETAIL_FIXED,
    };
  }

  return {
    pageKey,
    label,
    family,
    /**
     * Still `directory-limited`, deliberately, after Stage 07 Task F.
     *
     * All four directory block types now render and all four are
     * canvas-selectable, which is a real improvement on "the Builder controls
     * the heading text and one CTA". But calling the page `composed` would be a
     * lie: the listing's contents, search, filters and pagination are built from
     * the database query and are not Builder-owned, and the listing itself is
     * required. The directive is explicit — do not mark a page composed while
     * its structured core sits outside Builder control.
     */
    level: 'directory-limited',
    canvasSelectable: true,
    summary: DIRECTORY_SUMMARY,
    fixed: DIRECTORY_FIXED,
  };
}

export const PAGE_CAPABILITIES: Record<string, PageCapability> = Object.fromEntries(
  KNOWN_PAGE_KEYS.map((k) => [k, buildCapability(k)]),
);

export function getPageCapability(pageKey: string): PageCapability {
  return PAGE_CAPABILITIES[pageKey] ?? buildCapability(pageKey);
}

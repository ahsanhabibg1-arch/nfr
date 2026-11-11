/**
 * Stage 03 — fixtures and the exemption register for the registry contract test.
 *
 * The contract test derives its coverage from the live registry, so this module
 * supplies only (a) the minimum data each block needs to render non-null, and
 * (b) the explicit, reasoned register of properties that cannot be proven by a
 * component-level sentinel.
 *
 * The register is deliberately rigid in BOTH directions: an unregistered
 * exemption fails the test, and a registered exemption that is no longer needed
 * also fails it. Exemptions therefore cannot silently expand, and cannot linger
 * after the underlying defect is fixed.
 */

import type { Article, Discipline } from '../../types';

/* ── Sentinels ──────────────────────────────────────────────────────── */

export const SENTINEL = 'ZzStage03Sentinel';
export const SENTINEL_URL = '/zz-stage03-sentinel-url-';
export const SENTINEL_IMG = '/zz-stage03-sentinel-image.jpg';

/**
 * The value to write for a given prop type, and what to look for in the HTML.
 *
 * URL sentinels carry no trailing slash: `next/link` normalises one away, so
 * `/x/` is emitted as `href="/x"`. Verified while building this suite.
 */
export function sentinelFor(propType: string, key: string): { value: string; expect: string } {
  if (propType === 'url') return { value: `${SENTINEL_URL}${key}`, expect: `${SENTINEL_URL}${key}` };
  if (propType === 'image') return { value: `${SENTINEL_IMG}?k=${key}`, expect: `${SENTINEL_IMG}` };
  return { value: `${SENTINEL}_${key}`, expect: `${SENTINEL}_${key}` };
}

/**
 * `select` props render as a class or inline style rather than as text, so each
 * needs the option to set and the resulting output fragment to look for.
 */
export const SELECT_EXPECTATIONS: Record<string, Record<string, { value: string; expect: string }>> = {
  'rich-text-block': { alignment: { value: 'right', expect: 'text-align:right' } },
  'image-text-block': { imagePosition: { value: 'right', expect: 'flex-row-reverse' } },
  // 'light' is the only option producing bg-stone-100; the gold accent #D4A757
  // already appears in the default render's CTA button, so it cannot discriminate.
  'cta-banner': { bgColor: { value: 'light', expect: 'bg-stone-100' } },
};

/* ── Minimal entity fixtures ────────────────────────────────────────── */

export function makeArticle(i = 1, overrides: Partial<Article> = {}): Article {
  return {
    id: `fx-article-${i}`,
    slug: `fx-article-${i}`,
    title: `Fixture Article ${i}`,
    deck: `Fixture deck ${i}`,
    content: [`Fixture body ${i}`],
    category: 'competition',
    readTime: '4 min read',
    author: { id: `fx-author-${i}`, name: `Fixture Author ${i}`, slug: `fx-author-${i}`, bio: '', role: 'Staff' },
    publishedAt: '2026-01-0'.concat(String(i)).concat('T00:00:00.000Z'),
    heroImage: `/fx-hero-${i}.jpg`,
    imageCredit: `Fixture credit ${i}`,
    ...overrides,
  } as unknown as Article;
}

export function makeDiscipline(i = 1): Discipline {
  return {
    id: `fx-discipline-${i}`,
    name: `Fixture Discipline ${i}`,
    shortName: `FD${i}`,
    slug: `fx-discipline-${i}`,
    category: 'Roughstock',
    tagline: `Fixture tagline ${i}`,
    summary: `Fixture summary ${i}`,
    scoringBreakdown: [],
    rulesHighlights: [],
    stockProfile: '',
  } as unknown as Discipline;
}

const ARTICLES = [makeArticle(1), makeArticle(2), makeArticle(3)];
const DISCIPLINES = [makeDiscipline(1), makeDiscipline(2)];
const SECTION_META = { name: 'Fixture Section', tagline: 'Fixture tagline', description: 'Fixture description', path: '/fixture/' };

/* ── Per-block render fixtures ──────────────────────────────────────── */

export interface BlockFixture {
  /** Resolver-supplied data the block needs in order to render non-null. */
  data: Record<string, unknown>;
  /**
   * Props that must always be present. Two reasons they are needed:
   *   1. The block short-circuits to null without them (stats-banner, faq-block).
   *   2. The property under test has an UNDECLARED CONDITIONAL DEPENDENCY — it
   *      only takes effect when a partner prop is also set. Verified cases:
   *        - `heroImageAlt` is used only when `heroImageUrl` is set
   *          (components/sections/EditorialHero.tsx:27).
   *        - `ctaUrl` becomes an href only when `ctaText` is non-empty
   *          (e.g. components/sections/PlanAndWatchSection.tsx:23-24).
   *      These props ARE consumed, so they are not exempt — but the Builder
   *      presents them as independent fields, so an admin who sets only one sees
   *      no change. Recorded as a Stage 04 UX item, not a rendering defect.
   */
  baseProps?: Record<string, unknown>;
}

/** stat1-4 Label/Value, so any single one can be overridden with a sentinel. */
const STATS_BASE = Object.fromEntries(
  [1, 2, 3, 4].flatMap((n) => [[`stat${n}Label`, `base label ${n}`], [`stat${n}Value`, `base value ${n}`]]),
);

/** q1-5 / a1-5, so any single one can be overridden with a sentinel. */
const FAQ_BASE = Object.fromEntries(
  [1, 2, 3, 4, 5].flatMap((n) => [[`q${n}`, `base question ${n}`], [`a${n}`, `base answer ${n}`]]),
);

/** Section blocks gate their CTA href on ctaText being present. */
const SECTION_CTA_BASE = { ctaText: 'base cta text' };

export const BLOCK_FIXTURES: Record<string, BlockFixture> = {
  'editorial-hero': {
    data: { lead: ARTICLES[0], secondary: [ARTICLES[1], ARTICLES[2]] },
    // heroImageAlt is only consumed when heroImageUrl is set.
    baseProps: { heroImageUrl: '/fx-base-hero.jpg' },
  },
  'latest-coverage': { data: { articles: ARTICLES }, baseProps: SECTION_CTA_BASE },
  'quick-access': {
    data: { quickAccessLinks: [{ id: 'fx-qa-1', label: 'Fixture Link', description: 'Fixture link description', url: '/fx/' }] },
  },
  'competition': { data: { disciplines: DISCIPLINES } },
  'plan-and-watch': { data: { articles: ARTICLES }, baseProps: SECTION_CTA_BASE },
  'entertainment': { data: { articles: ARTICLES }, baseProps: SECTION_CTA_BASE },
  'events-shopping': { data: { articles: ARTICLES }, baseProps: SECTION_CTA_BASE },
  'learning': { data: { articles: ARTICLES }, baseProps: SECTION_CTA_BASE },
  'more-rodeo': {
    data: {
      hubs: [{ id: 'fx-hub-1', title: 'Fixture Hub', slug: 'fx-hub-1', summary: 'Fixture hub summary' }],
      recurringEvents: [{ id: 'fx-event-1', name: 'Fixture Event', slug: 'fx-event-1', summary: 'Fixture event summary' }],
    },
  },

  'rich-text-block': { data: {}, baseProps: { title: 'base', body: 'base body' } },
  'image-text-block': { data: {}, baseProps: { imageUrl: '/fx-base.jpg', ctaText: 'base cta', ctaUrl: '/fx-base/' } },
  // StatsBanner filters out any label/value pair that is incomplete, so every
  // pair is seeded and the prop under test overrides one half of its own pair.
  'stats-banner': { data: {}, baseProps: STATS_BASE },
  'cta-banner': { data: {}, baseProps: { ctaText: 'base cta', ctaUrl: '/fx-base/' } },
  // FaqBlock filters out incomplete q/a pairs; same approach as stats-banner.
  'faq-block': { data: {}, baseProps: FAQ_BASE },
  'newsletter-signup': { data: {} },

  'landing-hero': { data: { sectionMeta: SECTION_META, totalArticleCount: 3 } },
  'landing-featured': { data: { featuredStory: ARTICLES[0] } },
  'landing-grid': { data: { secondaryStories: ARTICLES, sectionKey: 'fx-section', sectionMeta: SECTION_META } },
  'landing-empty': { data: { sectionMeta: SECTION_META, totalArticleCount: 0 } },
  'landing-competition-disciplines': { data: { disciplines: DISCIPLINES } },

  'detail-related': { data: { relatedArticles: ARTICLES } },
  'detail-cta': { data: { ctaText: 'Fixture detail CTA', ctaUrl: '/fx-detail/' } },
  'directory-cta': { data: { ctaText: 'Fixture directory CTA', ctaUrl: '/fx-directory/' } },

  /**
   * Stage 07 Task F — the directory hero and listing gained renderers, so the
   * registry contract now covers them and they need fixtures.
   *
   * `DirectoryHeroBlock` returns null without a `heroTitle`, because the
   * resolver is what supplies the route's default heading when the operator has
   * left the field empty — a directory must never be headed by a blank <h1>.
   * The fixture therefore seeds one.
   */
  'directory-hero': {
    data: {
      heroTitle: 'Fixture directory heading',
      heroDescription: 'Fixture directory description',
      heroImageUrl: '/fx-directory-hero.jpg',
    },
  },
  /**
   * `directory-grid` renders the listing from route-supplied data, never from
   * slot props. Its one editable prop (`columns`) is a `number`, which the
   * contract treats as resolver-level — so its effect is proven behaviourally
   * in tests/stage07-directory-template.test.ts, which asserts the rendered
   * grid class actually changes with the stored value.
   */
  'directory-grid': {
    data: {
      items: [{ slug: 'fx-1', href: '/fx-1/', title: 'Fixture entry' }],
      total: 1,
      page: 1,
      totalPages: 1,
      entityLabel: 'entry',
      entityLabelPlural: 'entries',
    },
  },
};

/* ── Exemption register ─────────────────────────────────────────────── */

export type ExemptionReason =
  /** The declared block type has no entry in `blockRegistry`, so nothing can render it. */
  | 'NO_RENDERER'
  /** A renderer exists but the property reaches no output. A real defect. */
  | 'INERT'
  /** Consumed by a resolver rather than the component; proven by the causation suite. */
  | 'VIA_RESOLVER'
  /**
   * Correctly has no renderer (Stage 04 Task E). Some registry entries are
   * controls rather than blocks — e.g. `landing-stat-pills` is a visibility
   * toggle the resolver reads and then skips. Separated from NO_RENDERER so a
   * deliberate design choice is not counted as an unrendered defect.
   */
  | 'BY_DESIGN'
  /**
   * The block was retired by an owner decision (Stage 05 D-11). Its definition
   * is kept so a previously stored layout stays valid and editable, but it has
   * no renderer and is absent from the block library — so its properties
   * cannot and should not reach output.
   */
  | 'RETIRED';

export interface Exemption {
  reason: ExemptionReason;
  /** Why this cannot be proven at component level, and where it is proven instead. */
  note: string;
  /** Stage that is expected to remove this exemption, where one is scheduled. */
  resolvedBy?: string;
}

/** key format: `<blockType>.<propKey>`; a bare `<blockType>` covers a type with no props. */
export const EXEMPTIONS: Record<string, Exemption> = {
  // ── NO_RENDERER: 6 declared types absent from blockRegistry ──
  // ── RETIRED: newsletter-signup, owner decision D-11 (Stage 05) ──
  'newsletter-signup': { reason: 'RETIRED', note: 'Retired by owner decision D-11. The block rendered a styled email form whose input was readOnly and whose button had no handler — it collected nothing, but promised a subscription the site cannot deliver. Removed from blockRegistry so a legacy slot renders nothing; the definition is kept marked `retired` so a stored layout stays valid and editable. No subscription backend was created.' },

  'landing-stat-pills': { reason: 'BY_DESIGN', note: 'Resolved in Stage 04 Task E: this is a visibility toggle, not a block. resolveSectionLandingSlots derives pillsVisible from its presence/visibility then skips it, and the pills render inside the hero from live article counts. Correctly has no renderer. The inert defaultProps.pills[] array was removed.' },
  /**
   * STAGE 07 RESOLVED FOUR OF THESE EIGHT NO_RENDERER ENTRIES.
   *
   * The three detail markers were RETIRED under owner decision D-02, approved as
   * Option B ("confirmed for removal rather than promotion"). They keep a
   * definition so a stored layout containing one stays saveable - production has
   * never been inspected - so the exemption stays, now recorded as retirement
   * rather than as an open gap awaiting Stage 07.
   */
  'detail-body': { reason: 'NO_RENDERER', note: 'RETIRED in Stage 07 under owner decision D-02. Declared with empty editableProps and empty defaultProps; the article body belongs to the CMS record. Definition retained so a stored layout containing it stays saveable; physical deletion deferred pending a production inventory.', resolvedBy: 'Stage 07 - retired (D-02)' },
  'detail-hero.heroImageUrl': { reason: 'NO_RENDERER', note: 'RETIRED in Stage 07 under owner decision D-02. The entity hero is rendered by the template from the CMS record, so this prop never had an effect. Definition retained for stored-layout safety.', resolvedBy: 'Stage 07 - retired (D-02)' },
  'detail-hero.showImage': { reason: 'NO_RENDERER', note: 'RETIRED in Stage 07 under owner decision D-02. Also a type mismatch: declared `text`, defaults to boolean true. Definition retained for stored-layout safety.', resolvedBy: 'Stage 07 - retired (D-02)' },
  'detail-faq.title': { reason: 'NO_RENDERER', note: 'RETIRED in Stage 07 under owner decision D-02 and superseded by the shared `faq-block`, which Task D added to the detail family and which renders real question/answer pairs. Definition retained for stored-layout safety.', resolvedBy: 'Stage 07 - retired (D-02)' },

  // ── INERT: none remaining. Stage 04 Task D fixed all three former entries.
  //   landing-hero.heroImageUrl  — now proven by the contract suite
  //   landing-grid.articleCount  — now proven by the contract suite
  //   detail-related.title       — now wired, but via the resolver, so it moved
  //                                to VIA_RESOLVER below rather than being
  //                                provable by a component-level slot sentinel

  // ── VIA_RESOLVER: consumed through resolver data, proven by the causation suite ──
  'detail-related.title': { reason: 'VIA_RESOLVER', note: 'Stage 04 Task D wired this: detailTemplateData now passes slot.props.title into data.title, and DetailRelatedBlock forwards it to RelatedArticles. Consumed via resolver data rather than slot props, so it is proven in stage04-property-fixes.test.ts rather than by a component-level slot sentinel.' },
  'detail-cta.ctaText': { reason: 'VIA_RESOLVER', note: 'DetailCtaBlock reads data.ctaText, which the resolver copies from slot props. Proven end-to-end in stage03-draft-publish-causation.test.ts.' },
  'detail-cta.ctaUrl': { reason: 'VIA_RESOLVER', note: 'As detail-cta.ctaText.' },
  'directory-cta.ctaText': { reason: 'VIA_RESOLVER', note: 'DirectoryCtaBlock reads data.ctaText, copied by resolveDirectorySlots. Proven in stage03-draft-publish-causation.test.ts.' },
  /**
   * Stage 07 Task F: these three moved from NO_RENDERER to VIA_RESOLVER. The
   * block now renders them, but it reads them from the resolver's `data` rather
   * than from slot props directly, because the resolver is where the route's
   * default heading is applied when the operator leaves the field empty. Their
   * effect is proven end-to-end in tests/stage07-directory-template.test.ts.
   */
  'directory-hero.title': { reason: 'VIA_RESOLVER', note: 'DirectoryHeroBlock renders data.heroTitle, which resolveDirectorySlots copies from slot.props.title (falling back to the route default when empty). Proven in stage07-directory-template.test.ts.' },
  'directory-hero.description': { reason: 'VIA_RESOLVER', note: 'As directory-hero.title, via data.heroDescription.' },
  'directory-hero.heroImageUrl': { reason: 'VIA_RESOLVER', note: 'Resolved into data.heroImageUrl and rendered by DirectoryHeroBlock. Before Stage 07 it was resolved and then dropped, which is the defect Task F closed.' },
  'directory-cta.ctaUrl': { reason: 'VIA_RESOLVER', note: 'As directory-cta.ctaText.' },
  'detail-related.articleCount': { reason: 'VIA_RESOLVER', note: 'Read by detailTemplateData to size the related-articles query. Note it is currently UNCLAMPED (Number(..)||3), a defect tracked for Stage 04.' },
};

/**
 * Prop types whose effect is produced by a resolver, not by the component, so a
 * component-level sentinel cannot prove them. These are covered by the causation
 * suite instead and are exempt by type rather than needing a register entry each.
 */
export const RESOLVER_LEVEL_PROP_TYPES = new Set(['featured', 'number']);

/**
 * Section registry — typed catalogue of available page sections (blocks),
 * the JSON shape stored in PageLayout.draftSections / publishedSections,
 * and the block library for the visual page builder.
 */

/* ── Slot shape stored in DB JSON ───────────────────────────────── */

export interface SectionSlot {
  id: string;
  sectionType: string;
  visible: boolean;
  order: number;
  props: Record<string, unknown>;
}

/* ── Property definitions ───────────────────────────────────────── */

export type PropType = 'text' | 'textarea' | 'richtext' | 'number' | 'boolean' | 'select' | 'color' | 'url' | 'image' | 'featured';

export interface SelectOption { value: string; label: string; }

export interface PropDef {
  key: string;
  label: string;
  type: PropType;
  /** Numeric bounds. Enforced server-side by validateProps (Stage 04 Task C). */
  min?: number;
  max?: number;
  options?: SelectOption[];
  tab?: 'content' | 'style' | 'layout' | 'advanced' | 'seo';
  helpText?: string;
  /**
   * Keys that must hold a non-empty value before this property has any effect
   * (Stage 04 Task F). Several properties are consumed only in combination —
   * e.g. `heroImageAlt` is used only when `heroImageUrl` is set, and `ctaUrl`
   * becomes an href only when `ctaText` is non-empty. The registry previously
   * advertised them as independent fields, so an admin who set just one saw no
   * change and reasonably concluded the control was broken.
   *
   * This is editor guidance only: an unsatisfied dependency never discards a
   * stored value, and never blocks a save.
   */
  requires?: string[];
}

/* ── Block / section definition ─────────────────────────────────── */

export type BlockCategory = 'hero' | 'content' | 'editorial' | 'rodeo' | 'directory' | 'cta' | 'info' | 'layout' | 'media';

export interface SectionDef {
  type: string;
  label: string;
  description?: string;
  category: BlockCategory;
  icon?: string;
  required?: boolean;
  /** Default instance cap. `familyLimits` overrides it per family. */
  maxInstances?: number;
  /**
   * Per-family instance caps (Stage 04 Task B). `rich-text-block` and
   * `cta-banner` were previously DECLARED TWICE — once per family — with
   * divergent `maxInstances`. `getAvailableBlockTypes` dedupes first-wins, so
   * the homepage caps silently applied on section-landing pages and the
   * stricter declared cap was unreachable. One definition now carries both.
   */
  familyLimits?: Record<string, number>;
  duplicatable?: boolean;
  /**
   * Retired block (Stage 05, owner decision D-11). The definition is kept so a
   * layout stored before retirement stays valid and editable, but the block:
   *
   *   - is NOT offered in the Builder's block library,
   *   - is NOT placed in a family's default layout,
   *   - has NO renderer, so a legacy slot contributes nothing to the page.
   *
   * This is deliberately not a deletion. Removing the definition outright would
   * make `saveDraft` reject any stored layout that still contains the type,
   * locking an admin out of editing a page they never touched — Stage 04 found
   * zero stored layouts in the inspectable databases, but production was not
   * inspected, so the safe assumption is that such a layout may exist.
   */
  retired?: boolean;
  /**
   * The decision or stage that retired the block, for the Admin notice and for
   * the completion record. Added in Stage 07 because two different owner
   * decisions now retire blocks (D-11 the newsletter, D-02 the three inert
   * detail markers) and a single undifferentiated `retired` flag could not tell
   * an operator — or a reviewer — which one applied.
   */
  retiredBy?: string;
  /**
   * Families where the block is offered in the library but NOT seeded into the
   * default layout (Stage 07 Tasks D–F).
   *
   * PER-FAMILY, AND THAT IS THE POINT. A boolean would not do, because
   * `rich-text-block` belongs in the homepage default layout and must NOT
   * appear in the detail-template or directory ones. Stage 04 Task B
   * established that a shared block is ONE object referenced from several family
   * arrays — `tests/stage04-property-fixes.test.ts` asserts that object
   * identity — so a per-family difference cannot be expressed by cloning the
   * definition. Encoding the exception as a list of families keeps the single
   * object intact.
   *
   * Two reasons a block lands here:
   *
   *  - `landing-competition-disciplines` is addable on any section-landing page,
   *    but only Competition has disciplines, so seeding it into all five
   *    defaults would place a block that renders nothing on four pages.
   *  - the four approved detail appendage regions, and the directory
   *    `rich-text-block`, must not change what a live page renders. Three of
   *    them emit a `<section>` even with empty props, so seeding them would have
   *    added visible empty bands to every detail and directory page the moment
   *    Stage 07 shipped.
   *
   * `retired` would also keep a block out of the defaults, but it removes the
   * block from the library too — the opposite of what these tasks need.
   */
  excludeFromDefaultsIn?: string[];
  /**
   * The block's CONTENT comes from authoritative CMS queries, not from its slot
   * props (Stage 07 Task F).
   *
   * `directory-grid` is the case: the Builder owns where the listing sits and
   * nothing else. The entries, their order, the search form, the filters and
   * the pagination are all produced by the route's database query. The flag
   * exists so the Admin can say that plainly instead of presenting a listing
   * block as if its contents were editable here.
   */
  systemContent?: boolean;
  defaultProps: Record<string, unknown>;
  editableProps: PropDef[];
}

/* ── Helper: generate block instance ID ─────────────────────────── */

let _counter = 0;
export function generateBlockId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  _counter++;
  return `blk_${Date.now()}_${_counter}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ── Shared multi-family blocks (Stage 04 Task B) ───────────────────
 * These two were previously declared TWICE — once in HOMEPAGE_SECTIONS and
 * again in SECTION_LANDING_SECTIONS — with divergent `maxInstances`. Because
 * `getAvailableBlockTypes` dedupes first-wins, the homepage caps silently
 * applied on section-landing pages and the stricter landing caps (3 and 2)
 * were unreachable, so the admin was shown a limit that was not enforced.
 *
 * One authoritative definition each, with the per-family caps preserved
 * exactly as previously declared. Stored layouts are unaffected: the block
 * `type` strings, `defaultProps` and `editableProps` are unchanged.
 */

const SHARED_RICH_TEXT_BLOCK: SectionDef = {
  type: 'rich-text-block',
  label: 'Rich Text Block',
  description: 'Free-form editorial text section with heading',
  category: 'content',
  icon: 'Type',
  duplicatable: true,
  maxInstances: 5,
  // Stage 07: this one object now serves four families. The detail and
  // directory caps are tighter, and both are library-only there so no live page
  // gained a section when Stage 07 shipped.
  familyLimits: { homepage: 5, 'section-landing': 3, 'detail-template': 2, directory: 2 },
  excludeFromDefaultsIn: ['detail-template', 'directory'],
  defaultProps: { title: '', body: '', alignment: 'left' },
  editableProps: [
    { key: 'title', label: 'Heading', type: 'text', tab: 'content' },
    { key: 'body', label: 'Body text', type: 'textarea', tab: 'content' },
    { key: 'alignment', label: 'Text alignment', type: 'select', tab: 'style', options: [
      { value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' },
    ] },
  ],
};

const SHARED_CTA_BANNER: SectionDef = {
  type: 'cta-banner',
  label: 'CTA Banner',
  description: 'Full-width call-to-action banner with button',
  category: 'cta',
  icon: 'Megaphone',
  duplicatable: true,
  maxInstances: 3,
  // Stage 07: added to the detail-template family as the approved CTA region.
  familyLimits: { homepage: 3, 'section-landing': 2, 'detail-template': 1 },
  excludeFromDefaultsIn: ['detail-template'],
  defaultProps: { kicker: '', title: '', description: '', ctaText: '', ctaUrl: '', bgColor: 'dark' },
  editableProps: [
    { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
    { key: 'title', label: 'Heading', type: 'text', tab: 'content' },
    { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
    { key: 'ctaText', label: 'Button text', type: 'text', tab: 'content' },
    { key: 'ctaUrl', label: 'Button URL', type: 'url', tab: 'content', requires: ['ctaText'] },
    { key: 'bgColor', label: 'Background', type: 'select', tab: 'style', options: [
      { value: 'dark', label: 'Dark (brand)' }, { value: 'gold', label: 'Gold accent' }, { value: 'light', label: 'Light' },
    ] },
  ],
};

/* ── Homepage sections ──────────────────────────────────────────── */

/**
 * Shared presentation blocks reused by the detail-template and directory
 * families (Stage 07 Tasks D and F).
 *
 * ONE definition each, referenced from several family arrays — the pattern
 * Stage 04 Task B established after `rich-text-block` and `cta-banner` were
 * found declared twice with divergent caps, where first-wins dedup silently
 * applied the wrong limit. `familyLimits` carries the per-family cap so a
 * stricter limit on one family is actually enforced rather than merely shown.
 *
 * These were previously declared inline inside HOMEPAGE_SECTIONS. Extracting
 * them changes no `type` string, no `defaultProps` and no `editableProps`, so
 * every stored homepage layout is unaffected.
 */
const SHARED_IMAGE_TEXT_BLOCK: SectionDef = {
    excludeFromDefaultsIn: ['detail-template'],
    familyLimits: { 'detail-template': 2 },
    type: 'image-text-block',
    label: 'Image + Text',
    description: 'Side-by-side image and text content block',
    category: 'content',
    icon: 'Image',
    duplicatable: true,
    maxInstances: 5,
    defaultProps: { title: '', body: '', imageUrl: '', imageAlt: '', imagePosition: 'left', ctaText: '', ctaUrl: '' },
    editableProps: [
      { key: 'title', label: 'Heading', type: 'text', tab: 'content' },
      { key: 'body', label: 'Body text', type: 'textarea', tab: 'content' },
      { key: 'imageUrl', label: 'Image', type: 'image', tab: 'content' },
      { key: 'imageAlt', label: 'Image alt text', type: 'text', tab: 'seo', requires: ['imageUrl'] },
      { key: 'imagePosition', label: 'Image position', type: 'select', tab: 'layout', options: [
        { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
      ] },
      { key: 'ctaText', label: 'CTA text', type: 'text', tab: 'content' },
      { key: 'ctaUrl', label: 'CTA URL', type: 'url', tab: 'content', requires: ['ctaText'] },
    ],
  };

const SHARED_FAQ_BLOCK: SectionDef = {
    excludeFromDefaultsIn: ['detail-template'],
    familyLimits: { 'detail-template': 1 },
    type: 'faq-block',
    label: 'FAQ Section',
    description: 'Expandable questions-and-answers section',
    category: 'info',
    icon: 'HelpCircle',
    duplicatable: true,
    maxInstances: 3,
    defaultProps: { title: 'Frequently Asked Questions', q1: '', a1: '', q2: '', a2: '', q3: '', a3: '', q4: '', a4: '', q5: '', a5: '' },
    editableProps: [
      { key: 'title', label: 'Section title', type: 'text', tab: 'content' },
      { key: 'q1', label: 'Question 1', type: 'text', tab: 'content' },
      { key: 'a1', label: 'Answer 1', type: 'textarea', tab: 'content', requires: ['q1'] },
      { key: 'q2', label: 'Question 2', type: 'text', tab: 'content' },
      { key: 'a2', label: 'Answer 2', type: 'textarea', tab: 'content', requires: ['q2'] },
      { key: 'q3', label: 'Question 3', type: 'text', tab: 'content' },
      { key: 'a3', label: 'Answer 3', type: 'textarea', tab: 'content', requires: ['q3'] },
      { key: 'q4', label: 'Question 4', type: 'text', tab: 'content' },
      { key: 'a4', label: 'Answer 4', type: 'textarea', tab: 'content', requires: ['q4'] },
      { key: 'q5', label: 'Question 5', type: 'text', tab: 'content' },
      { key: 'a5', label: 'Answer 5', type: 'textarea', tab: 'content', requires: ['q5'] },
    ],
  };

const HOMEPAGE_SECTIONS: SectionDef[] = [
  {
    type: 'editorial-hero',
    label: 'Editorial Hero',
    description: 'Full-width hero banner with featured editorial content',
    category: 'hero',
    icon: 'Newspaper',
    required: true,
    maxInstances: 1,
    defaultProps: { secondaryCount: 2, heroImageUrl: '', heroImageAlt: '', kicker: 'Lead Editorial Feature', ctaText: 'Read Full Article', featuredIds: '' },
    editableProps: [
      { key: 'featuredIds', label: 'Lead article', type: 'featured', tab: 'content', helpText: 'First pick is the lead story. Empty = the article marked "Lead hero", else the newest article.' },
      { key: 'heroImageUrl', label: 'Override hero image', type: 'image', tab: 'content', helpText: 'Empty = use the lead article\'s own image.' },
      { key: 'heroImageAlt', label: 'Override image alt text', type: 'text', tab: 'seo', requires: ['heroImageUrl'] },
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'ctaText', label: 'Button text', type: 'text', tab: 'content' },
      { key: 'secondaryCount', label: 'Secondary stories (0–4)', type: 'number', max: 4, tab: 'content' },
    ],
  },
  {
    type: 'latest-coverage',
    label: 'Latest Coverage',
    description: 'Grid of latest articles with optional featured picks',
    category: 'editorial',
    icon: 'FileText',
    duplicatable: true,
    maxInstances: 3,
    defaultProps: { articleCount: 6, kicker: 'Latest', title: 'Latest NFR Coverage', description: '', featuredIds: '', ctaText: '', ctaUrl: '' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Title', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
      { key: 'articleCount', label: 'Article count', type: 'number', max: 12, tab: 'content' },
      { key: 'featuredIds', label: 'Pinned articles', type: 'featured', tab: 'content', helpText: 'Shown first, in this order. Remaining slots fill with the newest articles.' },
      { key: 'ctaText', label: 'Link text', type: 'text', tab: 'content' },
      { key: 'ctaUrl', label: 'Link URL', type: 'url', tab: 'content', requires: ['ctaText'] },
    ],
  },
  {
    type: 'quick-access',
    label: 'Quick Access',
    description: 'Shortcut links grid for fast navigation. Links are managed in Header & Nav → Homepage — Quick Access.',
    category: 'info',
    icon: 'Zap',
    maxInstances: 1,
    defaultProps: { kicker: 'Quick Links', title: 'NFR Quick Access', description: '' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content', helpText: 'The links shown here are managed in Admin → Header & Nav under "Homepage — Quick Access".' },
      { key: 'title', label: 'Title', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
    ],
  },
  {
    type: 'competition',
    label: 'Competition — The Seven NFR Disciplines',
    description: 'Showcase of the seven NFR competition disciplines',
    category: 'rodeo',
    icon: 'Trophy',
    maxInstances: 1,
    defaultProps: { kicker: 'Competition', title: 'The Seven NFR Disciplines', description: '' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Title', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
    ],
  },
  {
    type: 'plan-and-watch',
    label: 'Plan & Watch',
    description: 'Watch schedule, streaming, and viewing guide',
    category: 'editorial',
    icon: 'Tv',
    defaultProps: { articleCount: 4, kicker: 'Plan & Watch', title: 'NFR Plan & Watch', description: '', ctaText: '', ctaUrl: '' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Title', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
      { key: 'articleCount', label: 'Article count', type: 'number', max: 8, tab: 'content' },
      { key: 'featuredIds', label: 'Pinned articles', type: 'featured', tab: 'content', helpText: 'Shown first, in this order. Remaining slots fill automatically from this section.' },
      { key: 'ctaText', label: 'CTA button text', type: 'text', tab: 'content' },
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content', requires: ['ctaText'] },
    ],
  },
  {
    type: 'entertainment',
    label: 'Entertainment & Fan Experiences',
    description: 'Entertainment events, concerts, and fan activities',
    category: 'editorial',
    icon: 'Music',
    defaultProps: { articleCount: 3, kicker: 'Entertainment', title: 'NFR Entertainment & Fan Experiences', description: '', ctaText: '', ctaUrl: '' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Title', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
      { key: 'articleCount', label: 'Article count', type: 'number', max: 8, tab: 'content' },
      { key: 'featuredIds', label: 'Pinned articles', type: 'featured', tab: 'content', helpText: 'Shown first, in this order. Remaining slots fill automatically from this section.' },
      { key: 'ctaText', label: 'CTA button text', type: 'text', tab: 'content' },
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content', requires: ['ctaText'] },
    ],
  },
  {
    type: 'events-shopping',
    label: 'Events & Cowboy Christmas',
    description: 'Shopping events, Cowboy Christmas, and marketplace',
    category: 'editorial',
    icon: 'ShoppingBag',
    defaultProps: { articleCount: 3, kicker: 'Events & Shopping', title: 'NFR Events & Cowboy Christmas', description: '', ctaText: '', ctaUrl: '' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Title', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
      { key: 'articleCount', label: 'Article count', type: 'number', max: 8, tab: 'content' },
      { key: 'featuredIds', label: 'Pinned articles', type: 'featured', tab: 'content', helpText: 'Shown first, in this order. Remaining slots fill automatically from this section.' },
      { key: 'ctaText', label: 'CTA button text', type: 'text', tab: 'content' },
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content', requires: ['ctaText'] },
    ],
  },
  {
    type: 'more-rodeo',
    label: 'More Rodeo: Hubs & Recurring Events',
    description: 'Links to rodeo hubs and recurring event pages',
    category: 'rodeo',
    icon: 'LayoutGrid',
    maxInstances: 1,
    defaultProps: { kicker: 'More Rodeo', title: 'More Rodeo: Hubs & Recurring Events', description: '' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Title', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
    ],
  },
  {
    type: 'learning',
    label: 'Rodeo 101 — Rules, Formats & History',
    description: 'Educational content about rodeo rules and history',
    category: 'editorial',
    icon: 'BookOpen',
    defaultProps: { articleCount: 4, kicker: 'Rodeo 101', title: 'Rules, Formats & Rodeo History', description: '', ctaText: '', ctaUrl: '' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Title', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
      { key: 'articleCount', label: 'Article count', type: 'number', max: 8, tab: 'content' },
      { key: 'featuredIds', label: 'Pinned articles', type: 'featured', tab: 'content', helpText: 'Shown first, in this order. Remaining slots fill automatically from this section.' },
      { key: 'ctaText', label: 'CTA button text', type: 'text', tab: 'content' },
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content', requires: ['ctaText'] },
    ],
  },
  /* ── Premium blocks (homepage) ────────────────────────────────── */
  SHARED_RICH_TEXT_BLOCK,
  SHARED_IMAGE_TEXT_BLOCK,
  {
    type: 'stats-banner',
    label: 'Stats Banner',
    description: 'Highlight row of key statistics or numbers',
    category: 'info',
    icon: 'BarChart3',
    duplicatable: true,
    maxInstances: 3,
    defaultProps: { title: '', stat1Label: '', stat1Value: '', stat2Label: '', stat2Value: '', stat3Label: '', stat3Value: '', stat4Label: '', stat4Value: '' },
    editableProps: [
      { key: 'title', label: 'Section title', type: 'text', tab: 'content' },
      { key: 'stat1Label', label: 'Stat 1 label', type: 'text', tab: 'content' },
      { key: 'stat1Value', label: 'Stat 1 value', type: 'text', tab: 'content', requires: ['stat1Label'] },
      { key: 'stat2Label', label: 'Stat 2 label', type: 'text', tab: 'content' },
      { key: 'stat2Value', label: 'Stat 2 value', type: 'text', tab: 'content', requires: ['stat2Label'] },
      { key: 'stat3Label', label: 'Stat 3 label', type: 'text', tab: 'content' },
      { key: 'stat3Value', label: 'Stat 3 value', type: 'text', tab: 'content', requires: ['stat3Label'] },
      { key: 'stat4Label', label: 'Stat 4 label', type: 'text', tab: 'content' },
      { key: 'stat4Value', label: 'Stat 4 value', type: 'text', tab: 'content', requires: ['stat4Label'] },
    ],
  },
  SHARED_CTA_BANNER,
  SHARED_FAQ_BLOCK,
  {
    type: 'newsletter-signup',
    label: 'Newsletter Signup (retired)',
    /**
     * RETIRED — owner decision D-11 (Stage 05).
     *
     * This block rendered a styled email form with a `readOnly` input and a
     * button carrying no handler: a visitor could click it and nothing happened.
     * No address was ever captured, so no personal data was collected — but it
     * was a broken promise on a live publication. The Website Experience
     * Blueprint had already recorded that it should stay hidden until a
     * subscription backend exists; that decision was never enforced.
     *
     * Retired rather than deleted so a stored layout containing it remains
     * valid and editable. It is unavailable in the block library, absent from
     * default layouts, and has no renderer — see `SectionDef.retired`.
     *
     * No subscription backend was created and no provider was introduced.
     */
    description: 'Retired: the newsletter block is unavailable until a subscription backend and consent workflow are approved.',
    category: 'cta',
    icon: 'Mail',
    maxInstances: 2,
    duplicatable: true,
    retired: true,
    defaultProps: { title: 'Stay Updated', description: 'Get the latest NFR coverage delivered to your inbox.', ctaText: 'Subscribe', placeholderText: 'Enter your email' },
    editableProps: [
      { key: 'title', label: 'Heading', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
      { key: 'ctaText', label: 'Button text', type: 'text', tab: 'content' },
      { key: 'placeholderText', label: 'Placeholder', type: 'text', tab: 'content' },
    ],
  },
];

/* ── Section landing sections ───────────────────────────────────── */

const SECTION_LANDING_SECTIONS: SectionDef[] = [
  {
    type: 'landing-hero',
    label: 'Section Hero Banner',
    description: 'Top hero banner for section landing pages',
    category: 'hero',
    icon: 'Layout',
    required: true,
    maxInstances: 1,
    defaultProps: { kicker: '', title: '', description: '', heroImageUrl: '' },
    editableProps: [
      { key: 'heroImageUrl', label: 'Hero image', type: 'image', tab: 'content' },
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Title', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
    ],
  },
  {
    type: 'landing-featured',
    label: 'Featured Story',
    description: 'Highlighted featured article for the section',
    category: 'editorial',
    icon: 'Star',
    maxInstances: 1,
    defaultProps: { ctaText: 'Read Full Story', featuredIds: '' },
    editableProps: [
      { key: 'featuredIds', label: 'Featured article', type: 'featured', tab: 'content', helpText: 'Pick a featured story. Empty = newest article in this section.' },
      { key: 'ctaText', label: 'CTA text', type: 'text', tab: 'content' },
    ],
  },
  {
    type: 'landing-grid',
    label: 'Article Grid',
    description: 'Paginated grid of section articles',
    category: 'content',
    icon: 'Grid',
    maxInstances: 1,
    defaultProps: { articleCount: 9, ctaText: 'View Category Archive' },
    editableProps: [
      { key: 'articleCount', label: 'Article count', type: 'number', max: 20, tab: 'content' },
      { key: 'ctaText', label: 'CTA text', type: 'text', tab: 'content' },
    ],
  },
  {
    type: 'landing-stat-pills',
    label: 'Stat Pills (show/hide)',
    /**
     * Stage 04 Task E — this is a VISIBILITY TOGGLE, not a rendered block, and
     * that is by design. `resolveSectionLandingSlots` reads whether this slot is
     * present and visible, derives `pillsVisible` from it, then skips it; the
     * pills themselves are rendered inside the hero. It therefore has, and
     * should have, no `blockRegistry` entry.
     *
     * The previous `defaultProps.pills[]` array was read by nothing — the pill
     * labels and values are computed in `LandingHeroBlock` from live article
     * counts — so it is removed rather than left looking configurable.
     */
    description: 'Shows or hides the stat badges inside the section hero. Values are calculated automatically.',
    category: 'info',
    icon: 'BarChart',
    maxInstances: 1,
    defaultProps: {},
    editableProps: [],
  },
  {
    type: 'landing-competition-disciplines',
    label: 'Discipline Guides',
    /**
     * REGISTERED IN STAGE 07 TASK E.
     *
     * Before this it had a renderer in `blockRegistry` but NO definition
     * anywhere, so `resolveSectionLandingSlots` injected it and the block
     * printed two headings - "Championship Disciplines" and "NFR Discipline
     * Guides" - that no administrator could reach, reorder, hide or edit. It was
     * the clearest remaining case of public copy with no owner in the Admin.
     *
     * Now a real definition: addable, orderable, hideable, with its kicker,
     * heading and description editable. `defaultProps` carry the exact strings
     * the block hardcoded, so a page that does not set them renders byte-for-byte
     * what it rendered before.
     *
     * `excludeFromDefaults` keeps it out of the five default section-landing
     * layouts. Only the Competition section has disciplines, so seeding it
     * everywhere would place a block that renders nothing on four pages. The
     * resolver still injects it on Competition when no stored slot exists, so
     * the current public page is unchanged until an operator takes control of it.
     *
     * The data stays with the existing `getAllDisciplines()` call - no second
     * competition data source, and no duplication of the section resolver.
     */
    description: 'Grid of links to the NFR discipline guides. Only the Competition section has disciplines to show; on other sections this block renders nothing.',
    category: 'rodeo',
    icon: 'Grid',
    maxInstances: 1,
    excludeFromDefaultsIn: ['section-landing'],
    defaultProps: { kicker: 'Championship Disciplines', title: 'NFR Discipline Guides', description: '' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Heading', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
    ],
  },
  SHARED_RICH_TEXT_BLOCK,
  SHARED_CTA_BANNER,
];

/* ── Detail template sections ───────────────────────────────────── */

const DETAIL_TEMPLATE_SECTIONS: SectionDef[] = [
  {
    type: 'detail-hero',
    label: 'Page Hero (retired)',
    /**
     * RETIRED IN STAGE 07 - owner decision D-02, approved as Option B:
     * "the three inert detail markers (detail-hero, detail-body, detail-faq) are
     * confirmed for removal rather than promotion."
     *
     * It never had a renderer. The entity hero on every detail page is rendered
     * by the route from the CMS record, so this definition advertised control
     * that did not exist: an operator could set `heroImageUrl`, save, and see
     * nothing change. `showImage` was declared `text` while defaulting to a
     * boolean, so it could not have worked either.
     *
     * RETIRED, NOT DELETED. Deleting the definition would remove the type from
     * `getKnownSectionTypes`, so `saveDraft` would reject any stored layout that
     * still contains a `detail-hero` slot - locking an operator out of editing a
     * page they never touched. Stage 04 found zero PageLayout rows in the
     * development and test databases, but PRODUCTION HAS NEVER BEEN INSPECTED,
     * so such a layout may exist. Physical deletion is deferred until the
     * production inventory is run or the owner confirms no layouts exist.
     *
     * `required` is also dropped: a required block with no renderer could be
     * neither removed nor hidden in the Builder while contributing nothing.
     */
    description: 'Retired. The page hero is rendered by the template from the CMS record.',
    category: 'hero',
    icon: 'Layout',
    retired: true,
    retiredBy: 'D-02 (Stage 07)',
    maxInstances: 1,
    defaultProps: { showImage: true, heroImageUrl: '' },
    editableProps: [
      { key: 'heroImageUrl', label: 'Override hero image', type: 'image', tab: 'content' },
      { key: 'showImage', label: 'Show hero image', type: 'text', tab: 'content' },
    ],
  },
  {
    type: 'detail-body',
    label: 'Main Content (retired)',
    /**
     * RETIRED IN STAGE 07 - owner decision D-02 (Option B). No renderer, no
     * props, no contract: it declared `defaultProps: {}` and `editableProps: []`,
     * so it was a marker for a region the route owns and the Builder cannot
     * touch. The article body belongs to the CMS record.
     *
     * Retained as a definition for the same stored-layout safety reason as
     * `detail-hero`. `required` dropped for the same reason.
     */
    description: 'Retired. The main content is the CMS record body, rendered by the template.',
    category: 'content',
    icon: 'FileText',
    retired: true,
    retiredBy: 'D-02 (Stage 07)',
    maxInstances: 1,
    defaultProps: {},
    editableProps: [],
  },
  {
    type: 'detail-related',
    label: 'Related Content',
    description: 'Related articles grid below the main content',
    category: 'editorial',
    icon: 'Link',
    maxInstances: 1,
    defaultProps: { articleCount: 3, title: 'Related Coverage' },
    editableProps: [
      { key: 'title', label: 'Section title', type: 'text', tab: 'content' },
      { key: 'articleCount', label: 'Article count', type: 'number', max: 6, tab: 'content' },
    ],
  },
  {
    type: 'detail-faq',
    label: 'FAQ Section (retired - use the FAQ Section block)',
    /**
     * RETIRED IN STAGE 07 - owner decision D-02 (Option B), and SUPERSEDED.
     *
     * It had no renderer and only a `title` prop, so it could never have shown a
     * question or an answer. The replacement is the shared `faq-block`, which
     * Stage 07 Task D added to this family: it has a real renderer and five
     * question/answer pairs, so the FAQ region the directive asks for is now
     * genuinely editable rather than a heading with nothing under it.
     *
     * Retained as a definition for stored-layout safety (see `detail-hero`).
     */
    description: 'Retired. Use the FAQ Section block, which renders real questions and answers.',
    category: 'info',
    icon: 'HelpCircle',
    retired: true,
    retiredBy: 'D-02 (Stage 07)',
    maxInstances: 1,
    defaultProps: { title: 'Frequently Asked Questions' },
    editableProps: [
      { key: 'title', label: 'Section title', type: 'text', tab: 'content' },
    ],
  },
  {
    type: 'detail-cta',
    label: 'Call to Action',
    description: 'Bottom CTA for article pages',
    category: 'cta',
    icon: 'Megaphone',
    maxInstances: 1,
    defaultProps: { ctaText: '', ctaUrl: '' },
    editableProps: [
      { key: 'ctaText', label: 'CTA text', type: 'text', tab: 'content' },
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content', requires: ['ctaText'] },
    ],
  },
  /* -- Approved appendage regions (Stage 07 Task D) -------------------
   *
   * Owner decision D-02 was approved as Option B: "shared structured editorial
   * templates, WITH OPTIONAL APPROVED APPENDAGE SECTIONS". These four are those
   * sections. Each already has a working renderer proven by the Stage 03
   * registry contract, so adding it to this family gives the seven detail
   * templates real presentation control rather than another inert marker.
   *
   * What they deliberately are NOT: a replacement for the structured core. The
   * title, body, metadata, breadcrumbs and entity relationships stay owned by
   * the CMS record and rendered by the route. These blocks compose AROUND that
   * core, below the structured content, exactly where `ArticleAppendageSlots`
   * already places appendage slots in all seven public routes.
   *
   * Per D-03 the layout is TEMPLATE-level: one layout per `template:*` key,
   * shared by every entity of that type. No per-entity override is introduced,
   * because the approved architecture does not authorise one.
   *
   * Instance caps are per-family so a detail page cannot become an unbounded
   * free-form page - the Stage 02 guard against scope creep into a free-form
   * builder (architecture section 10).
   */
  // Referenced by IDENTITY, never cloned. Stage 04 Task B made a shared block a
  // single definition object so two families could not carry divergent caps, and
  // `tests/stage04-property-fixes.test.ts` asserts that identity. The per-family
  // caps and default-layout exclusions therefore live on the shared objects
  // themselves (`familyLimits`, `excludeFromDefaultsIn`), not on a copy made
  // here - a spread would have silently reintroduced the divergence Stage 04
  // removed.
  SHARED_RICH_TEXT_BLOCK,
  SHARED_IMAGE_TEXT_BLOCK,
  SHARED_FAQ_BLOCK,
  SHARED_CTA_BANNER,
];

/* ── Directory sections ─────────────────────────────────────────── */

const DIRECTORY_SECTIONS: SectionDef[] = [
  {
    type: 'directory-hero',
    label: 'Directory Hero',
    /**
     * GIVEN A REAL RENDERER IN STAGE 07 TASK F.
     *
     * Previously the two directory routes read `title` and `description` out of
     * this slot and rendered them inside their own header markup, while
     * `heroImageUrl` was resolved and then silently dropped. So the block was
     * half-wired: editing the text worked, editing the image did nothing, and
     * because no renderer produced an element there was no `data-slot-id`, which
     * made the block unclickable on the Stage 06 canvas.
     *
     * `DirectoryHeroBlock` now renders the whole header, including the image,
     * and the routes delegate to it. One H1 still, in the same position.
     *
     * `kicker` is new and editable; its default is the string the routes
     * hardcoded ("Directory"), so unset layouts render as before.
     */
    description: 'Heading block at the top of a directory listing page.',
    category: 'hero',
    icon: 'Layout',
    required: true,
    maxInstances: 1,
    defaultProps: { kicker: 'Directory', title: '', description: '', heroImageUrl: '' },
    editableProps: [
      { key: 'heroImageUrl', label: 'Hero image', type: 'image', tab: 'content' },
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Title', type: 'text', tab: 'content', helpText: 'Empty = the default heading for this directory.' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
    ],
  },
  {
    type: 'directory-grid',
    label: 'Entity Listing',
    /**
     * THE REQUIRED-BLOCK CONTRADICTION, RESOLVED IN STAGE 07 TASK F.
     *
     * This block was `required: true` AND had no renderer. An operator could
     * therefore neither remove it nor hide it, and it contributed nothing to the
     * page - the worst of both states, and the reason the Stage 06 handover
     * flagged it as unsavable-if-deleted.
     *
     * The directive requires the contradiction to be resolved "atomically with
     * the new directory rendering design", and there were two ways to do it:
     * drop `required` and delete the block, or make `required` TRUE by giving it
     * a renderer. The second is correct, because the thing it represents - the
     * search form, the result count, the entries and the pagination - really is
     * mandatory on a listing page and really is already on it. Deleting the
     * block would have left the listing unrepresented in the Builder, which is
     * the dishonesty this programme exists to remove.
     *
     * So `required` stays and is now truthful, and `systemContent` records the
     * other half of the truth: the Builder owns WHERE the listing sits, and
     * nothing else. The entries come from the route's authoritative database
     * query (`listPublicCompetitors` / `listPublicVenues`) - never from layout
     * JSON, so no competitor or venue record is ever duplicated into a slot.
     *
     * `columns` was declared and ignored. It is now consumed by the renderer and
     * clamped, so the one control this block advertises actually works.
     */
    description: 'The search form, entries and pagination. Built from the live database; the Builder sets only where it appears.',
    category: 'directory',
    icon: 'Grid',
    required: true,
    systemContent: true,
    maxInstances: 1,
    defaultProps: { columns: 3 },
    editableProps: [
      { key: 'columns', label: 'Grid columns', type: 'number', min: 1, max: 4, tab: 'layout' },
    ],
  },
  {
    type: 'directory-cta',
    label: 'Call to Action',
    description: 'Bottom CTA for directory pages',
    category: 'cta',
    icon: 'Megaphone',
    maxInstances: 1,
    defaultProps: { ctaText: '', ctaUrl: '' },
    editableProps: [
      { key: 'ctaText', label: 'CTA text', type: 'text', tab: 'content' },
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content', requires: ['ctaText'] },
    ],
  },
  /**
   * One approved presentation block for directories (Stage 07 Task F).
   *
   * Before this a directory layout held exactly three slots, two of which were
   * fixed, so "meaningful presentation editing" amounted to a heading and a
   * button. `rich-text-block` lets an operator put an explanatory paragraph
   * above or below the listing - a real composition decision - without touching
   * the listing itself, which stays required and database-owned.
   *
   * Capped at 2 per directory. Nothing is added that could remove required
   * directory functionality, and no filter, sort or personalisation control is
   * introduced: the directive forbids speculative controls, and Stage 06 has a
   * test asserting the inspector never mentions them.
   */
  // Library-only here, for the same reason as the detail appendages: the two
  // live directory pages must render exactly what they render today until an
  // operator adds a block deliberately. Referenced by identity; the directory
  // cap and exclusion live on the shared definition.
  SHARED_RICH_TEXT_BLOCK,
];

/* ── Registry map ───────────────────────────────────────────────── */

const PAGE_FAMILY_REGISTRY: Record<string, SectionDef[]> = {
  homepage: HOMEPAGE_SECTIONS,
  'section-landing': SECTION_LANDING_SECTIONS,
  'detail-template': DETAIL_TEMPLATE_SECTIONS,
  'directory': DIRECTORY_SECTIONS,
};

/* ── Lookups ────────────────────────────────────────────────────── */

export function getSectionsForFamily(family: string): SectionDef[] {
  return PAGE_FAMILY_REGISTRY[family] ?? [];
}

export function getPageFamily(pageKey: string): string {
  if (pageKey === 'homepage') return 'homepage';
  if (pageKey.startsWith('section:')) return 'section-landing';
  if (pageKey.startsWith('template:')) return 'detail-template';
  if (pageKey.startsWith('directory:')) return 'directory';
  return 'unknown';
}

export function buildDefaultSlots(family: string): SectionSlot[] {
  const defs = getSectionsForFamily(family);
  const seen = new Set<string>();
  return defs
    .filter((def) => {
      // Retired blocks are never placed in a default layout (Stage 05 D-11,
      // Stage 07 D-02).
      if (def.retired) return false;
      // Offered in the library but not seeded into THIS family's default
      // layout (Stage 07 - see `excludeFromDefaultsIn`).
      if (def.excludeFromDefaultsIn?.includes(family)) return false;
      if (seen.has(def.type)) return false;
      seen.add(def.type);
      return true;
    })
    .map((def, i) => ({
      id: defaultSlotId(family, def.type),
      sectionType: def.type,
      visible: true,
      order: i,
      props: { ...def.defaultProps },
    }));
}

/**
 * Deterministic id for a slot in a DEFAULT layout (Stage 06).
 *
 * This replaced `generateBlockId()` inside `buildDefaultSlots`, and the reason
 * is a defect browser verification caught that no unit test could.
 *
 * A page with no stored `PageLayout` row renders registry defaults. Those
 * defaults were computed TWICE and independently: once in the browser by the
 * Builder (to populate its structure tree) and once on the server by
 * `resolveSections` (to render the page in the canvas iframe). Each call minted
 * fresh random UUIDs, so the tree's ids and the canvas's `data-slot-id`s never
 * matched — click-to-select and tree-to-canvas highlighting silently did
 * nothing. With zero `PageLayout` rows in the development and test databases,
 * that meant EVERY page.
 *
 * A default layout is a pure function of (family, section type), so its ids can
 * be too. Any two computations now agree, and selection works before a draft
 * has ever been saved.
 *
 * Properties relied on elsewhere: unique within a family (types are deduped
 * above), stable across processes and reloads, and matching the canvas bridge's
 * `^[A-Za-z0-9_-]{1,64}$` allow-list. The `default-` prefix cannot collide with
 * a stored id, which is a UUID or `blk_…`.
 */
export function defaultSlotId(family: string, sectionType: string): string {
  return `default-${family}-${sectionType}`;
}

export function getAllFamilies(): string[] {
  return Object.keys(PAGE_FAMILY_REGISTRY);
}

/**
 * Blocks an admin may ADD to this family. Retired blocks are excluded, so the
 * Builder's library cannot offer them (Stage 05 D-11). Use
 * `getKnownSectionTypes` for validating what a stored layout may legitimately
 * still contain.
 */
export function getAvailableBlockTypes(family: string): SectionDef[] {
  const all = getSectionsForFamily(family);
  const seen = new Set<string>();
  return all.filter((d) => {
    if (d.retired) return false;
    if (seen.has(d.type)) return false;
    seen.add(d.type);
    return true;
  });
}

/**
 * Every section type a stored layout for this family may legitimately contain,
 * including retired ones. Save validation uses this so a layout stored before a
 * block was retired stays editable; the block library uses
 * `getAvailableBlockTypes`, so it can never be added again.
 */
export function getKnownSectionTypes(family: string): Map<string, SectionDef> {
  const map = new Map<string, SectionDef>();
  for (const d of getSectionsForFamily(family)) if (!map.has(d.type)) map.set(d.type, d);
  return map;
}

/** Whether a section type has been retired and should no longer be offered. */
export function isRetiredSectionType(family: string, type: string): boolean {
  return getKnownSectionTypes(family).get(type)?.retired === true;
}

export function getBlockCategories(family: string): BlockCategory[] {
  const blocks = getAvailableBlockTypes(family);
  const cats = new Set<BlockCategory>();
  for (const b of blocks) cats.add(b.category);
  return [...cats];
}

export function countBlockInstances(slots: SectionSlot[], blockType: string): number {
  return slots.filter((s) => s.sectionType === blockType).length;
}

/**
 * The instance cap that applies to a block on a given page family (Stage 04
 * Task B). `familyLimits` wins where present, so a multi-family block can carry
 * a stricter cap on one family than another and have it actually enforced.
 */
export function resolveMaxInstances(blockDef: SectionDef, family?: string): number | undefined {
  if (family && blockDef.familyLimits && family in blockDef.familyLimits) {
    return blockDef.familyLimits[family];
  }
  return blockDef.maxInstances;
}

export function canAddBlock(slots: SectionSlot[], blockDef: SectionDef, family?: string): boolean {
  const max = resolveMaxInstances(blockDef, family);
  if (max === undefined) return true;
  return countBlockInstances(slots, blockDef.type) < max;
}

export function ensureSlotIds(slots: SectionSlot[]): SectionSlot[] {
  return slots.map((s) => ({
    ...s,
    id: s.id || generateBlockId(),
  }));
}

/* ── Known page keys ────────────────────────────────────────────── */

export const KNOWN_PAGE_KEYS = [
  'homepage',
  'section:competition',
  'section:entertainment',
  'section:events-shopping',
  'section:plan-watch',
  'section:rodeo-events',
  'template:article',
  'template:rodeo-hub',
  'template:rodeo-edition',
  'template:discipline',
  'template:category',
  'template:info-page',
  'template:competitor',
  'template:venue',
  'directory:competitors',
  'directory:venues',
] as const;

export type KnownPageKey = (typeof KNOWN_PAGE_KEYS)[number];

export const PAGE_KEY_LABELS: Record<string, string> = {
  homepage: 'Homepage',
  'section:competition': 'Section — Competition',
  'section:entertainment': 'Section — Entertainment',
  'section:events-shopping': 'Section — Events & Shopping',
  'section:plan-watch': 'Section — Plan & Watch',
  'section:rodeo-events': 'Section — Rodeo Events',
  'template:article': 'Template — Article Detail',
  'template:rodeo-hub': 'Template — Rodeo Hub / Event',
  'template:rodeo-edition': 'Template — Annual Edition',
  'template:discipline': 'Template — Discipline Guide',
  'template:category': 'Template — Category Archive',
  'template:info-page': 'Template — Information & Policy Page',
  'template:competitor': 'Template — Competitor Detail',
  'template:venue': 'Template — Venue Detail',
  'directory:competitors': 'Directory — Competitors',
  'directory:venues': 'Directory — Venues',
};

const DEAD_PAGE_KEYS = new Set<string>([]);

export const ADMIN_VISIBLE_PAGE_KEYS = KNOWN_PAGE_KEYS.filter((k) => !DEAD_PAGE_KEYS.has(k));

export { HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS, DETAIL_TEMPLATE_SECTIONS, DIRECTORY_SECTIONS };

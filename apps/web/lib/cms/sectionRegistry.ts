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
  max?: number;
  options?: SelectOption[];
  tab?: 'content' | 'style' | 'layout' | 'advanced' | 'seo';
  helpText?: string;
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
  maxInstances?: number;
  duplicatable?: boolean;
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

/* ── Homepage sections ──────────────────────────────────────────── */

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
      { key: 'heroImageAlt', label: 'Override image alt text', type: 'text', tab: 'seo' },
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
      { key: 'ctaUrl', label: 'Link URL', type: 'url', tab: 'content' },
    ],
  },
  {
    type: 'quick-access',
    label: 'Quick Access',
    description: 'Shortcut links grid for fast navigation',
    category: 'info',
    icon: 'Zap',
    maxInstances: 1,
    defaultProps: { kicker: 'Quick Links', title: 'NFR Quick Access', description: '' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
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
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content' },
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
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content' },
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
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content' },
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
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content' },
    ],
  },
  /* ── Premium blocks (homepage) ────────────────────────────────── */
  {
    type: 'rich-text-block',
    label: 'Rich Text Block',
    description: 'Free-form editorial text section with heading',
    category: 'content',
    icon: 'Type',
    duplicatable: true,
    maxInstances: 5,
    defaultProps: { title: '', body: '', alignment: 'left' },
    editableProps: [
      { key: 'title', label: 'Heading', type: 'text', tab: 'content' },
      { key: 'body', label: 'Body text', type: 'textarea', tab: 'content' },
      { key: 'alignment', label: 'Text alignment', type: 'select', tab: 'style', options: [
        { value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' },
      ] },
    ],
  },
  {
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
      { key: 'imageAlt', label: 'Image alt text', type: 'text', tab: 'seo' },
      { key: 'imagePosition', label: 'Image position', type: 'select', tab: 'layout', options: [
        { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
      ] },
      { key: 'ctaText', label: 'CTA text', type: 'text', tab: 'content' },
      { key: 'ctaUrl', label: 'CTA URL', type: 'url', tab: 'content' },
    ],
  },
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
      { key: 'stat1Value', label: 'Stat 1 value', type: 'text', tab: 'content' },
      { key: 'stat2Label', label: 'Stat 2 label', type: 'text', tab: 'content' },
      { key: 'stat2Value', label: 'Stat 2 value', type: 'text', tab: 'content' },
      { key: 'stat3Label', label: 'Stat 3 label', type: 'text', tab: 'content' },
      { key: 'stat3Value', label: 'Stat 3 value', type: 'text', tab: 'content' },
      { key: 'stat4Label', label: 'Stat 4 label', type: 'text', tab: 'content' },
      { key: 'stat4Value', label: 'Stat 4 value', type: 'text', tab: 'content' },
    ],
  },
  {
    type: 'cta-banner',
    label: 'CTA Banner',
    description: 'Full-width call-to-action banner with button',
    category: 'cta',
    icon: 'Megaphone',
    duplicatable: true,
    maxInstances: 3,
    defaultProps: { kicker: '', title: '', description: '', ctaText: '', ctaUrl: '', bgColor: 'dark' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Heading', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
      { key: 'ctaText', label: 'Button text', type: 'text', tab: 'content' },
      { key: 'ctaUrl', label: 'Button URL', type: 'url', tab: 'content' },
      { key: 'bgColor', label: 'Background', type: 'select', tab: 'style', options: [
        { value: 'dark', label: 'Dark (brand)' }, { value: 'gold', label: 'Gold accent' }, { value: 'light', label: 'Light' },
      ] },
    ],
  },
  {
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
      { key: 'a1', label: 'Answer 1', type: 'textarea', tab: 'content' },
      { key: 'q2', label: 'Question 2', type: 'text', tab: 'content' },
      { key: 'a2', label: 'Answer 2', type: 'textarea', tab: 'content' },
      { key: 'q3', label: 'Question 3', type: 'text', tab: 'content' },
      { key: 'a3', label: 'Answer 3', type: 'textarea', tab: 'content' },
      { key: 'q4', label: 'Question 4', type: 'text', tab: 'content' },
      { key: 'a4', label: 'Answer 4', type: 'textarea', tab: 'content' },
      { key: 'q5', label: 'Question 5', type: 'text', tab: 'content' },
      { key: 'a5', label: 'Answer 5', type: 'textarea', tab: 'content' },
    ],
  },
  {
    type: 'newsletter-signup',
    label: 'Newsletter Signup',
    description: 'Email signup call-to-action with description',
    category: 'cta',
    icon: 'Mail',
    maxInstances: 2,
    duplicatable: true,
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
    defaultProps: { ctaText: 'Read Full Story' },
    editableProps: [
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
    label: 'Stat Pills',
    description: 'Horizontal stat badges at the bottom of the section',
    category: 'info',
    icon: 'BarChart',
    maxInstances: 1,
    defaultProps: {
      pills: [
        { label: 'Published articles', value: '' },
        { label: 'Publisher', value: 'Independent' },
      ],
    },
    editableProps: [],
  },
  {
    type: 'rich-text-block',
    label: 'Rich Text Block',
    description: 'Free-form editorial text section',
    category: 'content',
    icon: 'Type',
    duplicatable: true,
    maxInstances: 3,
    defaultProps: { title: '', body: '', alignment: 'left' },
    editableProps: [
      { key: 'title', label: 'Heading', type: 'text', tab: 'content' },
      { key: 'body', label: 'Body text', type: 'textarea', tab: 'content' },
      { key: 'alignment', label: 'Text alignment', type: 'select', tab: 'style', options: [
        { value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' },
      ] },
    ],
  },
  {
    type: 'cta-banner',
    label: 'CTA Banner',
    description: 'Full-width call-to-action banner',
    category: 'cta',
    icon: 'Megaphone',
    duplicatable: true,
    maxInstances: 2,
    defaultProps: { kicker: '', title: '', description: '', ctaText: '', ctaUrl: '', bgColor: 'dark' },
    editableProps: [
      { key: 'kicker', label: 'Kicker', type: 'text', tab: 'content' },
      { key: 'title', label: 'Heading', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
      { key: 'ctaText', label: 'Button text', type: 'text', tab: 'content' },
      { key: 'ctaUrl', label: 'Button URL', type: 'url', tab: 'content' },
      { key: 'bgColor', label: 'Background', type: 'select', tab: 'style', options: [
        { value: 'dark', label: 'Dark (brand)' }, { value: 'gold', label: 'Gold accent' }, { value: 'light', label: 'Light' },
      ] },
    ],
  },
];

/* ── Detail template sections ───────────────────────────────────── */

const DETAIL_TEMPLATE_SECTIONS: SectionDef[] = [
  {
    type: 'detail-hero',
    label: 'Page Hero',
    description: 'Top hero for detail/article pages',
    category: 'hero',
    icon: 'Layout',
    required: true,
    maxInstances: 1,
    defaultProps: { showImage: true, heroImageUrl: '' },
    editableProps: [
      { key: 'heroImageUrl', label: 'Override hero image', type: 'image', tab: 'content' },
      { key: 'showImage', label: 'Show hero image', type: 'text', tab: 'content' },
    ],
  },
  {
    type: 'detail-body',
    label: 'Main Content',
    description: 'Primary article body content area',
    category: 'content',
    icon: 'FileText',
    required: true,
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
    label: 'FAQ Section',
    description: 'Article-specific FAQ accordion',
    category: 'info',
    icon: 'HelpCircle',
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
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content' },
    ],
  },
];

/* ── Directory sections ─────────────────────────────────────────── */

const DIRECTORY_SECTIONS: SectionDef[] = [
  {
    type: 'directory-hero',
    label: 'Directory Hero',
    description: 'Hero banner for directory listing pages',
    category: 'hero',
    icon: 'Layout',
    required: true,
    maxInstances: 1,
    defaultProps: { title: '', description: '', heroImageUrl: '' },
    editableProps: [
      { key: 'heroImageUrl', label: 'Hero image', type: 'image', tab: 'content' },
      { key: 'title', label: 'Title', type: 'text', tab: 'content' },
      { key: 'description', label: 'Description', type: 'textarea', tab: 'content' },
    ],
  },
  {
    type: 'directory-grid',
    label: 'Entity Grid',
    description: 'Main grid of directory entries',
    category: 'directory',
    icon: 'Grid',
    required: true,
    maxInstances: 1,
    defaultProps: { columns: 3 },
    editableProps: [
      { key: 'columns', label: 'Grid columns', type: 'number', max: 4, tab: 'layout' },
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
      { key: 'ctaUrl', label: 'CTA link URL', type: 'url', tab: 'content' },
    ],
  },
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
      if (seen.has(def.type)) return false;
      seen.add(def.type);
      return true;
    })
    .map((def, i) => ({
      id: generateBlockId(),
      sectionType: def.type,
      visible: true,
      order: i,
      props: { ...def.defaultProps },
    }));
}

export function getAllFamilies(): string[] {
  return Object.keys(PAGE_FAMILY_REGISTRY);
}

export function getAvailableBlockTypes(family: string): SectionDef[] {
  const all = getSectionsForFamily(family);
  const seen = new Set<string>();
  return all.filter((d) => {
    if (seen.has(d.type)) return false;
    seen.add(d.type);
    return true;
  });
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

export function canAddBlock(slots: SectionSlot[], blockDef: SectionDef): boolean {
  if (blockDef.maxInstances === undefined) return true;
  return countBlockInstances(slots, blockDef.type) < blockDef.maxInstances;
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
  'directory:competitors': 'Directory — Competitors',
  'directory:venues': 'Directory — Venues',
};

const DEAD_PAGE_KEYS = new Set(['template:rodeo-hub', 'template:rodeo-edition', 'template:discipline', 'template:category']);

export const ADMIN_VISIBLE_PAGE_KEYS = KNOWN_PAGE_KEYS.filter((k) => !DEAD_PAGE_KEYS.has(k));

export { HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS, DETAIL_TEMPLATE_SECTIONS, DIRECTORY_SECTIONS };

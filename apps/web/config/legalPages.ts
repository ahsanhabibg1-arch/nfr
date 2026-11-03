/**
 * Static publication policy pages (Requirements v2.0 §1 independent identity, §3 Static/legal).
 *
 * Copy is deliberately conservative and describes only behaviour the codebase actually
 * implements. Nothing here asserts a company entity, address, jurisdiction, contact channel,
 * certification or commercial relationship. Every page ships as `pending-owner-review`:
 * it renders with a visible review notice, is `noindex`, and is excluded from the XML
 * sitemap until the owner (and legal counsel where needed) approves the wording and flips
 * `review` to `approved`.
 */

export type LegalReviewStatus = 'pending-owner-review' | 'approved';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalPage {
  slug: string;
  path: string;
  title: string;
  /** Footer / navigation label. */
  label: string;
  description: string;
  review: LegalReviewStatus;
  /** Items the owner must supply or confirm before approval. Shown in the review notice. */
  ownerInputs: string[];
  sections: LegalSection[];
}

export const LEGAL_PAGES: LegalPage[] = [
  {
    slug: 'about',
    path: '/about/',
    title: 'About NFRGuide',
    label: 'About NFRGuide',
    description: 'What NFRGuide is, and what it is not.',
    review: 'pending-owner-review',
    ownerInputs: ['Publisher / owning entity name', 'Editorial team and roles (if they will be listed)'],
    sections: [
      {
        heading: 'An independent publication',
        paragraphs: [
          'NFRGuide is an independent editorial website about the National Finals Rodeo (NFR) and the wider rodeo world. It publishes articles, guides and reference pages for fans.',
          'NFRGuide is not affiliated with, authorized by, endorsed by, or officially connected with the Professional Rodeo Cowboys Association (PRCA), the Women’s Professional Rodeo Association (WPRA), the National Finals Rodeo, Las Vegas Events, any broadcaster, ticket seller or event organizer.',
        ],
      },
      {
        heading: 'What we publish',
        paragraphs: [
          'Articles are the main unit of this site. Pages about events, editions, disciplines, competitors and venues collect related articles and reference information.',
          'Time-sensitive information such as dates, viewing options, tickets and prices can change. Where an article covers it, the article lists its sources. Always confirm details with the official organizer before you make plans or purchases.',
          'NFRGuide does not host or embed live streams and does not sell tickets.',
        ],
      },
    ],
  },
  {
    slug: 'editorial-policy',
    path: '/editorial-policy/',
    title: 'Editorial Policy',
    label: 'Editorial Policy',
    description: 'How NFRGuide articles are prepared, sourced and reviewed.',
    review: 'pending-owner-review',
    ownerInputs: ['Source verification thresholds (Requirements v2.0 §14.3)', 'Who approves publication', 'Use of AI-assisted drafting, if any'],
    sections: [
      {
        heading: 'Sources',
        paragraphs: [
          'Articles list the sources they rely on. We prefer official organizer, governing-body and broadcaster sources for facts such as dates, results, schedules and viewing rights.',
          'If a fact cannot be confirmed from a reliable source, it should not be presented as confirmed.',
        ],
      },
      {
        heading: 'Review before publication',
        paragraphs: [
          'Articles move through a draft and review workflow before they are published. Publication is blocked when required fields, image-rights information or required commercial disclosures are missing.',
        ],
      },
      {
        heading: 'Independence',
        paragraphs: [
          'Advertising and affiliate relationships do not determine editorial coverage. Commercial content is labelled as described in our Affiliate & Advertising Disclosure.',
        ],
      },
    ],
  },
  {
    slug: 'corrections',
    path: '/corrections/',
    title: 'Corrections Policy',
    label: 'Corrections Policy',
    description: 'How NFRGuide handles errors in published articles.',
    review: 'pending-owner-review',
    ownerInputs: ['How readers submit a correction request (contact channel)', 'Wording and placement of correction notices'],
    sections: [
      {
        heading: 'Fixing errors',
        paragraphs: [
          'When a material error in a published article is confirmed, the article is corrected and its updated date changes.',
          'A standard, visible correction notice format has not yet been approved. Until it is, editors note significant corrections within the article text.',
        ],
      },
      {
        heading: 'Requesting a correction',
        paragraphs: [
          'A public channel for correction requests has not been published yet. It will be listed on the Contact page once it is confirmed.',
        ],
      },
    ],
  },
  {
    slug: 'affiliate-disclosure',
    path: '/affiliate-disclosure/',
    title: 'Affiliate & Advertising Disclosure',
    label: 'Affiliate Disclosure',
    description: 'How advertising and affiliate links are identified on NFRGuide.',
    review: 'pending-owner-review',
    ownerInputs: ['Confirm whether any affiliate or advertising programs are active', 'Final disclosure wording (Requirements v2.0 §14.3)'],
    sections: [
      {
        heading: 'Affiliate links',
        paragraphs: [
          'Some articles may include affiliate links. If you buy through one, NFRGuide may earn a commission at no extra cost to you.',
          'Affiliate and paid links are marked with rel="sponsored", and the article that contains them shows a disclosure. Commissions do not determine which products, services or events we cover.',
        ],
      },
      {
        heading: 'Advertising',
        paragraphs: [
          'Any advertising space on the site is labelled “Advertisement” and kept separate from editorial content. No third-party advertising scripts are currently loaded on this site.',
        ],
      },
    ],
  },
  {
    slug: 'privacy',
    path: '/privacy/',
    title: 'Privacy Policy',
    label: 'Privacy Policy',
    description: 'What information NFRGuide processes and why.',
    review: 'pending-owner-review',
    ownerInputs: ['Data controller identity and contact', 'Legal basis and applicable jurisdiction (legal review required)', 'Decision on enabling first-party analytics'],
    sections: [
      {
        heading: 'Readers',
        paragraphs: [
          'NFRGuide does not ask readers to create accounts and does not set advertising or analytics cookies.',
          'The site’s web fonts are loaded from Google Fonts. Your browser therefore connects to Google’s servers when you view a page, and Google receives standard request information such as your IP address.',
        ],
      },
      {
        heading: 'First-party analytics',
        paragraphs: [
          'The site includes optional first-party analytics that is switched off by default. If the site operator enables it, the site records which pages were viewed, search queries entered on the site, and counts of clicks on outbound affiliate links.',
          'Search queries are shortened and have email addresses and long numbers masked before storage. No account, name, email address or IP address is stored with these records. A short-lived fingerprint of the request is used only to ignore duplicate events and is not stored.',
          'The site operator can delete analytics records older than a configurable retention period (180 days by default). This purge is currently run manually from the CMS; it is not yet automatic.',
        ],
      },
      {
        heading: 'Staff accounts',
        paragraphs: [
          'Editors and administrators who sign in to the content management system receive a session cookie that is required for sign-in. Account activity in the CMS is logged for security and audit purposes.',
        ],
      },
    ],
  },
  {
    slug: 'terms',
    path: '/terms/',
    title: 'Terms of Use',
    label: 'Terms of Use',
    description: 'Terms that apply to using NFRGuide.',
    review: 'pending-owner-review',
    ownerInputs: ['Owning entity and governing law (legal review required)', 'Content licensing and reuse terms'],
    sections: [
      {
        heading: 'Informational content',
        paragraphs: [
          'Content on NFRGuide is provided for general information. Event details, viewing options, ticket availability and prices can change, so confirm them with the official organizer or seller.',
        ],
      },
      {
        heading: 'Third-party links',
        paragraphs: [
          'Articles link to websites that NFRGuide does not operate. We are not responsible for the content, availability or practices of those sites.',
        ],
      },
      {
        heading: 'Status of these terms',
        paragraphs: [
          'These terms are a draft and have not yet been finalized. The final version will name the operator of the site and the law that governs these terms.',
        ],
      },
    ],
  },
  {
    slug: 'contact',
    path: '/contact/',
    title: 'Contact',
    label: 'Contact',
    description: 'How to contact NFRGuide.',
    review: 'pending-owner-review',
    ownerInputs: ['Public contact channel (email address or form)', 'Whether a postal address will be published'],
    sections: [
      {
        heading: 'Contact details',
        paragraphs: [
          'A public contact channel for NFRGuide has not been published yet. It will be added here once it is confirmed.',
          'For questions about an event, tickets or broadcasts, contact the official event organizer, ticket seller or broadcaster directly. NFRGuide does not handle tickets or event administration.',
        ],
      },
    ],
  },
];

export function getLegalPage(slug: string): LegalPage | undefined {
  return LEGAL_PAGES.find((p) => p.slug === slug);
}

/** Pages approved for indexing (central indexability policy: drafts stay out of the sitemap). */
export function getIndexableLegalPages(): LegalPage[] {
  return LEGAL_PAGES.filter((p) => p.review === 'approved');
}

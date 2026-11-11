import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Article } from '../types';

/**
 * Stage 08 Task H — the EditorialHero accessibility and crawlability fix.
 *
 * THE DEFECT, found during Stage 07's Task B investigation and reported there
 * rather than fixed, because it changes the public markup of the homepage's
 * most prominent element:
 *
 *   - each secondary story was `<article onClick={...}>` — a div with a click
 *     handler. Not focusable, not reachable by keyboard, not announced as a
 *     link, and with NO `href`, so invisible to crawlers and impossible to open
 *     in a new tab or middle-click;
 *   - the lead story's call to action was a `<button>` doing client-side
 *     navigation, with the same consequences.
 *
 * Every test below renders the real component and asserts on the real HTML,
 * because "there is an href in the output" is precisely the claim that failed
 * before and precisely what a source-text assertion cannot check.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const { EditorialHero } = await import('../components/sections/EditorialHero');

function article(id: string, slug: string, title: string): Article {
  return {
    id,
    slug,
    title,
    deck: `${title} deck`,
    category: 'Competition',
    subcategory: 'Bull Riding',
    readTime: '6 min read',
    heroImage: `/img/${slug}.jpg`,
    imageCredit: 'Credit',
    imageAltText: `${title} alt`,
    author: { name: 'Reporter Name', role: 'Staff Writer' },
  } as unknown as Article;
}

const LEAD = article('lead-1', 'nfr-round-one-recap', 'NFR Round One Recap');
const SECONDARY = [
  article('sec-1', 'barrel-racing-standings', 'Barrel Racing Standings'),
  article('sec-2', 'bull-riding-preview', 'Bull Riding Preview'),
];

function render(secondary: Article[] = SECONDARY, props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    React.createElement(EditorialHero, {
      leadArticle: LEAD,
      secondaryStories: secondary,
      ...props,
    } as never),
  );
}

/**
 * Every ANCHOR href in the rendered output, in order.
 *
 * Scoped to `<a>` deliberately. React's image handling also emits
 * `<link rel="preload" as="image" href="...">` tags, so a bare `href="..."`
 * match counts each card twice and the counts below would be meaningless.
 *
 * NOTE ON THE TRAILING SLASH. `ROUTES.ARTICLE` produces `/articles/<slug>/`,
 * and that is what the browser requests. `next/link` normalises the trailing
 * slash away when rendered outside the App Router, which is the environment
 * here, so the assertions below use the unslashed form. The slashed form is
 * verified where it matters — in Chromium, against the running server, in
 * `e2e/stage08-publishing.spec.ts`.
 */
function hrefs(html: string): string[] {
  return [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);
}

/** Every heading level in the rendered output, in document order. */
function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
}

/* ── 0. Heading hierarchy (Stage 09 continuation) ─────────────────── */

describe('Stage 09 continuation — the hero does not skip a heading level', () => {
  /**
   * THE DEFECT, found by running the full Chromium suite (Stage 08's gate ran
   * only the Stage 06-08 specs, so `e2e/a11y.spec.ts` had never been executed
   * against this markup): the lead story headline is the homepage's only `h1`
   * and each secondary story was an `h3`, with no `h2` between them. That is a
   * skipped level — WCAG 2.4.6 / 1.3.1 — and it made the homepage announce a
   * subsection that does not exist to a screen-reader user navigating by
   * heading. `e2e/a11y.spec.ts › home (/)` failed with "h1→h3".
   *
   * Fixed by emitting `h2`, which is also what the sibling section headings on
   * the page use. Asserted on the rendered HTML, in document order, because the
   * claim is about the delivered markup.
   */
  it('the lead headline is the only h1', () => {
    expect(headingLevels(render()).filter((l) => l === 1)).toHaveLength(1);
  });

  it('REGRESSION: no heading level is skipped (h1→h3 was the a11y failure)', () => {
    const levels = headingLevels(render());
    const jumps: string[] = [];
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) jumps.push(`h${levels[i - 1]}→h${levels[i]}`);
    }
    expect(jumps, 'the homepage hero must not skip a heading level').toEqual([]);
  });

  it('each secondary story headline is an h2, one level below the page headline', () => {
    expect(headingLevels(render())).toEqual([1, 2, 2]);
    // And the heading is still the card link's accessible name (Stage 08 Task H).
    expect(render()).toMatch(/<h2[^>]*>\s*Barrel Racing Standings\s*<\/h2>/);
  });

  it('holds when there is only one secondary story, and when there are none', () => {
    expect(headingLevels(render([SECONDARY[0]]))).toEqual([1, 2]);
    expect(headingLevels(render([]))).toEqual([1]);
  });
});

/* ── 1. Real hrefs exist in the public HTML ───────────────────────── */

describe('Stage 08 Task H — every hero article has a crawlable href', () => {
  it('the lead article has a real href', () => {
    const html = render();
    expect(hrefs(html)).toContain('/articles/nfr-round-one-recap');
  });

  it('every secondary story has a real href', () => {
    const html = render();
    const list = hrefs(html);
    expect(list).toContain('/articles/barrel-racing-standings');
    expect(list).toContain('/articles/bull-riding-preview');
  });

  it('REGRESSION: there is no click-handler-only navigation left', () => {
    /**
     * The shape of the old defect. `renderToStaticMarkup` does not emit React
     * event handlers at all, so a card that navigated only via `onClick`
     * produced markup with no `href` anywhere — which is exactly why a crawler
     * saw nothing and a keyboard user could reach nothing.
     */
    const html = render();
    expect(hrefs(html)).toHaveLength(3); // lead CTA + two secondary cards
  });

  it('renders no <button> for navigation', () => {
    const html = render();
    expect(html).not.toContain('<button');
  });

  it('scales to the registry maximum of four secondary stories', () => {
    const four = [...SECONDARY, article('sec-3', 'three', 'Three'), article('sec-4', 'four', 'Four')];
    expect(hrefs(render(four))).toHaveLength(5);
  });

  it('renders no secondary links when there are no secondary stories', () => {
    expect(hrefs(render([]))).toEqual(['/articles/nfr-round-one-recap']);
  });
});

/* ── 2. One link per article, no nested interactives ──────────────── */

describe('Stage 08 Task H — link structure is valid and not duplicated', () => {
  it('links each article exactly once', () => {
    // The directive forbids duplicating the same article link unnecessarily:
    // one crawlable href per article, not one per image + title + affordance.
    const list = hrefs(render());
    expect(new Set(list).size).toBe(list.length);
  });

  it('nests no interactive element inside another', () => {
    /**
     * Invalid HTML and a double focus stop. Checked structurally on the real
     * output: no `<a>` may appear between an opening `<a` and its `</a>`.
     */
    const html = render();
    const anchors = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThan(0);
    for (const inner of anchors) {
      expect(inner, 'no anchor inside an anchor').not.toMatch(/<a\b/);
      expect(inner, 'no button inside an anchor').not.toMatch(/<button\b/);
    }
  });

  it('keeps the secondary card inside a semantic <article>', () => {
    const html = render();
    expect(html).toContain('<article');
    // The anchor is inside the article, not the other way round, so the card
    // remains a semantic content unit.
    expect(html).toMatch(/<article[^>]*>\s*<a\b/);
  });

  it('keeps exactly one h1 — the lead headline', () => {
    const html = render();
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).toContain('NFR Round One Recap');
  });
});

/* ── 3. Accessible names and keyboard affordances ─────────────────── */

describe('Stage 08 Task H — accessible names and focus', () => {
  it('gives the lead CTA an accessible name that names the article', () => {
    // Without this, several "Read Full Article" links on one page are
    // indistinguishable in a screen reader's link list.
    const html = render();
    expect(html).toContain('aria-label="Read Full Article: NFR Round One Recap"');
  });

  it('includes the Builder CTA override in the accessible name', () => {
    const html = render(SECONDARY, { ctaText: 'See the recap' });
    expect(html).toContain('aria-label="See the recap: NFR Round One Recap"');
    expect(html).toContain('See the recap');
  });

  it('gives each secondary link its title as its accessible text', () => {
    const html = render();
    // The card anchor wraps the heading, so the link's name is the article title.
    const cardAnchor = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .find((m) => m[1] === '/articles/barrel-racing-standings');
    expect(cardAnchor, 'the secondary card must be an anchor').toBeDefined();
    expect(cardAnchor![2]).toContain('Barrel Racing Standings');
  });

  it('hides the decorative Read affordance from assistive technology', () => {
    // It duplicates the link name and would be announced as a second label.
    const html = render();
    expect(html).toMatch(/aria-hidden="true"[^>]*>Read/);
  });

  it('declares a visible focus ring on every hero link', () => {
    const html = render();
    const anchorTags = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    expect(anchorTags.length).toBe(3);
    for (const tag of anchorTags) {
      expect(tag, 'a keyboard user must be able to see where they are').toContain('focus-visible:ring-2');
    }
  });
});

/* ── 4. Nothing else about the hero changed ───────────────────────── */

describe('Stage 08 Task H — the fix is a correction, not a redesign', () => {
  it('preserves the lead headline, deck, byline and category', () => {
    const html = render();
    expect(html).toContain('NFR Round One Recap');
    expect(html).toContain('NFR Round One Recap deck');
    expect(html).toContain('Reporter Name');
    expect(html).toContain('Staff Writer');
    expect(html).toContain('Competition');
    expect(html).toContain('Bull Riding');
    expect(html).toContain('6 min read');
  });

  it('preserves the hero image and its alt text', () => {
    const html = render();
    expect(html).toContain('/img/nfr-round-one-recap.jpg');
    expect(html).toContain('NFR Round One Recap alt');
  });

  it('preserves the Builder image override and its alt', () => {
    const html = render(SECONDARY, { heroImageUrl: '/img/override.jpg', heroImageAlt: 'Override alt' });
    expect(html).toContain('/img/override.jpg');
    expect(html).toContain('Override alt');
  });

  it('preserves the kicker override', () => {
    expect(render(SECONDARY, { kicker: 'Tonight at the Thomas & Mack' })).toContain('Tonight at the Thomas &amp; Mack');
  });

  it('preserves the image credit, and still suppresses it for an override image', () => {
    expect(render()).toContain('Credit');
    expect(render(SECONDARY, { heroImageUrl: '/img/override.jpg' })).not.toContain('Photo: Credit');
  });

  it('preserves the card layout classes, so the visual result is unchanged', () => {
    const html = render();
    // The classes that produce the card's shape moved onto the anchor; the
    // `group` class moved to the <article> so every `group-hover:` rule fires.
    expect(html).toContain('flex flex-col sm:flex-row gap-4 items-start');
    expect(html).toContain('bg-[#1E293B]/60');
    expect(html).toContain('group-hover:scale-105');
    expect(html).toContain('<article class="group"');
  });

  it('renders nothing extra when the lead has no secondary stories', () => {
    const html = render([]);
    expect(html).not.toContain('<article');
  });
});

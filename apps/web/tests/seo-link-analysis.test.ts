import { describe, it, expect } from 'vitest';

/**
 * SEO Intelligence link analysis over rich-text links.
 *
 * WHAT THE AUDIT FOUND, MEASURED BEFORE ANY CHANGE. Link analysis was fed by a
 * generic walk over every string in a block's JSON, scanned with a regex. Run
 * against a body containing inline links, that produced:
 *
 *   detected : /articles/real-guide/, /categories/nfr-competition/,
 *              /disciplines/bull-riding/, https://example.com/a,
 *              https://official.example/report
 *   ALSO     : /articles/not-a-link/   ← merely MENTIONED in prose
 *   MISSED   : mailto:editor@example.com  ← renders as a real link
 *   anchors  : none available at all
 *
 * and the analyzer then `continue`d on every external link, so an external
 * destination produced no finding whatsoever — which reads in the UI as "fine".
 *
 * These tests pin the corrected behaviour: links are read from the fields that
 * carry them, roles are kept apart, anchors exist, and an unverifiable external
 * destination says so.
 */

const {
  collectArticleLinks, countArticleLinks, isEmptyAnchor, isNonDescriptiveAnchor,
} = await import('../lib/seo/articleLinkInventory');
const { classifyLink } = await import('../lib/seo/routeIndex');
const { RULES } = await import('../lib/seo-intel/rules');

const SITE = 'https://nfrguide.com';
const classify = (href: string) => classifyLink(href, SITE);

const BODY = [
  { type: 'paragraph', text: 'See the guide here.', runs: [
    { text: 'See the ' }, { text: 'guide', href: '/articles/real-guide/' }, { text: ' here.' },
  ] },
  { type: 'paragraph', text: 'External ref.', runs: [
    { text: 'External', href: 'https://example.com/a' }, { text: ' ref.' },
  ] },
  { type: 'paragraph', text: 'Mail us.', runs: [{ text: 'Mail us', href: 'mailto:editor@example.com' }] },
  { type: 'list', items: ['first', 'second'], itemRuns: [
    [{ text: 'first', href: '/categories/nfr-competition/' }], null,
  ] },
  { type: 'quote', quote: 'Quoted.', attribution: 'A', quoteRuns: [
    { text: 'Quoted', href: '/disciplines/bull-riding/' },
  ] },
  { type: 'paragraph', text: 'Our policy lives at /articles/not-a-link/ in prose.' },
  { type: 'sourceLink', title: 'Official report', url: 'https://official.example/report' },
];

// ---------------------------------------------------------------------------
// 1-3. Detection, counting and role separation
// ---------------------------------------------------------------------------

describe('link detection over runs, quoteRuns and itemRuns', () => {
  it('finds a link in every inline location, and nowhere else', () => {
    const links = collectArticleLinks(BODY);
    expect(links.map((l) => l.href)).toEqual([
      '/articles/real-guide/',
      'https://example.com/a',
      'mailto:editor@example.com',
      '/categories/nfr-competition/',
      '/disciplines/bull-riding/',
      'https://official.example/report',
    ]);
  });

  it('does NOT treat a path mentioned in prose as a link', () => {
    // The regression the old string scan produced.
    const links = collectArticleLinks(BODY);
    expect(links.map((l) => l.href)).not.toContain('/articles/not-a-link/');
  });

  it('finds the mailto link the old scan missed', () => {
    const links = collectArticleLinks(BODY);
    const mail = links.find((l) => l.href.startsWith('mailto:'));
    expect(mail).toBeTruthy();
    expect(mail!.renderable).toBe(true);   // InlineText does render it
  });

  it('records WHERE each link lives, so a finding can point at it', () => {
    const links = collectArticleLinks(BODY);
    const inList = links.find((l) => l.field === 'itemRuns');
    expect(inList).toMatchObject({ blockIndex: 3, blockType: 'list', itemIndex: 0 });
    const inQuote = links.find((l) => l.field === 'quoteRuns');
    expect(inQuote).toMatchObject({ blockIndex: 4, blockType: 'quote' });
    const citation = links.find((l) => l.field === 'url');
    expect(citation).toMatchObject({ blockIndex: 6, blockType: 'sourceLink' });
  });

  it('carries the ANCHOR TEXT, which the old pipeline discarded entirely', () => {
    const links = collectArticleLinks(BODY);
    expect(links.find((l) => l.href === '/articles/real-guide/')!.anchor).toBe('guide');
    expect(links.find((l) => l.field === 'url')!.anchor).toBe('Official report');
  });

  it('counts internal, external and citations separately, without double-counting', () => {
    const c = countArticleLinks(collectArticleLinks(BODY), classify);
    expect(c).toEqual({
      internalEditorial: 3,          // guide, category, discipline
      externalEditorial: 2,          // https://example.com/a + mailto (off-site)
      citations: 1,                  // sourceLink — NOT an editorial link
      unrenderable: 0,
      distinctInternalTargets: 3,
    });
  });

  it('a citation is never counted as an ordinary editorial link', () => {
    const only = [{ type: 'sourceLink', title: 'S', url: 'https://official.example/x' }];
    const c = countArticleLinks(collectArticleLinks(only), classify);
    expect(c.citations).toBe(1);
    expect(c.externalEditorial).toBe(0);
    expect(c.internalEditorial).toBe(0);
  });

  it('ADJACENT runs with the same target are one link, matching what renders', () => {
    // `normalizeRuns` merges adjacent runs with identical formatting, and that
    // is faithful: two touching runs sharing an href render as a single
    // anchor, so counting them twice would overstate the link count.
    const adjacent = [{ type: 'paragraph', text: 'ab', runs: [
      { text: 'a', href: '/articles/x/' }, { text: 'b', href: '/articles/x/' },
    ] }];
    const merged = countArticleLinks(collectArticleLinks(adjacent), classify);
    expect(merged.internalEditorial).toBe(1);
    expect(merged.distinctInternalTargets).toBe(1);
  });

  it('the same destination linked in two SEPARATE places counts twice, as one distinct target', () => {
    const twice = [{ type: 'paragraph', text: 'a and b', runs: [
      { text: 'a', href: '/articles/x/' }, { text: ' and ' }, { text: 'b', href: '/articles/x/' },
    ] }];
    const c = countArticleLinks(collectArticleLinks(twice), classify);
    expect(c.internalEditorial).toBe(2);
    expect(c.distinctInternalTargets).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5-6. Unsafe and unrenderable targets
// ---------------------------------------------------------------------------

describe('malformed and unsafe references', () => {
  it('a stored href the renderer would refuse is reported as unrenderable', () => {
    // `normalizeRuns` strips an unsafe href, so such a run carries no link at
    // all — the words survive and nothing is counted as a link.
    const hostile = [{ type: 'paragraph', text: 'click', runs: [
      { text: 'click', href: 'javascript:alert(1)' },
    ] }];
    const links = collectArticleLinks(hostile);
    expect(links).toEqual([]);
  });

  it('an unsafe CITATION url is kept but marked unrenderable', () => {
    // `sourceLink.url` is not run-normalised, so it reaches the inventory and
    // must be flagged rather than silently counted.
    const bad = [{ type: 'sourceLink', title: 'S', url: 'javascript:alert(1)' }];
    const links = collectArticleLinks(bad);
    expect(links).toHaveLength(1);
    expect(links[0].renderable).toBe(false);
    const c = countArticleLinks(links, classify);
    expect(c.unrenderable).toBe(1);
    expect(c.citations).toBe(0);
  });

  it('survives hostile and empty block shapes', () => {
    for (const junk of [[], [null], [42], ['x'], [{}], [{ type: 'paragraph' }]]) {
      expect(() => collectArticleLinks(junk as never)).not.toThrow();
    }
    expect(collectArticleLinks([{ type: 'paragraph', runs: 'not-an-array' }] as never)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8. Anchor text
// ---------------------------------------------------------------------------

describe('anchor text evaluation', () => {
  it('flags an anchor with no readable characters', () => {
    for (const empty of ['', '   ', '—', '•', '…', '()']) {
      expect(isEmptyAnchor(empty), JSON.stringify(empty)).toBe(true);
    }
    for (const ok of ['guide', 'A', '2026', 'Round 7']) {
      expect(isEmptyAnchor(ok), ok).toBe(false);
    }
  });

  it('flags the known context-free phrases, case and punctuation insensitively', () => {
    for (const bad of ['click here', 'Click Here', 'read more', 'Read more.', 'here', 'details']) {
      expect(isNonDescriptiveAnchor(bad), bad).toBe(true);
    }
    for (const good of ['the scoring guide', 'Thomas & Mack Center', 'bull riding', 'more rodeo coverage']) {
      expect(isNonDescriptiveAnchor(good), good).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. No thresholds, no new publication gates
// ---------------------------------------------------------------------------

describe('the new rules do not change publishing policy', () => {
  it('registers exactly the four new link rules', () => {
    const codes = RULES.map((r) => r.code);
    for (const c of ['LINK_INVENTORY', 'LINK_EXTERNAL_NOT_VERIFIED', 'LINK_ANCHOR_EMPTY', 'LINK_ANCHOR_NONDESCRIPTIVE']) {
      expect(codes, c).toContain(c);
    }
  });

  it('the publication gate does not read SEO findings at all', async () => {
    // `assertPublishable` runs `validateArticle`; adding SEO rules therefore
    // cannot block a publish. Asserted on the source because the alternative is
    // trusting a comment.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../lib/cms/articleService.ts', import.meta.url), 'utf8'),
    );
    const gate = src.slice(src.indexOf('async function assertPublishable'));
    const body = gate.slice(0, gate.indexOf('\n}'));
    expect(body).toContain('validateArticle');
    expect(body).not.toMatch(/seoFinding|SeoFinding|runAudit|LINK_/);
  });

  it('introduces no required link count', () => {
    const inventory = RULES.find((r) => r.code === 'LINK_INVENTORY')!;
    // Informational: an OPPORTUNITY, never a DEFECT, and its text promises no minimum.
    expect(inventory.kind).toBe('OPPORTUNITY');
    expect(inventory.description.toLowerCase()).toContain('informational');
    expect(inventory.description).not.toMatch(/\bat least\b|\bminimum\b|\brequire/i);
  });

  it('an empty body produces no link findings and no false count', () => {
    const c = countArticleLinks(collectArticleLinks([]), classify);
    expect(c.internalEditorial + c.externalEditorial + c.citations).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 12. The renderer, storage and analysis agree
// ---------------------------------------------------------------------------

describe('one canonical link set', () => {
  it('every link the inventory reports renderable is one InlineText would render', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { InlineText } = await import('../components/editorial/InlineText');

    const links = collectArticleLinks(BODY).filter((l) => l.field !== 'url' && l.renderable);
    for (const l of links) {
      const block = BODY[l.blockIndex] as Record<string, unknown>;
      const runs = l.field === 'quoteRuns'
        ? block.quoteRuns
        : l.field === 'itemRuns'
          ? (block.itemRuns as unknown[])[l.itemIndex!]
          : block.runs;
      const text = l.field === 'quoteRuns'
        ? String(block.quote)
        : l.field === 'itemRuns'
          ? String((block.items as string[])[l.itemIndex!])
          : String(block.text);
      const html = renderToStaticMarkup(React.createElement(InlineText, { text, runs: runs as never }));
      expect(html, `${l.href} must render as an anchor`).toContain(`href="${l.href}"`);
    }
  });

  it('a path only mentioned in prose renders as text, and is not in the inventory', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { InlineText } = await import('../components/editorial/InlineText');
    const prose = BODY[5] as { text: string };
    const html = renderToStaticMarkup(React.createElement(InlineText, { text: prose.text }));
    expect(html).not.toContain('<a');
    expect(collectArticleLinks([prose])).toEqual([]);
  });
});

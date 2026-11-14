import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Article, ContentBlock } from '../types';

/**
 * The four richer block types: questions and answers, notes, galleries and
 * approved video embeds.
 *
 * THE EMBED IS THE PART THAT HAS TO BE RIGHT. An `<iframe>` runs third-party
 * script in the reader's browser, so the set of origins one may come from is a
 * decision for code, not for content. The design is that an author supplies a
 * provider from a closed list and an opaque id, and the site builds the URL —
 * which means the tests that matter most here are the ones that try to get a
 * foreign origin accepted: a look-alike host, a credentialed URL, a
 * `javascript:` scheme, a path that merely contains a provider's name.
 *
 * The rest cover what a reader and a screen reader actually receive: a `dl` for
 * a question set, per-image alt text in a gallery, a titled frame for a video,
 * and nothing at all for a block the author has not finished.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/articles/x/',
  useSearchParams: () => new URLSearchParams(),
}));

const {
  VIDEO_PROVIDERS, isVideoId, isVideoProvider, parseVideoReference, videoEmbedUrl, videoWatchUrl,
} = await import('../lib/content/articleEmbeds');
const { articleBlockSchema } = await import('../lib/content/articleBlockSchema');
const { ArticleBody } = await import('../components/editorial/ArticleBody');

function publish(blocks: ContentBlock[]): string {
  const article = {
    id: 'a1', slug: 'x', title: 'T', deck: '', content: [], structuredBody: blocks,
    category: 'Rodeo', readTime: '1 min', publishedAt: '2026-01-01', heroImage: '', imageCredit: '',
    author: { id: 'au', name: 'A', slug: 'a', role: 'Staff', bio: '', avatar: '' },
  } as unknown as Article;
  return renderToStaticMarkup(React.createElement(ArticleBody, { article }));
}

// ---------------------------------------------------------------------------
// Video embeds: the security boundary
// ---------------------------------------------------------------------------

describe('the approved embed vocabulary', () => {
  it('approves exactly two providers', () => {
    expect([...VIDEO_PROVIDERS]).toEqual(['youtube', 'vimeo']);
    expect(isVideoProvider('dailymotion')).toBe(false);
    expect(isVideoProvider('YOUTUBE')).toBe(false);
  });

  it('accepts only each provider\'s own id shape', () => {
    expect(isVideoId('youtube', 'dQw4w9WgXcQ')).toBe(true);
    expect(isVideoId('youtube', 'tooshort')).toBe(false);
    expect(isVideoId('youtube', 'dQw4w9WgXcQextra')).toBe(false);
    // A slash or a dot in an id would let it climb out of the embed path.
    expect(isVideoId('youtube', '../../evil1')).toBe(false);
    expect(isVideoId('vimeo', '123456789')).toBe(true);
    expect(isVideoId('vimeo', '12')).toBe(false);
    expect(isVideoId('vimeo', '123456789a')).toBe(false);
    expect(isVideoId('unknown', 'dQw4w9WgXcQ')).toBe(false);
  });

  it('builds the embed URL itself, on the no-cookie host', () => {
    expect(videoEmbedUrl('youtube', 'dQw4w9WgXcQ'))
      .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('vimeo', '123456789'))
      .toBe('https://player.vimeo.com/video/123456789');
  });

  it('returns null rather than a guess for anything unrecognised', () => {
    expect(videoEmbedUrl('youtube', '')).toBeNull();
    expect(videoEmbedUrl('youtube', 'not an id')).toBeNull();
    expect(videoEmbedUrl('evil', 'dQw4w9WgXcQ')).toBeNull();
    expect(videoWatchUrl('youtube', 'nope')).toBeNull();
  });
});

describe('parsing a pasted video link', () => {
  it('reads the common YouTube and Vimeo forms', () => {
    const cases: [string, string, string][] = [
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
      ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s', 'youtube', 'dQw4w9WgXcQ'],
      ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
      ['https://youtu.be/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
      ['https://vimeo.com/123456789', 'vimeo', '123456789'],
      ['https://player.vimeo.com/video/123456789', 'vimeo', '123456789'],
      ['  https://vimeo.com/123456789  ', 'vimeo', '123456789'],
    ];
    for (const [input, provider, id] of cases) {
      expect(parseVideoReference(input), input).toEqual({ provider, id });
    }
  });

  it('accepts a bare id the author already has', () => {
    expect(parseVideoReference('dQw4w9WgXcQ')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(parseVideoReference('123456789')).toEqual({ provider: 'vimeo', id: '123456789' });
  });

  it('REFUSES a host that merely looks like an approved one', () => {
    /*
      THE CASE THAT MATTERS.

      Every one of these contains an approved provider's name, and a parser
      that matched by substring, `endsWith` on a bare domain, or a regular
      expression would accept at least one of them — putting an attacker's
      origin into an iframe on the article page. The host is compared for
      equality after `URL` parsing, so all of them are refused.
    */
    for (const bad of [
      'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
      'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
      'https://evil.test/youtube.com/watch?v=dQw4w9WgXcQ',
      'https://evil.test/?u=https://youtube.com/watch?v=dQw4w9WgXcQ',
      'https://vimeo.com.evil.test/123456789',
      'https://evil.test#youtube.com/watch?v=dQw4w9WgXcQ',
      'https://user:pass@evil.test/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(parseVideoReference(bad), bad).toBeNull();
    }
  });

  it('REFUSES a scheme that is not http(s)', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'vbscript:msgbox(1)',
    ]) {
      expect(parseVideoReference(bad), bad).toBeNull();
    }
  });

  it('refuses an approved host with no usable id', () => {
    for (const bad of [
      'https://www.youtube.com/',
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/channel/UCsomething',
      'https://vimeo.com/channels/staffpicks',
      'https://vimeo.com/',
      '',
      '   ',
    ]) {
      expect(parseVideoReference(bad), bad).toBeNull();
    }
  });
});

describe('the video block', () => {
  it('refuses a malformed id at the save boundary', () => {
    expect(() => articleBlockSchema.parse({
      type: 'video', provider: 'youtube', videoId: '../../evil', title: 'Nope',
    })).toThrow();
    expect(() => articleBlockSchema.parse({
      type: 'video', provider: 'dailymotion', videoId: '123456789', title: 'Nope',
    })).toThrow();
  });

  it('accepts an EMPTY id, because that is an unfinished block', () => {
    // The same state a freshly inserted image block is in: insertable
    // mid-sentence and completable later, without making the article
    // unsaveable in the meantime.
    expect(() => articleBlockSchema.parse({
      type: 'video', provider: 'youtube', videoId: '', title: '',
    })).not.toThrow();
  });

  it('publishes a titled, sandboxed frame built from the provider and id', () => {
    const html = publish([
      { type: 'video', provider: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'Bull riding final round' },
    ]);
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    // A frame with no accessible name is announced as "frame" and nothing else.
    expect(html).toContain('title="Bull riding final round"');
    expect(html).toContain('sandbox=');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    // And a way to watch it at the source.
    expect(html).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('publishes NOTHING for an unfinished video, and a note for a broken one', () => {
    const unfinished = publish([{ type: 'video', provider: 'youtube', videoId: '', title: '' }]);
    expect(unfinished).not.toContain('<iframe');
    expect(unfinished).not.toContain('could not be displayed');

    // Data that bypassed the schema (a bad import, a direct database edit)
    // must not reach an iframe either: the renderer re-checks.
    const broken = publish([
      { type: 'video', provider: 'youtube', videoId: 'javascript:1' } as unknown as ContentBlock,
    ]);
    expect(broken).not.toContain('<iframe');
    expect(broken).toContain('could not be displayed');
  });
});

// ---------------------------------------------------------------------------
// Questions and answers
// ---------------------------------------------------------------------------

describe('the question-and-answer block', () => {
  const faq: ContentBlock = {
    type: 'faq',
    title: 'Entry questions',
    items: [
      { question: 'When do entries close?', answer: 'Thirty days before the first performance.' },
      {
        question: 'Can I enter two events?',
        answer: 'Yes, see the rule book.',
        answerRuns: [{ text: 'Yes, see the ' }, { text: 'rule book', href: '/articles/rules/' }, { text: '.' }],
      },
    ],
  };

  it('round-trips through the save boundary with its answer formatting', () => {
    const parsed = articleBlockSchema.parse(faq);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(faq);
  });

  it('publishes as a description list, so the pairing is announced', () => {
    const html = publish([faq]);
    expect(html).toContain('<dl');
    expect(html).toContain('<dt');
    expect(html).toContain('When do entries close?');
    expect(html).toContain('Thirty days before the first performance.');
  });

  it('does NOT publish its questions as headings', () => {
    // A heading would join the article's outline and its contents list beside
    // real sections, which is not where a question belongs.
    const html = publish([faq]);
    expect(html).not.toMatch(/<h[23][^>]*>When do entries close\?/);
  });

  it('publishes a link inside an answer', () => {
    const html = publish([faq]);
    expect(html).toContain('href="/articles/rules/"');
  });
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

describe('the notes block', () => {
  const notes: ContentBlock = {
    type: 'footnotes',
    items: [
      { text: 'PRCA rule book, 2026 edition.' },
      {
        text: 'See the scoring guide.',
        runs: [{ text: 'See the ' }, { text: 'scoring guide', href: '/articles/scoring/' }, { text: '.' }],
      },
    ],
  };

  it('publishes an ordered list, so the browser owns the numbering', () => {
    const html = publish([notes]);
    expect(html).toContain('<ol');
    expect(html).toContain('PRCA rule book, 2026 edition.');
    expect(html).toContain('href="/articles/scoring/"');
    // The default heading, when the author supplies none.
    expect(html).toContain('Notes');
  });

  it('keeps a custom heading when one is given', () => {
    const html = publish([{ ...notes, title: 'Sources and notes' } as ContentBlock]);
    expect(html).toContain('Sources and notes');
  });
});

// ---------------------------------------------------------------------------
// Galleries
// ---------------------------------------------------------------------------

describe('the gallery block', () => {
  const gallery: ContentBlock = {
    type: 'gallery',
    layout: 'grid',
    caption: 'Finals week in Las Vegas',
    images: [
      { src: '/assets/a.jpg', alt: 'A bull rider leaving the chute', credit: 'Staff' },
      { src: '/assets/b.jpg', alt: 'A barrel racer turning the first barrel', caption: 'Round two' },
    ],
  };

  it('round-trips through the save boundary', () => {
    const parsed = articleBlockSchema.parse(gallery);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(gallery);
  });

  it('publishes each image with its OWN alt text', () => {
    // A reader using a screen reader meets each image separately; one caption
    // for the set tells them nothing about any individual photograph.
    const html = publish([gallery]);
    expect(html).toContain('A bull rider leaving the chute');
    expect(html).toContain('A barrel racer turning the first barrel');
    expect(html).toContain('Finals week in Las Vegas');
  });

  it('publishes nothing for an empty gallery', () => {
    const html = publish([{ type: 'gallery', images: [] }]);
    expect(html).not.toContain('<figure');
  });

  it('is accepted empty by the schema, so it can be placed then filled', () => {
    expect(() => articleBlockSchema.parse({ type: 'gallery', images: [] })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// The new types and the rest of the system
// ---------------------------------------------------------------------------

describe('the new types and the existing machinery', () => {
  it('are all in the renderer\'s declared vocabulary', async () => {
    const { ARTICLE_BLOCK_TYPES } = await import('../lib/content/articleBlockSchema');
    for (const t of ['faq', 'footnotes', 'gallery', 'video']) {
      expect(ARTICLE_BLOCK_TYPES as readonly string[]).toContain(t);
    }
  });

  it('travel through the rich-text editor untouched', async () => {
    const { blocksToDoc, docToBlocks, isProseBlock } = await import('../lib/content/articleRichTextAdapter');
    const blocks: ContentBlock[] = [
      { type: 'faq', items: [{ question: 'Q', answer: 'A' }] },
      { type: 'footnotes', items: [{ text: 'N' }] },
      { type: 'gallery', images: [{ src: '/a.jpg', alt: 'A' }] },
      { type: 'video', provider: 'vimeo', videoId: '123456789', title: 'V' },
    ];
    for (const b of blocks) expect(isProseBlock(b), b.type).toBe(false);
    expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks);
  });

  it('contribute their inline links to the SEO link inventory, with provenance', async () => {
    const { collectArticleLinks } = await import('../lib/seo/articleLinkInventory');
    const links = collectArticleLinks([
      {
        type: 'faq',
        items: [
          { question: 'Q1', answer: 'No link here.' },
          {
            question: 'Q2', answer: 'See the guide.',
            answerRuns: [{ text: 'See the ' }, { text: 'guide', href: '/articles/guide/' }, { text: '.' }],
          },
        ],
      },
      {
        type: 'footnotes',
        items: [{
          text: 'Per the rule book.',
          runs: [{ text: 'Per the ' }, { text: 'rule book', href: '/articles/rules/' }, { text: '.' }],
        }],
      },
    ]);

    // A link an author wrote into an answer renders on the page, so it must be
    // counted and anchor-audited like any other — and the finding has to be
    // able to say WHICH answer.
    const answer = links.find((l) => l.href === '/articles/guide/');
    expect(answer, 'a link inside an answer must be inventoried').toBeTruthy();
    expect(answer?.field).toBe('answerRuns');
    expect(answer?.itemIndex).toBe(1);
    expect(answer?.anchor).toBe('guide');
    expect(answer?.role).toBe('editorial');

    const note = links.find((l) => l.href === '/articles/rules/');
    expect(note?.field).toBe('noteRuns');
    expect(note?.itemIndex).toBe(0);
    expect(note?.anchor).toBe('rule book');
  });
});

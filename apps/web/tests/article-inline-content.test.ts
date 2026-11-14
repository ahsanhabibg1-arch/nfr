import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrismaClient } from '@prisma/client';

/**
 * Inline article formatting — the content model, its safety boundary and its
 * backward compatibility.
 *
 * WHY THIS FILE EXISTS. A body paragraph used to be `{ text: string }` rendered
 * as a React child, so bold, italic, underline and inline links had nowhere to
 * live. `runs` adds them while keeping `text` as the authoritative plain-text
 * projection, which is what lets the SEO word count, read time and every
 * existing consumer carry on reading `text` untouched.
 *
 * The three things that must hold, and are each tested below:
 *
 *   1. SAFETY. No markup is injected. A `javascript:` target can neither be
 *      stored nor rendered, and the words around it survive.
 *   2. PROJECTION. `text` always equals the concatenation of the runs. A block
 *      whose runs disagree loses its formatting, never its text.
 *   3. COMPATIBILITY. Every block already in the database still validates, and
 *      a block with no runs renders byte-identically to before.
 */

const {
  INLINE_MARKS, isSafeHref, normalizeRuns, runsToPlainText, plainTextToRuns,
  runsCarryFormatting, reconcileInline,
} = await import('../lib/content/articleInline');
const { articleBlockSchema, reconcileBlockInline, ARTICLE_BLOCK_TYPES } =
  await import('../lib/content/articleBlockSchema');
const { InlineText } = await import('../components/editorial/InlineText');

const render = (text: string, runs?: unknown) =>
  renderToStaticMarkup(React.createElement(InlineText, { text, runs: runs as never }));

// ---------------------------------------------------------------------------
// 1. Safety: link targets
// ---------------------------------------------------------------------------

describe('link target safety', () => {
  it('accepts site-relative paths, fragments, https and mailto', () => {
    for (const ok of [
      '/articles/some-slug/', '/categories/x/?page=2', '/competition/#scoring',
      '#section', 'https://example.com/a', 'https://example.com', 'mailto:editor@example.com',
    ]) {
      expect(isSafeHref(ok), ok).toBe(true);
    }
  });

  it('refuses every scheme that can execute, and plain http', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java\nscript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'http://example.com',          // HTTPS-only site: a downgrade, not a link
      '',
      '   ',
      null, undefined, 42, {},
      `/${'a'.repeat(3000)}`,        // over the length cap
    ]) {
      expect(isSafeHref(bad as never), String(bad).slice(0, 40)).toBe(false);
    }
  });

  it('a relative path carrying a control character is refused', () => {
    expect(isSafeHref('/articles/\u0000evil/')).toBe(false);
    expect(isSafeHref('/articles/\u001fevil/')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Normalisation
// ---------------------------------------------------------------------------

describe('run normalisation', () => {
  it('drops an unsafe href but KEEPS the text', () => {
    const out = normalizeRuns([{ text: 'click me', href: 'javascript:alert(1)' }]);
    expect(out).toEqual([{ text: 'click me' }]);
  });

  it('drops unknown marks and keeps known ones, sorted and deduplicated', () => {
    const out = normalizeRuns([{ text: 'x', marks: ['bold', 'blink', 'bold', 'italic'] }]);
    expect(out).toEqual([{ text: 'x', marks: ['bold', 'italic'] }]);
  });

  it('merges adjacent runs with identical formatting and drops empty ones', () => {
    const out = normalizeRuns([
      { text: 'a', marks: ['bold'] },
      { text: 'b', marks: ['bold'] },
      { text: '' },
      { text: 'c' },
      { text: 'd' },
    ]);
    expect(out).toEqual([{ text: 'ab', marks: ['bold'] }, { text: 'cd' }]);
  });

  it('does NOT merge runs that differ by link target', () => {
    const out = normalizeRuns([
      { text: 'a', href: 'https://a.example' },
      { text: 'b', href: 'https://b.example' },
    ]);
    expect(out).toHaveLength(2);
  });

  it('survives hostile input shapes without throwing', () => {
    for (const bad of [null, undefined, 'string', 42, {}, [null], [42], [{ text: 7 }], [{ }]]) {
      expect(() => normalizeRuns(bad)).not.toThrow();
    }
    expect(normalizeRuns([{ text: 7 }, { nope: 1 }])).toEqual([]);
  });

  it('is idempotent: normalising twice changes nothing', () => {
    const once = normalizeRuns([{ text: 'a', marks: ['italic', 'bold'] }, { text: 'b' }]);
    expect(normalizeRuns(once)).toEqual(once);
  });

  it('every declared mark is actually accepted', () => {
    for (const m of INLINE_MARKS) {
      expect(normalizeRuns([{ text: 'x', marks: [m] }])).toEqual([{ text: 'x', marks: [m] }]);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The projection invariant
// ---------------------------------------------------------------------------

describe('the text projection', () => {
  it('round-trips plain text', () => {
    expect(runsToPlainText(plainTextToRuns('hello world'))).toBe('hello world');
    expect(plainTextToRuns('')).toEqual([]);
  });

  it('keeps runs when they agree with the text and carry formatting', () => {
    const r = reconcileInline('ab', [{ text: 'a', marks: ['bold'] }, { text: 'b' }]);
    expect(r.text).toBe('ab');
    expect(r.runs).toEqual([{ text: 'a', marks: ['bold'] }, { text: 'b' }]);
  });

  it('DISCARDS runs that disagree with the text, keeping the text', () => {
    // The dangerous failure would be rewriting `text` from the runs: the SEO
    // word count and read time read `text`, so it must stay authoritative.
    const r = reconcileInline('the real text', [{ text: 'something else', marks: ['bold'] }]);
    expect(r.text).toBe('the real text');
    expect(r.runs).toBeUndefined();
  });

  it('omits runs that carry no formatting, so an unformatted block stays as before', () => {
    const r = reconcileInline('plain', [{ text: 'plain' }]);
    expect(r.runs).toBeUndefined();
    expect(runsCarryFormatting([{ text: 'plain' }])).toBe(false);
    expect(runsCarryFormatting([{ text: 'p', marks: ['bold'] }])).toBe(true);
    expect(runsCarryFormatting([{ text: 'p', href: '/x/' }])).toBe(true);
  });

  it('a run list whose href was stripped no longer counts as formatting', () => {
    // "click" + javascript: → the href is dropped, leaving a plain run, so the
    // block is stored without `runs` at all rather than with a pointless one.
    const r = reconcileInline('click', [{ text: 'click', href: 'javascript:alert(1)' }]);
    expect(r.runs).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Rendering
// ---------------------------------------------------------------------------

describe('rendering', () => {
  it('a block with no runs renders exactly the plain text', () => {
    expect(render('Just words.')).toBe('Just words.');
  });

  it('escapes text, with and without runs', () => {
    const payload = '<script>alert(1)</script>';
    expect(render(payload)).not.toContain('<script>');
    expect(render(payload, [{ text: payload, marks: ['bold'] }])).not.toContain('<script>');
  });

  it('renders each mark as its own element', () => {
    expect(render('x', [{ text: 'x', marks: ['bold'] }])).toContain('<strong>');
    expect(render('x', [{ text: 'x', marks: ['italic'] }])).toContain('<em>');
    expect(render('x', [{ text: 'x', marks: ['underline'] }])).toContain('<u>');
    expect(render('x', [{ text: 'x', marks: ['strike'] }])).toContain('<s>');
  });

  it('nests multiple marks deterministically', () => {
    const a = render('x', [{ text: 'x', marks: ['bold', 'italic'] }]);
    const b = render('x', [{ text: 'x', marks: ['italic', 'bold'] }]);
    expect(a).toBe(b);                       // order of the array must not matter
    expect(a).toContain('<strong><em>x</em></strong>');
  });

  it('an internal link gets no target, an external one gets the opener guard', () => {
    const internal = render('x', [{ text: 'x', href: '/articles/a/' }]);
    expect(internal).toContain('href="/articles/a/"');
    expect(internal).not.toContain('target=');

    const external = render('x', [{ text: 'x', href: 'https://example.com/' }]);
    expect(external).toContain('target="_blank"');
    expect(external).toContain('rel="noopener noreferrer nofollow"');
  });

  it('REFUSES to render an unsafe href even if one reached storage', () => {
    // Defence in depth: the schema would reject this, but a direct database
    // write or a bad migration must not produce an executable link.
    const html = render('click', [{ text: 'click', href: 'javascript:alert(1)' } as never]);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a');
    expect(html).toContain('click');          // the words survive
  });
});

// ---------------------------------------------------------------------------
// 5. The server schema
// ---------------------------------------------------------------------------

describe('the block schema boundary', () => {
  it('accepts one well-formed example of every renderable block type', () => {
    const samples: Record<string, unknown> = {
      heading: { type: 'heading', level: 2, text: 'H' },
      paragraph: { type: 'paragraph', text: 'P' },
      quote: { type: 'quote', quote: 'Q', attribution: 'A' },
      list: { type: 'list', items: ['a', 'b'] },
      table: { type: 'table', headers: ['h'], rows: [['r']] },
      callout: { type: 'callout', text: 'C' },
      image: { type: 'image', src: '/m/x.jpg', alt: 'a' },
      sourceLink: { type: 'sourceLink', title: 'T', url: 'https://example.com/' },
      disclosure: { type: 'disclosure', text: 'D' },
      divider: { type: 'divider' },
      faq: { type: 'faq', items: [{ question: 'Q?', answer: 'A.' }] },
      footnotes: { type: 'footnotes', items: [{ text: 'N' }] },
      gallery: { type: 'gallery', images: [{ src: '/m/x.jpg', alt: 'a' }] },
      // An id that is 11 characters of YouTube's unreserved alphabet; anything
      // else is refused, which `article-rich-blocks.test.ts` covers in full.
      video: { type: 'video', provider: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'V' },
    };
    for (const t of ARTICLE_BLOCK_TYPES) {
      expect(articleBlockSchema.safeParse(samples[t]).success, t).toBe(true);
    }
    // The map and the exported list agree — a new type cannot be added to one
    // without the other.
    expect(Object.keys(samples).sort()).toEqual([...ARTICLE_BLOCK_TYPES].sort());
  });

  it('REFUSES an unknown block type', () => {
    expect(articleBlockSchema.safeParse({ type: 'iframe', src: 'https://evil' }).success).toBe(false);
    expect(articleBlockSchema.safeParse({ type: 'script', text: 'x' }).success).toBe(false);
  });

  it('PRESERVES unknown keys on a known block type', () => {
    // Stored articles predate real validation; stripping their extra fields on
    // the next save would be silent data loss.
    const r = articleBlockSchema.safeParse({ type: 'paragraph', text: 'P', legacyField: 'keep me' });
    expect(r.success).toBe(true);
    expect((r as { data: Record<string, unknown> }).data.legacyField).toBe('keep me');
  });

  it('refuses an unsafe href inside runs, and an unsafe citation URL', () => {
    expect(articleBlockSchema.safeParse({
      type: 'paragraph', text: 'x', runs: [{ text: 'x', href: 'javascript:alert(1)' }],
    }).success).toBe(false);
    expect(articleBlockSchema.safeParse({
      type: 'sourceLink', title: 'T', url: 'javascript:alert(1)',
    }).success).toBe(false);
  });

  it('refuses an unknown mark rather than storing it', () => {
    expect(articleBlockSchema.safeParse({
      type: 'paragraph', text: 'x', runs: [{ text: 'x', marks: ['blink'] }],
    }).success).toBe(false);
  });

  it('enforces the projection on parse, per block type', () => {
    const p = reconcileBlockInline(articleBlockSchema.parse({
      type: 'paragraph', text: 'ab', runs: [{ text: 'a', marks: ['bold'] }, { text: 'b' }],
    }));
    expect(p).toMatchObject({ text: 'ab' });
    expect((p as { runs?: unknown[] }).runs).toHaveLength(2);

    // Disagreeing runs are dropped, text kept.
    const bad = reconcileBlockInline(articleBlockSchema.parse({
      type: 'paragraph', text: 'ab', runs: [{ text: 'zz', marks: ['bold'] }],
    }));
    expect(bad).toMatchObject({ text: 'ab' });
    expect((bad as { runs?: unknown }).runs).toBeUndefined();

    const q = reconcileBlockInline(articleBlockSchema.parse({
      type: 'quote', quote: 'hi', attribution: 'A', quoteRuns: [{ text: 'hi', marks: ['italic'] }],
    }));
    expect((q as { quoteRuns?: unknown[] }).quoteRuns).toHaveLength(1);
  });

  it('a list keeps per-item formatting positionally, and drops the array when nothing is formatted', () => {
    const formatted = reconcileBlockInline(articleBlockSchema.parse({
      type: 'list',
      items: ['plain', 'bold one'],
      itemRuns: [null, [{ text: 'bold one', marks: ['bold'] }]],
    })) as { itemRuns?: (unknown[] | null)[] };
    expect(formatted.itemRuns?.[0]).toBeNull();
    expect(formatted.itemRuns?.[1]).toHaveLength(1);

    const unformatted = reconcileBlockInline(articleBlockSchema.parse({
      type: 'list', items: ['a', 'b'], itemRuns: [[{ text: 'a' }], [{ text: 'b' }]],
    })) as { itemRuns?: unknown };
    expect(unformatted.itemRuns).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Real stored content (the compatibility gate)
// ---------------------------------------------------------------------------

const dbUrl = process.env.DATABASE_URL ?? '';
const dbSuite = dbUrl ? describe : describe.skip;

dbSuite('every block already in the database still validates', () => {
  it('no stored block is rejected by the new schema', async () => {
    const prisma = new PrismaClient();
    try {
      const stored = await prisma.articleBlock.findMany({
        select: { id: true, blockType: true, data: true },
      });
      expect(stored.length, 'expected stored blocks to validate against').toBeGreaterThan(0);

      const rejected: string[] = [];
      for (const b of stored) {
        const r = articleBlockSchema.safeParse(b.data);
        if (!r.success) rejected.push(`${b.blockType} (${b.id}): ${r.error.issues[0]?.message}`);
      }
      expect(rejected, 'stored blocks the new schema would refuse to save').toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('re-parsing a stored block does not change its text or lose a field', async () => {
    const prisma = new PrismaClient();
    try {
      const stored = await prisma.articleBlock.findMany({ select: { data: true } });
      for (const b of stored) {
        const before = b.data as Record<string, unknown>;
        const after = reconcileBlockInline(articleBlockSchema.parse(before)) as Record<string, unknown>;
        // Every key that was stored is still present (ignoring the inline keys
        // this change may legitimately add or clear).
        for (const k of Object.keys(before)) {
          if (['runs', 'quoteRuns', 'itemRuns'].includes(k)) continue;
          expect(after[k], `key "${k}" must survive a parse`).toEqual(before[k]);
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  });
});

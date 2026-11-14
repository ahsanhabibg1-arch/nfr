import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ContentBlock } from '../types';

/**
 * Formatting protection in the Blocks view.
 *
 * THE DEFECT, AND THE OWNER'S DECISION. The Blocks view edits a paragraph with
 * a plain field and writes back `{ ...block, text: newValue }`. That keeps
 * `runs` while changing `text`, so the projection no longer matches and the
 * save discards the formatting — with no warning. The owner's instruction is
 * that this loss is prohibited.
 *
 * A formatted block is therefore read-only in that view, shown through the same
 * renderer the public page uses, with an explicit route back to the Write
 * surface. Everything that does not touch the text — reorder, duplicate,
 * delete — still works, because preservation must not mean imprisonment.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/admin/articles/new/',
  useSearchParams: () => new URLSearchParams(),
}));

const { blockHasInlineFormatting, reconcileInline } = await import('../lib/content/articleInline');
const { RichBlockEditor } = await import('../components/admin/editor/RichBlockEditor');

const FORMATTED: ContentBlock = {
  type: 'paragraph',
  text: 'A bold claim.',
  runs: [{ text: 'A ' }, { text: 'bold', marks: ['bold'] }, { text: ' claim.' }],
};
const PLAIN: ContentBlock = { type: 'paragraph', text: 'Just words.' };

const render = (blocks: ContentBlock[], onEditInWrite?: () => void) =>
  renderToStaticMarkup(
    React.createElement(RichBlockEditor, { blocks, onChange: () => {}, onEditInWrite } as never),
  );

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

describe('detecting formatting worth protecting', () => {
  it('recognises marks and links across every text-bearing shape', () => {
    expect(blockHasInlineFormatting(FORMATTED)).toBe(true);
    expect(blockHasInlineFormatting({ type: 'paragraph', text: 'x', runs: [{ text: 'x', href: '/a/' }] })).toBe(true);
    expect(blockHasInlineFormatting({ type: 'quote', quote: 'q', attribution: '', quoteRuns: [{ text: 'q', marks: ['italic'] }] })).toBe(true);
    expect(blockHasInlineFormatting({ type: 'list', items: ['a'], itemRuns: [[{ text: 'a', marks: ['bold'] }]] })).toBe(true);
    expect(blockHasInlineFormatting({ type: 'callout', text: 'c', runs: [{ text: 'c', marks: ['strike'] }] })).toBe(true);
  });

  it('does NOT claim formatting where there is none to lose', () => {
    expect(blockHasInlineFormatting(PLAIN)).toBe(false);
    // Runs that carry no marks and no link are just the plain text again.
    expect(blockHasInlineFormatting({ type: 'paragraph', text: 'x', runs: [{ text: 'x' }] })).toBe(false);
    // A sparse list where no item is actually formatted.
    expect(blockHasInlineFormatting({ type: 'list', items: ['a', 'b'], itemRuns: [null, null] })).toBe(false);
    for (const junk of [null, undefined, 42, 'text', {}, { type: 'divider' }]) {
      expect(blockHasInlineFormatting(junk), String(junk)).toBe(false);
    }
  });

  it('a run whose unsafe href was stripped no longer counts as formatting', () => {
    expect(blockHasInlineFormatting({
      type: 'paragraph', text: 'click', runs: [{ text: 'click', href: 'javascript:alert(1)' }],
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The Blocks view behaviour
// ---------------------------------------------------------------------------

describe('the Blocks view', () => {
  it('offers NO text field for a formatted block, and says why', () => {
    const html = render([FORMATTED]);
    expect(html).not.toContain('<textarea');
    expect(html).toContain('Formatted text');
    expect(html).toMatch(/read-only in this view/i);
    expect(html).toMatch(/Reordering, duplicating and\s+deleting still work/i);
  });

  it('shows the formatting through the real public renderer', () => {
    const html = render([FORMATTED]);
    // The author sees the marks that will actually publish.
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('A bold claim.'.split('bold')[0].trim());
  });

  it('offers "Edit in Write" when the shell supplies the route back', () => {
    expect(render([FORMATTED], () => {})).toContain('Edit in Write');
    // Still protected without it — the field is never offered either way.
    const without = render([FORMATTED]);
    expect(without).not.toContain('Edit in Write');
    expect(without).not.toContain('<textarea');
  });

  it('leaves an UNFORMATTED block fully editable, as before', () => {
    const html = render([PLAIN]);
    expect(html).toContain('<textarea');
    expect(html).not.toContain('Formatted text');
  });

  it('protects only the formatted block in a mixed body', () => {
    const html = render([PLAIN, FORMATTED]);
    // Exactly one editable field: the plain paragraph's.
    expect((html.match(/<textarea/g) ?? []).length).toBe(1);
    expect((html.match(/Formatted text/g) ?? []).length).toBe(1);
  });

  it('keeps the block\'s structural controls available', () => {
    const html = render([FORMATTED]);
    // Reorder / duplicate / delete are not text edits, so they stay.
    expect(html).toMatch(/Duplicate|Move|Delete|Remove/i);
  });
});

// ---------------------------------------------------------------------------
// The loss this prevents, demonstrated
// ---------------------------------------------------------------------------

describe('why the protection is necessary', () => {
  it('a plain-text edit of a formatted block WOULD have dropped its runs', () => {
    // This is the exact write the old field performed.
    const edited = { ...FORMATTED, text: 'A bold claim, revised.' } as typeof FORMATTED;
    const stored = reconcileInline(edited.text, edited.runs);
    expect(stored.text).toBe('A bold claim, revised.');
    // The formatting is gone — the loss the owner prohibited.
    expect(stored.runs).toBeUndefined();
  });

  it('an untouched formatted block still reconciles with its formatting intact', () => {
    const stored = reconcileInline(FORMATTED.text, FORMATTED.runs);
    expect(stored.runs).toHaveLength(3);
  });
});

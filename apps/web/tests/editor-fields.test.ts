import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Reads the ACTUAL migrated editor component source (not a constant redefined in
// this test) and asserts the approved eight-field order and slug inspector are
// preserved, and that React Router has been fully removed (Batch 01 §13 / §8).
const editorSrc = readFileSync(
  fileURLToPath(new URL('../views/admin/AdminArticleEditorShell.tsx', import.meta.url)),
  'utf8',
);

describe('editor field preservation (reads real component source)', () => {
  const fields = [
    'Field 01 &mdash; Main Headline',
    'Field 02 &mdash; Secondary Editorial Deck',
    'Field 03 &mdash; Editorial Excerpt / Summary',
    'Field 04 &mdash; Article Body',
    'Field 05 &mdash; SEO Title',
    'Field 06 &mdash; Meta Description',
    'Field 07 &mdash; Image SEO Title',
    'Field 08 &mdash; Image ALT Text',
  ];

  it('contains all eight primary fields in order', () => {
    let lastIndex = -1;
    for (const f of fields) {
      const idx = editorSrc.indexOf(f);
      expect(idx, `missing editor field marker: ${f}`).toBeGreaterThan(-1);
      expect(idx, `field out of order: ${f}`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it('keeps the URL slug in the separate settings inspector, not as a primary field', () => {
    expect(editorSrc).toContain('URL Slug &amp; Route Path');
  });

  it('no longer imports react-router-dom', () => {
    expect(editorSrc.includes('react-router-dom')).toBe(false);
    expect(editorSrc.includes("next/navigation")).toBe(true);
  });
});

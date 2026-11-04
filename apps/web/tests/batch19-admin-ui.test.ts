import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminLoading from '../app/admin/(dashboard)/loading';

/**
 * Batch 19 §B.A/§B.C — admin loading/error states + no misleading demo labels.
 */
describe('Batch 19 — admin loading & error states', () => {
  it('admin loading skeleton renders an accessible busy status', () => {
    const html = renderToStaticMarkup(createElement(AdminLoading));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/Loading/i);
    expect(html).toContain('animate-pulse');
  });

  it('admin error boundary exports a component function', async () => {
    const adminError = (await import('../app/admin/(dashboard)/error')).default;
    expect(typeof adminError).toBe('function');
  });
});

describe('Batch 19 — no misleading demo labels in reviewed admin surfaces', () => {
  it('RevisionHistoryModal is no longer presented as a demo prototype', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../components/admin/editor/RevisionHistoryModal.tsx', import.meta.url)),
      'utf8',
    );
    expect(src).not.toMatch(/Demo Prototype/i);
    expect(src).not.toMatch(/Demo Session Revisions/i);
    expect(src).toMatch(/Revision history/i); // honest DB-backed wording present
  });
});

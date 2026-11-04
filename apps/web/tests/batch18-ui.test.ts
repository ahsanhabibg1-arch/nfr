import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PublicLoading from '../app/(public)/loading';

/**
 * Batch 18 §12 — public loading/error UX. Locks in the loading skeleton's
 * accessibility contract and verifies the error boundaries compile + export a
 * component (their runtime behavior — reset/retry — is exercised by the browser).
 */
describe('Batch 18 — public loading & error states', () => {
  it('loading skeleton renders an accessible busy status', () => {
    const html = renderToStaticMarkup(createElement(PublicLoading));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/Loading/i);
    expect(html).toContain('animate-pulse'); // skeleton bars present
  });

  it('public error + global-error export a component function', async () => {
    const publicError = (await import('../app/(public)/error')).default;
    const globalError = (await import('../app/global-error')).default;
    expect(typeof publicError).toBe('function');
    expect(typeof globalError).toBe('function');
  });
});

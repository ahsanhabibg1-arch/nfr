import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Batch D — admin accessibility regressions (static) for Media, SEO, Monetization, Team, Settings
 * and the shared admin components they render. Browser-level axe checks live in e2e/a11y.spec.ts.
 */
const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const VIEWS = ['AdminMediaPage', 'AdminSEOPage', 'AdminMonetizationPage', 'AdminTeamPage', 'AdminSettingsPage'].map((n) => `views/admin/${n}.tsx`);
const SHARED = ['AdminPageHeader', 'AdminBreadcrumbs', 'AdminTabs', 'AdminStatCard', 'AdminFilterBar', 'AdminModal'].map((n) => `components/admin/${n}.tsx`);

/** Every <input>/<select>/<textarea> opening tag (multi-line aware), minus hidden file inputs. */
function controls(src: string): string[] {
  return [...src.matchAll(/<(input|select|textarea)\b[^>]*?\/?>/gs)].map((m) => m[0]).filter((t) => !/\bhidden\b/.test(t));
}

describe('Batch D — admin accessibility (static)', () => {
  it('no light-only grey (stone-400/500) text remains in the audited admin views or shared components', () => {
    for (const f of [...VIEWS, ...SHARED]) {
      expect(read(f), f).not.toMatch(/(^|["'` ])text-stone-(400|500)(?=["'` ]|$)/m);
    }
  });

  it('muted text on the dark monetization banner uses the inverse token', () => {
    expect(read('views/admin/AdminMonetizationPage.tsx')).toMatch(/bg-stone-900[\s\S]{0,400}text-ink-inverse-muted/);
  });

  it('every form control in the audited views has an accessible name (id + label, aria-label, or a wrapping label)', () => {
    for (const f of VIEWS) {
      const src = read(f);
      const ids = new Set([...src.matchAll(/htmlFor=(?:"([^"]+)"|\{`([^`]+)`\})/g)].map((m) => m[1] ?? m[2]));
      for (const tag of controls(src)) {
        const id = tag.match(/\bid=(?:"([^"]+)"|\{`([^`]+)`\})/);
        const named = /aria-label(ledby)?=/.test(tag) || (id && ids.has(id[1] ?? id[2]));
        const wrapped = new RegExp(`<label className="flex[^"]*">(<span[^>]*>[^<]*</span>)?${tag.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(src);
        expect(named || wrapped, `${f}: unnamed control ${tag.slice(0, 110)}`).toBeTruthy();
      }
    }
  });

  it('label htmlFor targets exist and ids are unique within each view', () => {
    for (const f of VIEWS) {
      const src = read(f);
      const ids = [...src.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, `${f}: duplicate ids`).toBe(ids.length);
      for (const m of src.matchAll(/htmlFor="([^"]+)"/g)) expect(ids, `${f}: label target ${m[1]}`).toContain(m[1]);
    }
  });

  it('media metadata fields and the rights licence select are label-associated', () => {
    const src = read('views/admin/AdminMediaPage.tsx');
    expect(src).toContain('<label htmlFor={`media-${k}`}');
    expect(src).toContain('<input id={`media-${k}`}');
    expect(src).toMatch(/<label htmlFor="media-license"[\s\S]*<select id="media-license"/);
  });

  it('SEO and Monetization sections no longer skip from h1 to h3/h4', () => {
    for (const f of ['views/admin/AdminSEOPage.tsx', 'views/admin/AdminMonetizationPage.tsx']) {
      expect(read(f), f).not.toMatch(/<h[3-6][\s>]/);
    }
  });

  it('clickable table rows have a keyboard-operable button for the same action', () => {
    expect(read('views/admin/AdminSEOPage.tsx')).toMatch(/<button type="button" onClick=\{\(\) => \{ setSelId\(f\.id\); setNote\(''\); \}\} aria-pressed=/);
    expect(read('views/admin/AdminMediaPage.tsx')).toMatch(/<td[^>]*><button type="button" onClick=\{\(\) => setSelId\(r\.id\)\} aria-pressed=/);
  });

  it('icon-only view toggles are named and expose their pressed state', () => {
    const src = read('views/admin/AdminMediaPage.tsx');
    expect(src).toContain(`aria-label="Grid view" aria-pressed={view === 'grid'}`);
    expect(src).toContain(`aria-label="List view" aria-pressed={view === 'list'}`);
  });

  it('transient status messages are announced (polite live regions)', () => {
    for (const f of VIEWS) {
      const src = read(f);
      for (const m of src.matchAll(/\{(toast|notice) && <div([^>]*)>/g)) {
        expect(m[2], `${f}: ${m[1]} region`).toContain('role="status" aria-live="polite"');
      }
    }
  });

  it('AdminModal is a named dialog with a heading, managed focus and a typed close button', () => {
    const src = read('components/admin/AdminModal.tsx');
    expect(src).toContain('aria-labelledby={titleId}');
    expect(src).toContain('<h2 id={titleId}');
    expect(src).toMatch(/ref=\{panelRef\}\s+tabIndex=\{-1\}/);
    expect(src).toMatch(/useEffect\(\(\) => \{\s+if \(!isOpen\) return;[\s\S]*?panelRef\.current\?\.focus\(\);[\s\S]*?opener\?\.focus\?\.\(\)[\s\S]*?\}, \[isOpen\]\);/);
    expect(src).toMatch(/type="button"\s+aria-label="Close dialog"/);
  });

  it('the a11y baseline stays empty — no admin finding was suppressed', () => {
    expect(JSON.parse(read('e2e/a11y-known-issues.json'))).toEqual([]);
  });
});

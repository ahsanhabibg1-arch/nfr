import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every admin module the permission registry knows about must appear in the
 * sidebar.
 *
 * This exists because `info-pages` did not. It was registered, routable and
 * permission-gated, and the whole Page Manager behind it was reachable only by
 * typing its URL — a module can be built, tested and shipped while being
 * invisible to the people meant to use it, and nothing fails.
 *
 * Asserted against the SOURCE rather than a rendered tree, because the sidebar
 * filters by the viewer's permissions at runtime: a render-based check would
 * pass for an admin who happens to see everything and miss the real problem,
 * which is a module nobody put in the list at all.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('admin sidebar covers every registered module', () => {
  const registry = read('lib/auth/permissions.ts');
  const sidebar = read('components/admin/AdminSidebar.tsx');

  const modules = [...registry.matchAll(/\{\s*id:\s*'([a-z0-9-]+)',\s*label:\s*'([^']+)'/g)]
    .map((m) => ({ id: m[1], label: m[2] }));

  it('finds the module registry', () => {
    // A sanity floor: if the regex stops matching, the rest of this file would
    // pass vacuously and prove nothing.
    expect(modules.length).toBeGreaterThanOrEqual(15);
  });

  it.each(modules)('"$label" ($id) has a sidebar entry', ({ id }) => {
    expect(sidebar).toContain(`id: '${id}'`);
  });

  it('includes Info & Legal Pages specifically', () => {
    // Named on its own because this is the one that was missing, and a
    // regression here would otherwise hide inside a parameterised list.
    expect(modules.map((m) => m.id)).toContain('info-pages');
    expect(sidebar).toContain("id: 'info-pages'");
    expect(sidebar).toContain('ROUTES.ADMIN_INFO_PAGES');
  });

  it('routes the entry through the shared route constant, not a literal', () => {
    // So the sidebar and the permission registry cannot drift to different URLs.
    const routes = read('config/routes.ts');
    expect(routes).toContain("ADMIN_INFO_PAGES: '/admin/info-pages/'");
    expect(registry).toContain("path: '/admin/info-pages/'");
  });
});

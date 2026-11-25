import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';

/**
 * Regression cover for the `middleware` -> `proxy` convention migration.
 *
 * Next.js 16 deprecated the `middleware` file convention in favour of `proxy`,
 * and `next build` THROWS when both files exist ("Both middleware file ... and
 * proxy file ... are detected"). So the convention is not a style preference
 * here: the wrong file name either logs a deprecation warning on every start
 * (middleware only) or fails the build outright (both). These cases pin the
 * file name, the export name Next looks for, and the matcher that decides which
 * requests the function sees — the three things a careless revert would undo.
 *
 * The response BEHAVIOUR itself (which hostnames and paths get
 * `X-Robots-Tag: noindex, nofollow`) is covered in depth by
 * `tests/idx02-hostname-seo.test.ts`; only a single smoke case is repeated here
 * so a rename that silently drops the logic cannot pass this file alone.
 */

const appRoot = fileURLToPath(new URL('../', import.meta.url));

describe('proxy convention (migrated from the deprecated middleware convention)', () => {
  it('the convention file is proxy.ts, and the deprecated middleware.ts is gone', () => {
    expect(existsSync(appRoot + 'proxy.ts')).toBe(true);
    // Both files present is a hard `next build` error, not a warning.
    expect(existsSync(appRoot + 'middleware.ts')).toBe(false);
    expect(existsSync(appRoot + 'src/proxy.ts')).toBe(false);
  });

  it('exports a function named `proxy`, which is the name Next.js resolves', async () => {
    const mod = await import('../proxy');
    expect(typeof mod.proxy).toBe('function');
    // The old name must not linger as an alias: Next would not call it, so a
    // leftover export would read as working code that never runs.
    expect('middleware' in mod).toBe(false);
  });

  it('keeps the asset and API exclusions, so static caching is untouched', async () => {
    const { config } = await import('../proxy');
    // String.raw so the single backslash before `.ico` survives review and edits.
    expect(config.matcher).toEqual([String.raw`/((?!_next/static|_next/image|favicon\.ico|api/).*)`]);
  });

  it('still noindexes /admin on a production hostname', async () => {
    const { proxy } = await import('../proxy');
    const req = new NextRequest('https://nfrguide.com/admin/articles/', {
      headers: { host: 'nfrguide.com' },
    });
    expect(proxy(req).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('leaves a public page on a production hostname indexable', async () => {
    const { proxy } = await import('../proxy');
    const req = new NextRequest('https://nfrguide.com/about/', {
      headers: { host: 'nfrguide.com' },
    });
    expect(proxy(req).headers.get('X-Robots-Tag')).toBeNull();
  });
});

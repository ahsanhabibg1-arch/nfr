import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextRequest } from 'next/server';

/**
 * IDX-02 release prep — deployment configuration safety.
 *
 * `render.yaml` is the Blueprint a future deploy can be created or re-synced
 * from. Two of its declarations can break production SEO on their own, and
 * neither was covered by any other test:
 *
 *   1. `STAGING_NOINDEX: "true"` — harmless while the Render service answered
 *      only on a staging hostname, catastrophic now that nfrguide.com resolves
 *      to the same service: it would noindex the real site.
 *   2. a hardcoded origin for `NEXT_PUBLIC_SITE_URL` — that value is inlined
 *      into the build, so a wrong one bakes staging URLs into every canonical.
 *
 * The first case is asserted against the middleware's OWN rule rather than a
 * copy of it, so the two cannot drift apart: whatever the Blueprint declares is
 * fed to the real middleware, and the production hostname must come back
 * indexable.
 */

const REPO_ROOT = resolve(__dirname, '../../..');
const RENDER_YAML = readFileSync(resolve(REPO_ROOT, 'render.yaml'), 'utf8');
const NVMRC = readFileSync(resolve(REPO_ROOT, '.nvmrc'), 'utf8').trim();

interface EnvVar {
  key: string;
  value?: string;
  sync?: boolean;
}

/**
 * A deliberately narrow reader for the `envVars:` list — no YAML dependency is
 * installed, and adding one to assert a handful of facts would be a poor trade.
 * It understands exactly the three shapes this file uses (`- key:`, `value:`,
 * `sync:`) and nothing else. The first describe block fails loudly if the file
 * ever outgrows it, so a silently-empty parse cannot pass as "no problems
 * found".
 */
function parseEnvVars(yaml: string): EnvVar[] {
  const out: EnvVar[] = [];
  let current: EnvVar | null = null;

  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    const keyMatch = line.match(/^\s*-\s*key:\s*(\S+)\s*$/);
    if (keyMatch) {
      current = { key: keyMatch[1] };
      out.push(current);
      continue;
    }
    if (!current) continue;

    const valueMatch = line.match(/^\s*value:\s*(.+)$/);
    if (valueMatch) {
      current.value = valueMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }
    const syncMatch = line.match(/^\s*sync:\s*(true|false)\s*$/);
    if (syncMatch) {
      current.sync = syncMatch[1] === 'true';
      continue;
    }
    // Any other line ends the current entry.
    current = null;
  }
  return out;
}

const ENV_VARS = parseEnvVars(RENDER_YAML);
const byKey = (key: string): EnvVar | undefined => ENV_VARS.find((e) => e.key === key);

describe('deploy config — the parser actually read the file', () => {
  it('found the env var block, so the assertions below are meaningful', () => {
    expect(ENV_VARS.length).toBeGreaterThanOrEqual(10);
    // One entry of each shape: a plain value, and a dashboard-managed secret.
    expect(byKey('NODE_VERSION')?.value).toBeDefined();
    expect(byKey('DATABASE_URL')?.sync).toBe(false);
  });

  it('every declared key is either a value or a dashboard-managed secret', () => {
    for (const entry of ENV_VARS) {
      const declared = entry.value !== undefined || entry.sync === false;
      expect(declared, `${entry.key} declares neither a value nor sync: false`).toBe(true);
    }
  });
});

describe('deploy config — STAGING_NOINDEX cannot noindex production', () => {
  it('REGRESSION (IDX-02): the Blueprint does not declare it as "true"', () => {
    const entry = byKey('STAGING_NOINDEX');
    expect(entry, 'STAGING_NOINDEX should stay declared, explicitly disabled').toBeDefined();
    expect(entry?.value).not.toBe('true');
  });

  it('no NOINDEX-shaped key anywhere in the Blueprint is enabled', () => {
    for (const entry of ENV_VARS) {
      if (/NOINDEX/i.test(entry.key)) {
        expect(entry.value, `${entry.key} is enabled in render.yaml`).not.toBe('true');
      }
    }
  });

  it('is not enabled anywhere in the raw file either (comments aside)', () => {
    const withoutComments = RENDER_YAML.split(/\r?\n/)
      .map((l) => l.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, ''))
      .join('\n');
    expect(withoutComments).not.toMatch(/STAGING_NOINDEX[\s\S]{0,80}value:\s*["']?true["']?/);
  });
});

/**
 * The end-to-end form of the check above: take the value the Blueprint actually
 * declares, give it to the real middleware, and require that a request on the
 * production hostname comes back indexable. If someone flips the Blueprint to
 * "true", this fails with the consequence spelled out, not with a string
 * mismatch.
 */
describe('deploy config — the declared value, fed to the real middleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const req = (host: string) =>
    ({ nextUrl: new URL(`https://${host}/`), headers: new Headers({ host }) }) as unknown as NextRequest;

  it('leaves nfrguide.com indexable while still protecting the Render hostname', async () => {
    const declared = byKey('STAGING_NOINDEX')?.value ?? '';
    vi.stubEnv('STAGING_NOINDEX', declared);
    vi.resetModules();
    const { middleware } = await import('../middleware');

    expect(
      middleware(req('nfrguide.com')).headers.get('X-Robots-Tag'),
      `render.yaml declares STAGING_NOINDEX="${declared}", which would noindex the production site`,
    ).toBeNull();
    expect(middleware(req('www.nfrguide.com')).headers.get('X-Robots-Tag')).toBeNull();
    expect(middleware(req('nfr-qadd.onrender.com')).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});

describe('deploy config — the canonical origin is not hardcoded', () => {
  it('NEXT_PUBLIC_SITE_URL is dashboard-managed, with no origin baked into the repo', () => {
    const entry = byKey('NEXT_PUBLIC_SITE_URL');
    expect(entry).toBeDefined();
    expect(entry?.sync).toBe(false);
    expect(entry?.value).toBeUndefined();
  });

  it('no onrender.com origin is declared as a value anywhere in the Blueprint', () => {
    for (const entry of ENV_VARS) {
      expect(entry.value ?? '', `${entry.key}`).not.toMatch(/onrender\.com/);
    }
  });
});

describe('deploy config — secrets stay out of the repository', () => {
  const SECRET_KEYS = [
    'DATABASE_URL',
    'MEDIA_S3_ENDPOINT',
    'MEDIA_S3_BUCKET',
    'MEDIA_S3_REGION',
    'MEDIA_S3_ACCESS_KEY_ID',
    'MEDIA_S3_SECRET_ACCESS_KEY',
    'INTERNAL_REVALIDATE_SECRET',
  ];

  it.each(SECRET_KEYS)('%s is sync: false and declares no literal value', (key) => {
    const entry = byKey(key);
    expect(entry, `${key} is missing from render.yaml`).toBeDefined();
    expect(entry?.sync).toBe(false);
    expect(entry?.value).toBeUndefined();
  });

  it('no entry looks like a credential or a connection string', () => {
    for (const entry of ENV_VARS) {
      expect(entry.value ?? '').not.toMatch(/postgres(ql)?:\/\//i);
      expect(entry.value ?? '').not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
    }
  });
});

describe('deploy config — runtime pinning that past deploys got wrong', () => {
  it('NODE_VERSION matches .nvmrc', () => {
    expect(byKey('NODE_VERSION')?.value).toBe(NVMRC);
  });

  it('rootDir points at the app, not the repository root', () => {
    expect(RENDER_YAML).toMatch(/^\s*rootDir:\s*apps\/web\s*(#.*)?$/m);
  });

  it('media storage is R2, never local (the filesystem is ephemeral)', () => {
    expect(byKey('MEDIA_STORAGE_PROVIDER')?.value).toBe('r2');
  });

  it('deploys stay owner-triggered', () => {
    expect(RENDER_YAML).toMatch(/^\s*autoDeploy:\s*false\s*(#.*)?$/m);
  });
});

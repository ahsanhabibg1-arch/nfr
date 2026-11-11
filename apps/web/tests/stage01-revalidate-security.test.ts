import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

/**
 * Stage 01 — security regression tests for POST /api/internal/revalidate.
 *
 * These invoke the REAL route handler. `next/cache` is mocked because
 * revalidatePath() throws outside a request context, and because the mock is
 * what lets us assert the security-critical property that unauthorized
 * requests never reach cache invalidation at all.
 */

const { revalidatePathMock } = vi.hoisted(() => ({ revalidatePathMock: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { POST } = await import('../app/api/internal/revalidate/route');

const VALID_SECRET = 'stage01-test-secret-do-not-reuse';
const originalSecret = process.env.INTERNAL_REVALIDATE_SECRET;

/** Minimal NextRequest stand-in: the handler only calls req.json(). */
function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/** A request whose body is not valid JSON — the handler must treat it as empty. */
function makeMalformedReq(): NextRequest {
  return { json: async () => { throw new SyntaxError('Unexpected token'); } } as unknown as NextRequest;
}

beforeEach(() => {
  revalidatePathMock.mockClear();
  process.env.INTERNAL_REVALIDATE_SECRET = VALID_SECRET;
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.INTERNAL_REVALIDATE_SECRET;
  else process.env.INTERNAL_REVALIDATE_SECRET = originalSecret;
});

// ── 1-2. Fail closed when the environment secret is absent or empty ──────────

describe('Stage 01 — fails closed without a configured secret', () => {
  it('returns 503 and does not revalidate when the env secret is MISSING', async () => {
    delete process.env.INTERNAL_REVALIDATE_SECRET;
    const res = await POST(makeReq({ secret: 'anything', path: '/' }));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'not_configured' });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns 503 and does not revalidate when the env secret is EMPTY', async () => {
    process.env.INTERNAL_REVALIDATE_SECRET = '';
    const res = await POST(makeReq({ secret: '', path: '/' }));
    expect(res.status).toBe(503);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('the removed hardcoded fallback no longer authenticates', async () => {
    delete process.env.INTERNAL_REVALIDATE_SECRET;
    const res = await POST(makeReq({ secret: '__scheduled_publish_revalidate__', path: '/' }));
    expect(res.status).not.toBe(200);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('the former fallback is also rejected when a real secret IS configured', async () => {
    const res = await POST(makeReq({ secret: '__scheduled_publish_revalidate__', path: '/' }));
    expect(res.status).toBe(403);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ── 3, 5, 6. Invalid, missing and malformed authentication input ─────────────

describe('Stage 01 — rejects invalid authentication input', () => {
  it('returns 403 for an incorrect secret', async () => {
    const res = await POST(makeReq({ secret: 'wrong-secret', path: '/' }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the secret field is absent', async () => {
    const res = await POST(makeReq({ path: '/' }));
    expect(res.status).toBe(403);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-string secret (no type coercion)', async () => {
    for (const supplied of [42, true, null, { toString: () => VALID_SECRET }, [VALID_SECRET]]) {
      revalidatePathMock.mockClear();
      const res = await POST(makeReq({ secret: supplied, path: '/' }));
      expect(res.status, `payload ${JSON.stringify(supplied)}`).toBe(403);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    }
  });

  it('returns 403 for a malformed (non-JSON) body', async () => {
    const res = await POST(makeMalformedReq());
    expect(res.status).toBe(403);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns 403 for an empty body', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(403);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('a correct-prefix but truncated secret is rejected', async () => {
    const res = await POST(makeReq({ secret: VALID_SECRET.slice(0, -1), path: '/' }));
    expect(res.status).toBe(403);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ── 7. Revalidation targets are restricted ──────────────────────────────────

describe('Stage 01 — restricts revalidation targets', () => {
  const disallowed = ['/admin/', '/admin/website/', '/articles/some-slug/', '/competitors/', '..', '../', '/../etc', '', 'not-a-path', 'https://example.com/'];

  it('returns 400 and does not revalidate for a non-permitted path', async () => {
    for (const p of disallowed) {
      revalidatePathMock.mockClear();
      const res = await POST(makeReq({ secret: VALID_SECRET, path: p }));
      expect(res.status, `path ${JSON.stringify(p)}`).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'invalid_target' });
      expect(revalidatePathMock, `path ${JSON.stringify(p)}`).not.toHaveBeenCalled();
    }
  });

  it('a non-string path falls back to the permitted default rather than being coerced', async () => {
    const res = await POST(makeReq({ secret: VALID_SECRET, path: 999 }));
    expect(res.status).toBe(200);
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });
});

// ── 4, 8, 10. Authorized requests still work ────────────────────────────────

describe('Stage 01 — authorized revalidation remains functional', () => {
  it('returns 200 and revalidates for a correct secret and permitted path', async () => {
    const res = await POST(makeReq({ secret: VALID_SECRET, path: '/' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, revalidated: '/' });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });

  it('remains compatible with the exact payload the scheduled-publish runner sends', async () => {
    // Mirrors lib/cms/scheduledPublishRunner.ts triggerRevalidation().
    const runnerPayload = JSON.parse(JSON.stringify({ secret: VALID_SECRET, path: '/' }));
    const res = await POST(makeReq(runnerPayload));
    expect(res.status).toBe(200);
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });

  it('sets Cache-Control: no-store on the success response', async () => {
    const res = await POST(makeReq({ secret: VALID_SECRET, path: '/' }));
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

// ── 9. No unauthorized request ever reaches cache invalidation ──────────────

describe('Stage 01 — unauthorized requests never invoke cache invalidation', () => {
  it('revalidatePath is not called across the full unauthorized matrix', async () => {
    const unauthorized: { body: unknown; env?: string | null }[] = [
      { body: { secret: 'wrong', path: '/' } },
      { body: { path: '/' } },
      { body: {} },
      { body: { secret: 42, path: '/' } },
      { body: { secret: VALID_SECRET, path: '/admin/' } },
      { body: { secret: '__scheduled_publish_revalidate__', path: '/' } },
      { body: { secret: 'anything', path: '/' }, env: null },
      { body: { secret: '', path: '/' }, env: '' },
    ];

    for (const { body, env } of unauthorized) {
      revalidatePathMock.mockClear();
      if (env === null) delete process.env.INTERNAL_REVALIDATE_SECRET;
      else if (env !== undefined) process.env.INTERNAL_REVALIDATE_SECRET = env;
      else process.env.INTERNAL_REVALIDATE_SECRET = VALID_SECRET;

      const res = await POST(makeReq(body));
      expect(res.status, JSON.stringify(body)).not.toBe(200);
      expect(revalidatePathMock, JSON.stringify(body)).not.toHaveBeenCalled();
    }
  });
});

// ── Secret confidentiality ──────────────────────────────────────────────────

describe('Stage 01 — never discloses the secret', () => {
  it('no response body or header contains the configured secret', async () => {
    const cases: unknown[] = [
      { secret: 'wrong', path: '/' },
      { secret: VALID_SECRET, path: '/admin/' },
      { secret: VALID_SECRET, path: '/' },
      {},
    ];
    for (const body of cases) {
      const res = await POST(makeReq(body));
      const text = await res.text();
      expect(text, JSON.stringify(body)).not.toContain(VALID_SECRET);
      expect(JSON.stringify([...res.headers])).not.toContain(VALID_SECRET);
    }
  });

  it('the 403 body does not distinguish "wrong secret" from "no secret supplied"', async () => {
    const wrong = await (await POST(makeReq({ secret: 'wrong', path: '/' }))).text();
    const absent = await (await POST(makeReq({ path: '/' }))).text();
    expect(wrong).toBe(absent);
  });
});

// ── Structural invariants (negative existence, not a behavioural substitute) ──

describe('Stage 01 — the hardcoded fallback is gone from the codebase', () => {
  const root = path.resolve(__dirname, '..');
  const FORBIDDEN = '__scheduled_publish_revalidate__';

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.git')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx|mts|mjs|js|json)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it('the literal appears in no source file except this test', () => {
    const offenders = walk(root).filter((f) => {
      if (path.resolve(f) === path.resolve(__filename)) return false;
      return fs.readFileSync(f, 'utf8').includes(FORBIDDEN);
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it('neither the route nor the runner uses an `||` fallback for the secret', () => {
    for (const rel of ['app/api/internal/revalidate/route.ts', 'lib/cms/scheduledPublishRunner.ts']) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      expect(src, rel).not.toMatch(/INTERNAL_REVALIDATE_SECRET\s*\|\|/);
    }
  });

  it('the route uses timing-safe comparison rather than a plain equality check', () => {
    const src = fs.readFileSync(path.join(root, 'app/api/internal/revalidate/route.ts'), 'utf8');
    expect(src).toContain('timingSafeEqual');
  });
});

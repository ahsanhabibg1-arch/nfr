import { describe, it, expect, vi, afterAll } from 'vitest';

/**
 * Stage 07 Task F — the fixture-exclusion defect in the directory queries.
 *
 * THE DEFECT, FOUND WHILE BUILDING THE DIRECTORY TEMPLATE MODEL.
 *
 * `lib/fixturePolicy.ts` provides `publicSlugWhere()` for slug-addressed public
 * entities, and it is applied at the public hub and event reads. Neither
 * `listPublicCompetitors` nor `listPublicVenues` applied it. So a `fixture-`
 * competitor or venue row would have been listed to real visitors in
 * production, and nothing else guards it: neither model carries a publication
 * state, so the fixture prefix is the only filter available.
 *
 * This file is in its own suite because it mutates `APP_ENV` and resets the
 * module registry to reach the production branch, which would disturb the other
 * Stage 07 suites if interleaved with them.
 *
 * It asserts the WHERE CLAUSE THE QUERY ACTUALLY RECEIVES, by substituting the
 * Prisma client and capturing the arguments — not the presence of a string in
 * a source file. A mutation that drops `publicSlugWhere()` from either query
 * fails here.
 */

const originalEnv = process.env.APP_ENV;

afterAll(() => {
  if (originalEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = originalEnv;
  vi.resetModules();
  vi.doUnmock('../lib/db');
});

interface Captured {
  where?: { NOT?: { slug?: { startsWith?: string } }; [k: string]: unknown };
  take?: number;
  skip?: number;
}

/**
 * Load `batch12Content` with a captured Prisma client under a chosen APP_ENV.
 * Returns the arguments every query received.
 */
async function runWithEnv(env: string, which: 'competitors' | 'venues', opts: Record<string, unknown> = {}) {
  process.env.APP_ENV = env;
  vi.resetModules();

  const calls: Captured[] = [];
  const record = async <T>(args: Captured, result: T): Promise<T> => {
    calls.push(args);
    return result;
  };

  vi.doMock('../lib/db', () => ({
    prisma: {
      competitor: {
        count: (a: Captured) => record(a, 0),
        findMany: (a: Captured) => record(a, [] as unknown[]),
      },
      venue: {
        count: (a: Captured) => record(a, 0),
        findMany: (a: Captured) => record(a, [] as unknown[]),
      },
      discipline: { findMany: () => Promise.resolve([] as unknown[]) },
    },
  }));

  const mod = await import('../lib/batch12Content');
  if (which === 'competitors') await mod.listPublicCompetitors(opts as never);
  else await mod.listPublicVenues(opts as never);

  // The first two calls are the entity count and findMany; later ones are
  // option lookups (disciplines / distinct countries) that are not entity reads.
  return calls;
}

describe('Stage 07 Task F — competitor directory excludes fixtures in production', () => {
  it('applies the fixture-slug exclusion to the count query', async () => {
    const calls = await runWithEnv('production', 'competitors');
    expect(calls.length).toBeGreaterThan(0);
    expect(
      calls[0].where?.NOT?.slug?.startsWith,
      'listPublicCompetitors must apply publicSlugWhere() in production',
    ).toBeTruthy();
  });

  it('applies it to the entries query too, not only the count', async () => {
    const calls = await runWithEnv('production', 'competitors');
    const entriesQuery = calls.find((c) => typeof c.take === 'number');
    expect(entriesQuery, 'the paged query must exist').toBeDefined();
    expect(entriesQuery!.where?.NOT?.slug?.startsWith).toBeTruthy();
  });

  it('keeps the query bounded and page-clamped', async () => {
    // Preserving the existing protection is as important as adding the new one.
    const calls = await runWithEnv('production', 'competitors', { page: -5 });
    const entriesQuery = calls.find((c) => typeof c.take === 'number')!;
    expect(entriesQuery.take, 'the listing must stay bounded').toBeGreaterThan(0);
    expect(entriesQuery.skip, 'a negative page must not produce a negative skip').toBeGreaterThanOrEqual(0);
  });

  it('still applies the exclusion alongside a search term', async () => {
    const calls = await runWithEnv('production', 'competitors', { q: 'wright' });
    expect(calls[0].where?.NOT?.slug?.startsWith).toBeTruthy();
    expect(JSON.stringify(calls[0].where)).toContain('wright');
  });

  it('does NOT exclude fixtures in the test environment, by design', async () => {
    // Test and CI databases must keep showing fixtures so the browser harness
    // and route smoke tests can exercise real public routes.
    const calls = await runWithEnv('test', 'competitors');
    expect(calls[0].where?.NOT).toBeUndefined();
  });
});

describe('Stage 07 Task F — venue directory excludes fixtures in production', () => {
  it('applies the fixture-slug exclusion to the count query', async () => {
    const calls = await runWithEnv('production', 'venues');
    expect(
      calls[0].where?.NOT?.slug?.startsWith,
      'listPublicVenues must apply publicSlugWhere() in production',
    ).toBeTruthy();
  });

  it('applies it to the entries query too', async () => {
    const calls = await runWithEnv('production', 'venues');
    const entriesQuery = calls.find((c) => typeof c.take === 'number');
    expect(entriesQuery!.where?.NOT?.slug?.startsWith).toBeTruthy();
  });

  it('does NOT exclude fixtures in the test environment', async () => {
    const calls = await runWithEnv('test', 'venues');
    expect(calls[0].where?.NOT).toBeUndefined();
  });
});

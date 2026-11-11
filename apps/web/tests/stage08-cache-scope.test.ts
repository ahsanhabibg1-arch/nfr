import { describe, it, expect, vi, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Stage 08 Task D — the cache-invalidation contract (KD-08, owner decision
 * D-08, "Approval required: NO").
 *
 * THE DEFECT. `app/admin/page-layout-actions.ts` had one helper:
 *
 *     const rev = () => { revalidatePath('/admin/website/'); revalidatePath('/', 'layout'); };
 *
 * and EVERY action called it — including `saveDraftAction`.
 * `revalidatePath('/', 'layout')` invalidates the root layout and therefore
 * every page on the site, so saving an unpublished draft for one page key
 * flushed the entire public cache, including the published version of the very
 * page being drafted.
 *
 * WHAT IS PROVEN HERE. The first block tests the path map as a pure function.
 * The second intercepts `revalidatePath` and drives the real Server Actions, so
 * it asserts the calls each action actually makes rather than the text of the
 * file. That is the distinction Task D asks for: "Run behavioral and mutation
 * tests against the actual invalidation boundary."
 */

const {
  publishedPathsFor, mappedPageKeys, unmappedPageKeys, draftWriteNeedsPublicRevalidation, ADMIN_LAYOUT_PATH,
} = await import('../lib/cms/layoutCachePaths');
const { KNOWN_PAGE_KEYS } = await import('../lib/cms/sectionRegistry');

/* ── 1. The path map ──────────────────────────────────────────────── */

describe('Stage 08 Task D — the pageKey to paths map', () => {
  it('covers all 15 known page keys', () => {
    expect(unmappedPageKeys(), 'every page key must declare its published paths').toEqual([]);
    expect(mappedPageKeys()).toHaveLength(KNOWN_PAGE_KEYS.length);
  });

  it('maps no key it should not', () => {
    const known = new Set<string>(KNOWN_PAGE_KEYS);
    expect(mappedPageKeys().filter((k) => !known.has(k))).toEqual([]);
  });

  it('never returns the site root as a layout invalidation for a non-homepage key', () => {
    /**
     * The precise shape of the defect: a single `revalidatePath('/', 'layout')`
     * reaches every page. Only `homepage` may target `/`, and even then as a
     * page rather than a layout.
     */
    for (const key of KNOWN_PAGE_KEYS) {
      for (const target of publishedPathsFor(key)) {
        if (key === 'homepage') {
          expect(target.path).toBe('/');
          expect(target.type, 'even the homepage must not flush the root LAYOUT').toBe('page');
        } else {
          expect(target.path, `${key} must not target the site root`).not.toBe('/');
        }
        expect(target.type, `${key} must not invalidate a layout subtree`).toBe('page');
      }
    }
  });

  it('gives each section landing exactly its own path', () => {
    expect(publishedPathsFor('section:competition')).toEqual([{ path: '/competition', type: 'page' }]);
    expect(publishedPathsFor('section:plan-watch')).toEqual([{ path: '/plan-watch', type: 'page' }]);
  });

  it('gives each detail template its route pattern, so all instances refresh', () => {
    expect(publishedPathsFor('template:article')).toEqual([{ path: '/articles/[slug]', type: 'page' }]);
    expect(publishedPathsFor('template:rodeo-edition')).toEqual([
      { path: '/rodeo-events/[slug]/[edition]', type: 'page' },
    ]);
  });

  it('gives each directory its index path', () => {
    expect(publishedPathsFor('directory:competitors')).toEqual([{ path: '/competitors', type: 'page' }]);
    expect(publishedPathsFor('directory:venues')).toEqual([{ path: '/venues', type: 'page' }]);
  });

  it('returns nothing for an unknown key, rather than falling back to the whole site', () => {
    // A fallback of '/' would quietly restore the defect this module removes.
    expect(publishedPathsFor('made:up')).toEqual([]);
  });

  it('states that a draft-only write needs no public invalidation', () => {
    /**
     * The reasoning, as an executable claim: the staff preview reads
     * `draftMode()`, which opts the route out of static rendering, so there is
     * no cached public artefact for a draft write to invalidate.
     */
    expect(draftWriteNeedsPublicRevalidation()).toBe(false);
  });
});

/* ── 2. What the real actions actually invalidate ─────────────────── */

/**
 * `revalidatePath` is intercepted so the calls can be recorded. The services
 * are stubbed because this suite is about the invalidation boundary, not about
 * persistence — persistence is covered by the DB-backed suites.
 */
const calls: { path: string; type?: string }[] = [];

vi.mock('next/cache', () => ({
  revalidatePath: (p: string, t?: string) => { calls.push({ path: p, type: t }); },
  revalidateTag: vi.fn(),
}));

vi.mock('../lib/cms/guard', async () => {
  const actual = await import('../lib/cms/guard');
  return {
    ...actual,
    requireActor: async () => ({ id: 'stage08-cache-actor', roles: ['super_admin'] }),
  };
});

const stub = (version = 2) => async () => ({ id: 'l1', pageKey: 'homepage', version }) as never;

vi.mock('../lib/cms/pageLayoutService', () => ({
  saveDraft: stub(),
  publishLayout: stub(),
  resetDraftToPublished: stub(),
  restoreDefaults: stub(),
  schedulePublish: stub(),
  cancelSchedule: stub(),
  restoreRevision: stub(),
  listRevisions: async () => ({ revisions: [], total: 0 }),
}));

vi.mock('../lib/db', () => ({ prisma: { pageLayout: { findUnique: async () => null }, article: {}, rodeoHub: {} } }));

const actions = await import('../app/admin/page-layout-actions');

afterAll(() => { vi.resetModules(); });

function record(): { path: string; type?: string }[] {
  return calls.splice(0, calls.length);
}

describe('Stage 08 Task D — draft-tier actions touch no public path', () => {
  const draftTier: [string, () => Promise<unknown>][] = [
    ['saveDraftAction', () => actions.saveDraftAction('homepage', [], 1)],
    ['resetDraftAction', () => actions.resetDraftAction('homepage')],
    ['restoreDefaultsAction', () => actions.restoreDefaultsAction('homepage')],
    ['restoreRevisionAction', () => actions.restoreRevisionAction('homepage', 'rev-1')],
    ['schedulePublishAction', () => actions.schedulePublishAction('homepage', new Date(Date.now() + 86_400_000).toISOString())],
    ['cancelScheduleAction', () => actions.cancelScheduleAction('homepage')],
  ];

  for (const [name, run] of draftTier) {
    it(`${name} revalidates ONLY the admin route`, async () => {
      record();
      await run();
      const seen = record();
      expect(seen, `${name} must make exactly one revalidation call`).toHaveLength(1);
      expect(seen[0].path).toBe(ADMIN_LAYOUT_PATH);
      expect(seen[0].type, 'the admin route is revalidated as a page, not a layout subtree').toBeUndefined();
    });

    it(`${name} never flushes the site root`, async () => {
      record();
      await run();
      const seen = record();
      // THE REGRESSION GUARD. This is the exact call the old `rev()` helper made
      // on every single one of these actions.
      expect(seen.some((c) => c.path === '/' && c.type === 'layout')).toBe(false);
      expect(seen.some((c) => c.path === '/')).toBe(false);
    });
  }

  it('saving a draft does not invalidate the published page being drafted', async () => {
    record();
    await actions.saveDraftAction('directory:competitors', [], 1);
    const seen = record();
    expect(seen.map((c) => c.path)).not.toContain('/competitors');
  });
});

describe('Stage 08 Task D — publishing invalidates exactly its own paths', () => {
  it('homepage publish revalidates the admin route and /', async () => {
    record();
    await actions.publishLayoutAction('homepage');
    const seen = record();
    expect(seen).toEqual([
      { path: ADMIN_LAYOUT_PATH, type: undefined },
      { path: '/', type: 'page' },
    ]);
  });

  it('a section publish revalidates that section only', async () => {
    record();
    await actions.publishLayoutAction('section:entertainment');
    const seen = record();
    expect(seen.map((c) => c.path)).toEqual([ADMIN_LAYOUT_PATH, '/entertainment']);
  });

  it('a detail-template publish revalidates its route pattern, not the root', async () => {
    record();
    await actions.publishLayoutAction('template:article');
    const seen = record();
    expect(seen.map((c) => c.path)).toEqual([ADMIN_LAYOUT_PATH, '/articles/[slug]']);
    expect(seen.some((c) => c.path === '/' && c.type === 'layout')).toBe(false);
  });

  it('a directory publish revalidates that directory only', async () => {
    record();
    await actions.publishLayoutAction('directory:venues');
    const seen = record();
    expect(seen.map((c) => c.path)).toEqual([ADMIN_LAYOUT_PATH, '/venues']);
  });

  it('every page key publishes to at least one public path', async () => {
    // A key that publishes nothing would look like it worked and change no page.
    for (const key of KNOWN_PAGE_KEYS) {
      record();
      await actions.publishLayoutAction(key);
      const seen = record();
      expect(seen.length, `${key} must revalidate the admin route plus public paths`).toBeGreaterThanOrEqual(2);
    }
  });
});

/* ── 3. The internal revalidation endpoint still fails closed ─────── */

describe('Stage 08 Task D — the internal revalidate endpoint is unchanged and safe [structural]', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'api', 'internal', 'revalidate', 'route.ts'),
    'utf8',
  );

  it('fails closed when the secret is not configured', () => {
    // Stage 01 hardened this; Stage 08 must not weaken it. Requirement 6.
    expect(src).toContain('const expected = process.env.INTERNAL_REVALIDATE_SECRET');
    expect(src).toContain("return NextResponse.json({ error: 'not_configured' }, { status: 503 })");
    expect(src).not.toMatch(/INTERNAL_REVALIDATE_SECRET\s*\|\|\s*['"]/);
  });

  it('compares the secret in constant time', () => {
    expect(src).toContain('timingSafeEqual');
  });

  it('allows only an explicit path allow-list, so it is not a general cache-flush endpoint', () => {
    // Requirement 7: no broad unauthorized cache-flush endpoint.
    expect(src).toContain("const ALLOWED_PATHS = new Set(['/'])");
    expect(src).toContain("return NextResponse.json({ error: 'invalid_target' }, { status: 400 })");
  });

  it('rejects an unauthenticated caller with 403', () => {
    expect(src).toContain("return NextResponse.json({ error: 'forbidden' }, { status: 403 })");
  });
});

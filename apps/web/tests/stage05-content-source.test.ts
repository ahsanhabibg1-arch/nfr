import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

/**
 * Stage 05 — content-source contract, behavioural.
 *
 * `pickedThenAuto` + `SelectionContext` are the authoritative content-source
 * pathway after owner decision D-04 retired `contentSourceEngine.ts`. These
 * tests drive the real functions with a mocked content layer, so they assert
 * selection behaviour rather than source text.
 *
 * The mocked boundary is `lib/content`, i.e. the published-article queries. That
 * is deliberate: it lets the tests prove ordering, fallback, bounding and
 * deduplication deterministically, including the cases a database fixture
 * cannot reliably produce (a manual reference to an unpublished record, or
 * content running out mid-page).
 */

const { byIdsMock } = vi.hoisted(() => ({ byIdsMock: vi.fn() }));

vi.mock('../lib/content', () => ({
  getPublishedArticlesByIds: byIdsMock,
}));

const { pickedThenAuto, createSelectionContext, numProp, idListProp, limitList } =
  await import('../lib/cms/slotUtils');
import type { Article } from '../types';

/** Minimal article shaped like the fields the selection path touches. */
function a(id: string): Article {
  return { id, slug: id, title: `Article ${id}` } as unknown as Article;
}

/** The published-article store the mocked content layer resolves against. */
let published: Map<string, Article>;

beforeEach(() => {
  published = new Map(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => [id, a(id)]));
  byIdsMock.mockReset();
  // Mirrors the real getPublishedArticlesByIds: unknown or unpublished ids are
  // simply absent from the result, and caller order is preserved.
  byIdsMock.mockImplementation(async (ids: string[]) =>
    (ids ?? []).map((id) => published.get(id)).filter(Boolean) as Article[]);
});

/** An auto resolver over a fixed pool that honours its exclude list. */
function pool(ids: string[]) {
  return async (need: number, exclude: string[]) =>
    ids.filter((id) => !exclude.includes(id)).slice(0, need).map(a);
}

/* ── 1. Selection context ─────────────────────────────────────────── */

describe('Stage 05 — SelectionContext', () => {
  it('records claimed ids and reports them for exclusion', () => {
    const ctx = createSelectionContext();
    ctx.claim(['x', 'y']);
    expect(ctx.excluded().sort()).toEqual(['x', 'y']);
    expect(ctx.has('x')).toBe(true);
    expect(ctx.has('z')).toBe(false);
  });

  it('accepts a seed set', () => {
    expect(createSelectionContext(['seed']).has('seed')).toBe(true);
  });

  it('ignores null, undefined and empty ids rather than storing junk', () => {
    const ctx = createSelectionContext();
    ctx.claim([null, undefined, '', 'real']);
    expect(ctx.excluded()).toEqual(['real']);
  });

  it('is idempotent — re-claiming an id does not duplicate it', () => {
    const ctx = createSelectionContext();
    ctx.claim(['dup', 'dup']);
    ctx.claim(['dup']);
    expect(ctx.excluded()).toEqual(['dup']);
  });
});

/* ── 2. Manual selection and ordering ─────────────────────────────── */

describe('Stage 05 — manual selection', () => {
  it('returns hand-picked articles in the picked order, not store order', async () => {
    const out = await pickedThenAuto({ featuredIds: 'p3,p1,p2' }, 3, pool([]));
    expect(out.map((x) => x.id)).toEqual(['p3', 'p1', 'p2']);
  });

  it('accepts an array as well as a comma string', async () => {
    const out = await pickedThenAuto({ featuredIds: ['p2', 'p1'] }, 2, pool([]));
    expect(out.map((x) => x.id)).toEqual(['p2', 'p1']);
  });

  it('bounds manual picks to the requested count, keeping the first N in order', async () => {
    const out = await pickedThenAuto({ featuredIds: 'p1,p2,p3,p4' }, 2, pool([]));
    expect(out.map((x) => x.id)).toEqual(['p1', 'p2']);
  });

  it('drops a reference to a MISSING record and keeps the rest in order', async () => {
    const out = await pickedThenAuto({ featuredIds: 'p1,does-not-exist,p2' }, 3, pool([]));
    expect(out.map((x) => x.id)).toEqual(['p1', 'p2']);
  });

  it('drops a reference to an UNPUBLISHED record', async () => {
    published.delete('p2'); // simulates p2 being unpublished
    const out = await pickedThenAuto({ featuredIds: 'p1,p2,p3' }, 3, pool([]));
    expect(out.map((x) => x.id)).toEqual(['p1', 'p3']);
  });

  it('de-duplicates a repeated manual id deterministically — first occurrence wins', async () => {
    const out = await pickedThenAuto({ featuredIds: 'p1,p2,p1' }, 3, pool(['p5']));
    expect(out.map((x) => x.id)).toEqual(['p1', 'p2', 'p5']);
  });

  it('returns nothing for a zero count, without querying', async () => {
    expect(await pickedThenAuto({ featuredIds: 'p1' }, 0, pool(['p2']))).toEqual([]);
    expect(byIdsMock).not.toHaveBeenCalled();
  });
});

/* ── 3. Automatic and mixed selection ─────────────────────────────── */

describe('Stage 05 — automatic and mixed selection', () => {
  it('automatic: with no manual picks, fills entirely from the auto resolver', async () => {
    const out = await pickedThenAuto({}, 3, pool(['p4', 'p5', 'p6']));
    expect(out.map((x) => x.id)).toEqual(['p4', 'p5', 'p6']);
  });

  it('mixed: manual picks come first, auto fills the remainder', async () => {
    const out = await pickedThenAuto({ featuredIds: 'p1' }, 3, pool(['p4', 'p5']));
    expect(out.map((x) => x.id)).toEqual(['p1', 'p4', 'p5']);
  });

  it('mixed: auto-fill never repeats a manual pick', async () => {
    const out = await pickedThenAuto({ featuredIds: 'p4' }, 3, pool(['p4', 'p5', 'p6']));
    expect(out.map((x) => x.id)).toEqual(['p4', 'p5', 'p6']);
    expect(new Set(out.map((x) => x.id)).size).toBe(3);
  });

  it('the auto resolver is asked for exactly the shortfall', async () => {
    const spy = vi.fn(async (need: number) => ['p5', 'p6'].slice(0, need).map(a));
    await pickedThenAuto({ featuredIds: 'p1,p2' }, 4, spy);
    expect(spy.mock.calls[0][0]).toBe(2);
  });

  it('sparse content: returns fewer than requested rather than padding', async () => {
    const out = await pickedThenAuto({ featuredIds: 'p1' }, 5, pool(['p2']));
    expect(out.map((x) => x.id)).toEqual(['p1', 'p2']);
  });

  it('empty everywhere: returns an empty list without throwing', async () => {
    expect(await pickedThenAuto({}, 4, pool([]))).toEqual([]);
  });

  it('is deterministic — the same inputs give the same result', async () => {
    const run = () => pickedThenAuto({ featuredIds: 'p2,p1' }, 4, pool(['p5', 'p6', 'p4']));
    expect((await run()).map((x) => x.id)).toEqual((await run()).map((x) => x.id));
  });
});

/* ── 4. Cross-slot deduplication — the KD-01 mechanism ───────────── */

describe('Stage 05 — cross-slot deduplication', () => {
  it('a later slot excludes articles an earlier slot already placed', async () => {
    const ctx = createSelectionContext();
    const first = await pickedThenAuto({}, 2, pool(['p1', 'p2', 'p3', 'p4']), ctx);
    const second = await pickedThenAuto({}, 2, pool(['p1', 'p2', 'p3', 'p4']), ctx);

    expect(first.map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(second.map((x) => x.id)).toEqual(['p3', 'p4']);
    expect(new Set([...first, ...second].map((x) => x.id)).size).toBe(4);
  });

  it('a later slot drops a MANUAL pick already placed earlier — first slot wins', async () => {
    const ctx = createSelectionContext();
    await pickedThenAuto({ featuredIds: 'p1' }, 1, pool([]), ctx);
    const second = await pickedThenAuto({ featuredIds: 'p1,p2' }, 2, pool([]), ctx);
    expect(second.map((x) => x.id)).toEqual(['p2']);
  });

  it('NEVER pads a slot with an already-shown article to meet its count', async () => {
    // Only p1 and p2 exist in the pool; the first slot takes both.
    const ctx = createSelectionContext();
    await pickedThenAuto({}, 2, pool(['p1', 'p2']), ctx);
    const second = await pickedThenAuto({}, 3, pool(['p1', 'p2']), ctx);
    expect(second, 'a duplicate was used to fill the count').toEqual([]);
  });

  it('a seeded context (the hero) is honoured by the first slot', async () => {
    const ctx = createSelectionContext(['p1']);
    const out = await pickedThenAuto({}, 3, pool(['p1', 'p2', 'p3']), ctx);
    expect(out.map((x) => x.id)).toEqual(['p2', 'p3']);
  });

  it('guards against an auto resolver that IGNORES its exclude list', async () => {
    // Defence in depth: a resolver bug must not be able to reintroduce a duplicate.
    const ignoring = async (need: number) => ['p1', 'p2'].slice(0, need).map(a);
    const ctx = createSelectionContext(['p1']);
    const out = await pickedThenAuto({}, 2, ignoring, ctx);
    expect(out.map((x) => x.id)).toEqual(['p2']);
  });

  it('the context accumulates across many slots', async () => {
    const ctx = createSelectionContext();
    const all: string[] = [];
    for (let i = 0; i < 3; i++) {
      const got = await pickedThenAuto({}, 2, pool(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']), ctx);
      all.push(...got.map((x) => x.id));
    }
    expect(all).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(new Set(all).size).toBe(6);
  });

  it('without a context, behaviour is unchanged — unmigrated callers are unaffected', async () => {
    const first = await pickedThenAuto({}, 2, pool(['p1', 'p2', 'p3']));
    const second = await pickedThenAuto({}, 2, pool(['p1', 'p2', 'p3']));
    expect(first.map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(second.map((x) => x.id)).toEqual(['p1', 'p2']);
  });
});

/* ── 5. Query bounding (Task G) ───────────────────────────────────── */

describe('Stage 05 — bounded queries', () => {
  it('asks the auto resolver for at most the requested count', async () => {
    const spy = vi.fn(async (need: number) => pool(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])(need, []));
    await pickedThenAuto({}, 4, spy);
    expect(spy.mock.calls[0][0]).toBeLessThanOrEqual(4);
  });

  it('issues exactly one manual lookup and at most one auto call per slot', async () => {
    const spy = vi.fn(async (need: number) => pool(['p5', 'p6'])(need, []));
    await pickedThenAuto({ featuredIds: 'p1' }, 3, spy);
    expect(byIdsMock, 'manual lookups per slot').toHaveBeenCalledTimes(1);
    expect(spy, 'auto calls per slot').toHaveBeenCalledTimes(1);
  });

  it('skips the auto call entirely when manual picks already satisfy the count', async () => {
    const spy = vi.fn(async () => [] as Article[]);
    await pickedThenAuto({ featuredIds: 'p1,p2' }, 2, spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('the exclude list passed to auto is de-duplicated', async () => {
    const spy = vi.fn(async (_need: number, _exclude: string[]) => [] as Article[]);
    const ctx = createSelectionContext(['p1']);
    await pickedThenAuto({ featuredIds: 'p1,p2' }, 4, spy, ctx);
    const exclude = spy.mock.calls[0][1];
    expect(exclude.length).toBe(new Set(exclude).size);
    // p1 is both already-claimed and a manual pick, so it must appear once.
    expect(exclude.filter((id) => id === 'p1').length).toBe(1);
  });

  it('numProp clamps a count to its declared bounds', () => {
    expect(numProp({ articleCount: 999 }, 'articleCount', 4, 0, 12)).toBe(12);
    expect(numProp({ articleCount: -5 }, 'articleCount', 4, 0, 12)).toBe(0);
    expect(numProp({}, 'articleCount', 4, 0, 12)).toBe(4);
  });

  it('limitList bounds a resolved list', () => {
    expect(limitList([1, 2, 3, 4], { n: 2 }, 'n', 20)).toEqual([1, 2]);
    expect(limitList([1, 2, 3, 4], {}, 'n', 20)).toEqual([1, 2, 3, 4]);
  });

  it('idListProp tolerates both storage shapes and junk', () => {
    expect(idListProp({ featuredIds: 'a, b ,,c' }, 'featuredIds')).toEqual(['a', 'b', 'c']);
    expect(idListProp({ featuredIds: ['a', '', 'b'] }, 'featuredIds')).toEqual(['a', 'b']);
    expect(idListProp({}, 'featuredIds')).toEqual([]);
  });
});

/* ── 6. Fixture exclusion (Task J item 7) ─────────────────────────── */

describe('Stage 05 — fixture exclusion in public selection', () => {
  const original = process.env.APP_ENV;
  const withEnv = async (env: string) => {
    process.env.APP_ENV = env;
    vi.resetModules();
    return import('../lib/fixturePolicy');
  };

  afterAll(() => {
    if (original === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = original;
    vi.resetModules();
  });

  it('IN PRODUCTION the public article filter excludes fixture slugs', async () => {
    const { publicArticleWhere } = await withEnv('production');
    const where = publicArticleWhere() as { workflowStatus: string; NOT?: { slug?: { startsWith?: string } } };
    expect(where.workflowStatus).toBe('PUBLISHED');
    expect(where.NOT?.slug?.startsWith, 'fixtures are not excluded from public reads in production').toBeTruthy();
  });

  it('IN PRODUCTION a fixture slug is reported as hidden', async () => {
    const { isHiddenFixtureSlug, excludeFixturesFromPublic } = await withEnv('production');
    expect(excludeFixturesFromPublic()).toBe(true);
    expect(isHiddenFixtureSlug('fixture-demo-article')).toBe(true);
    expect(isHiddenFixtureSlug('real-editorial-article')).toBe(false);
  });

  it('in TEST the fixtures stay visible, by design, so smoke tests can use them', async () => {
    const { excludeFixturesFromPublic, isHiddenFixtureSlug } = await withEnv('test');
    expect(excludeFixturesFromPublic()).toBe(false);
    expect(isHiddenFixtureSlug('fixture-demo-article')).toBe(false);
  });

  it('the published-only constraint applies in EVERY environment', async () => {
    for (const env of ['production', 'test', 'development']) {
      const { publicArticleWhere } = await withEnv(env);
      expect((publicArticleWhere() as { workflowStatus: string }).workflowStatus, env).toBe('PUBLISHED');
    }
  });
});

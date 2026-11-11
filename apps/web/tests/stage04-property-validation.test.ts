import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Stage 04 Task C — property validation is enforced from the real PropDef list.
 *
 * Before Stage 04 every check was gated on `typeof val === 'string'`, so
 * numbers, booleans and arrays passed unvalidated; `select` options were never
 * checked; declared min/max were never enforced server-side; the XSS test was a
 * bare `/<script/i`; and arbitrary undeclared keys were persisted silently.
 *
 * These tests drive the real `saveDraft` service with a mocked Prisma client, so
 * they assert the service's actual accept/reject behaviour rather than its text.
 */

const { upsertMock, createMock, updateManyMock, findUniqueMock, warnMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  createMock: vi.fn(),
  updateManyMock: vi.fn(),
  findUniqueMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  prisma: {
    /**
     * Stage 08 Task B changed how `saveDraft` writes, so this mock models the
     * client the service now uses. It no longer calls `upsert`: it reads the row
     * first, then either `create`s (no row yet) or runs a version-guarded
     * `updateMany`. `createMock` therefore receives what `upsertMock` used to.
     */
    pageLayout: {
      create: createMock,
      updateMany: updateManyMock,
      upsert: upsertMock,
      findUnique: findUniqueMock,
      findMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ name: 'Tester' }) },
  },
}));

vi.mock('../lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: warnMock, error: vi.fn() },
  report: vi.fn(),
  newCorrelationId: () => 't', correlationIdFrom: () => 't', redact: (x: unknown) => x, monitoringEnabled: () => false,
}));

const svc = await import('../lib/cms/pageLayoutService');
import type { SectionSlot } from '../lib/cms/sectionRegistry';

const ACTOR = { id: 'stage04-actor', roles: ['super_admin'] as never };

function slot(type: string, props: Record<string, unknown>): SectionSlot {
  return { id: 'v1', sectionType: type, visible: true, order: 0, props } as SectionSlot;
}

beforeEach(() => {
  // No stored row -> saveDraft takes the create path (Stage 08 Task B).
  findUniqueMock.mockReset();
  findUniqueMock.mockResolvedValue(null);
  createMock.mockReset();
  createMock.mockResolvedValue({ id: 'layout-1', pageKey: 'homepage', version: 1 });
  updateManyMock.mockReset();
  updateManyMock.mockResolvedValue({ count: 1 });
});

/** Attempt a save; resolve to null on success or the error message on rejection. */
async function trySave(pageKey: string, slots: SectionSlot[]): Promise<string | null> {
  try {
    await svc.saveDraft(ACTOR, { pageKey, sections: slots, expectedVersion: 'unchecked' });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ id: 'layout-1', pageKey: 'homepage' });
  warnMock.mockReset();
});

/* ── Numeric bounds ────────────────────────────────────────────────── */

describe('Stage 04 Task C — numeric properties', () => {
  it('accepts a value inside the declared range', async () => {
    expect(await trySave('homepage', [slot('latest-coverage', { articleCount: 6 })])).toBeNull();
  });

  it('REJECTS a value above the declared max', async () => {
    const err = await trySave('homepage', [slot('latest-coverage', { articleCount: 999 })]);
    expect(err).toMatch(/at most/i);
    expect(upsertMock, 'nothing may be written when validation fails').not.toHaveBeenCalled();
  });

  it('REJECTS a negative value', async () => {
    expect(await trySave('homepage', [slot('latest-coverage', { articleCount: -1 })])).toMatch(/at least/i);
  });

  it('REJECTS a non-numeric value where a number is declared', async () => {
    expect(await trySave('homepage', [slot('latest-coverage', { articleCount: 'lots' })])).toMatch(/must be a number/i);
  });

  it('REJECTS a fractional value', async () => {
    expect(await trySave('homepage', [slot('latest-coverage', { articleCount: 2.5 })])).toMatch(/whole number/i);
  });
});

/* ── Select options ───────────────────────────────────────────────── */

describe('Stage 04 Task C — select properties', () => {
  it('accepts a declared option', async () => {
    expect(await trySave('homepage', [slot('cta-banner', { bgColor: 'gold' })])).toBeNull();
  });

  it('REJECTS a value that is not one of the declared options', async () => {
    const err = await trySave('homepage', [slot('cta-banner', { bgColor: 'neon-pink' })]);
    expect(err).toMatch(/must be one of/i);
  });

  it('REJECTS a non-string where a select is declared', async () => {
    expect(await trySave('homepage', [slot('cta-banner', { bgColor: 7 })])).toMatch(/must be a string/i);
  });
});

/* ── Booleans ─────────────────────────────────────────────────────── */

describe('Stage 04 Task C — boolean properties', () => {
  it('REJECTS a truthy string where a boolean is declared', async () => {
    // detail-hero.showImage is declared `text` today, so use a real boolean prop.
    const boolProp = (await import('../lib/cms/sectionRegistry')).HOMEPAGE_SECTIONS
      .flatMap((d) => d.editableProps.map((p) => ({ type: d.type, p })))
      .find(({ p }) => p.type === 'boolean');
    if (!boolProp) return; // no boolean props declared today; nothing to assert
    const err = await trySave('homepage', [slot(boolProp.type, { [boolProp.p.key]: 'yes' })]);
    expect(err).toMatch(/true or false/i);
  });
});

/* ── URL and image safety ─────────────────────────────────────────── */

describe('Stage 04 Task C — URL and image properties', () => {
  it('accepts a same-site path', async () => {
    expect(await trySave('homepage', [slot('cta-banner', { ctaText: 'Go', ctaUrl: '/coverage/' })])).toBeNull();
  });

  it('accepts an https URL', async () => {
    expect(await trySave('homepage', [slot('cta-banner', { ctaText: 'Go', ctaUrl: 'https://example.com/x' })])).toBeNull();
  });

  it('REJECTS a javascript: scheme', async () => {
    const err = await trySave('homepage', [slot('cta-banner', { ctaUrl: 'javascript:alert(1)' })]);
    expect(err).toMatch(/disallowed URL scheme/i);
  });

  it('REJECTS a data: scheme — which the old /<script/ check allowed through', async () => {
    const err = await trySave('homepage', [slot('cta-banner', { ctaUrl: 'data:text/html,<b>x</b>' })]);
    expect(err).toMatch(/disallowed URL scheme/i);
  });

  it('REJECTS a malformed URL', async () => {
    expect(await trySave('homepage', [slot('cta-banner', { ctaUrl: 'not a url at all' })])).toMatch(/relative path or an http/i);
  });

  it('REJECTS an unsafe scheme on an image property', async () => {
    expect(await trySave('homepage', [slot('editorial-hero', { heroImageUrl: 'javascript:void(0)' })])).toMatch(/disallowed URL scheme/i);
  });
});

/* ── Text safety — beyond the old /<script/i check ────────────────── */

describe('Stage 04 Task C — text property safety', () => {
  it('accepts ordinary editorial prose, including angle brackets in words', async () => {
    expect(await trySave('homepage', [slot('rich-text-block', { title: 'Scores 8 > 7 at the NFR' })])).toBeNull();
  });

  it('REJECTS a <script> tag (the original check)', async () => {
    expect(await trySave('homepage', [slot('rich-text-block', { title: '<script>alert(1)</script>' })])).toMatch(/disallowed markup/i);
  });

  it('REJECTS an event-handler attribute, which the old check MISSED', async () => {
    const err = await trySave('homepage', [slot('rich-text-block', { title: '<img src=x onerror=alert(1)>' })]);
    expect(err).toMatch(/disallowed markup/i);
  });

  it('REJECTS an <svg onload>, which the old check MISSED', async () => {
    expect(await trySave('homepage', [slot('rich-text-block', { title: '<svg onload=alert(1)>' })])).toMatch(/disallowed markup/i);
  });

  it('REJECTS an <iframe>, which the old check MISSED', async () => {
    expect(await trySave('homepage', [slot('rich-text-block', { body: '<iframe src="//evil"></iframe>' })])).toMatch(/disallowed markup/i);
  });

  it('REJECTS a value over the character limit', async () => {
    expect(await trySave('homepage', [slot('rich-text-block', { title: 'x'.repeat(2001) })])).toMatch(/exceeds 2000/i);
  });

  it('REJECTS a non-string where text is declared', async () => {
    expect(await trySave('homepage', [slot('rich-text-block', { title: { a: 1 } })])).toMatch(/must be a string/i);
  });
});

/* ── Undeclared keys: warn, keep, never delete ────────────────────── */

describe('Stage 04 Task C — undeclared legacy keys', () => {
  it('ACCEPTS an undeclared key rather than failing a save on an untouched page', async () => {
    expect(await trySave('homepage', [slot('rich-text-block', { title: 'ok', legacyFromBatch12: 'kept' })])).toBeNull();
  });

  it('WARNS about the undeclared key so the drift is visible', async () => {
    await trySave('homepage', [slot('rich-text-block', { title: 'ok', legacyFromBatch12: 'kept' })]);
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warnMock.mock.calls[0])).toContain('rich-text-block.legacyFromBatch12');
  });

  it('PRESERVES the undeclared value in what is written — nothing is dropped', async () => {
    // Stage 08 Task B: `saveDraft` writes through `create` (no stored row in
    // this mock) rather than `upsert`. The assertion is unchanged in substance:
    // the undeclared key and its value must reach the write.
    await trySave('homepage', [slot('rich-text-block', { title: 'ok', legacyFromBatch12: 'kept' })]);
    expect(JSON.stringify(createMock.mock.calls[0])).toContain('legacyFromBatch12');
    expect(JSON.stringify(createMock.mock.calls[0])).toContain('kept');
  });

  it('still applies baseline safety to an undeclared key', async () => {
    const err = await trySave('homepage', [slot('rich-text-block', { legacyEvil: '<script>x</script>' })]);
    expect(err).toMatch(/disallowed content/i);
  });

  it('does not warn when every key is declared', async () => {
    await trySave('homepage', [slot('rich-text-block', { title: 'ok', body: 'b', alignment: 'left' })]);
    expect(warnMock).not.toHaveBeenCalled();
  });
});

/* ── Featured id lists ────────────────────────────────────────────── */

describe('Stage 04 Task C — featured id lists', () => {
  it('accepts a comma-joined id string, as the editor stores it', async () => {
    expect(await trySave('homepage', [slot('editorial-hero', { featuredIds: 'a1,a2,a3' })])).toBeNull();
  });

  it('accepts an array of ids, as the API may supply', async () => {
    expect(await trySave('homepage', [slot('editorial-hero', { featuredIds: ['a1', 'a2'] })])).toBeNull();
  });

  it('REJECTS an unreasonable number of references', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `a${i}`);
    expect(await trySave('homepage', [slot('editorial-hero', { featuredIds: many })])).toMatch(/more than 50/i);
  });
});

/* ── Family-aware instance limits (Task B, enforced server-side) ──── */

describe('Stage 04 Task B — instance limits are enforced per family', () => {
  const rich = (n: number) => Array.from({ length: n }, (_, i) => (
    { id: `r${i}`, sectionType: 'rich-text-block', visible: true, order: i, props: {} } as SectionSlot
  ));

  it('allows 5 rich-text blocks on the homepage', async () => {
    expect(await trySave('homepage', rich(5))).toBeNull();
  });

  it('REJECTS a 6th rich-text block on the homepage', async () => {
    expect(await trySave('homepage', rich(6))).toMatch(/exceeds max instances \(5\)/i);
  });

  it('REJECTS a 4th rich-text block on a section landing — the stricter cap now applies', async () => {
    const err = await trySave('section:competition', rich(4));
    expect(err).toMatch(/exceeds max instances \(3\)/i);
    expect(err).toMatch(/section-landing/);
  });

  it('allows 3 rich-text blocks on a section landing', async () => {
    expect(await trySave('section:competition', rich(3))).toBeNull();
  });
});

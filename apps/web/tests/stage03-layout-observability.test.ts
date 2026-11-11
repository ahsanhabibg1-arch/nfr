import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Stage 03 Task G — layout retrieval errors are observable.
 *
 * BEHAVIOUR PROVEN: a database failure during layout retrieval is logged and
 * reported, and is distinguishable from the two legitimate default cases.
 *
 * Previously `getPublishedSections` / `getDraftSections` swallowed every error
 * and returned family defaults, so a database outage was indistinguishable from
 * "this page has no customised layout". That would have masked regressions
 * throughout Stages 04-10, which is why it is fixed here rather than later.
 *
 * The fallback itself is PRESERVED: a public page must still render during an
 * outage. Only the silence is removed.
 */

const { findUniqueMock, logErrorMock, reportMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  logErrorMock: vi.fn(),
  reportMock: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  prisma: { pageLayout: { findUnique: findUniqueMock } },
}));

vi.mock('../lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: logErrorMock },
  report: reportMock,
  newCorrelationId: () => 'test',
  correlationIdFrom: () => 'test',
  redact: (x: unknown) => x,
  monitoringEnabled: () => false,
}));

const { getPublishedSectionsResolved, getDraftSectionsResolved, getPublishedSections } =
  await import('../lib/cms/pageLayoutService');

beforeEach(() => {
  findUniqueMock.mockReset();
  logErrorMock.mockReset();
  reportMock.mockReset();
});

describe('Stage 03 Task G — the three retrieval outcomes are distinguishable', () => {
  it('MISSING LAYOUT: no row -> family defaults, reported as default-no-layout, nothing logged as an error', async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await getPublishedSectionsResolved('homepage');
    expect(res.source).toBe('default-no-layout');
    expect(res.slots.length).toBeGreaterThan(0);
    expect(logErrorMock).not.toHaveBeenCalled();
    expect(reportMock).not.toHaveBeenCalled();
  });

  it('VALID DEFAULT: row exists with an empty array -> defaults, reported as default-empty, not an error', async () => {
    findUniqueMock.mockResolvedValue({ pageKey: 'homepage', publishedSections: [] });
    const res = await getPublishedSectionsResolved('homepage');
    expect(res.source).toBe('default-empty');
    expect(res.slots.length).toBeGreaterThan(0);
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it('DATABASE FAILURE: query throws -> defaults served, AND the error is logged and reported', async () => {
    findUniqueMock.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = await getPublishedSectionsResolved('homepage');

    // Fallback preserved: the public page still renders.
    expect(res.slots.length).toBeGreaterThan(0);
    // But it is now attributable.
    expect(res.source).toBe('default-db-error');
    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock.mock.calls[0][0]).toBe('database');
  });

  it('the log carries the pageKey and column, and does not leak the connection string', async () => {
    findUniqueMock.mockRejectedValue(new Error('postgresql://user:secret@host/db unreachable'));
    await getDraftSectionsResolved('section:competition');

    const [message, fields] = logErrorMock.mock.calls[0];
    expect(typeof message).toBe('string');
    expect(fields.pageKey).toBe('section:competition');
    expect(fields.column).toBe('draftSections');
    // The message itself must not be the credential-bearing string.
    expect(message).not.toContain('secret');
  });

  it('stored sections are returned as stored, not as a default', async () => {
    findUniqueMock.mockResolvedValue({
      pageKey: 'homepage',
      publishedSections: [{ id: 's1', sectionType: 'rich-text-block', visible: true, order: 0, props: { title: 'x' } }],
    });
    const res = await getPublishedSectionsResolved('homepage');
    expect(res.source).toBe('stored');
    expect(res.slots).toHaveLength(1);
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it('the public signature is unchanged — callers still receive a plain slot array', async () => {
    findUniqueMock.mockResolvedValue(null);
    const slots = await getPublishedSections('homepage');
    expect(Array.isArray(slots)).toBe(true);
    expect(slots.length).toBeGreaterThan(0);
  });

  it('draft retrieval reads the draft column, not the published one', async () => {
    findUniqueMock.mockResolvedValue({
      pageKey: 'homepage',
      draftSections: [{ id: 'd1', sectionType: 'cta-banner', visible: true, order: 0, props: {} }],
      publishedSections: [{ id: 'p1', sectionType: 'rich-text-block', visible: true, order: 0, props: {} }],
    });
    const draft = await getDraftSectionsResolved('homepage');
    const published = await getPublishedSectionsResolved('homepage');
    expect(draft.slots[0].sectionType).toBe('cta-banner');
    expect(published.slots[0].sectionType).toBe('rich-text-block');
  });
});

describe('Stage 03 Task G — negative control', () => {
  it('a thrown query cannot be mistaken for a missing layout', async () => {
    findUniqueMock.mockRejectedValue(new Error('boom'));
    const err = await getPublishedSectionsResolved('homepage');
    findUniqueMock.mockResolvedValue(null);
    const missing = await getPublishedSectionsResolved('homepage');

    // Identical slot payloads...
    expect(err.slots.length).toBe(missing.slots.length);
    // ...but no longer identical outcomes. This is the whole point of Task G.
    expect(err.source).not.toBe(missing.source);
  });
});

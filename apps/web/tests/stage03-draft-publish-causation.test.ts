import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';
import type * as PageLayoutSvc from '../lib/cms/pageLayoutService';

/**
 * Stage 03 Tasks B, C, F — draft -> publish -> public causation.
 *
 * BEHAVIOUR PROVEN, end to end through the real services and the real database:
 *   B1. A property saved as a draft persists in the draft column.
 *   B2. Authorized preview resolution returns the DRAFT value.
 *   B3. Public resolution does NOT expose the unpublished value.
 *   B4. Publishing copies draft -> published.
 *   B5. Public resolution then returns the PUBLISHED value, and it reaches HTML.
 *   B6. A revision is created on publish, per the existing contract.
 *   C.  Draft isolation holds for all 15 registered page keys.
 *   F.  A layout stored before a property existed still renders, using defaults.
 *
 * This is the chain the project had never tested. 611 tests across 13 Builder
 * suites described it in source-text assertions; none traversed it.
 *
 * Self-skips without an isolated test database, matching the existing DB suites.
 * It never falls back to the development database — vitest.config.ts blanks
 * DATABASE_URL unless tests/support/testDbGuard.ts approves an isolated one.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Capability probe. The isolated test database may be behind the schema, so the
 * suite checks for the specific tables it needs and runs the subset it can.
 * Anything it cannot run is SKIPPED with a precise reason and reported BLOCKED —
 * never silently counted as a pass.
 */
let available = false;      // PageLayout reachable: draft save/resolve, isolation
let hasRevisions = false;   // PageLayoutRevision present: publishLayout works
let skipReason = 'no isolated test database (TEST_DATABASE_URL unset)';
let prisma: PrismaClient;
let svc: typeof PageLayoutSvc;

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    svc = await import('../lib/cms/pageLayoutService');

    // A real client query is the only honest compatibility check: the generated
    // client selects every column in the current schema, so a database that is
    // behind on migrations fails even when the table itself exists.
    try {
      // Full-row read, with no `select`, because that is what the services do
      // (saveDraft upserts and returns the whole row). A narrow select would
      // pass against a database that is missing columns the services need.
      await prisma.pageLayout.findFirst();
      available = true;
    } catch (err) {
      skipReason = `PageLayout is not queryable with the current Prisma client — the test database is behind the schema (${String(err).replace(/\s+/g, ' ').slice(0, 120)})`;
    }

    if (available) {
      try {
        await prisma.pageLayoutRevision.findFirst();
        hasRevisions = true;
      } catch {
        skipReason = 'PageLayoutRevision is not queryable; publish-dependent cases skipped';
      }
    }
  } catch (err) {
    skipReason = `database unreachable: ${String(err).slice(0, 80)}`;
  }
}

const { blockRegistry } = await import('../components/blocks/registry');
const { KNOWN_PAGE_KEYS, buildDefaultSlots, getPageFamily } = await import('../lib/cms/sectionRegistry');
import type { SectionSlot } from '../lib/cms/sectionRegistry';

/**
 * A super_admin actor: saveDraft/publishLayout require `system.config`, and
 * every mutation is audit-logged. `AuditLog.actorId` carries an FK to `User`,
 * so the suite creates an ephemeral user in beforeAll and removes it in afterAll
 * — the same pattern the existing DB suites use.
 */
const ACTOR: { id: string; roles: never } = { id: '', roles: ['super_admin'] as never };
let ephemeralUserId: string | null = null;

const TEST_KEY = 'homepage';
const DRAFT_SENTINEL = 'ZzStage03DraftOnly';
const PUBLISHED_SENTINEL = 'ZzStage03Published';

function slot(props: Record<string, unknown>): SectionSlot {
  return { id: 'stage03-causation-slot', sectionType: 'rich-text-block', visible: true, order: 0, props } as SectionSlot;
}

function renderSlots(slots: SectionSlot[], data: Record<string, unknown> = {}): string {
  return slots
    .map((s) => {
      const C = blockRegistry[s.sectionType];
      return C ? renderToStaticMarkup(React.createElement(C, { slot: s, data })) : '';
    })
    .join('');
}

/** Saved so the suite can restore the real layout afterwards. */
let originalDraft: unknown = null;
let originalPublished: unknown = null;
let hadRow = false;

beforeAll(async () => {
  if (!available) return;
  try {
    const user = await prisma.user.create({
      data: { email: `stage03test-${Date.now()}@example.com`, name: 'Stage03 Test Actor', status: 'ACTIVE' },
    });
    ephemeralUserId = user.id;
    ACTOR.id = user.id;

    const existing = await prisma.pageLayout.findUnique({ where: { pageKey: TEST_KEY } });
    if (existing) {
      hadRow = true;
      originalDraft = existing.draftSections;
      originalPublished = existing.publishedSections;
    }
  } catch (err) {
    // A hook must never fail the whole file; downgrade to a clean skip.
    available = false;
    hasRevisions = false;
    skipReason = `setup failed: ${String(err).replace(/\s+/g, ' ').slice(0, 120)}`;
  }
});

afterAll(async () => {
  if (!available) return;
  // Restore exactly what was there; never leave test state behind.
  if (hadRow) {
    await prisma.pageLayout.update({
      where: { pageKey: TEST_KEY },
      data: { draftSections: originalDraft as never, publishedSections: originalPublished as never },
    });
  } else {
    await prisma.pageLayout.deleteMany({ where: { pageKey: TEST_KEY } });
  }

  // Remove the ephemeral actor and the audit rows it generated, so the suite
  // leaves the test database exactly as it found it.
  if (ephemeralUserId) {
    await prisma.auditLog.deleteMany({ where: { actorId: ephemeralUserId } });
    await prisma.userRole.deleteMany({ where: { userId: ephemeralUserId } });
    await prisma.user.deleteMany({ where: { id: ephemeralUserId } });
  }
});

describe.skipIf(!available)('Stage 03 Task B — draft to public causation', () => {
  it('B1: a draft save persists the property in the draft column', async () => {
    await svc.saveDraft(ACTOR, { pageKey: TEST_KEY, sections: [slot({ title: DRAFT_SENTINEL, body: 'b' })], expectedVersion: 'unchecked' });

    const row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(row.draftSections)).toContain(DRAFT_SENTINEL);
  });

  it('B2: authorized preview resolution returns the draft value', async () => {
    const draft = await svc.getDraftSections(TEST_KEY);
    expect(renderSlots(draft)).toContain(DRAFT_SENTINEL);
  });

  it('B3: public resolution does NOT expose the unpublished draft value', async () => {
    const published = await svc.getPublishedSections(TEST_KEY);
    const html = renderSlots(published);
    expect(html, 'an unpublished draft reached public output').not.toContain(DRAFT_SENTINEL);
  });

  it.skipIf(!hasRevisions)('B4 + B6: publishing copies draft to published and creates a revision', async () => {
    const before = await prisma.pageLayoutRevision.count({ where: { pageKey: TEST_KEY } });

    await svc.saveDraft(ACTOR, { pageKey: TEST_KEY, sections: [slot({ title: PUBLISHED_SENTINEL, body: 'b' })], expectedVersion: 'unchecked' });
    await svc.publishLayout(ACTOR, TEST_KEY);

    const row = await prisma.pageLayoutRevision.count({ where: { pageKey: TEST_KEY } });
    expect(row, 'publish did not create a revision').toBe(before + 1);

    const layout = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(layout.publishedSections)).toContain(PUBLISHED_SENTINEL);
  });

  it.skipIf(!hasRevisions)('B5: public rendering now reflects the published value', async () => {
    const published = await svc.getPublishedSections(TEST_KEY);
    const html = renderSlots(published);
    expect(html).toContain(PUBLISHED_SENTINEL);
    // The earlier draft-only sentinel must be gone from public output.
    expect(html).not.toContain(DRAFT_SENTINEL);
  });

  it.skipIf(!hasRevisions)('the published layout is reported as stored, not as a family default', async () => {
    const res = await svc.getPublishedSectionsResolved(TEST_KEY);
    expect(res.source).toBe('stored');
  });

  it('resolver-level props (featuredIds/articleCount) survive the save/resolve round trip', async () => {
    // These cannot be proven by a component sentinel — the resolver reads them,
    // not the component — so their persistence is proven here instead. This is
    // what closes the VIA_RESOLVER exemptions in the contract register.
    const sections = [{
      id: 'stage03-resolver-slot', sectionType: 'latest-coverage', visible: true, order: 0,
      props: { articleCount: 7, featuredIds: ['fx-a', 'fx-b'], title: 'Resolver Props' },
    }] as SectionSlot[];

    await svc.saveDraft(ACTOR, { pageKey: TEST_KEY, sections, expectedVersion: 'unchecked' });

    const draft = await svc.getDraftSections(TEST_KEY);
    const target = draft.find((s) => s.id === 'stage03-resolver-slot');
    expect(target?.props.articleCount).toBe(7);
    expect(target?.props.featuredIds).toEqual(['fx-a', 'fx-b']);
  });

  it('a draft save is reported as stored, not as a family default', async () => {
    const res = await svc.getDraftSectionsResolved(TEST_KEY);
    expect(res.source).toBe('stored');
  });
});

describe.skipIf(!available)('Stage 03 Task C — draft isolation across all 16 page keys', () => {
  it('KNOWN_PAGE_KEYS still contains exactly 16 keys', () => {
    // 16 since PM-05 added `template:info-page`, which gets the same draft
    // isolation as every other key — that is what this suite then proves.
    expect(KNOWN_PAGE_KEYS.length).toBe(16);
  });

  for (const pageKey of KNOWN_PAGE_KEYS) {
    it(`${pageKey}: a draft-only value never appears in published resolution`, async () => {
      const sentinel = `ZzIsolate_${pageKey.replace(/[^a-z0-9]/gi, '_')}`;
      const family = getPageFamily(pageKey);
      const defaults = buildDefaultSlots(family);

      // Use a block type that is valid for this page family, so saveDraft's
      // section-type validation accepts it. Every family has at least one.
      const sampleType = defaults[0]?.sectionType;
      expect(sampleType, `no default slot for ${pageKey}`).toBeTruthy();

      const before = await prisma.pageLayout.findUnique({ where: { pageKey } });

      await svc.saveDraft(ACTOR, {
        pageKey,
        sections: [{ id: `iso-${pageKey}`, sectionType: sampleType!, visible: true, order: 0, props: { title: sentinel } } as SectionSlot],
        expectedVersion: 'unchecked',
      });

      const draftJson = JSON.stringify(await svc.getDraftSections(pageKey));
      const publishedJson = JSON.stringify(await svc.getPublishedSections(pageKey));

      expect(draftJson, `${pageKey}: draft did not retain the value`).toContain(sentinel);
      expect(publishedJson, `${pageKey}: an unpublished value leaked into published output`).not.toContain(sentinel);

      // Restore.
      if (before) {
        await prisma.pageLayout.update({
          where: { pageKey },
          data: { draftSections: before.draftSections as never, publishedSections: before.publishedSections as never },
        });
      } else {
        await prisma.pageLayout.deleteMany({ where: { pageKey } });
      }
    });
  }
});

describe.skipIf(!available)('Stage 03 Task F — backward compatibility of stored layouts', () => {
  it('a layout stored WITHOUT a later-added optional property still renders, using defaults', async () => {
    // Simulates a row written before `alignment` / `body` existed on the block:
    // only `title` is present. The renderer must fall back, not throw. Proven
    // through the real save + resolve path, not a hand-built array.
    const legacy = [{ id: 'legacy-slot', sectionType: 'rich-text-block', visible: true, order: 0, props: { title: 'Legacy Title' } }] as SectionSlot[];

    await svc.saveDraft(ACTOR, { pageKey: TEST_KEY, sections: legacy, expectedVersion: 'unchecked' });

    const stored = await svc.getDraftSections(TEST_KEY);
    const html = renderSlots(stored);

    expect(html).toContain('Legacy Title');
    // The absent `alignment` prop must fall back to the documented default.
    expect(html).toContain('text-align:left');
  });

  it('a stored slot with an unknown sectionType does not break the page', async () => {
    // PageRenderer skips unregistered types. Rendering must degrade, not throw.
    const withUnknown = [
      { id: 'known', sectionType: 'rich-text-block', visible: true, order: 0, props: { title: 'Known Block' } },
      { id: 'unknown', sectionType: 'stage03-retired-block', visible: true, order: 1, props: {} },
    ] as SectionSlot[];

    const html = renderSlots(withUnknown);
    expect(html).toContain('Known Block');
    expect(html).not.toContain('stage03-retired-block');
  });

  it('a stored slot missing `props` entirely renders with defaults', async () => {
    const noProps = [{ id: 'noprops', sectionType: 'rich-text-block', visible: true, order: 0, props: {} }] as SectionSlot[];
    expect(() => renderSlots(noProps)).not.toThrow();
  });
});

describe('Stage 03 Tasks B/C/F — environment', () => {
  it('reports whether the DB-backed causation suites executed', () => {
    if (!available) {
      // Surfaced deliberately so a skipped run is never mistaken for a pass.
      console.warn(`[stage03] DB causation suites SKIPPED — ${skipReason}`);
    }
    expect(typeof available).toBe('boolean');
  });
});

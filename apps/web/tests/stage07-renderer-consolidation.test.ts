import { describe, it, expect, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

/**
 * Stage 07 Task A — renderer consolidation, proven against the REAL resolvers
 * and the REAL renderer.
 *
 * WHY THIS FILE EXISTS
 *
 * Seven tests across `batch-a-renderer`, `batch-b-detail`, `batch-e-directory`
 * and `batch-i-hardening` claimed, by name, that the resolvers "filter visible
 * slots and sort by order". Every one of them asserted a SOURCE STRING —
 * `expect(src).toContain('.filter((s) => s.visible)')`. When Stage 07 replaced
 * those five hand-written copies with one shared function, all seven failed
 * although the behaviour was intact and better guaranteed. They were measuring
 * the characters in a file, not the ordering of a page.
 *
 * This file is the behavioural replacement. It writes a real `PageLayout` row
 * to the ISOLATED test database with slots deliberately out of order and one
 * hidden, then asserts what each resolver and the renderer actually produce.
 * The seven original tests now delegate their claim here by name.
 *
 * DATABASE: the isolated test database only (`TEST_DATABASE_URL`, enforced by
 * `vitest.config.ts`). Rows are created under reserved page keys and removed in
 * `afterAll`. Production is never contacted.
 */

const PROBE_KEYS = ['directory:competitors', 'template:article'] as const;

let available = false;
let skipReason = 'no isolated test database (TEST_DATABASE_URL unset)';
let prisma: PrismaClient;
let resolveDirectorySlots: typeof import('../lib/cms/directoryData').resolveDirectorySlots;
let resolveArticleTemplateSlots: typeof import('../lib/cms/detailTemplateData').resolveArticleTemplateSlots;

/** Rows this suite created and must remove, so it leaves the database as found. */
const createdKeys: string[] = [];

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.pageLayout.findFirst();
    ({ resolveDirectorySlots } = await import('../lib/cms/directoryData'));
    ({ resolveArticleTemplateSlots } = await import('../lib/cms/detailTemplateData'));
    available = true;
  } catch (err) {
    skipReason = `resolver integration unavailable — ${String(err).replace(/\s+/g, ' ').slice(0, 120)}`;
  }
}

if (!available) {
  // Visible rather than silent: a missing database must not look like a pass.
  // eslint-disable-next-line no-console
  console.warn(`[stage07-renderer-consolidation] DB suites skipped: ${skipReason}`);
}

function slot(sectionType: string, order: number, visible = true, props: Record<string, unknown> = {}): SectionSlot {
  return { id: `s07-${sectionType}-${order}`, sectionType, visible, order, props };
}

/**
 * Write a layout to BOTH columns under a real page key. Both columns so the
 * published path and the draft path can be compared for isolation without a
 * second row.
 */
async function writeLayout(pageKey: string, published: SectionSlot[], draft: SectionSlot[]): Promise<void> {
  await prisma.pageLayout.upsert({
    where: { pageKey },
    create: {
      pageKey,
      publishedSections: published as unknown as object,
      draftSections: draft as unknown as object,
    },
    update: {
      publishedSections: published as unknown as object,
      draftSections: draft as unknown as object,
    },
  });
  if (!createdKeys.includes(pageKey)) createdKeys.push(pageKey);
}

afterAll(async () => {
  if (!available) return;
  for (const key of createdKeys) {
    await prisma.pageLayout.deleteMany({ where: { pageKey: key } });
  }
});

/* ── 1. The directory resolver orders and filters for real ─────────── */

describe.runIf(available)('Stage 07 Task A — resolveDirectorySlots filters visible and sorts by order', () => {
  it('returns visible slots in ascending order, from a deliberately shuffled layout', async () => {
    await writeLayout(
      'directory:competitors',
      [
        slot('directory-cta', 2, true, { ctaText: 'Browse', ctaUrl: '/venues/' }),
        slot('directory-hero', 0, true, { title: 'Probe hero', description: 'Probe desc' }),
        slot('directory-grid', 1),
      ],
      [slot('directory-hero', 0, true, { title: 'DRAFT hero' })],
    );

    const out = await resolveDirectorySlots('directory:competitors');
    const order = out.map((r) => r.slot.order);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // The hero was stored LAST in the array and first by `order`; the CTA the
    // reverse. Ordering, not array position, decides.
    const types = out.map((r) => r.slot.sectionType);
    expect(types.indexOf('directory-hero')).toBeLessThan(types.indexOf('directory-cta'));
    // Which TYPES a directory layout emits is Task F's subject, asserted in
    // `tests/stage07-directory-template.test.ts`. This test owns ordering only.
  });

  it('omits a hidden slot entirely', async () => {
    await writeLayout(
      'directory:competitors',
      [
        slot('directory-hero', 0, true, { title: 'Probe hero' }),
        slot('directory-cta', 1, false, { ctaText: 'Hidden CTA', ctaUrl: '/x/' }),
      ],
      [],
    );

    const out = await resolveDirectorySlots('directory:competitors');
    expect(out.map((r) => r.slot.sectionType)).not.toContain('directory-cta');
  });

  it('keeps draft and published layouts isolated', async () => {
    await writeLayout(
      'directory:competitors',
      [slot('directory-hero', 0, true, { title: 'PUBLISHED hero' })],
      [slot('directory-hero', 0, true, { title: 'DRAFT hero' })],
    );

    const pub = await resolveDirectorySlots('directory:competitors');
    const draft = await resolveDirectorySlots('directory:competitors', { draft: true });
    expect(pub.find((r) => r.slot.sectionType === 'directory-hero')?.data.heroTitle).toBe('PUBLISHED hero');
    expect(draft.find((r) => r.slot.sectionType === 'directory-hero')?.data.heroTitle).toBe('DRAFT hero');
  });
});

/* ── 2. The detail-template resolver orders and filters for real ───── */

describe.runIf(available)('Stage 07 Task A — detail template resolver filters visible and sorts by order', () => {
  it('returns visible appendage slots in ascending order', async () => {
    await writeLayout(
      'template:article',
      [
        slot('detail-cta', 3, true, { ctaText: 'Last', ctaUrl: '/' }),
        slot('rich-text-block', 1, true, { title: 'First', body: 'Intro body' }),
        slot('detail-cta', 2, false, { ctaText: 'Hidden middle', ctaUrl: '/' }),
      ],
      [],
    );

    const out = await resolveArticleTemplateSlots('no-such-article-id');
    const orders = out.map((r) => r.slot.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(out.map((r) => r.slot.props.ctaText ?? r.slot.props.title)).not.toContain('Hidden middle');
  });
});

/* ── 3. The renderer is the final authority ────────────────────────── */

const { PageRenderer } = await import('../components/blocks/PageRenderer');

describe('Stage 07 Task A — PageRenderer enforces the contract on resolver output', () => {
  function render(slots: SectionSlot[], editorMode?: boolean): string {
    return renderToStaticMarkup(
      React.createElement(PageRenderer, { slots: slots.map((s) => ({ slot: s, data: {} })), editorMode }),
    );
  }

  it('orders by `order` even when a caller hands it an unsorted list', () => {
    const html = render(
      [slot('cta-banner', 2, true, { ctaText: 'second' }), slot('cta-banner', 1, true, { ctaText: 'first' })],
      true,
    );
    expect(html.indexOf('data-slot-id="s07-cta-banner-1"')).toBeLessThan(
      html.indexOf('data-slot-id="s07-cta-banner-2"'),
    );
  });

  it('drops a hidden slot a future caller forgot to filter', () => {
    const html = render([slot('cta-banner', 0, false, { ctaText: 'should not appear' })]);
    expect(html).toBe('');
  });

  /**
   * The documented exception in `PageRenderer`: `SectionLandingSlots` splits the
   * resolved list into the hero and the remainder, so the renderer runs twice on
   * two subsets. This asserts the split is order-preserving, which is what makes
   * the exception safe rather than merely declared.
   */
  it('partitioned rendering (SectionLandingSlots) preserves overall page order', () => {
    const resolved: SectionSlot[] = [
      slot('landing-hero', 0),
      slot('landing-featured', 1),
      slot('landing-competition-disciplines', 1.5),
      slot('landing-grid', 2),
    ];
    const heroPart = resolved.filter((s) => s.sectionType === 'landing-hero');
    const contentPart = resolved.filter((s) => s.sectionType !== 'landing-hero');

    const partitioned = render(heroPart, true) + render(contentPart, true);
    const whole = render(resolved, true);

    const ids = (html: string) => [...html.matchAll(/data-slot-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(partitioned)).toEqual(ids(whole));
  });
});

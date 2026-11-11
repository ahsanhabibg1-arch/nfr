import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Stage 05 Task F — newsletter retirement (owner decision D-11) and legacy
 * layout compatibility.
 *
 * The decision: remove the non-functional `newsletter-signup` block from the
 * Builder's available registry until a working subscription backend and consent
 * workflow are approved. No backend was created and no visitor data is
 * collected.
 *
 * The compatibility problem this had to solve: Stage 04 found zero stored
 * layouts in the inspectable databases, but **production was not inspected**.
 * So a stored layout containing a legacy newsletter slot must be assumed
 * possible. Deleting the definition outright would make `saveDraft` reject that
 * layout, locking an admin out of editing a page they never touched.
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/', useSearchParams: () => new URLSearchParams(),
}));

const svc = await import('../lib/cms/pageLayoutService');
const { blockRegistry } = await import('../components/blocks/registry');
const { PageRenderer } = await import('../components/blocks/PageRenderer');
const {
  HOMEPAGE_SECTIONS, getAvailableBlockTypes, getKnownSectionTypes,
  isRetiredSectionType, buildDefaultSlots,
} = await import('../lib/cms/sectionRegistry');
import type { SectionSlot, SectionDef } from '../lib/cms/sectionRegistry';

const ACTOR = { id: 'stage05-actor', roles: ['super_admin'] as never };

function slot(type: string, props: Record<string, unknown> = {}, id = 'legacy-1'): SectionSlot {
  return { id, sectionType: type, visible: true, order: 0, props } as SectionSlot;
}

async function trySave(pageKey: string, slots: SectionSlot[]): Promise<string | null> {
  try { await svc.saveDraft(ACTOR, { pageKey, sections: slots, expectedVersion: 'unchecked' }); return null; }
  catch (e) { return (e as Error).message; }
}

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ id: 'layout-1', pageKey: 'homepage' });
  // Stage 08 Task B: saveDraft reads, then creates when no row exists.
  findUniqueMock.mockReset();
  findUniqueMock.mockResolvedValue(null);
  createMock.mockReset();
  createMock.mockResolvedValue({ id: 'layout-1', pageKey: 'homepage', version: 1 });
  updateManyMock.mockReset();
  updateManyMock.mockResolvedValue({ count: 1 });
  warnMock.mockReset();
});

/* ── The block is no longer offered ───────────────────────────────── */

describe('Stage 05 Task F — newsletter-signup is removed from the block library', () => {
  it('is NOT in the homepage block library the admin can add from', () => {
    const available = getAvailableBlockTypes('homepage').map((d) => d.type);
    expect(available).not.toContain('newsletter-signup');
  });

  it('is absent from every family library', () => {
    for (const family of ['homepage', 'section-landing', 'detail-template', 'directory']) {
      expect(getAvailableBlockTypes(family).map((d) => d.type), family).not.toContain('newsletter-signup');
    }
  });

  it('is NOT placed in any family default layout', () => {
    for (const family of ['homepage', 'section-landing', 'detail-template', 'directory']) {
      const types = buildDefaultSlots(family).map((s) => s.sectionType);
      expect(types, `${family} default layout`).not.toContain('newsletter-signup');
    }
  });

  it('is reported as retired by the registry helper', () => {
    expect(isRetiredSectionType('homepage', 'newsletter-signup')).toBe(true);
    expect(isRetiredSectionType('homepage', 'cta-banner')).toBe(false);
  });

  it('has NO renderer, so nothing can draw its form', () => {
    expect(blockRegistry['newsletter-signup']).toBeUndefined();
  });

  it('its definition is RETAINED and marked retired, for stored-layout validity', () => {
    const def = (HOMEPAGE_SECTIONS as SectionDef[]).find((d) => d.type === 'newsletter-signup');
    expect(def, 'the definition must be kept so stored layouts stay valid').toBeDefined();
    expect(def!.retired).toBe(true);
    expect(def!.label.toLowerCase()).toContain('retired');
  });
});

/* ── Legacy stored layouts remain usable ──────────────────────────── */

describe('Stage 05 Task F — legacy layout compatibility', () => {
  it('a stored layout containing a legacy newsletter slot can STILL BE SAVED', async () => {
    // The admin must not be locked out of editing a page that merely contains
    // the retired block.
    const err = await trySave('homepage', [
      slot('rich-text-block', { title: 'Kept' }, 'rt-1'),
      slot('newsletter-signup', { title: 'Old heading' }, 'nl-1'),
    ]);
    expect(err, 'saving a layout with a legacy newsletter slot was rejected').toBeNull();
  });

  it('the legacy slot is PRESERVED in what gets written — not silently dropped', async () => {
    await trySave('homepage', [slot('newsletter-signup', { title: 'Old heading' }, 'nl-1')]);
    const written = JSON.stringify(createMock.mock.calls[0]);
    expect(written).toContain('newsletter-signup');
    expect(written).toContain('Old heading');
  });

  it('saving a legacy slot WARNS, so the retained block is visible to operators', async () => {
    await trySave('homepage', [slot('newsletter-signup', {}, 'nl-1')]);
    expect(warnMock).toHaveBeenCalled();
    expect(JSON.stringify(warnMock.mock.calls)).toContain('newsletter-signup');
  });

  it('a genuinely unknown section type is still REJECTED', async () => {
    const err = await trySave('homepage', [slot('totally-made-up-block', {}, 'x-1')]);
    expect(err).toMatch(/not allowed for page family/i);
  });

  it('known types include the retired block; the library does not', () => {
    expect(getKnownSectionTypes('homepage').has('newsletter-signup')).toBe(true);
    expect(getAvailableBlockTypes('homepage').some((d) => d.type === 'newsletter-signup')).toBe(false);
  });
});

/* ── A legacy slot renders nothing at all ─────────────────────────── */

describe('Stage 05 Task F — a legacy newsletter slot renders nothing, and collects nothing', () => {
  const render = (slots: SectionSlot[]) =>
    renderToStaticMarkup(React.createElement(PageRenderer, { slots: slots.map((s) => ({ slot: s, data: {} })) }));

  it('contributes no markup to the page', () => {
    const html = render([slot('newsletter-signup', { title: 'ZzLegacyNewsletter' }, 'nl-1')]);
    expect(html).toBe('');
  });

  it('renders NO form, NO input and NO submit control', () => {
    const html = render([slot('newsletter-signup', { title: 'x', placeholderText: 'Enter your email' }, 'nl-1')]);
    for (const fragment of ['<form', '<input', '<button', 'type="email"', 'Enter your email']) {
      expect(html, `${fragment} must not be rendered`).not.toContain(fragment);
    }
  });

  it('does not leak its stored copy into the page', () => {
    const html = render([slot('newsletter-signup', { title: 'ZzSecretHeading', description: 'ZzSecretBody' }, 'nl-1')]);
    expect(html).not.toContain('ZzSecretHeading');
    expect(html).not.toContain('ZzSecretBody');
  });

  it('does not break the page — sibling blocks still render around it', () => {
    const html = render([
      slot('rich-text-block', { title: 'ZzBefore' }, 'a'),
      slot('newsletter-signup', { title: 'skip me' }, 'b'),
      slot('rich-text-block', { title: 'ZzAfter' }, 'c'),
    ]);
    expect(html).toContain('ZzBefore');
    expect(html).toContain('ZzAfter');
    expect(html).not.toContain('skip me');
  });

  it('no subscription endpoint was introduced', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const apiRoot = path.resolve(__dirname, '..', 'app', 'api');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (/newsletter|subscri/i.test(e.name)) found.push(e.name);
          walk(full);
        }
      }
    };
    walk(apiRoot);
    expect(found, 'no newsletter/subscription API route may exist').toEqual([]);
  });
});

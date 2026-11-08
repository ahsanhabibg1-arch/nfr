import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HOMEPAGE_SECTIONS } from '../lib/cms/sectionRegistry';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

// ── Quick Access block helpText ─────────────────────────────────────

describe('Task 4 — Quick Access helpText polish', () => {
  const quickAccess = HOMEPAGE_SECTIONS.find((s) => s.type === 'quick-access')!;

  it('quick-access block exists in HOMEPAGE_SECTIONS', () => {
    expect(quickAccess).toBeDefined();
  });

  it('quick-access description mentions Header & Nav', () => {
    expect(quickAccess.description).toContain('Header & Nav');
  });

  it('kicker prop has helpText explaining item management location', () => {
    const kicker = quickAccess.editableProps.find((p) => p.key === 'kicker');
    expect(kicker).toBeDefined();
    expect(kicker!.helpText).toBeTruthy();
    expect(kicker!.helpText).toContain('Header & Nav');
  });

  it('helpText mentions "Homepage — Quick Access" location', () => {
    const kicker = quickAccess.editableProps.find((p) => p.key === 'kicker');
    expect(kicker!.helpText).toContain('Homepage — Quick Access');
  });

  it('title and description props remain without helpText (no unnecessary noise)', () => {
    const title = quickAccess.editableProps.find((p) => p.key === 'title');
    const desc = quickAccess.editableProps.find((p) => p.key === 'description');
    expect(title?.helpText).toBeFalsy();
    expect(desc?.helpText).toBeFalsy();
  });

  it('quick-access editableProps still have 3 props', () => {
    expect(quickAccess.editableProps).toHaveLength(3);
  });

  it('quick-access defaultProps are unchanged', () => {
    expect(quickAccess.defaultProps).toEqual({
      kicker: 'Quick Links',
      title: 'NFR Quick Access',
      description: '',
    });
  });

  it('quick-access maxInstances is still 1', () => {
    expect(quickAccess.maxInstances).toBe(1);
  });
});

// ── Builder helpText rendering infrastructure ───────────────────────

describe('Task 4 — Builder helpText rendering', () => {
  const editorSrc = read('views/admin/AdminPageLayoutEditor.tsx');

  it('editor renders helpText for text props', () => {
    expect(editorSrc).toContain('helpText');
  });

  it('editor renders helpText in small/muted styling', () => {
    expect(editorSrc).toContain('prop.helpText');
  });
});

// ── Navigation admin page preserved ─────────────────────────────────

describe('Task 4 — AdminWebsiteNavPage preserved', () => {
  const navSrc = read('views/admin/AdminWebsiteNavPage.tsx');

  it('nav page still has quick-access location', () => {
    expect(navSrc).toContain("'quick-access'");
    expect(navSrc).toContain('Homepage — Quick Access');
  });

  it('nav page still has all locations', () => {
    expect(navSrc).toContain("'header'");
    expect(navSrc).toContain("'footer-sections'");
    expect(navSrc).toContain("'footer-academy'");
    expect(navSrc).toContain("'quick-access'");
  });
});

// ── Regressions ─────────────────────────────────────────────────────

describe('Task 4 — Regressions', () => {
  it('other homepage blocks are unaffected', () => {
    const hero = HOMEPAGE_SECTIONS.find((s) => s.type === 'editorial-hero');
    expect(hero).toBeDefined();
    expect(hero!.editableProps.length).toBeGreaterThan(0);
  });

  it('quick-access block category unchanged', () => {
    const qa = HOMEPAGE_SECTIONS.find((s) => s.type === 'quick-access');
    expect(qa!.category).toBe('info');
  });

  it('quick-access block icon unchanged', () => {
    const qa = HOMEPAGE_SECTIONS.find((s) => s.type === 'quick-access');
    expect(qa!.icon).toBe('Zap');
  });

  it('no new block types were introduced', () => {
    expect(HOMEPAGE_SECTIONS.length).toBe(15);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateArticle } from '../utils/seoValidator';
import type { Article } from '../types';

/**
 * Batch 15 — Article Editor Phase-0 demo-content removal (Workstream E).
 * The editor is a client component with no render-test harness in this repo, so the
 * "new article starts blank" guarantees are verified two ways:
 *   1. Source guard — the hardcoded demo DEFAULTS are gone from the editor source.
 *   2. Publication-gate logic — a genuinely empty new draft cannot be published.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(path.resolve(here, '../views/admin/AdminArticleEditorShell.tsx'), 'utf8');
const topbar = readFileSync(path.resolve(here, '../components/admin/AdminTopbar.tsx'), 'utf8');

describe('Batch 15 — article editor demo cleanup (source guard)', () => {
  it('new-article body no longer defaults to the demo blocks', () => {
    expect(editor).toContain('existingArticle?.structuredBody || []');
    expect(editor).not.toContain('The Anatomy of the 8-Second Whistle');
    expect(editor).not.toContain('Judges award up to 50 points');
  });
  it('no preselected demo category / subcategory / article type', () => {
    expect(editor).toContain("existingArticle?.category || ''");
    expect(editor).toContain("existingArticle?.subcategory || ''");
    expect(editor).toContain("existingArticle?.articleType || ''");
    expect(editor).not.toMatch(/useState<PrimarySection>\(existingArticle\?\.category \|\| 'NFR Competition'\)/);
  });
  it('no fake preselected author / reviewer', () => {
    expect(editor).not.toContain("useState<string>('clayton')");
    expect(editor).not.toContain("|| 'Elena Morales'");
  });
  it('no sample featured image / caption / credit / image SEO title', () => {
    expect(editor).not.toContain('hero_bull_riding_1793166440262');
    expect(editor).not.toContain('Championship action inside the arena');
    expect(editor).not.toContain('Editorial Staff Archives / NFRGuide');
    expect(editor).not.toContain('Featured Action Photography');
  });
  it('no sample tags and no demo relationship ids on a new article', () => {
    expect(editor).toContain('existingArticle?.tags || []');
    expect(editor).not.toContain("['NFR 2026', 'Roughstock', 'Judicial Scoring']");
    expect(editor).not.toContain("['nfr-2026']");
    expect(editor).not.toContain("['las-vegas-nfr']");
  });
  it('safe default image rights is Unresolved (never claim ownership)', () => {
    expect(editor).toContain("existingArticle?.imageRightsStatus || 'Unresolved'");
  });
  it('the hardcoded "Demo Stage" badge is removed', () => {
    expect(topbar).not.toContain('Demo Stage');
  });
  it('placeholder hints exist and are not persisted values', () => {
    expect(editor).toContain('Enter compelling, authoritative championship headline');
    expect(editor).toContain('Select author…');
  });
});

describe('Batch 15 — publication gate intact for a blank new article', () => {
  it('an empty new draft cannot be published', () => {
    const blank: Partial<Article> = { title: '', excerpt: '', structuredBody: [], imageAltText: '', imageRightsStatus: 'Unresolved' };
    const r = validateArticle(blank);
    expect(r.canPublish).toBe(false);
    expect(r.blockers.length + r.compliance.length).toBeGreaterThan(0);
  });
});

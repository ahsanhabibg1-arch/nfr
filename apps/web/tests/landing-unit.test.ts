import { describe, it, expect } from 'vitest';
import { permForEntity } from '../lib/cms/landingEntities';
import { resolveCanonical, mergeSeoMeta, isLandingIndexable } from '../lib/cms/entitySeoService';
import { SITE_URL } from '../lib/seo';
import type { EntitySeo } from '@prisma/client';

/**
 * Batch 11 — pure landing SEO logic (no DB queries). Per-entity permission mapping,
 * same-site canonical validation, SEO merge/fallback, and additive-only noindex.
 */
const seo = (over: Partial<EntitySeo>): EntitySeo => ({
  id: 'x', entityType: 'RODEO_HUB', entityId: 'y', seoTitle: null, metaDescription: null,
  canonicalOverride: null, ogImage: null, noindex: false, intro: null, updatedById: null, updatedAt: new Date(), ...over,
});

describe('Batch 11 — landing SEO logic', () => {
  it('maps each entity to its owning permission', () => {
    expect(permForEntity('CATEGORY')).toBe('taxonomy.manage');
    expect(permForEntity('RODEO_HUB')).toBe('rodeo.manage');
    expect(permForEntity('RODEO_EVENT')).toBe('rodeo.manage');
    expect(permForEntity('RODEO_EDITION')).toBe('rodeo.manage');
    expect(permForEntity('DISCIPLINE')).toBe('rodeo.manage');
  });

  it('resolves only same-site canonical overrides', () => {
    expect(resolveCanonical('/rodeo-events/x/')).toBe(`${SITE_URL}/rodeo-events/x/`);
    expect(resolveCanonical(`${SITE_URL}/a/`)).toBe(`${SITE_URL}/a/`);
    expect(resolveCanonical('https://evil.example.com/x')).toBeNull();
    expect(resolveCanonical('')).toBeNull();
    expect(resolveCanonical(null)).toBeNull();
  });

  it('merges overrides with fallback to derived values', () => {
    const base = { title: 'Derived', description: 'DerivedD', path: '/p/' };
    const none = mergeSeoMeta(null, base);
    expect(none.title).toBe('Derived');
    expect(none.description).toBe('DerivedD');
    // Batch S3: robots is an independent { index, follow } policy (was a `noindex` boolean).
    expect(none.robots).toEqual({ index: true, follow: true });

    const over = mergeSeoMeta(seo({ seoTitle: 'Override', metaDescription: 'OverD' }), base);
    expect(over.title).toBe('Override');
    expect(over.description).toBe('OverD');
  });

  it('noindex is additive-only (cannot force-index a content-noindex page)', () => {
    // Batch S3: still additive (index:false either way); an editor noindex keeps follow,
    // a content-based noindex keeps its existing nofollow.
    expect(mergeSeoMeta(seo({ noindex: true }), { title: 't', description: 'd', path: '/p/', derivedNoindex: false }).robots).toEqual({ index: false, follow: true });
    expect(mergeSeoMeta(seo({ noindex: false }), { title: 't', description: 'd', path: '/p/', derivedNoindex: true }).robots).toEqual({ index: false, follow: false });
    expect(isLandingIndexable(null, true)).toBe(true);
    expect(isLandingIndexable(seo({ noindex: true }), true)).toBe(false);
    expect(isLandingIndexable(null, false)).toBe(false);
  });
});

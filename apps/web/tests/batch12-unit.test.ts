import { describe, it, expect } from 'vitest';
import { permForEntity, LANDING_TYPES } from '../lib/cms/landingEntities';
import { venueJsonLd, competitorJsonLd, SITE_URL } from '../lib/seo';
import { competitorHometown } from '../lib/batch12Content';

/**
 * Batch 12 — pure logic (no DB). New landing types map to rodeo.manage; structured-data
 * builders emit ONLY verified fields and omit unknowns (no fabrication).
 */
describe('Batch 12 — venue & competitor logic', () => {
  it('registers VENUE and COMPETITOR as rodeo.manage-governed landing types', () => {
    expect(LANDING_TYPES).toContain('VENUE');
    expect(LANDING_TYPES).toContain('COMPETITOR');
    expect(permForEntity('VENUE')).toBe('rodeo.manage');
    expect(permForEntity('COMPETITOR')).toBe('rodeo.manage');
  });

  it('venueJsonLd emits only verified fields (omits unknowns)', () => {
    const minimal = venueJsonLd({ name: 'Thomas & Mack', url: '/venues/thomas-mack/' });
    expect(minimal['@type']).toBe('Place');
    expect(minimal.name).toBe('Thomas & Mack');
    expect(minimal).not.toHaveProperty('address');
    expect(minimal).not.toHaveProperty('geo');
    expect(minimal).not.toHaveProperty('maximumAttendeeCapacity');

    const full = venueJsonLd({ name: 'T&M', url: '/venues/x/', city: 'Las Vegas', state: 'NV', country: 'USA', latitude: 36.1, longitude: -115.1, capacity: 18000 });
    expect((full.address as Record<string, unknown>).addressLocality).toBe('Las Vegas');
    expect((full.geo as Record<string, unknown>).latitude).toBe(36.1);
    expect(full.maximumAttendeeCapacity).toBe(18000);
  });

  it('competitorJsonLd is a Person and omits unknown/absent fields', () => {
    const minimal = competitorJsonLd({ name: 'Stetson Wright', url: '/competitors/stetson-wright/' });
    expect(minimal['@type']).toBe('Person');
    expect(minimal).not.toHaveProperty('description');
    expect(minimal).not.toHaveProperty('image');
    expect(minimal).not.toHaveProperty('homeLocation');
    expect(minimal).not.toHaveProperty('knowsAbout');

    const full = competitorJsonLd({ name: 'X', url: '/competitors/x/', description: 'Bio', image: '/a.jpg', hometown: 'Milford, UT', disciplines: ['Bull Riding'] });
    expect(full.description).toBe('Bio');
    expect(full.image).toBe(`${SITE_URL}/a.jpg`);
    expect((full.homeLocation as Record<string, unknown>).name).toBe('Milford, UT');
    expect(full.knowsAbout).toEqual(['Bull Riding']);
  });

  it('competitorHometown joins present parts, or null when empty', () => {
    expect(competitorHometown({ hometownCity: 'Milford', state: 'UT', country: 'USA' })).toBe('Milford, UT, USA');
    expect(competitorHometown({ hometownCity: null, state: 'TX', country: null })).toBe('TX');
    expect(competitorHometown({ hometownCity: null, state: null, country: null })).toBeNull();
  });
});

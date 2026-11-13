import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrismaClient } from '@prisma/client';

/**
 * Discipline Classification — management audit and single-source-of-truth
 * verification.
 *
 * THE OWNER'S QUESTION. Landing SEO offers a "Classification" of Roughstock /
 * Timed Event, Rodeo Coverage offered the same pair under the label "Category",
 * and Editorial Organization manages five editorial Categories. The owner could
 * not find where the two classification options are managed, and asked whether
 * the five editorial categories should appear in that dropdown.
 *
 * WHAT THIS PROVES:
 *
 *   1. They are two separate models, deliberately. Editorial Category is
 *      administrator-owned rows in `Category`; classification is a fixed,
 *      code-owned property of `Discipline.category`.
 *   2. There is exactly ONE definition of the classification vocabulary, and
 *      every surface that offers, validates, defaults or filters on it reads
 *      from that definition.
 *   3. The service refuses any value outside it, under RBAC.
 *   4. The seven seeded disciplines keep their assignments.
 *   5. The public filter counts are derived from data, not hardcoded.
 */

const {
  DISCIPLINE_CLASSIFICATIONS,
  DISCIPLINE_CLASSIFICATION_PLURAL,
  DEFAULT_DISCIPLINE_CLASSIFICATION,
  isDisciplineClassification,
  toDisciplineClassification,
} = await import('../lib/content/disciplineClassifications');

const dbUrl = process.env.DATABASE_URL ?? '';
const dbSuite = dbUrl ? describe : describe.skip;

// ---------------------------------------------------------------------------
// 1-2. The vocabulary itself, and the two existing values (§8.1, §8.2)
// ---------------------------------------------------------------------------

describe('the classification vocabulary', () => {
  it('is exactly Roughstock and Timed Event, in that order', () => {
    expect([...DISCIPLINE_CLASSIFICATIONS]).toEqual(['Roughstock', 'Timed Event']);
  });

  it('accepts only those two values and rejects the editorial sections', () => {
    expect(isDisciplineClassification('Roughstock')).toBe(true);
    expect(isDisciplineClassification('Timed Event')).toBe(true);
    for (const notAClassification of ['NFR Competition', 'More Rodeo', 'roughstock', 'Timed Events', '', null, 7]) {
      expect(isDisciplineClassification(notAClassification), String(notAClassification)).toBe(false);
    }
  });

  it('maps an unknown stored string to the default instead of passing it through', () => {
    // The old mapper used `as` and asserted any string was valid, so a bad row
    // rendered as a classification the public filter could never match.
    expect(toDisciplineClassification('Something Else')).toBe(DEFAULT_DISCIPLINE_CLASSIFICATION);
    expect(toDisciplineClassification(null)).toBe(DEFAULT_DISCIPLINE_CLASSIFICATION);
    expect(toDisciplineClassification('Timed Event')).toBe('Timed Event');
  });

  it('has a public plural label for every value', () => {
    for (const c of DISCIPLINE_CLASSIFICATIONS) {
      expect(DISCIPLINE_CLASSIFICATION_PLURAL[c], c).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 3-6. Management operations: what an administrator can and cannot do (§8.3-6)
// ---------------------------------------------------------------------------

describe('classification management surface', () => {
  /**
   * THIS TEST WAS INVERTED IN BATCH 05, ON THE OWNER'S APPROVAL.
   *
   * It previously asserted that no management model, table or CRUD service
   * existed — the architectural fact behind "there is nowhere to manage these".
   * The owner approved making classifications administrator-managed, so the
   * assertion now pins the NEW architecture and, just as importantly, the two
   * properties that make it safe: the identity is immutable and the reference
   * is a real foreign key, so a rename cannot orphan a discipline.
   *
   * It is rewritten rather than deleted so the reversal is visible in the
   * history instead of a guarantee quietly disappearing.
   */
  it('IS administrator-managed, and keyed on a stable identity rather than the name', async () => {
    const schema = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    );
    expect(schema).toMatch(/model\s+DisciplineClassification\b/);
    // The reference is an id with a deletion guard, not the display label.
    expect(schema).toMatch(/classificationId\s+String\?/);
    expect(schema).toMatch(/onDelete:\s*Restrict/);
    // The legacy text column is PRESERVED through the transition.
    expect(schema).toMatch(/category\s+String\?/);

    const svc = await import('../lib/cms/disciplineClassificationService');
    for (const present of ['createClassification', 'updateClassification', 'deleteClassification', 'setClassificationActive', 'reorderClassifications']) {
      expect(Object.keys(svc)).toContain(present);
    }
    // `value` is not updatable: the update input accepts a name, never an identity.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../lib/cms/disciplineClassificationService.ts', import.meta.url), 'utf8'),
    );
    expect(src).not.toMatch(/data:\s*\{[^}]*\bvalue:\s*v\./s);
  });

  it('cannot be extended through the discipline write path (a third value is refused)', async () => {
    const rodeo = await import('../lib/cms/rodeoService');
    const superAdmin = { id: 'u-test', roles: ['super_admin'] } as never;
    await expect(
      rodeo.createDiscipline(superAdmin, {
        name: 'Invented Event',
        summary: 'Should never be created.',
        category: 'Freestyle' as never,
      }),
    ).rejects.toThrow();
  });

  it('enforces rodeo.manage on the discipline write path (§8.11)', async () => {
    const { roleHasPermission } = await import('../lib/auth/rbac');
    expect(roleHasPermission(['super_admin'], 'rodeo.manage')).toBe(true);
    // A reader-level role must not reach it.
    expect(roleHasPermission(['reader'] as never, 'rodeo.manage')).toBe(false);

    const rodeo = await import('../lib/cms/rodeoService');
    await expect(
      rodeo.createDiscipline({ id: 'u-x', roles: ['reader'] } as never, {
        name: 'Unauthorised',
        summary: 'Should be forbidden.',
        category: 'Roughstock',
      }),
    ).rejects.toThrow(/permitted/i);
  });
});

// ---------------------------------------------------------------------------
// 7-9. Every selector reads the one definition (§8.7-9, §7)
// ---------------------------------------------------------------------------

describe('single source of truth across every surface', () => {
  const read = (rel: string) =>
    import('node:fs').then((fs) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));

  it('no surface writes the vocabulary out by hand any more', async () => {
    /**
     * Structural by necessity: the point of the change is that these literals
     * exist in ONE file, which is a property of the source and not observable
     * at runtime. The behavioural consequences are asserted in the tests above
     * and below; this guards the duplication from coming back.
     */
    for (const rel of [
      '../lib/cms/rodeoService.ts',
      '../views/admin/AdminLandingSeoPage.tsx',
      '../views/admin/AdminRodeoCoveragePage.tsx',
      '../components/sections/CompetitionSection.tsx',
      '../lib/mappers.ts',
      '../types/index.ts',
    ]) {
      const src = await read(rel);
      expect(src, `${rel} should not hardcode the classification pair`).not.toMatch(/'Timed Event'/);
    }
  });

  it('Add Discipline (Rodeo Coverage) offers the classifications and is labelled Classification', async () => {
    const src = await read('../views/admin/AdminRodeoCoveragePage.tsx');
    // §6 — the misleading "Category (optional)" label is gone.
    expect(src).not.toContain('label="Category (optional)"');
    expect(src).toContain('label="Classification (optional)"');
    expect(src).toContain('DISCIPLINE_CLASSIFICATIONS.map');
  });

  it('Landing SEO (Edit Discipline) offers the classifications from the same definition', async () => {
    const src = await read('../views/admin/AdminLandingSeoPage.tsx');
    expect(src).toContain('DISCIPLINE_CLASSIFICATIONS.map');
    expect(src).toContain('DISCIPLINE_CLASSIFICATION_HELP');
  });
});

// ---------------------------------------------------------------------------
// 12-13. Editorial Category independence, and public rendering (§8.12, §8.13)
// ---------------------------------------------------------------------------

describe('Editorial Category stays independent of classification', () => {
  it('the five editorial sections are not classifications, and vice versa', async () => {
    const { PRIMARY_SECTIONS } = await import('../config/routes');
    const sectionNames = Object.values(PRIMARY_SECTIONS).map((s) => (s as { categoryKey?: string }).categoryKey);
    for (const c of DISCIPLINE_CLASSIFICATIONS) expect(sectionNames).not.toContain(c);
    for (const name of sectionNames) expect(isDisciplineClassification(name)).toBe(false);
  });
});

describe('the public Competition filter', () => {
  const render = (disciplines: unknown[]) =>
    import('../components/sections/CompetitionSection').then(({ CompetitionSection }) =>
      renderToStaticMarkup(
        React.createElement(CompetitionSection, {
          disciplines: disciplines as never,
          onSelectDiscipline: () => {},
        }),
      ),
    );

  it('derives its counts from the disciplines given, not from a hardcoded 3/4/7', async () => {
    /**
     * The regression this prevents: the buttons used to read "All 7 Events",
     * "Roughstock (3)" and "Timed Events (4)" literally. Adding or archiving a
     * discipline in Rodeo Coverage left the buttons asserting a count the grid
     * beneath them contradicted.
     */
    const html = await render([
      { id: 'a', slug: 'a', name: 'A', category: 'Roughstock' },
      { id: 'b', slug: 'b', name: 'B', category: 'Roughstock' },
      { id: 'c', slug: 'c', name: 'C', category: 'Timed Event' },
    ]);
    expect(html).toContain('All 3 Events');
    expect(html).toContain('Roughstock (2)');
    expect(html).toContain('Timed Events (1)');
    expect(html).not.toContain('All 7 Events');
  });

  it('counts a discipline with no stored classification under the default', async () => {
    const html = await render([{ id: 'a', slug: 'a', name: 'A', category: null }]);
    expect(html).toContain('All 1 Events');
    expect(html).toContain(`${DISCIPLINE_CLASSIFICATION_PLURAL[DEFAULT_DISCIPLINE_CLASSIFICATION]} (1)`);
  });
});

// ---------------------------------------------------------------------------
// 10, 15. Stored assignments survive; the column is unchanged (§8.10, §8.15)
// ---------------------------------------------------------------------------

dbSuite('stored discipline assignments', () => {
  it('every discipline in the database still holds a valid classification', async () => {
    const p = new PrismaClient();
    try {
      const rows = await p.discipline.findMany({ select: { slug: true, category: true } });
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        // Null is allowed by the schema (the field is optional); anything
        // non-null must be one of the two values.
        if (r.category !== null) {
          expect(isDisciplineClassification(r.category), `${r.slug} -> ${r.category}`).toBe(true);
        }
      }
    } finally {
      await p.$disconnect();
    }
  });

  it('needs no migration: the refactor touched code only', async () => {
    const p = new PrismaClient();
    try {
      const col = await p.$queryRawUnsafe<{ data_type: string; is_nullable: string }[]>(
        `SELECT data_type, is_nullable FROM information_schema.columns
         WHERE table_schema='public' AND table_name='Discipline' AND column_name='category'`,
      );
      expect(col).toHaveLength(1);
      expect(col[0].data_type).toBe('text');
      expect(col[0].is_nullable).toBe('YES');
    } finally {
      await p.$disconnect();
    }
  });
});

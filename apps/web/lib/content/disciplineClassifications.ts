/**
 * Discipline Classification — the COMPATIBILITY vocabulary.
 *
 * BATCH 05 CHANGED WHAT THIS FILE IS FOR. Classifications are now
 * administrator-managed rows in `DisciplineClassification`, owned by
 * `lib/cms/disciplineClassificationService.ts`. This module is no longer the
 * source of truth; it is the fallback the application behaves by when the
 * managed table is absent (migration not yet applied), empty (bootstrap not yet
 * run) or unreachable — exactly the role `lib/content/articleTypes.ts` plays for
 * Article Types.
 *
 * Everything below therefore describes the TWO PRE-EXISTING classifications and
 * the legacy `Discipline.category` text column, which is preserved and never
 * rewritten. New code that needs the live vocabulary must read the service.
 *
 * WHAT A CLASSIFICATION IS. How a rodeo discipline is *contested*: judged rides
 * on bucking stock (Roughstock) or fastest time (Timed Event).
 *
 * WHAT IT IS NOT. It is not the site's editorial taxonomy. The five editorial
 * sections (NFR Competition, NFR Entertainment, NFR Events & Shopping,
 * NFR Plan & Watch, More Rodeo) are administrator-owned rows in the `Category`
 * table and organise ARTICLES. Classification organises DISCIPLINES. The two
 * are deliberately separate models and must not be merged to populate a
 * dropdown; `tests/issue03-discipline-cms.test.ts` pins that separation.
 *
 * WHY THE OLD DESIGN HAD TO CHANGE. The legacy column stores the display label
 * itself, not a reference, so renaming a classification orphaned every
 * discipline still holding the old string. `Discipline.classificationId` now
 * points at a stable id, so a rename is one UPDATE and every discipline follows
 * it. That is the defect Batch 05 removed, and it is why nothing in the managed
 * schema keys a relationship on a mutable name.
 *
 * WHY THIS FILE STILL EXISTS. Two reasons. It is the fallback described above,
 * and it is the definition the bootstrap seeds the managed table FROM, so the
 * two pre-existing classifications are created with exactly the values existing
 * rows already hold rather than values typed a second time.
 */

/** The ordered classification values. The array order is the display order. */
export const DISCIPLINE_CLASSIFICATIONS = ['Roughstock', 'Timed Event'] as const;

/** The classification of a discipline, derived from the list above. */
export type DisciplineClassification = (typeof DISCIPLINE_CLASSIFICATIONS)[number];

/**
 * The value used when a stored row has none.
 *
 * Kept because `Discipline.category` is nullable while the public `Discipline`
 * type requires a classification, so the mapper has to choose something. It is
 * the first value by definition rather than a second hand-written literal.
 */
export const DEFAULT_DISCIPLINE_CLASSIFICATION: DisciplineClassification = DISCIPLINE_CLASSIFICATIONS[0];

/** Reader-facing help text, shared by every admin surface that offers the field. */
export const DISCIPLINE_CLASSIFICATION_HELP =
  'How the event is contested — Roughstock (judged rides on bucking stock) or Timed Event (fastest time). ' +
  'This is not a website section; the public Competition page filters on these two values, so the list is fixed by design.';

/**
 * Plural wording for the PUBLIC Competition filter buttons.
 *
 * Separate from the stored value because the button reads as a group of
 * disciplines ("Timed Events") while the value names one discipline's
 * classification ("Timed Event"). Declared explicitly rather than pluralised by
 * rule, so the reader-facing label is never guessed; the counts beside it are
 * derived from the disciplines actually rendered.
 */
export const DISCIPLINE_CLASSIFICATION_PLURAL: Record<DisciplineClassification, string> = {
  Roughstock: 'Roughstock',
  'Timed Event': 'Timed Events',
};

/**
 * The seed definitions for the two pre-existing classifications.
 *
 * `value` is byte-for-byte what existing `Discipline.category` rows hold, which
 * is what lets the bootstrap attach them without rewriting a single discipline.
 */
export const LEGACY_DISCIPLINE_CLASSIFICATIONS: readonly {
  value: DisciplineClassification;
  name: string;
  pluralName: string;
  description: string;
  sortOrder: number;
}[] = [
  {
    value: 'Roughstock',
    name: 'Roughstock',
    pluralName: 'Roughstock',
    description: 'Judged rides on bucking stock, scored out of 100 between rider and animal.',
    sortOrder: 0,
  },
  {
    value: 'Timed Event',
    name: 'Timed Event',
    pluralName: 'Timed Events',
    description: 'Contested against the clock — the fastest time wins.',
    sortOrder: 1,
  },
];

/**
 * URL-safe form of a classification name. Shared by the service (at creation)
 * and the tests, so the slug a name produces is never computed two ways.
 */
export function classificationSlug(name: string): string {
  return name.toLowerCase().trim().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Narrowing guard for untrusted input (stored strings, query params, form values). */
export function isDisciplineClassification(value: unknown): value is DisciplineClassification {
  return typeof value === 'string' && (DISCIPLINE_CLASSIFICATIONS as readonly string[]).includes(value);
}

/**
 * The classification to display for a stored value.
 *
 * An unrecognised or absent string falls back to the default rather than
 * throwing: a row written before a vocabulary change must still render.
 */
export function toDisciplineClassification(value: unknown): DisciplineClassification {
  return isDisciplineClassification(value) ? value : DEFAULT_DISCIPLINE_CLASSIFICATION;
}

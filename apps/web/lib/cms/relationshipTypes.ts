/**
 * Article ↔ rodeo relationship option shapes shared by the server loader
 * (adminQueries.listArticleRelationshipOptions) and the client editor panel.
 * Plain types only — safe to import from client components.
 */
export interface RelationshipOption {
  id: string;
  label: string;
  /** Secondary text (category / region / location). */
  detail?: string | null;
}

export interface EditionOption extends RelationshipOption {
  /** Parent recurring event — an edition may only be linked alongside its event (ADM-06). */
  eventId: string;
}

export interface ArticleRelationshipOptions {
  disciplines: RelationshipOption[];
  hubs: RelationshipOption[];
  events: RelationshipOption[];
  editions: EditionOption[];
  /**
   * Batch 04-B — ACTIVE managed subcategories, keyed by primary-section NAME.
   *
   * Keyed by name because that is what the editor's `category` state holds (a
   * `PrimarySection`), so the selector can filter without a round trip and
   * without the client ever learning a category id. Archived rows are excluded:
   * they must not be newly assignable. An article already pointing at an
   * archived one keeps it — the editor adds that single current value itself.
   */
  subcategoriesBySection: Record<string, RelationshipOption[]>;
}

export const EMPTY_RELATIONSHIP_OPTIONS: ArticleRelationshipOptions = { disciplines: [], hubs: [], events: [], editions: [], subcategoriesBySection: {} };

/** A row of the real Source directory (DB), offered by the editor's "attach existing" picker. */
export interface SourceDirectoryOption {
  id: string;
  title: string;
  publisher: string | null;
  url: string;
  type: string | null;
  status: 'verified' | 'needs_review' | 'expired';
  classification: 'Official' | 'Independent Reference' | 'Historical Archive';
}

/** Client-side id prefix for a source typed into the editor that is not in the directory yet. */
export const NEW_SOURCE_ID_PREFIX = 'new-';

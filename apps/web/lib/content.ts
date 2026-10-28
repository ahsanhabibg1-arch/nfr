/**
 * NFRGuide — Temporary Content Access Layer (Batch 01)
 * ----------------------------------------------------------------------------
 * A read-only adapter that isolates the Phase 0 static mock editorial data from
 * the public, server-rendered pages. Every public read goes through here so
 * that:
 *   1. Public surfaces never import `ALL_ARTICLES` directly (Master Reqs §3.2,
 *      Batch 01 §11), and the future PostgreSQL/Prisma backend can replace this
 *      single module without touching page components.
 *   2. Unpublished content (draft/in_review/approved/scheduled/archived) is
 *      never returned to server-rendered public responses (eligibility policy).
 *
 * IMPORTANT: This is NOT a database and NOT production persistence. It is a
 * synchronous, in-memory, read-only view over typed seed data. It deliberately
 * does NOT read the admin `articleStore` (browser sessionStorage), which remains
 * a client-only admin prototype — see KNOWN_LIMITATIONS.md.
 */

import { Article, Discipline, PrimarySection } from '../types';
import {
  ALL_ARTICLES,
  SEVEN_DISCIPLINES,
  getDisciplineBySlug as rawGetDisciplineBySlug,
} from '../data/mockEditorialData';
import { isArticlePubliclyEligible } from '../utils/contentEligibility';
import { PRIMARY_SECTIONS, SectionMeta } from '../config/routes';

/** All publicly eligible (published) articles. */
export function getPublishedArticles(): Article[] {
  return ALL_ARTICLES.filter(isArticlePubliclyEligible);
}

/** A single published article by slug, or undefined if missing/unpublished. */
export function getPublishedArticleBySlug(slug: string): Article | undefined {
  const art = ALL_ARTICLES.find((a) => a.slug === slug);
  return art && isArticlePubliclyEligible(art) ? art : undefined;
}

/** Published articles in a primary section, by its canonical category key. */
export function getArticlesBySection(categoryKey: PrimarySection | string): Article[] {
  return getPublishedArticles().filter((a) => a.category === categoryKey);
}

/** Alias kept for category archive semantics (same published-only guarantee). */
export function getArticlesByCategory(categoryKey: PrimarySection | string): Article[] {
  return getArticlesBySection(categoryKey);
}

/** Published articles related to a discipline (explicit links, else section fallback). */
export function getArticlesByDiscipline(disciplineSlug: string, limit = 3): Article[] {
  const discipline = rawGetDisciplineBySlug(disciplineSlug);
  const pool = getPublishedArticles();
  if (!discipline) return [];
  if (discipline.relatedArticleSlugs && discipline.relatedArticleSlugs.length > 0) {
    return pool.filter((a) => discipline.relatedArticleSlugs?.includes(a.slug));
  }
  return pool.filter((a) => a.category === 'NFR Competition').slice(0, limit);
}

/** Related published articles for an article id (shared tags/category heuristic). */
export function getRelatedArticles(currentArticleId: string, limit = 3): Article[] {
  const current = ALL_ARTICLES.find((a) => a.id === currentArticleId);
  const pool = getPublishedArticles().filter((a) => a.id !== currentArticleId);
  if (!current) return pool.slice(0, limit);

  if (current.relatedArticleIds && current.relatedArticleIds.length > 0) {
    const linked = pool.filter((a) => current.relatedArticleIds?.includes(a.id));
    if (linked.length > 0) return linked.slice(0, limit);
  }
  return pool.filter((a) => a.category === current.category).slice(0, limit);
}

export function getAllDisciplines(): Discipline[] {
  return SEVEN_DISCIPLINES;
}

export function getDisciplineBySlug(slug: string): Discipline | undefined {
  return rawGetDisciplineBySlug(slug);
}

/** Section metadata by its route key (competition, entertainment, …). */
export function getSectionMeta(sectionKey: string): SectionMeta | undefined {
  return PRIMARY_SECTIONS[sectionKey];
}

export function getAllSectionKeys(): string[] {
  return Object.keys(PRIMARY_SECTIONS);
}

/** Map a category-archive slug back to its section metadata, if it is one. */
export function getSectionMetaByCategorySlug(slug: string): SectionMeta | undefined {
  const clean = slug.toLowerCase();
  return Object.values(PRIMARY_SECTIONS).find(
    (s) =>
      s.id === clean ||
      s.categoryKey.toLowerCase().replace(/[^a-z0-9]+/g, '-') === clean,
  );
}

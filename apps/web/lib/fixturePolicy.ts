import 'server-only';
import type { Prisma } from '@prisma/client';
import { appEnv } from './env';
import { FIXTURE_PREFIX } from '../prisma/fixtures';

/**
 * Synthetic test fixtures must never surface as real editorial content (Batch B).
 *
 * Fixtures (`fixture-` slugs, prisma/fixtures.ts) are only ever seeded into isolated test/CI
 * databases. As defence in depth — e.g. if a fixture row were ever copied into production by
 * an import — every PUBLIC read excludes them when the app runs as production. In test/CI
 * they stay visible so smoke and browser tests can exercise real public routes.
 */
export function excludeFixturesFromPublic(): boolean {
  return appEnv() === 'production';
}

export function isHiddenFixtureSlug(slug: string | null | undefined): boolean {
  return excludeFixturesFromPublic() && !!slug && slug.startsWith(FIXTURE_PREFIX);
}

/** `where` for publicly eligible articles: PUBLISHED, and not a fixture in production. */
export function publicArticleWhere(): Prisma.ArticleWhereInput {
  return {
    workflowStatus: 'PUBLISHED',
    ...(excludeFixturesFromPublic() ? { NOT: { slug: { startsWith: FIXTURE_PREFIX } } } : {}),
  };
}

/** `where` fragment for public hub / event lists (slug-addressed entities). */
export function publicSlugWhere(): { NOT?: { slug: { startsWith: string } } } {
  return excludeFixturesFromPublic() ? { NOT: { slug: { startsWith: FIXTURE_PREFIX } } } : {};
}

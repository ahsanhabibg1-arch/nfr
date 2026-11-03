/**
 * NFRGuide — database seed (Batch A, owner decision D3).
 *
 * Two clearly separated parts:
 *
 * 1. REFERENCE DATA — written to any database. Only structural records the application
 *    needs (the five section categories, the seven requirement-defined NFR disciplines with
 *    a neutral "pending editorial review" guide, SEO rule groups, roles/permissions, canonical
 *    navigation, analytics/monetization defaults, legacy section redirects). No editorial
 *    claims, figures, dates, people, venues or sponsors.
 *
 * 2. TEST FIXTURES — written ONLY when DATABASE_URL is an isolated local test/CI database
 *    (same guard as the test runner: local host, database name contains `test`/`ci`, not the
 *    cloud database). Every fixture id/slug starts with `fixture-`, every title with
 *    "Fixture:", and the text says it is synthetic. Nothing describes a real event.
 *
 * Every write is CREATE-ONLY (`update: {}` or skip-if-present): re-running the seed never
 * overwrites CMS edits and never republishes or reverts content. Nothing is deleted.
 * The Phase 0 demo corpus (data/mockEditorialData.ts) is no longer seeded.
 */
import { PrismaClient, WorkflowStatus, SeoSeverity } from '@prisma/client';
import { PRIMARY_SECTIONS } from '../config/routes';
import { seedCanonicalNavigation } from '../lib/cms/navCanonical';
import { seedAnalyticsDefaults } from '../lib/cms/analyticsSeed';
import { seedMonetizationDefaults } from '../lib/cms/monetizationSeed';
import { decideTestDatabase } from '../tests/support/testDbGuard';
import { NFR_DISCIPLINES, FIXTURE_ARTICLES, FIXTURE_SLUGS, FIXTURE_TEXT } from './fixtures';

const prisma = new PrismaClient();

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const PENDING = 'Pending editorial review.';
const NEUTRAL_GUIDE = {
  competitionFormat: PENDING,
  stockProfile: PENDING,
  historicBenchmark: PENDING,
  scoringBreakdown: [] as string[],
  rulesHighlights: [] as string[],
  terminology: [] as { term: string; definition: string }[],
  beginnerTips: [] as string[],
};

const SEO_GROUPS = ['On-page', 'Search Appearance', 'Technical', 'Content & Topic', 'External Links', 'Internal Links', 'Image SEO', 'Structured Data', 'AI Search Readiness', 'Freshness', 'Event SEO', 'Redirects'];

const LEGACY_REDIRECTS: [string, string][] = [
  ['/nfr-competition/', '/competition/'],
  ['/nfr-entertainment/', '/entertainment/'],
  ['/nfr-events-and-shopping/', '/events-shopping/'],
  ['/nfr-plan-and-watch/', '/plan-watch/'],
  ['/more-rodeo/', '/rodeo-events/'],
];

// ---------------------------------------------------------------------------
// 1. Reference data
// ---------------------------------------------------------------------------
async function seedReference() {
  let order = 0;
  for (const key of Object.keys(PRIMARY_SECTIONS)) {
    const meta = PRIMARY_SECTIONS[key];
    const id = `cat-${meta.id}`;
    await prisma.category.upsert({
      where: { id },
      update: {},
      create: { id, slug: slugify(meta.categoryKey), name: meta.categoryKey, description: meta.description, sortOrder: order++ },
    });
  }

  for (let i = 0; i < NFR_DISCIPLINES.length; i++) {
    const d = NFR_DISCIPLINES[i];
    const id = `disc-${d.slug}`;
    await prisma.discipline.upsert({
      where: { id },
      update: {},
      create: {
        id, slug: d.slug, name: d.name, shortName: d.name, category: d.category,
        tagline: '', summary: `${d.name} guide — ${PENDING.toLowerCase()}`, image: null, imageCredit: null,
        guide: NEUTRAL_GUIDE, sortOrder: i,
      },
    });
  }

  for (let i = 0; i < SEO_GROUPS.length; i++) {
    const code = `grp-${slugify(SEO_GROUPS[i])}`;
    const severity: SeoSeverity = i < 4 ? 'WARNING' : 'NOTICE';
    await prisma.seoRule.upsert({
      where: { code },
      update: {},
      create: { code, group: SEO_GROUPS[i], severity, description: `${SEO_GROUPS[i]} rule group` },
    });
  }

  const ROLES: [string, string][] = [['super_admin', 'Super Admin'], ['administrator', 'Administrator'], ['editor', 'Editor'], ['author', 'Author'], ['seo_manager', 'SEO Manager']];
  for (const [key, name] of ROLES) await prisma.role.upsert({ where: { key }, update: {}, create: { key, name } });
  const PERMS: [string, string][] = [['article.publish', 'Publish articles'], ['article.edit', 'Edit articles'], ['user.manage', 'Manage users'], ['seo.configure', 'Configure SEO']];
  for (const [key, label] of PERMS) await prisma.permission.upsert({ where: { key }, update: {}, create: { key, label } });

  // Already create-missing-only helpers.
  const nav = await seedCanonicalNavigation(prisma);
  await seedAnalyticsDefaults(prisma);
  await seedMonetizationDefaults(prisma);

  for (const [src, tgt] of LEGACY_REDIRECTS) {
    await prisma.articleRedirect.upsert({ where: { sourcePath: src }, update: {}, create: { sourcePath: src, targetPath: tgt, statusCode: 308, status: 'ACTIVE' } });
  }
  return nav;
}

// ---------------------------------------------------------------------------
// 2. Synthetic test fixtures (isolated test/CI databases only)
// ---------------------------------------------------------------------------
async function seedFixtures() {
  const authorId = 'fixture-author';
  await prisma.author.upsert({
    where: { id: authorId },
    update: {},
    create: { id: authorId, slug: 'fixture-author', name: 'Fixture Author', role: 'Test fixture', bio: FIXTURE_TEXT },
  });

  const sourceId = FIXTURE_SLUGS.source;
  await prisma.source.upsert({
    where: { id: sourceId },
    update: {},
    create: { id: sourceId, title: 'Fixture Source A', url: 'https://example.org/fixture-source-a', publisher: 'Example Publisher (fixture)', type: 'Fixture', status: 'NEEDS_REVIEW' },
  });

  const hubId = 'fixture-hub-a';
  await prisma.rodeoHub.upsert({
    where: { id: hubId },
    update: {},
    create: { id: hubId, slug: FIXTURE_SLUGS.hub, title: 'Fixture Hub A', description: 'Synthetic test hub. Not a real rodeo region or circuit.', sortOrder: 999 },
  });

  const editionIds: string[] = [];
  for (const [i, slug] of FIXTURE_SLUGS.events.entries()) {
    const letter = i === 0 ? 'A' : 'B';
    const eventId = `fixture-event-${letter.toLowerCase()}`;
    await prisma.rodeoEvent.upsert({
      where: { id: eventId },
      update: {},
      create: { id: eventId, slug, name: `Fixture Rodeo Event ${letter}`, description: 'Synthetic test event. Not a real rodeo.' },
    });
    const editionId = `fixture-edition-${letter.toLowerCase()}`;
    // No dates, venue or purse: the public page must show "Dates to be confirmed".
    await prisma.rodeoEventEdition.upsert({
      where: { id: editionId },
      update: {},
      create: { id: editionId, eventId, editionSlug: FIXTURE_SLUGS.editionSlug, label: `Fixture Edition ${letter}` },
    });
    await prisma.rodeoHubEvent.upsert({ where: { hubId_eventId: { hubId, eventId } }, update: {}, create: { hubId, eventId } });
    editionIds.push(editionId);
  }

  const BASE = Date.UTC(2026, 0, 1);
  for (const [i, f] of FIXTURE_ARTICLES.entries()) {
    const id = `fixture-article-${f.slug.replace(/^fixture-/, '')}`;
    if (await prisma.article.findUnique({ where: { id }, select: { id: true } })) continue; // create-only
    const categoryId = `cat-${PRIMARY_SECTIONS[f.key].id}`;
    await prisma.article.create({
      data: {
        id, slug: f.slug, title: f.title, deck: 'Synthetic test content.', excerpt: FIXTURE_TEXT,
        articleType: f.type, workflowStatus: f.published ? WorkflowStatus.PUBLISHED : WorkflowStatus.DRAFT, readTime: '1 min read',
        imageAltText: 'Fixture placeholder image', imageRightsStatus: 'UNRESOLVED',
        disclosureType: 'editorial-independent', takeaways: [],
        publishedAt: f.published ? new Date(BASE - i * 86_400_000) : null,
        authorId, categoryId,
        blocks: {
          create: [
            { sortOrder: 0, blockType: 'paragraph', data: { type: 'paragraph', text: `${FIXTURE_TEXT} (block 1)` } },
            { sortOrder: 1, blockType: 'paragraph', data: { type: 'paragraph', text: `${FIXTURE_TEXT} (block 2)` } },
          ],
        },
        seo: { create: { seoTitle: f.title, metaDescription: FIXTURE_TEXT } },
        sources: { create: [{ sourceId, sortOrder: 0, note: 'Fixture citation' }] },
        ...(f.slug === FIXTURE_SLUGS.publishedArticle
          ? {
              disciplines: { create: [{ disciplineId: 'disc-bull-riding' }] },
              hubs: { create: [{ hubId }] },
              events: { create: [{ eventId: 'fixture-event-a' }] },
              editions: { create: [{ editionId: editionIds[0] }] },
            }
          : {}),
      },
    });
  }
}

async function main() {
  const nav = await seedReference();

  const target = decideTestDatabase({ TEST_DATABASE_URL: process.env.DATABASE_URL, CLOUD_DATABASE_URL: process.env.CLOUD_DATABASE_URL });
  const fixtures = target.mode === 'isolated';
  if (fixtures) await seedFixtures();
  else console.log(`Test fixtures skipped: DATABASE_URL is not an isolated test/CI database (${target.reason}).`);

  const counts = {
    fixtures: fixtures ? `seeded into ${target.mode === 'isolated' ? target.target : ''}` : 'skipped',
    articles: await prisma.article.count(),
    published: await prisma.article.count({ where: { workflowStatus: 'PUBLISHED' } }),
    disciplines: await prisma.discipline.count(),
    categories: await prisma.category.count(),
    authors: await prisma.author.count(),
    navigationSeeded: `${nav.created} created / ${nav.skipped} kept`,
  };
  console.log('Seed complete:', JSON.stringify(counts, null, 2));
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => {
    console.error('Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

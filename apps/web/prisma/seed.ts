/**
 * NFRGuide — Idempotent database seed (Batch 02 §7).
 *
 * Maps the existing Phase 0 typed demonstration data (mockEditorialData.ts,
 * mockAdminData.ts) into the relational schema. Safe to run repeatedly: every
 * entity is upserted by a stable key and each article's child rows are reset and
 * rebuilt. It seeds only known demonstration slugs/ids, so it will not clobber
 * editor-created content (which uses different ids) in a shared environment.
 *
 * It does NOT fabricate real NFR results/schedules/standings — it only persists
 * the clearly-marked demonstration editorial content already in the repo.
 */
import { PrismaClient, WorkflowStatus, ImageRightsStatus, SourceClassification, SourceStatus, SeoSeverity } from '@prisma/client';
import {
  ALL_ARTICLES,
  SEVEN_DISCIPLINES,
  RODEO_HUBS,
  RECURRING_RODEO_EVENTS,
  AUTHORS,
} from '../data/mockEditorialData';
import { MEDIA_ASSETS, ADMIN_SOURCES } from '../data/mockAdminData';
import { PRIMARY_SECTIONS } from '../config/routes';
import { seedCanonicalNavigation } from '../lib/cms/navCanonical';
import { seedAnalyticsDefaults } from '../lib/cms/analyticsSeed';
import type { Article, ContentBlock } from '../types';

const prisma = new PrismaClient();

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// JSON columns cannot contain `undefined`; a round-trip yields clean JSON.
const cleanJson = (v: unknown): object => JSON.parse(JSON.stringify(v ?? {}));

const RIGHTS: Record<string, ImageRightsStatus> = {
  'Staff Photo': 'STAFF_PHOTO',
  'Editorial Pool': 'EDITORIAL_POOL',
  'PRCA Archive': 'PRCA_ARCHIVE',
  'Licensed Creative': 'LICENSED_CREATIVE',
  Unresolved: 'UNRESOLVED',
};
const toRights = (s?: string): ImageRightsStatus => (s && RIGHTS[s]) || 'STAFF_PHOTO';

const CLASSIFICATION: Record<string, SourceClassification> = {
  Official: 'OFFICIAL',
  'Independent Reference': 'INDEPENDENT_REFERENCE',
  'Historical Archive': 'HISTORICAL_ARCHIVE',
};
const SOURCE_STATUS: Record<string, SourceStatus> = {
  verified: 'VERIFIED',
  needs_review: 'NEEDS_REVIEW',
  expired: 'EXPIRED',
};

// Deterministic publish timestamps: array order = newest first.
const BASE = Date.UTC(2026, 11, 1);
const DAY = 86_400_000;
const publishedAtFor = (i: number) => new Date(BASE - i * DAY);

async function main() {
  // --- Categories (5 primary sections) -------------------------------------
  const categoryIdByName = new Map<string, string>();
  let order = 0;
  for (const key of Object.keys(PRIMARY_SECTIONS)) {
    const meta = PRIMARY_SECTIONS[key];
    const id = `cat-${meta.id}`;
    await prisma.category.upsert({
      where: { id },
      update: { slug: slugify(meta.categoryKey), name: meta.categoryKey, description: meta.description, sortOrder: order },
      create: { id, slug: slugify(meta.categoryKey), name: meta.categoryKey, description: meta.description, sortOrder: order },
    });
    categoryIdByName.set(meta.categoryKey, id);
    order++;
  }

  // --- Authors (from AUTHORS + any article bylines) ------------------------
  const authorIdByName = new Map<string, string>();
  const authorList: { name: string; role: string; bio?: string; credentials?: string; editorialBeat?: string; avatar?: string }[] = [
    ...Object.values(AUTHORS as Record<string, { name: string; role: string; bio?: string; credentials?: string; editorialBeat?: string; avatar?: string }>),
    ...ALL_ARTICLES.map((a) => a.author),
  ];
  for (const a of authorList) {
    if (!a?.name || authorIdByName.has(a.name)) continue;
    const id = `author-${slugify(a.name)}`;
    await prisma.author.upsert({
      where: { id },
      update: { name: a.name, role: a.role, bio: a.bio ?? null, credentials: a.credentials ?? null, editorialBeat: a.editorialBeat ?? null, avatar: a.avatar ?? null },
      create: { id, slug: slugify(a.name), name: a.name, role: a.role, bio: a.bio ?? null, credentials: a.credentials ?? null, editorialBeat: a.editorialBeat ?? null, avatar: a.avatar ?? null },
    });
    authorIdByName.set(a.name, id);
  }

  // --- Disciplines (core fields + guide JSON) ------------------------------
  const disciplineIdBySlug = new Map<string, string>();
  let dOrder = 0;
  for (const d of SEVEN_DISCIPLINES) {
    const id = `disc-${d.slug}`;
    const { id: _i, slug, name, shortName, category, tagline, summary, image, imageCredit, ...guide } = d as Record<string, unknown> & typeof d;
    await prisma.discipline.upsert({
      where: { id },
      update: { slug, name, shortName, category, tagline, summary, image, imageCredit, guide: cleanJson(guide), sortOrder: dOrder },
      create: { id, slug, name, shortName, category, tagline, summary, image, imageCredit, guide: cleanJson(guide), sortOrder: dOrder },
    });
    disciplineIdBySlug.set(d.slug, id);
    disciplineIdBySlug.set(d.id, id);
    dOrder++;
  }

  // --- Rodeo hubs ----------------------------------------------------------
  const hubIds = new Set<string>();
  let hOrder = 0;
  for (const h of RODEO_HUBS) {
    const id = `hub-${h.slug || slugify(h.title)}`;
    await prisma.rodeoHub.upsert({
      where: { id },
      update: { slug: h.slug || slugify(h.title), title: h.title, region: h.region, circuitType: h.circuitType, description: h.description, annualEventsCount: h.annualEventsCount ?? 0, sortOrder: hOrder },
      create: { id, slug: h.slug || slugify(h.title), title: h.title, region: h.region, circuitType: h.circuitType, description: h.description, annualEventsCount: h.annualEventsCount ?? 0, sortOrder: hOrder },
    });
    hubIds.add(id);
    hubIds.add(h.id);
    hOrder++;
  }

  // --- Recurring events + current editions ---------------------------------
  const eventIds = new Set<string>();
  const editionIds = new Set<string>();
  for (const e of RECURRING_RODEO_EVENTS) {
    const id = `event-${e.slug || slugify(e.name)}`;
    await prisma.rodeoEvent.upsert({
      where: { id },
      update: { slug: e.slug || slugify(e.name), name: e.name, location: e.location, traditionalMonth: e.traditionalMonth, status: e.status, description: e.description },
      create: { id, slug: e.slug || slugify(e.name), name: e.name, location: e.location, traditionalMonth: e.traditionalMonth, status: e.status, description: e.description },
    });
    eventIds.add(id);
    eventIds.add(e.id);
    if (e.currentEdition) {
      const edId = `edition-${e.slug || slugify(e.name)}-${e.currentEdition.year}`;
      await prisma.rodeoEventEdition.upsert({
        where: { id: edId },
        update: { eventId: id, editionSlug: String(e.currentEdition.year), label: `${e.name} ${e.currentEdition.year}`, year: e.currentEdition.year, purseBenchmark: e.currentEdition.purseBenchmark },
        create: { id: edId, eventId: id, editionSlug: String(e.currentEdition.year), label: `${e.name} ${e.currentEdition.year}`, year: e.currentEdition.year, purseBenchmark: e.currentEdition.purseBenchmark },
      });
      editionIds.add(edId);
    }
  }

  // --- Media assets --------------------------------------------------------
  const mediaIdByUrl = new Map<string, string>();
  for (const m of MEDIA_ASSETS) {
    const id = `media-${m.id}`;
    const url = m.url.replace('/src/assets/images/', '/assets/images/');
    await prisma.mediaAsset.upsert({
      where: { id },
      update: { storageKey: m.id, url, filename: m.filename, dimensions: m.dimensions, format: m.format, seoTitle: m.seoTitle, altText: m.altText, credit: m.credit, rightsStatus: toRights(m.rightsStatus) },
      create: { id, storageKey: m.id, url, filename: m.filename, dimensions: m.dimensions, format: m.format, seoTitle: m.seoTitle, altText: m.altText, credit: m.credit, rightsStatus: toRights(m.rightsStatus) },
    });
    if (!mediaIdByUrl.has(url)) mediaIdByUrl.set(url, id);
  }

  // --- Source directory (admin directory + article citations) -------------
  const sourceId = (title: string, url: string) => `src-${slugify(title).slice(0, 40)}-${slugify(url).slice(0, 20)}`;
  const upsertSource = async (title: string, url: string, publisher?: string, type?: string, classification?: string, status?: string) => {
    const id = sourceId(title, url);
    await prisma.source.upsert({
      where: { id },
      update: { title, url, publisher: publisher ?? null, type: type ?? null, classification: (classification && CLASSIFICATION[classification]) || 'INDEPENDENT_REFERENCE', status: (status && SOURCE_STATUS[status]) || 'NEEDS_REVIEW' },
      create: { id, title, url, publisher: publisher ?? null, type: type ?? null, classification: (classification && CLASSIFICATION[classification]) || 'INDEPENDENT_REFERENCE', status: (status && SOURCE_STATUS[status]) || 'NEEDS_REVIEW' },
    });
    return id;
  };
  for (const s of ADMIN_SOURCES) {
    await upsertSource(s.title, s.url, s.publisher, s.type, s.classification, s.status);
  }

  // --- SEO rules (12 groups foundation) ------------------------------------
  const SEO_GROUPS = ['On-page','Search Appearance','Technical','Content & Topic','External Links','Internal Links','Image SEO','Structured Data','AI Search Readiness','Freshness','Event SEO','Redirects'];
  for (let i = 0; i < SEO_GROUPS.length; i++) {
    const code = `grp-${slugify(SEO_GROUPS[i])}`;
    const severity: SeoSeverity = i < 4 ? 'WARNING' : 'NOTICE';
    await prisma.seoRule.upsert({
      where: { code },
      update: { group: SEO_GROUPS[i], severity, description: `${SEO_GROUPS[i]} rule group` },
      create: { code, group: SEO_GROUPS[i], severity, description: `${SEO_GROUPS[i]} rule group` },
    });
  }

  // --- Roles & permissions (identity foundation, no auth) ------------------
  const ROLES: [string, string][] = [['super_admin','Super Admin'],['administrator','Administrator'],['editor','Editor'],['author','Author'],['seo_manager','SEO Manager']];
  for (const [key, name] of ROLES) {
    await prisma.role.upsert({ where: { key }, update: { name }, create: { key, name } });
  }
  const PERMS: [string, string][] = [['article.publish','Publish articles'],['article.edit','Edit articles'],['user.manage','Manage users'],['seo.configure','Configure SEO']];
  for (const [key, label] of PERMS) {
    await prisma.permission.upsert({ where: { key }, update: { label }, create: { key, label } });
  }

  // --- Canonical navigation (idempotent, create-missing-only) --------------
  // Materializes the protected header/footer links as `isSystem` rows. Never
  // overwrites an administrator's customized values and never deletes rows.
  const navSeed = await seedCanonicalNavigation(prisma);

  // --- Analytics provider rows (idempotent, create-missing-only) -----------
  await seedAnalyticsDefaults(prisma);

  // --- Redirect registry (mirror of next.config legacy redirects) ----------
  const REDIRECTS: [string, string][] = [
    ['/nfr-competition/','/competition/'],
    ['/nfr-entertainment/','/entertainment/'],
    ['/nfr-events-and-shopping/','/events-shopping/'],
    ['/nfr-plan-and-watch/','/plan-watch/'],
    ['/more-rodeo/','/rodeo-events/'],
  ];
  for (const [src, tgt] of REDIRECTS) {
    await prisma.articleRedirect.upsert({
      where: { sourcePath: src },
      update: { targetPath: tgt, statusCode: 308, status: 'ACTIVE' },
      create: { sourcePath: src, targetPath: tgt, statusCode: 308, status: 'ACTIVE' },
    });
  }

  // --- Articles ------------------------------------------------------------
  const seededArticleIds = new Set<string>();
  for (let i = 0; i < ALL_ARTICLES.length; i++) {
    const art = ALL_ARTICLES[i] as Article;
    const id = art.id;
    seededArticleIds.add(id);
    const categoryId = categoryIdByName.get(art.category) ?? categoryIdByName.values().next().value!;
    const authorId = authorIdByName.get(art.author.name)!;
    const hero = (art.heroImage || '').replace('/src/assets/images/', '/assets/images/');

    await prisma.article.upsert({
      where: { id },
      update: {
        slug: art.slug, title: art.title, deck: art.deck ?? null, excerpt: art.excerpt ?? art.deck ?? '',
        subcategory: art.subcategory ?? null, articleType: String(art.articleType ?? 'General Information'),
        workflowStatus: WorkflowStatus.PUBLISHED, readTime: art.readTime ?? null,
        isLeadHero: Boolean(art.isLeadHero) || i === 0, isFeatured: Boolean(art.isFeatured),
        heroImageUrl: hero || null, imageCredit: art.imageCredit ?? null, imageCaption: art.imageCaption ?? null,
        imageSeoTitle: art.imageSeoTitle ?? null, imageAltText: art.imageAltText ?? null, imageRightsStatus: toRights(art.imageRightsStatus),
        disclosureType: art.disclosure ?? 'editorial-independent', disclosureNote: art.disclosureNote ?? null,
        takeaways: art.takeaways ?? [], publishedAt: publishedAtFor(i), authorId, categoryId,
      },
      create: {
        id, slug: art.slug, title: art.title, deck: art.deck ?? null, excerpt: art.excerpt ?? art.deck ?? '',
        subcategory: art.subcategory ?? null, articleType: String(art.articleType ?? 'General Information'),
        workflowStatus: WorkflowStatus.PUBLISHED, readTime: art.readTime ?? null,
        isLeadHero: Boolean(art.isLeadHero) || i === 0, isFeatured: Boolean(art.isFeatured),
        heroImageUrl: hero || null, imageCredit: art.imageCredit ?? null, imageCaption: art.imageCaption ?? null,
        imageSeoTitle: art.imageSeoTitle ?? null, imageAltText: art.imageAltText ?? null, imageRightsStatus: toRights(art.imageRightsStatus),
        disclosureType: art.disclosure ?? 'editorial-independent', disclosureNote: art.disclosureNote ?? null,
        takeaways: art.takeaways ?? [], publishedAt: publishedAtFor(i), authorId, categoryId,
      },
    });

    // Reset child rows for idempotency.
    await prisma.articleBlock.deleteMany({ where: { articleId: id } });
    await prisma.articleTag.deleteMany({ where: { articleId: id } });
    await prisma.articleSource.deleteMany({ where: { articleId: id } });
    await prisma.articleMedia.deleteMany({ where: { articleId: id } });
    await prisma.articleDiscipline.deleteMany({ where: { articleId: id } });
    await prisma.articleHub.deleteMany({ where: { articleId: id } });
    await prisma.articleEvent.deleteMany({ where: { articleId: id } });
    await prisma.articleEdition.deleteMany({ where: { articleId: id } });

    // Blocks
    const blocks: ContentBlock[] = art.structuredBody && art.structuredBody.length
      ? art.structuredBody
      : (art.content ?? []).map((text) => ({ type: 'paragraph', text }) as ContentBlock);
    for (let b = 0; b < blocks.length; b++) {
      await prisma.articleBlock.create({ data: { articleId: id, sortOrder: b, blockType: blocks[b].type, data: cleanJson(blocks[b]) } });
    }

    // SEO (1:1)
    await prisma.articleSeo.upsert({
      where: { articleId: id },
      update: { seoTitle: art.seo?.title ?? art.title, metaDescription: art.seo?.description ?? art.excerpt ?? art.deck ?? null, canonicalUrl: `https://nfrguide.com/articles/${art.slug}/`, ogImage: hero || null },
      create: { articleId: id, seoTitle: art.seo?.title ?? art.title, metaDescription: art.seo?.description ?? art.excerpt ?? art.deck ?? null, canonicalUrl: `https://nfrguide.com/articles/${art.slug}/`, ogImage: hero || null },
    });

    // Tags
    for (const name of art.tags ?? []) {
      const tagId = `tag-${slugify(name)}`;
      await prisma.tag.upsert({ where: { id: tagId }, update: { name }, create: { id: tagId, slug: slugify(name), name } });
      await prisma.articleTag.create({ data: { articleId: id, tagId } });
    }

    // Sources (citations attached to the article)
    let sOrder = 0;
    for (const s of art.sources ?? []) {
      const sid = await upsertSource(s.title, s.url ?? '', s.publisher, undefined, s.classification, s.status);
      await prisma.articleSource.create({ data: { articleId: id, sourceId: sid, note: s.note ?? null, sortOrder: sOrder++ } });
    }

    // Hero media link (if the hero image matches a known asset)
    if (hero && mediaIdByUrl.has(hero)) {
      await prisma.articleMedia.create({ data: { articleId: id, mediaId: mediaIdByUrl.get(hero)!, usageKey: 'hero', altText: art.imageAltText ?? null, caption: art.imageCaption ?? null } });
    }

    // Rodeo relationships (guarded to existing seeded entities)
    const discIds = new Set<string>([...(art.associatedDisciplineIds ?? []), ...(art.associatedDisciplineId ? [art.associatedDisciplineId] : [])]);
    for (const d of discIds) {
      const realId = disciplineIdBySlug.get(d) ?? disciplineIdBySlug.get(slugify(d));
      if (realId) await prisma.articleDiscipline.create({ data: { articleId: id, disciplineId: realId } }).catch(() => {});
    }
    for (const h of new Set<string>([...(art.associatedHubIds ?? []), ...(art.associatedHubId ? [art.associatedHubId] : [])])) {
      const realId = hubIds.has(h) ? (h.startsWith('hub-') ? h : `hub-${h}`) : hubIds.has(`hub-${h}`) ? `hub-${h}` : null;
      if (realId && hubIds.has(realId)) await prisma.articleHub.create({ data: { articleId: id, hubId: realId } }).catch(() => {});
    }
  }

  // --- Curated article relations (after all articles exist) ----------------
  for (const art of ALL_ARTICLES as Article[]) {
    await prisma.articleRelation.deleteMany({ where: { sourceId: art.id } });
    for (const targetId of art.relatedArticleIds ?? []) {
      if (seededArticleIds.has(targetId) && targetId !== art.id) {
        await prisma.articleRelation.create({ data: { sourceId: art.id, targetId } }).catch(() => {});
      }
    }
  }

  const counts = {
    articles: await prisma.article.count(),
    published: await prisma.article.count({ where: { workflowStatus: 'PUBLISHED' } }),
    disciplines: await prisma.discipline.count(),
    categories: await prisma.category.count(),
    authors: await prisma.author.count(),
    blocks: await prisma.articleBlock.count(),
    sources: await prisma.source.count(),
    media: await prisma.mediaAsset.count(),
    redirects: await prisma.articleRedirect.count(),
    navigationItems: await prisma.navigationItem.count(),
    navigationSeeded: `${navSeed.created} created / ${navSeed.skipped} kept`,
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

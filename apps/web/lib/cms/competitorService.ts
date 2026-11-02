import 'server-only';
import { z } from 'zod';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { deleteEntitySeoForEntity } from './entitySeoService';
import { deleteFaqsForEntity } from './faqService';

/**
 * Competitor (rodeo athlete) management — Batch 12. Requires `rodeo.manage` (reuses
 * existing RBAC; no new permission strings). Every mutation is audited. Participation
 * is authoritative at the EDITION grain only (never the recurring event) and is never
 * auto-transferred between annual editions. Only verified facts are stored — the CMS
 * supplies no fabricated bios, results, rankings or prize money (empty is preferred).
 * Reference-safe deletion cleans up polymorphic SEO/FAQ rows (no orphans).
 */
const req = (a: Actor) => { if (!roleHasPermission(a.roles, 'rodeo.manage')) throw new ServiceError('forbidden', 'Not permitted to manage competitors'); };
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const currentYear = new Date().getUTCFullYear();

export interface CompetitorRow {
  id: string; slug: string; fullName: string; knownAs: string | null; status: string | null;
  disciplineCount: number; participationCount: number; articleCount: number;
}
export async function listCompetitors(): Promise<CompetitorRow[]> {
  const rows = await prisma.competitor.findMany({
    orderBy: [{ sortOrder: 'asc' }, { fullName: 'asc' }],
    include: { _count: { select: { disciplines: true, editions: true, articles: true } } },
  });
  return rows.map((c) => ({
    id: c.id, slug: c.slug, fullName: c.fullName, knownAs: c.knownAs, status: c.status,
    disciplineCount: c._count.disciplines, participationCount: c._count.editions, articleCount: c._count.articles,
  }));
}

const CompetitorInput = z.object({
  fullName: z.string().min(1).max(200),
  knownAs: z.string().max(160).optional(),
  summary: z.string().max(600).optional(),
  hometownCity: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  birthYear: z.number().int().min(1900).max(currentYear).optional(),
  status: z.enum(['active', 'retired']).optional(),
  heroImage: z.string().max(500).optional(),
  imageCredit: z.string().max(240).optional(),
});
export type CompetitorInput = z.input<typeof CompetitorInput>;
function competitorData(v: z.infer<typeof CompetitorInput>) {
  return {
    fullName: v.fullName, knownAs: v.knownAs?.trim() || null, summary: v.summary?.trim() || null,
    hometownCity: v.hometownCity?.trim() || null, state: v.state?.trim() || null, country: v.country?.trim() || null,
    birthYear: v.birthYear ?? null, status: v.status ?? null,
    heroImage: v.heroImage?.trim() || null, imageCredit: v.imageCredit?.trim() || null,
  };
}

export async function createCompetitor(a: Actor, raw: CompetitorInput): Promise<{ id: string }> {
  req(a); const v = CompetitorInput.parse(raw); const slug = slugify(v.fullName);
  if (!slug) throw new ServiceError('validation', 'Name must contain letters or numbers.');
  if (await prisma.competitor.findUnique({ where: { slug }, select: { id: true } })) throw new ServiceError('conflict', 'A competitor with that name/slug already exists.');
  const row = await prisma.competitor.create({ data: { slug, ...competitorData(v) } });
  await audit(a.id, 'competitor.create', 'competitor', row.id, v.fullName);
  return { id: row.id };
}
export async function updateCompetitor(a: Actor, id: string, raw: CompetitorInput): Promise<void> {
  req(a); const v = CompetitorInput.parse(raw);
  if (!(await prisma.competitor.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('not_found', 'Competitor not found');
  await prisma.competitor.update({ where: { id }, data: competitorData(v) });
  await audit(a.id, 'competitor.update', 'competitor', id, v.fullName);
}
export async function deleteCompetitor(a: Actor, id: string): Promise<void> {
  req(a);
  const published = await prisma.articleCompetitor.count({ where: { competitorId: id, article: { workflowStatus: 'PUBLISHED' } } });
  if (published > 0) throw new ServiceError('conflict', `Cannot delete: ${published} published article(s) reference this competitor.`);
  await prisma.competitor.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Competitor not found'); });
  // Junctions cascade via FK; clean up polymorphic SEO/FAQ to avoid orphans.
  await deleteEntitySeoForEntity('COMPETITOR', id);
  await deleteFaqsForEntity('COMPETITOR', id);
  await audit(a.id, 'competitor.delete', 'competitor', id);
}

// ---- Relationships ----

/** Replace the competitor's discipline set (validates each discipline exists). */
export async function setCompetitorDisciplines(a: Actor, competitorId: string, disciplineIds: string[]): Promise<void> {
  req(a);
  if (!(await prisma.competitor.findUnique({ where: { id: competitorId }, select: { id: true } }))) throw new ServiceError('not_found', 'Competitor not found');
  const ids = [...new Set(disciplineIds)];
  if (ids.length) {
    const found = await prisma.discipline.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new ServiceError('validation', 'One or more disciplines do not exist.');
  }
  await prisma.$transaction([
    prisma.competitorDiscipline.deleteMany({ where: { competitorId } }),
    ...ids.map((disciplineId) => prisma.competitorDiscipline.create({ data: { competitorId, disciplineId } })),
  ]);
  await audit(a.id, 'competitor.disciplines.set', 'competitor', competitorId, `${ids.length} discipline(s)`);
}

const ParticipationInput = z.object({
  editionId: z.string().min(1),
  result: z.string().max(240).optional(),
  placement: z.number().int().min(1).max(9999).optional(),
  note: z.string().max(600).optional(),
});
export type ParticipationInput = z.input<typeof ParticipationInput>;

/** Add (or update) an edition-level participation. Edition must exist; never the
 *  recurring event. Results/placement are optional and only ever verified facts. */
export async function addCompetitorParticipation(a: Actor, competitorId: string, raw: ParticipationInput): Promise<void> {
  req(a); const v = ParticipationInput.parse(raw);
  if (!(await prisma.competitor.findUnique({ where: { id: competitorId }, select: { id: true } }))) throw new ServiceError('not_found', 'Competitor not found');
  if (!(await prisma.rodeoEventEdition.findUnique({ where: { id: v.editionId }, select: { id: true } }))) throw new ServiceError('validation', 'Edition not found.');
  await prisma.competitorParticipation.upsert({
    where: { competitorId_editionId: { competitorId, editionId: v.editionId } },
    create: { competitorId, editionId: v.editionId, result: v.result?.trim() || null, placement: v.placement ?? null, note: v.note?.trim() || null },
    update: { result: v.result?.trim() || null, placement: v.placement ?? null, note: v.note?.trim() || null },
  });
  await audit(a.id, 'competitor.participation.set', 'competitor', competitorId, v.editionId);
}
export async function removeCompetitorParticipation(a: Actor, competitorId: string, editionId: string): Promise<void> {
  req(a);
  await prisma.competitorParticipation.deleteMany({ where: { competitorId, editionId } });
  await audit(a.id, 'competitor.participation.remove', 'competitor', competitorId, editionId);
}

/** Link/unlink an article to a competitor (article↔competitor association). */
export async function setArticleCompetitors(a: Actor, articleId: string, competitorIds: string[]): Promise<void> {
  req(a);
  if (!(await prisma.article.findUnique({ where: { id: articleId }, select: { id: true } }))) throw new ServiceError('not_found', 'Article not found');
  const ids = [...new Set(competitorIds)];
  if (ids.length) {
    const found = await prisma.competitor.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new ServiceError('validation', 'One or more competitors do not exist.');
  }
  await prisma.$transaction([
    prisma.articleCompetitor.deleteMany({ where: { articleId } }),
    ...ids.map((competitorId) => prisma.articleCompetitor.create({ data: { articleId, competitorId } })),
  ]);
  await audit(a.id, 'article.competitors.set', 'article', articleId, `${ids.length} competitor(s)`);
}

// ---- Admin detail (for the dedicated CMS editor) ----
export interface CompetitorDetail {
  id: string; slug: string;
  fields: CompetitorInput;
  disciplineIds: string[];
  participations: { editionId: string; label: string; eventName: string; result: string | null; placement: number | null; note: string | null }[];
}
export async function getCompetitorDetail(a: Actor, id: string): Promise<CompetitorDetail> {
  req(a);
  const c = await prisma.competitor.findUnique({
    where: { id },
    include: {
      disciplines: { select: { disciplineId: true } },
      editions: { include: { edition: { select: { label: true, event: { select: { name: true } } } } } },
    },
  });
  if (!c) throw new ServiceError('not_found', 'Competitor not found');
  return {
    id: c.id, slug: c.slug,
    fields: {
      fullName: c.fullName, knownAs: c.knownAs ?? undefined, summary: c.summary ?? undefined,
      hometownCity: c.hometownCity ?? undefined, state: c.state ?? undefined, country: c.country ?? undefined,
      birthYear: c.birthYear ?? undefined, status: (c.status as 'active' | 'retired' | undefined) ?? undefined,
      heroImage: c.heroImage ?? undefined, imageCredit: c.imageCredit ?? undefined,
    },
    disciplineIds: c.disciplines.map((d) => d.disciplineId),
    participations: c.editions.map((p) => ({ editionId: p.editionId, label: p.edition.label, eventName: p.edition.event.name, result: p.result, placement: p.placement, note: p.note })),
  };
}

export async function listEditionsForSelect(): Promise<{ id: string; label: string }[]> {
  const rows = await prisma.rodeoEventEdition.findMany({ orderBy: [{ year: 'desc' }], include: { event: { select: { name: true } } } });
  return rows.map((e) => ({ id: e.id, label: `${e.event.name} — ${e.label}` }));
}
export async function listDisciplinesForSelect(): Promise<{ id: string; name: string }[]> {
  return prisma.discipline.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } });
}

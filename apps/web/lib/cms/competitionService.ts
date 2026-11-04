import 'server-only';
import { z } from 'zod';
import { Prisma, type CoverageStatus, type CoverageVerification, type CompetitionResultType, type StandingCategory, type CompetitionSessionStatus } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';

/**
 * Edition-scoped competition coverage — Schedules, Results, Standings (Batch 14).
 * Generic + reusable across any rodeo event/edition (NOT NFR-specific). Requires
 * `rodeo.manage`; every mutation is audited. Public visibility requires
 * coverageStatus=PUBLISHED AND verification=VERIFIED AND valid edition/relationships.
 * No fabricated data: unknown times/scores stay null, and official values are never
 * silently altered (corrections are explicit, linked records). Authoritative numerics
 * use Decimal (never float) and are serialized as strings.
 */
const req = (a: Actor) => { if (!roleHasPermission(a.roles, 'rodeo.manage')) throw new ServiceError('forbidden', 'Not permitted to manage competition coverage'); };

/**
 * Optimistic-concurrency guard (Batch 17 finalization §4): an existing-record content
 * update MUST carry the version the editor loaded. A missing / non-integer / < 1 value
 * is rejected as `validation` — this closes the bypass where omitting `expectedVersion`
 * previously fell back to an unconditional (last-write-wins) update.
 */
function requireVersion(expectedVersion: number): number {
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new ServiceError('validation', 'A valid record version is required to save edits. Reload the record and try again.');
  }
  return expectedVersion;
}

async function assertEdition(editionId: string) {
  if (!(await prisma.rodeoEventEdition.findUnique({ where: { id: editionId }, select: { id: true } }))) throw new ServiceError('validation', 'Edition not found.');
}
async function assertDiscipline(id: string | null | undefined) {
  if (id && !(await prisma.discipline.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('validation', 'Discipline not found.');
}
/** A competitor must have a participation in the edition — prevents cross-edition association. */
async function assertEligible(competitorId: string, editionId: string) {
  if (!(await prisma.competitor.findUnique({ where: { id: competitorId }, select: { id: true } }))) throw new ServiceError('validation', 'Competitor not found.');
  const part = await prisma.competitorParticipation.findUnique({ where: { competitorId_editionId: { competitorId, editionId } }, select: { competitorId: true } });
  if (!part) throw new ServiceError('validation', 'Competitor is not a participant in this edition (add participation first — prevents cross-edition association).');
}

const dec = z.union([z.number(), z.string()]).optional().nullable();
function toDecimal(v: number | string | null | undefined): Prisma.Decimal | null {
  if (v === null || v === undefined || v === '') return null;
  try { return new Prisma.Decimal(v); } catch { throw new ServiceError('validation', 'Invalid numeric value.'); }
}
const decStr = (d: Prisma.Decimal | null) => (d === null ? null : d.toString());

// ---- publication / verification gate (shared) ----
function canPublish(verification: CoverageVerification): boolean { return verification === 'VERIFIED'; }
export function isCoveragePublic(coverageStatus: CoverageStatus, verification: CoverageVerification): boolean {
  return coverageStatus === 'PUBLISHED' && verification === 'VERIFIED';
}

// ======================= SCHEDULE (CompetitionSession) =======================
const SessionInput = z.object({
  editionId: z.string().min(1),
  disciplineId: z.string().optional().nullable(),
  venueId: z.string().optional().nullable(),
  date: z.string().datetime().optional().nullable(),
  title: z.string().min(1).max(200),
  sessionType: z.string().min(1).max(80),
  roundNumber: z.number().int().min(0).max(999).optional().nullable(),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
  timezone: z.string().max(64).optional().nullable(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['SCHEDULED', 'RESCHEDULED', 'POSTPONED', 'CANCELLED', 'COMPLETED']).optional(),
  sourceRef: z.string().max(300).optional().nullable(),
  sourceUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  notes: z.string().max(2000).optional().nullable(),
});
export type SessionInput = z.input<typeof SessionInput>;

export async function createSession(a: Actor, raw: SessionInput) {
  req(a); const v = SessionInput.parse(raw);
  await assertEdition(v.editionId); await assertDiscipline(v.disciplineId);
  if (v.venueId && !(await prisma.venue.findUnique({ where: { id: v.venueId }, select: { id: true } }))) throw new ServiceError('validation', 'Venue not found.');
  const row = await prisma.competitionSession.create({ data: {
    editionId: v.editionId, disciplineId: v.disciplineId || null, venueId: v.venueId || null,
    date: v.date ? new Date(v.date) : null, title: v.title, sessionType: v.sessionType,
    roundNumber: v.roundNumber ?? null, startAt: v.startAt ? new Date(v.startAt) : null, endAt: v.endAt ? new Date(v.endAt) : null,
    timezone: v.timezone || null, sortOrder: v.sortOrder ?? 0, status: (v.status as CompetitionSessionStatus) ?? 'SCHEDULED',
    sourceRef: v.sourceRef || null, sourceUrl: v.sourceUrl || null, notes: v.notes || null, createdById: a.id,
  } });
  await audit(a.id, 'competition.session.create', 'competition_session', row.id, v.title);
  return { id: row.id };
}
export async function updateSession(a: Actor, id: string, raw: Omit<SessionInput, 'editionId'>, expectedVersion: number): Promise<{ version: number }> {
  req(a); const ev = requireVersion(expectedVersion);
  const existing = await prisma.competitionSession.findUnique({ where: { id }, select: { editionId: true } });
  if (!existing) throw new ServiceError('not_found', 'Session not found');
  const v = SessionInput.parse({ ...raw, editionId: existing.editionId });
  await assertDiscipline(v.disciplineId);
  // Optimistic concurrency (Batch 17 §A): the update only matches when the row is
  // still at the version the editor loaded, and the version is incremented in the
  // same atomic statement. A mismatch means another editor saved first — we refuse
  // rather than silently overwriting their changes.
  const where = { id, version: ev };
  const upd = await prisma.competitionSession.updateMany({ where, data: {
    disciplineId: v.disciplineId || null, venueId: v.venueId || null, date: v.date ? new Date(v.date) : null,
    title: v.title, sessionType: v.sessionType, roundNumber: v.roundNumber ?? null,
    startAt: v.startAt ? new Date(v.startAt) : null, endAt: v.endAt ? new Date(v.endAt) : null, timezone: v.timezone || null,
    sortOrder: v.sortOrder ?? 0, status: (v.status as CompetitionSessionStatus) ?? 'SCHEDULED',
    sourceRef: v.sourceRef || null, sourceUrl: v.sourceUrl || null, notes: v.notes || null,
    version: { increment: 1 },
  } });
  if (upd.count === 0) throw new ServiceError('conflict', 'This session was changed by someone else. Reload the latest data and reapply your edits.');
  const after = await prisma.competitionSession.findUniqueOrThrow({ where: { id }, select: { version: true } });
  await audit(a.id, 'competition.session.update', 'competition_session', id, v.title);
  return { version: after.version };
}
export async function deleteSession(a: Actor, id: string) {
  req(a);
  await prisma.competitionResult.updateMany({ where: { sessionId: id }, data: { sessionId: null } });
  await prisma.competitionSession.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Session not found'); });
  await audit(a.id, 'competition.session.delete', 'competition_session', id);
}

// ======================= RESULTS (CompetitionResult) =======================
const ResultInput = z.object({
  editionId: z.string().min(1),
  disciplineId: z.string().min(1),
  sessionId: z.string().optional().nullable(),
  competitorId: z.string().min(1),
  resultType: z.enum(['TIME', 'SCORE', 'NO_TIME', 'NO_SCORE', 'DISQUALIFIED', 'WITHDRAWN']),
  scoreNumeric: dec,
  timeSeconds: dec,
  placement: z.number().int().min(1).max(9999).optional().nullable(),
  isTie: z.boolean().optional(),
  sourceRef: z.string().max(300).optional().nullable(),
  sourceUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  notes: z.string().max(2000).optional().nullable(),
});
export type ResultInput = z.input<typeof ResultInput>;

async function assertSessionInEdition(sessionId: string | null | undefined, editionId: string) {
  if (!sessionId) return;
  const s = await prisma.competitionSession.findUnique({ where: { id: sessionId }, select: { editionId: true } });
  if (!s) throw new ServiceError('validation', 'Session not found.');
  if (s.editionId !== editionId) throw new ServiceError('validation', 'Session belongs to a different edition (cross-edition association blocked).');
}
/** Enforce domain sanity: score/time only where the result type supports it. */
function normalizeResultValues(v: z.infer<typeof ResultInput>) {
  const score = toDecimal(v.scoreNumeric), time = toDecimal(v.timeSeconds);
  if (v.resultType === 'NO_TIME' || v.resultType === 'NO_SCORE' || v.resultType === 'DISQUALIFIED' || v.resultType === 'WITHDRAWN') {
    return { score: null, time: null }; // no measured value is forced
  }
  if (v.resultType === 'TIME' && time === null) throw new ServiceError('validation', 'A TIME result needs timeSeconds (or use NO_TIME).');
  if (v.resultType === 'SCORE' && score === null) throw new ServiceError('validation', 'A SCORE result needs scoreNumeric (or use NO_SCORE).');
  return { score: v.resultType === 'SCORE' ? score : null, time: v.resultType === 'TIME' ? time : null };
}

export async function createResult(a: Actor, raw: ResultInput) {
  req(a); const v = ResultInput.parse(raw);
  await assertEdition(v.editionId); await assertDiscipline(v.disciplineId);
  await assertEligible(v.competitorId, v.editionId);
  await assertSessionInEdition(v.sessionId, v.editionId);
  const { score, time } = normalizeResultValues(v);
  const row = await prisma.competitionResult.create({ data: {
    editionId: v.editionId, disciplineId: v.disciplineId, sessionId: v.sessionId || null, competitorId: v.competitorId,
    resultType: v.resultType as CompetitionResultType, scoreNumeric: score, timeSeconds: time,
    placement: v.placement ?? null, isTie: v.isTie ?? false,
    sourceRef: v.sourceRef || null, sourceUrl: v.sourceUrl || null, notes: v.notes || null, createdById: a.id,
  } });
  await audit(a.id, 'competition.result.create', 'competition_result', row.id);
  return { id: row.id };
}
export async function updateResult(a: Actor, id: string, raw: Omit<ResultInput, 'editionId'>, expectedVersion: number): Promise<{ version: number }> {
  req(a); const ev = requireVersion(expectedVersion);
  const existing = await prisma.competitionResult.findUnique({ where: { id }, select: { editionId: true } });
  if (!existing) throw new ServiceError('not_found', 'Result not found');
  const v = ResultInput.parse({ ...raw, editionId: existing.editionId });
  await assertDiscipline(v.disciplineId); await assertEligible(v.competitorId, existing.editionId);
  await assertSessionInEdition(v.sessionId, existing.editionId);
  const { score, time } = normalizeResultValues(v);
  // Optimistic concurrency (Batch 17 §A) — atomic version-guarded update; never
  // silently overwrite a concurrent editor's change (results are authoritative).
  const where = { id, version: ev };
  const upd = await prisma.competitionResult.updateMany({ where, data: {
    disciplineId: v.disciplineId, sessionId: v.sessionId || null, competitorId: v.competitorId,
    resultType: v.resultType as CompetitionResultType, scoreNumeric: score, timeSeconds: time,
    placement: v.placement ?? null, isTie: v.isTie ?? false, sourceRef: v.sourceRef || null, sourceUrl: v.sourceUrl || null, notes: v.notes || null,
    version: { increment: 1 },
  } });
  if (upd.count === 0) throw new ServiceError('conflict', 'This result was changed by someone else. Reload the latest data and reapply your edits.');
  const after = await prisma.competitionResult.findUniqueOrThrow({ where: { id }, select: { version: true } });
  await audit(a.id, 'competition.result.update', 'competition_result', id);
  return { version: after.version };
}
/** Record an explicit correction: a new result linked to the original (original archived). */
export async function correctResult(a: Actor, originalId: string, raw: Omit<ResultInput, 'editionId'>) {
  req(a); const original = await prisma.competitionResult.findUnique({ where: { id: originalId }, select: { editionId: true } });
  if (!original) throw new ServiceError('not_found', 'Original result not found');
  const created = await createResult(a, { ...raw, editionId: original.editionId } as ResultInput);
  await prisma.competitionResult.update({ where: { id: created.id }, data: { correctionOfId: originalId } });
  await prisma.competitionResult.update({ where: { id: originalId }, data: { coverageStatus: 'ARCHIVED' } });
  await audit(a.id, 'competition.result.correct', 'competition_result', created.id, `corrects ${originalId}`);
  return created;
}
export async function deleteResult(a: Actor, id: string) {
  req(a);
  await prisma.competitionResult.updateMany({ where: { correctionOfId: id }, data: { correctionOfId: null } });
  await prisma.competitionResult.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Result not found'); });
  await audit(a.id, 'competition.result.delete', 'competition_result', id);
}

// ======================= STANDINGS (CompetitionStanding) =======================
const StandingInput = z.object({
  editionId: z.string().min(1),
  disciplineId: z.string().optional().nullable(),
  competitorId: z.string().min(1),
  category: z.enum(['ROUND', 'AGGREGATE', 'CHAMPIONSHIP', 'SEASON']),
  rankPosition: z.number().int().min(1).max(99999).optional().nullable(),
  aggregateValue: dec, earnings: dec, points: dec,
  sourceRef: z.string().max(300).optional().nullable(),
  sourceUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
});
export type StandingInput = z.input<typeof StandingInput>;

export async function createStanding(a: Actor, raw: StandingInput) {
  req(a); const v = StandingInput.parse(raw);
  await assertEdition(v.editionId); await assertDiscipline(v.disciplineId); await assertEligible(v.competitorId, v.editionId);
  const row = await prisma.competitionStanding.create({ data: {
    editionId: v.editionId, disciplineId: v.disciplineId || null, competitorId: v.competitorId, category: v.category as StandingCategory,
    rankPosition: v.rankPosition ?? null, aggregateValue: toDecimal(v.aggregateValue), earnings: toDecimal(v.earnings), points: toDecimal(v.points),
    sourceRef: v.sourceRef || null, sourceUrl: v.sourceUrl || null, lastUpdatedAt: new Date(), createdById: a.id,
  } });
  await audit(a.id, 'competition.standing.create', 'competition_standing', row.id);
  return { id: row.id };
}
export async function updateStanding(a: Actor, id: string, raw: Omit<StandingInput, 'editionId'>, expectedVersion: number): Promise<{ version: number }> {
  req(a); const ev = requireVersion(expectedVersion);
  const existing = await prisma.competitionStanding.findUnique({ where: { id }, select: { editionId: true } });
  if (!existing) throw new ServiceError('not_found', 'Standing not found');
  const v = StandingInput.parse({ ...raw, editionId: existing.editionId });
  await assertDiscipline(v.disciplineId); await assertEligible(v.competitorId, existing.editionId);
  // Optimistic concurrency (Batch 17 §A) — atomic version-guarded update.
  const where = { id, version: ev };
  const upd = await prisma.competitionStanding.updateMany({ where, data: {
    disciplineId: v.disciplineId || null, competitorId: v.competitorId, category: v.category as StandingCategory,
    rankPosition: v.rankPosition ?? null, aggregateValue: toDecimal(v.aggregateValue), earnings: toDecimal(v.earnings), points: toDecimal(v.points),
    sourceRef: v.sourceRef || null, sourceUrl: v.sourceUrl || null, lastUpdatedAt: new Date(),
    version: { increment: 1 },
  } });
  if (upd.count === 0) throw new ServiceError('conflict', 'This standing was changed by someone else. Reload the latest data and reapply your edits.');
  const after = await prisma.competitionStanding.findUniqueOrThrow({ where: { id }, select: { version: true } });
  await audit(a.id, 'competition.standing.update', 'competition_standing', id);
  return { version: after.version };
}
export async function deleteStanding(a: Actor, id: string) {
  req(a);
  await prisma.competitionStanding.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Standing not found'); });
  await audit(a.id, 'competition.standing.delete', 'competition_standing', id);
}

// ======================= verification + publication (shared) =======================
type CoverageKind = 'session' | 'result' | 'standing';
const model = (k: CoverageKind) => (k === 'session' ? prisma.competitionSession : k === 'result' ? prisma.competitionResult : prisma.competitionStanding) as { findUnique: Function; update: Function };

export async function setVerification(a: Actor, kind: CoverageKind, id: string, verification: CoverageVerification, source?: { sourceRef?: string; sourceUrl?: string }) {
  req(a); const m = model(kind);
  const row = await m.findUnique({ where: { id }, select: { id: true, coverageStatus: true } });
  if (!row) throw new ServiceError('not_found', `${kind} not found`);
  const data: Record<string, unknown> = { verification, verifiedById: verification === 'VERIFIED' ? a.id : null, verifiedAt: verification === 'VERIFIED' ? new Date() : null };
  if (source?.sourceRef !== undefined) data.sourceRef = source.sourceRef || null;
  if (source?.sourceUrl !== undefined) data.sourceUrl = source.sourceUrl || null;
  // Un-verifying or flagging a correction must also pull a published record back to APPROVED.
  if (verification !== 'VERIFIED' && row.coverageStatus === 'PUBLISHED') data.coverageStatus = 'APPROVED';
  await m.update({ where: { id }, data });
  await audit(a.id, `competition.${kind}.verify`, `competition_${kind}`, id, verification);
}

export async function setCoverageStatus(a: Actor, kind: CoverageKind, id: string, status: CoverageStatus) {
  req(a); const m = model(kind);
  const row = await m.findUnique({ where: { id }, select: { id: true, verification: true } });
  if (!row) throw new ServiceError('not_found', `${kind} not found`);
  if (status === 'PUBLISHED' && !canPublish(row.verification)) throw new ServiceError('validation', 'Cannot publish: the record must be VERIFIED first (no draft/unverified coverage goes public).');
  const data: Record<string, unknown> = { coverageStatus: status };
  if (kind === 'result') data.publishedAt = status === 'PUBLISHED' ? new Date() : null;
  await m.update({ where: { id }, data });
  await audit(a.id, `competition.${kind}.status`, `competition_${kind}`, id, status);
}

// ======================= ADMIN reads (with optional filters) =======================
export interface CoverageFilters { disciplineId?: string; competitorId?: string; coverageStatus?: CoverageStatus; verification?: CoverageVerification; category?: StandingCategory }
const f = (flt?: CoverageFilters) => ({
  ...(flt?.disciplineId ? { disciplineId: flt.disciplineId } : {}),
  ...(flt?.competitorId ? { competitorId: flt.competitorId } : {}),
  ...(flt?.coverageStatus ? { coverageStatus: flt.coverageStatus } : {}),
  ...(flt?.verification ? { verification: flt.verification } : {}),
});

export async function listSessionsAdmin(a: Actor, editionId: string, flt?: CoverageFilters) {
  req(a);
  const rows = await prisma.competitionSession.findMany({ where: { editionId, ...f(flt) }, orderBy: [{ sortOrder: 'asc' }, { startAt: 'asc' }], include: { discipline: { select: { name: true } }, venue: { select: { name: true } } } });
  return rows.map((s) => ({ id: s.id, title: s.title, sessionType: s.sessionType, disciplineId: s.disciplineId, date: s.date?.toISOString() ?? null, startAt: s.startAt?.toISOString() ?? null, endAt: s.endAt?.toISOString() ?? null, timezone: s.timezone, roundNumber: s.roundNumber, status: s.status, coverageStatus: s.coverageStatus, verification: s.verification, discipline: s.discipline?.name ?? null, venue: s.venue?.name ?? null, sortOrder: s.sortOrder, sourceRef: s.sourceRef, sourceUrl: s.sourceUrl, notes: s.notes, version: s.version }));
}
export async function listResultsAdmin(a: Actor, editionId: string, flt?: CoverageFilters) {
  req(a);
  const rows = await prisma.competitionResult.findMany({ where: { editionId, ...f(flt) }, orderBy: [{ disciplineId: 'asc' }, { placement: 'asc' }], include: { discipline: { select: { name: true } }, competitor: { select: { fullName: true } } } });
  return rows.map((r) => ({ id: r.id, disciplineId: r.disciplineId, discipline: r.discipline.name, competitorId: r.competitorId, competitor: r.competitor.fullName, resultType: r.resultType, scoreNumeric: decStr(r.scoreNumeric), timeSeconds: decStr(r.timeSeconds), placement: r.placement, isTie: r.isTie, coverageStatus: r.coverageStatus, verification: r.verification, correctionOfId: r.correctionOfId, sourceRef: r.sourceRef, sourceUrl: r.sourceUrl, notes: r.notes, version: r.version }));
}
export async function listStandingsAdmin(a: Actor, editionId: string, flt?: CoverageFilters) {
  req(a);
  const rows = await prisma.competitionStanding.findMany({ where: { editionId, ...f(flt), ...(flt?.category ? { category: flt.category } : {}) }, orderBy: [{ category: 'asc' }, { rankPosition: 'asc' }], include: { discipline: { select: { name: true } }, competitor: { select: { fullName: true } } } });
  return rows.map((s) => ({ id: s.id, category: s.category, disciplineId: s.disciplineId, discipline: s.discipline?.name ?? null, competitorId: s.competitorId, competitor: s.competitor.fullName, rankPosition: s.rankPosition, aggregateValue: decStr(s.aggregateValue), earnings: decStr(s.earnings), points: decStr(s.points), coverageStatus: s.coverageStatus, verification: s.verification, sourceRef: s.sourceRef, sourceUrl: s.sourceUrl, version: s.version }));
}

// ======================= PUBLIC reads (PUBLISHED + VERIFIED only) =======================
const PUB = { coverageStatus: 'PUBLISHED' as const, verification: 'VERIFIED' as const };

export async function getPublicSchedule(editionId: string) {
  const rows = await prisma.competitionSession.findMany({ where: { editionId, ...PUB, status: { not: 'CANCELLED' } }, orderBy: [{ sortOrder: 'asc' }, { startAt: 'asc' }], include: { discipline: { select: { name: true, slug: true } }, venue: { select: { name: true } } } });
  return rows.map((s) => ({ id: s.id, title: s.title, sessionType: s.sessionType, date: s.date?.toISOString() ?? null, startAt: s.startAt?.toISOString() ?? null, endAt: s.endAt?.toISOString() ?? null, timezone: s.timezone, roundNumber: s.roundNumber, status: s.status, discipline: s.discipline?.name ?? null, disciplineSlug: s.discipline?.slug ?? null, venue: s.venue?.name ?? null, updatedAt: s.updatedAt.toISOString() }));
}
export async function getPublicResults(editionId: string) {
  const rows = await prisma.competitionResult.findMany({ where: { editionId, ...PUB }, orderBy: [{ disciplineId: 'asc' }, { placement: 'asc' }], include: { discipline: { select: { name: true, slug: true } }, competitor: { select: { fullName: true, slug: true } } } });
  return rows.map((r) => ({ id: r.id, discipline: r.discipline.name, disciplineSlug: r.discipline.slug, competitor: r.competitor.fullName, competitorSlug: r.competitor.slug, resultType: r.resultType, scoreNumeric: decStr(r.scoreNumeric), timeSeconds: decStr(r.timeSeconds), placement: r.placement, isTie: r.isTie, sourceUrl: r.sourceUrl, isCorrection: !!r.correctionOfId, updatedAt: r.updatedAt.toISOString() }));
}
export async function getPublicStandings(editionId: string) {
  const rows = await prisma.competitionStanding.findMany({ where: { editionId, ...PUB }, orderBy: [{ category: 'asc' }, { rankPosition: 'asc' }], include: { discipline: { select: { name: true, slug: true } }, competitor: { select: { fullName: true, slug: true } } } });
  return rows.map((s) => ({ id: s.id, category: s.category, discipline: s.discipline?.name ?? null, disciplineSlug: s.discipline?.slug ?? null, competitor: s.competitor.fullName, competitorSlug: s.competitor.slug, rankPosition: s.rankPosition, aggregateValue: decStr(s.aggregateValue), earnings: decStr(s.earnings), points: decStr(s.points), sourceUrl: s.sourceUrl, lastUpdatedAt: s.lastUpdatedAt.toISOString() }));
}
/** Does an edition have ANY published+verified coverage (for landing/sitemap gating)? */
export async function editionCoverageSummary(editionId: string) {
  const [sessions, results, standings] = await Promise.all([
    prisma.competitionSession.count({ where: { editionId, ...PUB } }),
    prisma.competitionResult.count({ where: { editionId, ...PUB } }),
    prisma.competitionStanding.count({ where: { editionId, ...PUB } }),
  ]);
  return { sessions, results, standings, hasAny: sessions + results + standings > 0 };
}

/** Editions with ANY published+verified coverage, with per-section flags, for the sitemap. */
export async function listPublicCoverageEditions(): Promise<{ eventSlug: string; editionSlug: string; schedule: boolean; results: boolean; standings: boolean }[]> {
  const editionIds = new Set<string>();
  const [s, r, st] = await Promise.all([
    prisma.competitionSession.findMany({ where: PUB, select: { editionId: true }, distinct: ['editionId'] }),
    prisma.competitionResult.findMany({ where: PUB, select: { editionId: true }, distinct: ['editionId'] }),
    prisma.competitionStanding.findMany({ where: PUB, select: { editionId: true }, distinct: ['editionId'] }),
  ]);
  const sch = new Set(s.map((x) => x.editionId)); const res = new Set(r.map((x) => x.editionId)); const stn = new Set(st.map((x) => x.editionId));
  for (const id of [...sch, ...res, ...stn]) editionIds.add(id);
  if (editionIds.size === 0) return [];
  const eds = await prisma.rodeoEventEdition.findMany({ where: { id: { in: [...editionIds] } }, select: { id: true, editionSlug: true, event: { select: { slug: true } } } });
  return eds.map((e) => ({ eventSlug: e.event.slug, editionSlug: e.editionSlug, schedule: sch.has(e.id), results: res.has(e.id), standings: stn.has(e.id) }));
}

export async function listEligibleCompetitors(a: Actor, editionId: string) {
  req(a);
  const rows = await prisma.competitorParticipation.findMany({ where: { editionId }, include: { competitor: { select: { id: true, fullName: true } } } });
  return rows.map((p) => ({ id: p.competitor.id, fullName: p.competitor.fullName }));
}
export async function listDisciplinesForSelect() {
  return prisma.discipline.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } });
}

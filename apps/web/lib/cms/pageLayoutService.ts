import 'server-only';
import { Prisma, type PageLayout, type PageLayoutRevision } from '@prisma/client';
import { prisma } from '../db';
import { roleHasPermission } from '../auth/rbac';
import type { Actor } from './guard';
import { audit } from './guard';
import { ServiceError } from './articleService';
import { log, report } from '../logger';
import { z } from 'zod';
import { type SectionSlot, type PropDef, getPageFamily, buildDefaultSlots, getSectionsForFamily, KNOWN_PAGE_KEYS, ensureSlotIds, getAvailableBlockTypes, getKnownSectionTypes, resolveMaxInstances } from './sectionRegistry';

const need = (a: Actor) => {
  if (!roleHasPermission(a.roles, 'system.config'))
    throw new ServiceError('forbidden', 'Not permitted (system.config).');
};

const SectionSlotSchema = z.object({
  id: z.string().min(1),
  sectionType: z.string().min(1),
  visible: z.boolean(),
  order: z.number().int().min(0),
  props: z.record(z.string(), z.unknown()),
});

/**
 * OPTIMISTIC CONCURRENCY TOKEN (Stage 08 Task B, KD-09).
 *
 * `expectedVersion` is the `PageLayout.version` the editor actually loaded.
 * It is a REQUIRED field, and the only way to skip the check is to spell the
 * opt-out — `'unchecked'`. That shape is deliberate:
 *
 *   - a caller cannot FORGET the token, because TypeScript and Zod both demand
 *     the field. Making it `expectedVersion?: number` would have let any future
 *     action silently reopen KD-09, which is exactly how the hole was created;
 *   - the opt-out is visible in review and in a diff. It exists for callers
 *     that genuinely have no loaded editor state to be stale relative to:
 *     service-level tests, maintenance scripts, and server-side automation.
 *
 * The interactive path — `saveDraftAction` — requires a real number; its
 * signature has no opt-out, so the Builder always sends a token.
 */
export type ExpectedVersion = number | 'unchecked';

const UpdateDraftSchema = z.object({
  pageKey: z.string().min(1).max(120),
  sections: z.array(SectionSlotSchema).max(50),
  expectedVersion: z.union([z.number().int().min(0), z.literal('unchecked')]),
});

/**
 * Details attached to a `conflict` ServiceError, so the Admin can explain what
 * happened rather than just refusing (Task B requirement 3).
 */
export interface SaveConflictDetails {
  pageKey: string;
  /** What the editor thought it was editing. */
  expectedVersion: number;
  /** What is actually stored now. */
  currentVersion: number;
  /** Who stored it, when resolvable. */
  lastEditedBy: string | null;
  lastEditedAt: string | null;
}

/* ── Property validation (Stage 04 Task C) ──────────────────────────
 * Previously every check was gated on `typeof val === 'string'`, so numbers,
 * booleans and arrays passed unvalidated; `select` options were never checked;
 * declared `min`/`max` were never enforced server-side; and arbitrary
 * undeclared keys were persisted. Validation now derives from the block's own
 * `PropDef` list, so the contract the Builder advertises is the contract the
 * server enforces.
 *
 * Undeclared legacy keys are reported as WARNINGS, not rejections: stored
 * layouts may carry keys from earlier iterations, and rejecting them would make
 * a save fail on a page the admin never touched. Nothing stored is deleted.
 */

/** A URL value must be a same-site path or an http(s) URL. */
const SAFE_URL = /^(\/[^\s]*|https?:\/\/[^\s]+)$/;
/** Schemes that must never survive into an href or src. */
const UNSAFE_SCHEME = /^\s*(javascript|data|vbscript|file|blob):/i;
/** Markup that must never be stored in a text property. */
const UNSAFE_MARKUP = /<\s*(script|iframe|object|embed|style|link|meta|base|svg)\b|<[^>]+\son[a-z]+\s*=|srcdoc\s*=/i;

const MAX_PROP_CHARS = 2000;

export interface PropWarning { sectionType: string; key: string; reason: string }

function validateOneProp(def: PropDef, key: string, val: unknown, sectionType: string): void {
  const fail = (msg: string): never => {
    throw new ServiceError('validation', `Block "${sectionType}" property "${key}": ${msg}`);
  };

  if (val === undefined || val === null) return; // absent is always allowed; defaults apply

  switch (def.type) {
    case 'number': {
      const n = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(n)) fail('must be a number.');
      if (!Number.isInteger(n)) fail('must be a whole number.');
      const min = def.min ?? 0;
      if (n < min) fail(`must be at least ${min}.`);
      if (def.max !== undefined && n > def.max) fail(`must be at most ${def.max}.`);
      return;
    }
    case 'boolean': {
      if (typeof val !== 'boolean') fail('must be true or false.');
      return;
    }
    case 'select': {
      if (typeof val !== 'string') fail('must be a string.');
      const allowed = (def.options ?? []).map((o) => o.value);
      if (allowed.length > 0 && !allowed.includes(val as string)) {
        fail(`must be one of: ${allowed.join(', ')}.`);
      }
      return;
    }
    case 'featured': {
      // Stored as a comma-joined id list by the editor, or an array by the API.
      const ids = Array.isArray(val) ? val : typeof val === 'string' ? val.split(',').filter(Boolean) : fail('must be a list of ids.');
      if ((ids as unknown[]).length > 50) fail('may not reference more than 50 items.');
      for (const id of ids as unknown[]) {
        if (typeof id !== 'string' || id.length > 200) fail('contains an invalid id.');
      }
      return;
    }
    case 'url':
    case 'image': {
      if (typeof val !== 'string') fail('must be a string.');
      const s = val as string;
      if (s.length > MAX_PROP_CHARS) fail(`exceeds ${MAX_PROP_CHARS} characters.`);
      if (s.length === 0) return;
      if (UNSAFE_SCHEME.test(s)) fail('uses a disallowed URL scheme.');
      if (!SAFE_URL.test(s)) fail('must be a relative path or an http(s) URL.');
      return;
    }
    case 'color': {
      if (typeof val !== 'string') fail('must be a string.');
      if ((val as string).length > 0 && !/^#[0-9a-f]{3,8}$/i.test(val as string)) fail('must be a hex colour.');
      return;
    }
    default: {
      // text / textarea / richtext
      if (typeof val !== 'string') fail('must be a string.');
      const s = val as string;
      if (s.length > MAX_PROP_CHARS) fail(`exceeds ${MAX_PROP_CHARS} characters.`);
      if (UNSAFE_MARKUP.test(s)) fail('contains disallowed markup.');
      if (UNSAFE_SCHEME.test(s)) fail('contains a disallowed URL scheme.');
      return;
    }
  }
}

/**
 * Validates section types and every property against its declared definition.
 * Returns warnings for undeclared keys rather than rejecting them.
 */
function validateSectionTypes(pageKey: string, slots: SectionSlot[]): PropWarning[] {
  const family = getPageFamily(pageKey);
  // Known types include RETIRED ones, so a layout stored before a block was
  // retired stays saveable. The block library (getAvailableBlockTypes) excludes
  // them, so a retired block can never be added to a new layout. Stage 05 D-11.
  const known = getKnownSectionTypes(family);
  const warnings: PropWarning[] = [];

  for (const s of slots) {
    if (!known.has(s.sectionType)) {
      throw new ServiceError('validation', `Section type "${s.sectionType}" is not allowed for page family "${family}".`);
    }
    if (known.get(s.sectionType)?.retired) {
      warnings.push({ sectionType: s.sectionType, key: '(block)', reason: 'retired block retained from a previously stored layout; it renders nothing and cannot be re-added' });
    }
    const blockDef = known.get(s.sectionType);
    const propDefs = new Map((blockDef?.editableProps ?? []).map((p) => [p.key, p]));

    for (const [key, val] of Object.entries(s.props)) {
      const def = propDefs.get(key);
      if (!def) {
        // Legacy or undeclared key: warn, keep, never silently drop.
        warnings.push({ sectionType: s.sectionType, key, reason: 'not declared in the block registry' });
        // Still apply baseline safety to undeclared string values.
        if (typeof val === 'string') {
          if (val.length > MAX_PROP_CHARS) {
            throw new ServiceError('validation', `Block "${s.sectionType}" property "${key}": exceeds ${MAX_PROP_CHARS} characters.`);
          }
          if (UNSAFE_MARKUP.test(val) || UNSAFE_SCHEME.test(val)) {
            throw new ServiceError('validation', `Block "${s.sectionType}" property "${key}": contains disallowed content.`);
          }
        }
        continue;
      }
      validateOneProp(def, key, val, s.sectionType);
    }
  }
  return warnings;
}

function validateBlockLimits(pageKey: string, slots: SectionSlot[]): void {
  const family = getPageFamily(pageKey);
  const available = getAvailableBlockTypes(family);
  const defMap = new Map(available.map((d) => [d.type, d]));
  const counts = new Map<string, number>();
  for (const s of slots) {
    counts.set(s.sectionType, (counts.get(s.sectionType) ?? 0) + 1);
  }
  for (const [type, count] of counts) {
    const def = defMap.get(type);
    if (!def) continue;
    // Family-aware (Stage 04 Task B): a shared block may carry a stricter cap
    // on this family than its default, and that cap is now the enforced one.
    const max = resolveMaxInstances(def, family);
    if (max !== undefined && count > max) {
      throw new ServiceError('validation', `Block "${type}" exceeds max instances (${max}) on ${family} pages.`);
    }
  }
}

function validateUniqueIds(slots: SectionSlot[]): void {
  const ids = new Set<string>();
  for (const s of slots) {
    if (ids.has(s.id)) throw new ServiceError('validation', `Duplicate block ID "${s.id}".`);
    ids.add(s.id);
  }
}

export async function getPageLayout(pageKey: string): Promise<PageLayout | null> {
  return prisma.pageLayout.findUnique({ where: { pageKey } });
}

/**
 * Why a section list came back as it did. Both outcomes below return slots, so
 * a caller that only reads the array cannot tell a configured layout from a
 * database outage — previously these were indistinguishable and unlogged, so a
 * DB fault silently presented as "the layout was reset to defaults".
 */
export type SectionSource =
  /** Stored sections were found and returned. */
  | 'stored'
  /** No PageLayout row exists for this key; family defaults returned. */
  | 'default-no-layout'
  /** A row exists but its section array is absent or empty; defaults returned. */
  | 'default-empty'
  /** The query threw. Defaults returned so the public page still renders. */
  | 'default-db-error';

export interface ResolvedSections {
  slots: SectionSlot[];
  source: SectionSource;
}

async function resolveSections(pageKey: string, column: 'publishedSections' | 'draftSections'): Promise<ResolvedSections> {
  try {
    const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
    if (!layout) return { slots: buildDefaultSlots(getPageFamily(pageKey)), source: 'default-no-layout' };
    const sections = layout[column] as unknown as SectionSlot[];
    if (!Array.isArray(sections) || sections.length === 0) {
      return { slots: buildDefaultSlots(getPageFamily(pageKey)), source: 'default-empty' };
    }
    return { slots: ensureSlotIds(sections), source: 'stored' };
  } catch (err) {
    // Observability fix (Stage 03 Task G): the fallback is retained so a public
    // page still renders during an outage, but the failure is no longer silent.
    log.error('page layout query failed; serving family defaults', { pageKey, column, error: String(err) });
    report('database', err, { fields: { pageKey, column } });
    return { slots: buildDefaultSlots(getPageFamily(pageKey)), source: 'default-db-error' };
  }
}

/** Diagnostic variant: same resolution, but reports which case occurred. */
export async function getPublishedSectionsResolved(pageKey: string): Promise<ResolvedSections> {
  return resolveSections(pageKey, 'publishedSections');
}

/** Diagnostic variant: same resolution, but reports which case occurred. */
export async function getDraftSectionsResolved(pageKey: string): Promise<ResolvedSections> {
  return resolveSections(pageKey, 'draftSections');
}

export async function getPublishedSections(pageKey: string): Promise<SectionSlot[]> {
  return (await resolveSections(pageKey, 'publishedSections')).slots;
}

export async function getDraftSections(pageKey: string): Promise<SectionSlot[]> {
  return (await resolveSections(pageKey, 'draftSections')).slots;
}

export async function listPageLayouts(): Promise<PageLayout[]> {
  try {
    return await prisma.pageLayout.findMany({ orderBy: { pageKey: 'asc' } });
  } catch {
    return [];
  }
}

function validatePageKey(pageKey: string): void {
  const knownSet = new Set<string>(KNOWN_PAGE_KEYS);
  if (!knownSet.has(pageKey)) {
    throw new ServiceError('validation', `Unknown page key "${pageKey}".`);
  }
}

/**
 * One message for every stale-save case, so the Admin never has to guess which
 * wording it got. The actionable part is in `details`.
 */
const CONFLICT_MESSAGE =
  'This page was changed by someone else since you opened it. Your edits have NOT been saved. ' +
  'Reload to see the current version, then re-apply your changes.';

/** Resolve who last touched a layout, for the conflict message. */
async function buildConflictDetails(
  pageKey: string,
  expectedVersion: number,
  current: PageLayout | null,
): Promise<SaveConflictDetails> {
  return {
    pageKey,
    expectedVersion,
    currentVersion: current?.version ?? 0,
    lastEditedBy: current?.updatedById ? await resolveActorName(current.updatedById) : null,
    lastEditedAt: current?.updatedAt?.toISOString() ?? null,
  };
}

export async function saveDraft(
  actor: Actor,
  input: { pageKey: string; sections: SectionSlot[]; expectedVersion: ExpectedVersion },
): Promise<PageLayout> {
  need(actor);
  const data = UpdateDraftSchema.parse(input);
  validatePageKey(data.pageKey);
  const warnings = validateSectionTypes(data.pageKey, data.sections);
  validateBlockLimits(data.pageKey, data.sections);
  validateUniqueIds(data.sections);

  // Undeclared legacy keys are kept, not dropped — but they are surfaced so the
  // drift is visible rather than accumulating silently (Stage 04 Task C).
  if (warnings.length > 0) {
    log.warn('page layout draft contains undeclared property keys', {
      pageKey: data.pageKey,
      keys: warnings.map((w) => `${w.sectionType}.${w.key}`),
    });
  }

  const sections = JSON.parse(JSON.stringify(data.sections));
  const existing = await prisma.pageLayout.findUnique({ where: { pageKey: data.pageKey } });

  /**
   * No stored row yet: there is no version to be stale against, so create.
   *
   * `create` is used rather than `upsert` so that a row appearing between the
   * read above and this write raises a unique violation instead of silently
   * overwriting the draft the other editor just created. That is the same
   * protection the version check gives for an existing row, applied to the
   * one case where no version exists yet.
   */
  if (!existing) {
    try {
      const created = await prisma.pageLayout.create({
        data: {
          pageKey: data.pageKey,
          draftSections: sections,
          updatedById: actor.id,
        },
      });
      await audit(actor.id, 'page_layout.draft_save', 'PageLayout', created.id, JSON.stringify({ pageKey: data.pageKey, version: created.version }));
      return created;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const now = await prisma.pageLayout.findUnique({ where: { pageKey: data.pageKey } });
      throw new ServiceError('conflict', CONFLICT_MESSAGE, await buildConflictDetails(data.pageKey, 0, now));
    }
  }

  /**
   * Existing row: a CONDITIONAL update (Stage 08 Task B, KD-09).
   *
   * `updateMany` with `version` in the WHERE clause is the whole mechanism. The
   * database decides whether the editor's token still matches, in the same
   * statement that writes — so there is no window between checking and writing.
   * `count === 0` means someone else saved first, and nothing was written.
   *
   * `'unchecked'` skips the guard for callers with no loaded editor state. It
   * still increments the version, so an editor holding the old token is
   * correctly told its view is stale.
   */
  const guard =
    data.expectedVersion === 'unchecked'
      ? { pageKey: data.pageKey }
      : { pageKey: data.pageKey, version: data.expectedVersion };

  const { count } = await prisma.pageLayout.updateMany({
    where: guard,
    data: {
      draftSections: sections,
      updatedById: actor.id,
      version: { increment: 1 },
    },
  });

  if (count === 0) {
    const current = await prisma.pageLayout.findUnique({ where: { pageKey: data.pageKey } });
    const expected = data.expectedVersion === 'unchecked' ? -1 : data.expectedVersion;
    log.warn('draft save rejected as stale', {
      pageKey: data.pageKey,
      expectedVersion: expected,
      currentVersion: current?.version ?? null,
      actorId: actor.id,
    });
    // Audited: a rejected save is a real event an operator will ask about, and
    // silence here is what made the previous last-write-wins behaviour invisible.
    await audit(actor.id, 'page_layout.draft_save_conflict', 'PageLayout', current?.id, JSON.stringify({ pageKey: data.pageKey, expectedVersion: expected, currentVersion: current?.version ?? null }));
    throw new ServiceError('conflict', CONFLICT_MESSAGE, await buildConflictDetails(data.pageKey, expected, current));
  }

  const result = (await prisma.pageLayout.findUnique({ where: { pageKey: data.pageKey } }))!;
  await audit(actor.id, 'page_layout.draft_save', 'PageLayout', result.id, JSON.stringify({ pageKey: data.pageKey, version: result.version }));
  return result;
}

export async function publishLayout(actor: Actor, pageKey: string): Promise<PageLayout> {
  need(actor);
  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  if (!layout) throw new ServiceError('not_found', `No layout found for "${pageKey}".`);

  const sections = JSON.parse(JSON.stringify(layout.draftSections));
  const actorName = await resolveActorName(actor.id);

  /**
   * Stage 08 Task B: both writes in ONE interactive transaction, with the
   * revision number read inside it and the whole thing retried on contention.
   * The previous form awaited `nextRevisionNo` while building the `$transaction`
   * array, so the read happened before the transaction opened — see the comment
   * on `nextRevisionNo`.
   *
   * `version` is incremented here too. Before Stage 08 exactly one of the eight
   * transitions touched it, which made it useless as a concurrency token even
   * where it was read: an editor could publish, and a second editor's stale
   * draft save would still have matched the unchanged version.
   */
  const result = await publishWithRevision(
    pageKey,
    sections,
    { actorId: actor.id, actorName, summary: 'Immediate publish' },
    (tx) =>
      tx.pageLayout.update({
        where: { pageKey },
        data: {
          publishedSections: sections,
          publishedAt: new Date(),
          publishedById: actor.id,
          updatedById: actor.id,
          version: { increment: 1 },
        },
      }),
  );
  if (!result) throw new ServiceError('not_found', `No layout found for "${pageKey}".`);

  await audit(actor.id, 'page_layout.publish', 'PageLayout', result.id, JSON.stringify({ pageKey, version: result.version }));
  return result;
}

export async function resetDraftToPublished(actor: Actor, pageKey: string): Promise<PageLayout> {
  need(actor);
  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  if (!layout) throw new ServiceError('not_found', `No layout found for "${pageKey}".`);

  /**
   * Stage 08 Task B: `version` is incremented, like every other write that
   * changes what the editor should be looking at. Without it, an editor holding
   * a pre-reset token could save over the reset draft and the operator who
   * reset it would see their action silently undone.
   */
  const result = await prisma.pageLayout.update({
    where: { pageKey },
    data: {
      draftSections: JSON.parse(JSON.stringify(layout.publishedSections)),
      updatedById: actor.id,
      version: { increment: 1 },
    },
  });
  await audit(actor.id, 'page_layout.reset_draft', 'PageLayout', result.id, JSON.stringify({ pageKey, version: result.version }));
  return result;
}

export async function restoreDefaults(actor: Actor, pageKey: string): Promise<PageLayout> {
  need(actor);
  const family = getPageFamily(pageKey);
  const defaults = buildDefaultSlots(family);

  const result = await prisma.pageLayout.upsert({
    where: { pageKey },
    create: {
      pageKey,
      draftSections: JSON.parse(JSON.stringify(defaults)),
      updatedById: actor.id,
    },
    update: {
      draftSections: JSON.parse(JSON.stringify(defaults)),
      updatedById: actor.id,
      // Stage 08 Task B: see resetDraftToPublished.
      version: { increment: 1 },
    },
  });
  await audit(actor.id, 'page_layout.restore_defaults', 'PageLayout', result.id, JSON.stringify({ pageKey, version: result.version }));
  return result;
}

/* ── Scheduled Publishing ──────────────────────────────────────── */

export async function schedulePublish(
  actor: Actor,
  pageKey: string,
  scheduledAt: Date,
): Promise<PageLayout> {
  need(actor);
  validatePageKey(pageKey);
  if (scheduledAt.getTime() <= Date.now()) {
    throw new ServiceError('validation', 'Scheduled time must be in the future.');
  }
  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  if (!layout) throw new ServiceError('not_found', `No layout found for "${pageKey}".`);
  const draft = layout.draftSections as unknown as SectionSlot[];
  if (!Array.isArray(draft) || draft.length === 0) {
    throw new ServiceError('validation', 'Cannot schedule an empty draft.');
  }

  const result = await prisma.pageLayout.update({
    where: { pageKey },
    data: {
      scheduledSections: JSON.parse(JSON.stringify(draft)),
      scheduledAt,
      scheduledById: actor.id,
      updatedById: actor.id,
    },
  });
  await audit(actor.id, 'page_layout.schedule', 'PageLayout', result.id, JSON.stringify({ pageKey, scheduledAt: scheduledAt.toISOString() }));
  return result;
}

export async function cancelSchedule(actor: Actor, pageKey: string): Promise<PageLayout> {
  need(actor);
  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  if (!layout) throw new ServiceError('not_found', `No layout found for "${pageKey}".`);
  if (!layout.scheduledAt) throw new ServiceError('validation', 'No schedule exists for this page.');

  const result = await prisma.pageLayout.update({
    where: { pageKey },
    data: {
      /**
       * Stage 09 Task I: `Prisma.DbNull` writes a real SQL NULL.
       *
       * The previous `null as unknown as undefined` was coerced by Prisma to a
       * JSON `null` LITERAL, which leaves the column `IS NULL = false` — so
       * `getDueSchedules` could not exclude it and a cancelled schedule came
       * back as due with nothing to publish. See that function's comment for the
       * measured table.
       */
      scheduledSections: Prisma.DbNull,
      scheduledAt: null,
      scheduledById: null,
      updatedById: actor.id,
    },
  });
  await audit(actor.id, 'page_layout.cancel_schedule', 'PageLayout', result.id, JSON.stringify({ pageKey }));
  return result;
}

/**
 * Layouts whose schedule is due (Stage 09 Task I — S08-5 resolved).
 *
 * THE DIAGNOSIS, AND A CORRECTION TO STAGE 08'S.
 *
 * Stage 08 reported that `scheduledSections: { not: { equals: null } }` "does
 * not exclude a database NULL". **That was wrong.** Measured against the
 * isolated test database, that predicate excludes a true SQL NULL perfectly.
 *
 * The real cause is the WRITE. `cancelSchedule` and `executeScheduledPublish`
 * cleared the column with `null as unknown as undefined`, which Prisma coerces
 * to `JsonNull` — a JSON `null` LITERAL stored in the column, not SQL NULL. The
 * column is then `IS NULL = false`, so a predicate comparing against SQL NULL
 * correctly fails to exclude it, and the row came back as due with nothing to
 * publish. Measured:
 *
 *     write form                        stored      IS NULL   old predicate
 *     null as unknown as undefined      JSON null   false     MATCHED  <- the bug
 *     Prisma.DbNull                     SQL NULL    true      excluded
 *     Prisma.JsonNull                   JSON null   false     MATCHED
 *     [{ … }]                           array       false     matched (correct)
 *
 * Two changes, both needed:
 *
 *   - the writes now use `Prisma.DbNull`, so a cleared schedule is a real SQL
 *     NULL from here on;
 *   - this read uses `Prisma.AnyNull`, which excludes SQL NULL **and** the JSON
 *     `null` literal. That covers rows already written by the old code with no
 *     data migration — which matters, because production has never been
 *     inspected and may hold them.
 *
 * `AnyNull` was chosen on measurement: it excludes both null forms and still
 * matches a real array. `{ not: Prisma.DbNull }` does not exclude the literal,
 * and `NOT: { scheduledSections: Prisma.DbNull }` is not valid syntax here.
 */
export async function getDueSchedules(): Promise<PageLayout[]> {
  return prisma.pageLayout.findMany({
    where: {
      scheduledAt: { lte: new Date() },
      scheduledSections: { not: Prisma.AnyNull },
    },
  });
}

export async function executeScheduledPublish(layout: PageLayout): Promise<PageLayout | null> {
  const scheduled = layout.scheduledSections as unknown as SectionSlot[];
  if (!Array.isArray(scheduled) || scheduled.length === 0) return null;

  const sections = JSON.parse(JSON.stringify(scheduled));
  const actorName = await resolveActorName(layout.scheduledById);

  /**
   * IDEMPOTENCE AND ATOMICITY (Stage 08 Tasks B and G).
   *
   * The guarded `updateMany` is what makes repeated execution safe: it requires
   * `scheduledAt` and `scheduledSections` to still be set, and it clears both.
   * A second runner — a duplicate cron fire, a second replica, a retry after a
   * timeout — matches zero rows and publishes nothing. That claim-by-update is
   * the only lock, and it is sufficient because it is a single statement.
   *
   * What Stage 08 fixed is what came AFTER. The revision `create` was a
   * separate statement outside any transaction, so a crash or a connection
   * failure between the two left content published with no history, and the
   * revision number was read outside a transaction as well. Both writes are now
   * in one interactive transaction: either the schedule is consumed and its
   * revision recorded, or neither happens and the schedule remains due for the
   * next run.
   */
  const result = await publishWithRevision(
    layout.pageKey,
    sections,
    { actorId: layout.scheduledById, actorName, summary: 'Scheduled publish' },
    async (tx) => {
      const { count } = await tx.pageLayout.updateMany({
        where: {
          id: layout.id,
          scheduledAt: { not: null },
          // Stage 09 Task I: `AnyNull` so the claim guard also rejects a
          // schedule cleared by the OLD code, which left a JSON `null` literal
          // rather than SQL NULL. `scheduledAt` already carries the idempotence
          // on its own; this closes the second condition rather than relying on
          // one of the pair.
          scheduledSections: { not: Prisma.AnyNull },
        },
        data: {
          publishedSections: sections,
          publishedAt: new Date(),
          publishedById: layout.scheduledById,
          // Stage 09 Task I: a real SQL NULL, so a consumed schedule is never
          // returned as due again. See `getDueSchedules` for the measured table.
          scheduledSections: Prisma.DbNull,
          scheduledAt: null,
          scheduledById: null,
          version: { increment: 1 },
        },
      });
      // Zero rows: another runner already consumed this schedule. Returning
      // null aborts the transaction without recording a duplicate revision.
      if (count === 0) return null;
      return tx.pageLayout.findUnique({ where: { id: layout.id } });
    },
  );

  if (result) {
    await audit(layout.scheduledById, 'page_layout.scheduled_publish', 'PageLayout', result.id, JSON.stringify({ pageKey: layout.pageKey, version: result.version }));
  }
  return result;
}

/* ── Revision History ─────────────────────────────────────────── */

async function resolveActorName(actorId: string | null | undefined): Promise<string> {
  if (!actorId) return 'System';
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
  return user?.name ?? 'Unknown';
}

/**
 * The next revision number for a page key.
 *
 * KEPT, BUT NO LONGER USED FOR WRITES (Stage 08 Task B, KD-10). Reading the
 * highest revisionNo and then inserting it is a read-modify-write race, and the
 * previous callers made it worse by awaiting this OUTSIDE their transaction:
 *
 *     prisma.$transaction([
 *       prisma.pageLayout.update(...),
 *       prisma.pageLayoutRevision.create({ data: { revisionNo: await nextRevisionNo(pageKey) ... } }),
 *     ])
 *
 * The array argument is fully evaluated before `$transaction` is called, so the
 * read happened before the transaction even opened. Two concurrent publishes
 * both read N and both tried to insert N+1; `@@unique([pageKey, revisionNo])`
 * turned that into a P2002 for one of them, which surfaced to the operator as
 * "Unexpected server error" on a publish that had partly happened.
 *
 * Writes now go through `publishWithRevision`, which reads inside an
 * interactive transaction and retries on the unique violation. This function
 * remains as a read-only accessor for diagnostics and tests.
 */
export async function nextRevisionNo(pageKey: string): Promise<number> {
  const last = await prisma.pageLayoutRevision.findFirst({
    where: { pageKey },
    orderBy: { revisionNo: 'desc' },
    select: { revisionNo: true },
  });
  return (last?.revisionNo ?? 0) + 1;
}

/** Prisma's unique-constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2002';
}

/**
 * How many times a revision insert may lose the race before giving up. Five is
 * far beyond what a 15-key admin site can contend, and it bounds the work so a
 * pathological loop cannot hold a connection open.
 */
const REVISION_RETRY_LIMIT = 5;

/**
 * Publish `sections` and record its revision ATOMICALLY (Stage 08 Task B).
 *
 * Both writes happen inside one interactive transaction, so a published layout
 * can never exist without its revision row — the failure mode
 * `executeScheduledPublish` had, where the `updateMany` and the revision
 * `create` were two separate statements and a crash between them published
 * content with no history.
 *
 * The revision number is read INSIDE the transaction and the whole transaction
 * is retried on a unique violation, so concurrent publishes serialise onto
 * distinct numbers instead of one of them failing.
 *
 * `mutateLayout` receives the transaction client and performs the layout write,
 * so each caller keeps its own update shape (immediate publish vs. the
 * scheduled runner's guarded `updateMany`) while sharing the atomicity.
 * Returning `null` from it aborts without recording a revision.
 */
async function publishWithRevision(
  pageKey: string,
  sections: unknown,
  revision: { actorId: string | null; actorName: string; summary: string },
  mutateLayout: (tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<PageLayout | null>,
): Promise<PageLayout | null> {
  for (let attempt = 1; attempt <= REVISION_RETRY_LIMIT; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const updated = await mutateLayout(tx);
        if (!updated) return null;

        const last = await tx.pageLayoutRevision.findFirst({
          where: { pageKey },
          orderBy: { revisionNo: 'desc' },
          select: { revisionNo: true },
        });
        await tx.pageLayoutRevision.create({
          data: {
            pageKey,
            revisionNo: (last?.revisionNo ?? 0) + 1,
            snapshot: sections as object,
            actorId: revision.actorId,
            actorName: revision.actorName,
            summary: revision.summary,
          },
        });
        return updated;
      });
    } catch (err) {
      if (isUniqueViolation(err) && attempt < REVISION_RETRY_LIMIT) {
        // Another publish claimed this revision number. Re-read and retry;
        // nothing was committed, because the whole transaction rolled back.
        log.warn('revision number contended; retrying', { pageKey, attempt });
        continue;
      }
      throw err;
    }
  }
  throw new ServiceError('conflict', 'Could not allocate a revision number after repeated attempts. Please try again.');
}

/**
 * DEFENCE IN DEPTH (Stage 08 Task A finding S08-3).
 *
 * These two read paths previously took no actor and performed no permission
 * check. They were safe only because every caller happened to be a guarded
 * Server Action — an invariant nothing enforced. Revision snapshots contain
 * unpublished draft content, so an unguarded future caller would be a draft
 * leak. The actor is now required and checked here as well.
 */
export async function listRevisions(
  actor: Actor,
  pageKey: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ revisions: Omit<PageLayoutRevision, 'snapshot'>[]; total: number }> {
  need(actor);
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const [revisions, total] = await Promise.all([
    prisma.pageLayoutRevision.findMany({
      where: { pageKey },
      select: { id: true, pageKey: true, revisionNo: true, actorId: true, actorName: true, summary: true, createdAt: true },
      orderBy: { revisionNo: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.pageLayoutRevision.count({ where: { pageKey } }),
  ]);
  return { revisions: revisions as Omit<PageLayoutRevision, 'snapshot'>[], total };
}

export async function getRevision(actor: Actor, revisionId: string): Promise<PageLayoutRevision | null> {
  need(actor);
  return prisma.pageLayoutRevision.findUnique({ where: { id: revisionId } });
}

export async function restoreRevision(actor: Actor, pageKey: string, revisionId: string): Promise<PageLayout> {
  need(actor);
  validatePageKey(pageKey);

  const revision = await prisma.pageLayoutRevision.findUnique({ where: { id: revisionId } });
  if (!revision) throw new ServiceError('not_found', 'Revision not found.');
  if (revision.pageKey !== pageKey) throw new ServiceError('validation', 'Revision does not belong to this page.');

  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  if (!layout) throw new ServiceError('not_found', `No layout found for "${pageKey}".`);

  /**
   * VALIDATE THE SNAPSHOT BEFORE WRITING IT (Stage 08 Task C).
   *
   * A restore previously wrote `revision.snapshot` straight into
   * `draftSections`, bypassing every check `saveDraft` applies. That is the one
   * write path into a draft with no validation at all, so a snapshot that was
   * malformed — hand-edited JSON, a row from an older shape, a partially
   * written record — became the operator's working draft and then failed
   * confusingly on the next save, pointing at the wrong cause.
   *
   * The restore is refused instead, with the revision number in the message so
   * the operator can pick a different one. The existing draft is left exactly
   * as it was: Task C requires that a failed restore changes nothing.
   */
  const parsed = z.array(SectionSlotSchema).max(50).safeParse(revision.snapshot);
  if (!parsed.success) {
    log.warn('restore refused: malformed revision snapshot', {
      pageKey,
      revisionId,
      revisionNo: revision.revisionNo,
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    throw new ServiceError(
      'validation',
      `Revision #${revision.revisionNo} cannot be restored because its stored snapshot is not a valid layout. ` +
        'Your current draft has not been changed. Please choose a different revision.',
    );
  }

  /**
   * Restore writes the DRAFT only, and increments `version`.
   *
   * Writing only `draftSections` is what keeps a restore off the public site
   * until an authorised publish (Task C). Incrementing the version is new in
   * Stage 08: a restore changes what the editor should be looking at, so an
   * editor holding a pre-restore token must be told its view is stale rather
   * than being allowed to overwrite the restored draft.
   */
  const result = await prisma.pageLayout.update({
    where: { pageKey },
    data: {
      draftSections: parsed.data as unknown as object,
      updatedById: actor.id,
      version: { increment: 1 },
    },
  });

  await audit(actor.id, 'page_layout.restore_revision', 'PageLayout', result.id, JSON.stringify({ pageKey, revisionId, revisionNo: revision.revisionNo, version: result.version }));
  return result;
}

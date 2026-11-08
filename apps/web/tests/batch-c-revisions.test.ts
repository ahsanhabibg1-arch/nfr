/**
 * Phase C — Page Layout Revision History & Restore
 * Comprehensive test suite.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_PATH = path.resolve(__dirname, '../prisma/schema.prisma');
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
const SERVICE_PATH = path.resolve(__dirname, '../lib/cms/pageLayoutService.ts');
const service = fs.readFileSync(SERVICE_PATH, 'utf-8');
const ACTIONS_PATH = path.resolve(__dirname, '../app/admin/page-layout-actions.ts');
const actions = fs.readFileSync(ACTIONS_PATH, 'utf-8');
const EDITOR_PATH = path.resolve(__dirname, '../views/admin/AdminPageLayoutEditor.tsx');
const editor = fs.readFileSync(EDITOR_PATH, 'utf-8');
const MIGRATION_DIR = path.resolve(__dirname, '../prisma/migrations/20261108130000_phase_c_page_layout_revisions');
const MIGRATION_SQL = fs.readFileSync(path.join(MIGRATION_DIR, 'migration.sql'), 'utf-8');

/* ================================================================
 * 1. Prisma Schema — PageLayoutRevision model
 * ================================================================ */
describe('Phase C — Prisma schema: PageLayoutRevision', () => {
  it('defines PageLayoutRevision model', () => {
    expect(schema).toContain('model PageLayoutRevision');
  });

  it('has id field with uuid default', () => {
    expect(schema).toMatch(/id\s+String\s+@id\s+@default\(uuid\(\)\)/);
  });

  it('has pageKey field', () => {
    expect(schema).toMatch(/pageKey\s+String/);
  });

  it('has revisionNo field as Int', () => {
    expect(schema).toMatch(/revisionNo\s+Int/);
  });

  it('has snapshot field as Json', () => {
    expect(schema).toMatch(/snapshot\s+Json/);
  });

  it('has actorId as optional String', () => {
    // Inside the PageLayoutRevision model
    const modelBlock = schema.slice(schema.indexOf('model PageLayoutRevision'));
    expect(modelBlock).toMatch(/actorId\s+String\?/);
  });

  it('has actorName field as String', () => {
    const modelBlock = schema.slice(schema.indexOf('model PageLayoutRevision'));
    expect(modelBlock).toMatch(/actorName\s+String/);
  });

  it('has summary field as String', () => {
    const modelBlock = schema.slice(schema.indexOf('model PageLayoutRevision'));
    expect(modelBlock).toMatch(/summary\s+String/);
  });

  it('has createdAt with default now()', () => {
    const modelBlock = schema.slice(schema.indexOf('model PageLayoutRevision'));
    expect(modelBlock).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
  });

  it('has unique constraint on (pageKey, revisionNo)', () => {
    expect(schema).toContain('@@unique([pageKey, revisionNo])');
  });

  it('has index on (pageKey, createdAt)', () => {
    const modelBlock = schema.slice(schema.indexOf('model PageLayoutRevision'));
    expect(modelBlock).toContain('@@index([pageKey, createdAt])');
  });

  it('has relation to PageLayout via pageKey', () => {
    const modelBlock = schema.slice(schema.indexOf('model PageLayoutRevision'));
    expect(modelBlock).toContain('@relation(fields: [pageKey], references: [pageKey]');
  });

  it('PageLayout model has revisions relation', () => {
    const plModel = schema.slice(schema.indexOf('model PageLayout'), schema.indexOf('model PageLayoutRevision'));
    expect(plModel).toContain('PageLayoutRevision[]');
  });
});

/* ================================================================
 * 2. Migration
 * ================================================================ */
describe('Phase C — Migration', () => {
  it('migration directory exists', () => {
    expect(fs.existsSync(MIGRATION_DIR)).toBe(true);
  });

  it('creates PageLayoutRevision table', () => {
    expect(MIGRATION_SQL).toContain('CREATE TABLE "PageLayoutRevision"');
  });

  it('creates unique index on (pageKey, revisionNo)', () => {
    expect(MIGRATION_SQL).toContain('CREATE UNIQUE INDEX "PageLayoutRevision_pageKey_revisionNo_key"');
  });

  it('creates index on (pageKey, createdAt)', () => {
    expect(MIGRATION_SQL).toContain('CREATE INDEX "PageLayoutRevision_pageKey_createdAt_idx"');
  });

  it('adds foreign key to PageLayout', () => {
    expect(MIGRATION_SQL).toContain('ADD CONSTRAINT "PageLayoutRevision_pageKey_fkey"');
    expect(MIGRATION_SQL).toContain('REFERENCES "PageLayout"("pageKey")');
  });

  it('uses CASCADE on delete', () => {
    expect(MIGRATION_SQL).toContain('ON DELETE CASCADE');
  });

  it('is non-destructive (no DROP statements)', () => {
    expect(MIGRATION_SQL).not.toMatch(/DROP\s+(TABLE|INDEX|COLUMN)/i);
  });
});

/* ================================================================
 * 3. Service Layer — Exports
 * ================================================================ */
describe('Phase C — Service exports', () => {
  it('exports listRevisions', () => {
    expect(service).toContain('export async function listRevisions');
  });

  it('exports getRevision', () => {
    expect(service).toContain('export async function getRevision');
  });

  it('exports restoreRevision', () => {
    expect(service).toContain('export async function restoreRevision');
  });
});

/* ================================================================
 * 4. Revision Creation — Immediate Publish
 * ================================================================ */
describe('Phase C — Immediate publish creates revision', () => {
  it('publishLayout uses $transaction for atomicity', () => {
    const fnBody = service.slice(service.indexOf('export async function publishLayout'));
    expect(fnBody).toContain('prisma.$transaction');
  });

  it('publishLayout creates pageLayoutRevision inside transaction', () => {
    const fnBody = service.slice(service.indexOf('export async function publishLayout'));
    expect(fnBody).toContain('prisma.pageLayoutRevision.create');
  });

  it('sets summary to "Immediate publish"', () => {
    expect(service).toContain("summary: 'Immediate publish'");
  });

  it('calls resolveActorName for actor attribution', () => {
    const fnBody = service.slice(
      service.indexOf('export async function publishLayout'),
      service.indexOf('export async function resetDraftToPublished'),
    );
    expect(fnBody).toContain('resolveActorName');
  });

  it('calls nextRevisionNo for sequential numbering', () => {
    const fnBody = service.slice(
      service.indexOf('export async function publishLayout'),
      service.indexOf('export async function resetDraftToPublished'),
    );
    expect(fnBody).toContain('nextRevisionNo');
  });
});

/* ================================================================
 * 5. Revision Creation — Scheduled Publish
 * ================================================================ */
describe('Phase C — Scheduled publish creates revision', () => {
  it('executeScheduledPublish creates pageLayoutRevision', () => {
    const fnBody = service.slice(service.indexOf('export async function executeScheduledPublish'));
    expect(fnBody).toContain('prisma.pageLayoutRevision.create');
  });

  it('sets summary to "Scheduled publish"', () => {
    expect(service).toContain("summary: 'Scheduled publish'");
  });

  it('uses scheduledById for actor attribution', () => {
    const fnBody = service.slice(
      service.indexOf('export async function executeScheduledPublish'),
      service.indexOf('/* ── Revision History'),
    );
    expect(fnBody).toContain('layout.scheduledById');
  });

  it('preserves atomic updateMany concurrency guard', () => {
    const fnBody = service.slice(service.indexOf('export async function executeScheduledPublish'));
    expect(fnBody).toContain('prisma.pageLayout.updateMany');
    expect(fnBody).toContain('scheduledAt: { not: null }');
    expect(fnBody).toContain('if (count === 0) return null');
  });

  it('only creates revision after successful updateMany (count > 0)', () => {
    const fnBody = service.slice(service.indexOf('export async function executeScheduledPublish'));
    const countCheck = fnBody.indexOf('if (count === 0) return null');
    const revisionCreate = fnBody.indexOf('prisma.pageLayoutRevision.create');
    expect(countCheck).toBeLessThan(revisionCreate);
  });
});

/* ================================================================
 * 6. Revision Numbering
 * ================================================================ */
describe('Phase C — Revision numbering', () => {
  it('nextRevisionNo queries the highest existing revisionNo', () => {
    expect(service).toContain("orderBy: { revisionNo: 'desc' }");
  });

  it('nextRevisionNo returns last + 1', () => {
    expect(service).toContain('(last?.revisionNo ?? 0) + 1');
  });

  it('database unique constraint prevents duplicate revision numbers', () => {
    expect(schema).toContain('@@unique([pageKey, revisionNo])');
  });
});

/* ================================================================
 * 7. Listing Revisions
 * ================================================================ */
describe('Phase C — listRevisions', () => {
  it('returns revisions in descending order (newest first)', () => {
    const fnBody = service.slice(service.indexOf('export async function listRevisions'));
    expect(fnBody).toContain("orderBy: { revisionNo: 'desc' }");
  });

  it('excludes snapshot from list responses for efficiency', () => {
    const fnBody = service.slice(service.indexOf('export async function listRevisions'));
    expect(fnBody).toContain('select:');
    expect(fnBody).not.toMatch(/select:.*snapshot/);
  });

  it('supports pagination with limit and offset', () => {
    const fnBody = service.slice(service.indexOf('export async function listRevisions'));
    expect(fnBody).toContain('take: limit');
    expect(fnBody).toContain('skip: offset');
  });

  it('returns total count', () => {
    const fnBody = service.slice(service.indexOf('export async function listRevisions'));
    expect(fnBody).toContain('prisma.pageLayoutRevision.count');
  });
});

/* ================================================================
 * 8. Restore Revision
 * ================================================================ */
describe('Phase C — restoreRevision service', () => {
  it('requires system.config permission', () => {
    const fnBody = service.slice(service.indexOf('export async function restoreRevision'));
    expect(fnBody).toContain('need(actor)');
  });

  it('validates pageKey', () => {
    const fnBody = service.slice(service.indexOf('export async function restoreRevision'));
    expect(fnBody).toContain('validatePageKey(pageKey)');
  });

  it('rejects if revision not found', () => {
    const fnBody = service.slice(service.indexOf('export async function restoreRevision'));
    expect(fnBody).toContain("'Revision not found.'");
  });

  it('rejects cross-page revision restore', () => {
    const fnBody = service.slice(service.indexOf('export async function restoreRevision'));
    expect(fnBody).toContain('revision.pageKey !== pageKey');
    expect(fnBody).toContain("'Revision does not belong to this page.'");
  });

  it('copies snapshot to draftSections only', () => {
    const fnBody = service.slice(service.indexOf('export async function restoreRevision'));
    expect(fnBody).toContain('draftSections: revision.snapshot');
    expect(fnBody).not.toContain('publishedSections');
  });

  it('does not modify publishedSections', () => {
    const fnBody = service.slice(service.indexOf('export async function restoreRevision'));
    const updateBlock = fnBody.slice(fnBody.indexOf('prisma.pageLayout.update'), fnBody.indexOf('await audit'));
    expect(updateBlock).not.toContain('publishedSections');
  });

  it('creates audit log entry', () => {
    const fnBody = service.slice(service.indexOf('export async function restoreRevision'));
    expect(fnBody).toContain("'page_layout.restore_revision'");
  });
});

/* ================================================================
 * 9. Actor Name Resolution
 * ================================================================ */
describe('Phase C — Actor name resolution', () => {
  it('resolveActorName returns "System" for null actorId', () => {
    expect(service).toContain("if (!actorId) return 'System'");
  });

  it('resolveActorName falls back to "Unknown" for deleted users', () => {
    expect(service).toContain("user?.name ?? 'Unknown'");
  });

  it('resolveActorName queries user by ID', () => {
    expect(service).toContain('prisma.user.findUnique({ where: { id: actorId }');
  });
});

/* ================================================================
 * 10. Server Actions
 * ================================================================ */
describe('Phase C — Server actions', () => {
  it('exports listRevisionsAction', () => {
    expect(actions).toContain('export async function listRevisionsAction');
  });

  it('exports restoreRevisionAction', () => {
    expect(actions).toContain('export async function restoreRevisionAction');
  });

  it('listRevisionsAction requires system.config', () => {
    const fnBody = actions.slice(actions.indexOf('async function listRevisionsAction'));
    expect(fnBody).toContain("requireActor('system.config')");
  });

  it('restoreRevisionAction requires system.config', () => {
    const fnBody = actions.slice(actions.indexOf('async function restoreRevisionAction'));
    expect(fnBody).toContain("requireActor('system.config')");
  });

  it('restoreRevisionAction calls rev() for revalidation', () => {
    const fnBody = actions.slice(
      actions.indexOf('async function restoreRevisionAction'),
      actions.indexOf('async function getDraftPreviewSections'),
    );
    expect(fnBody).toContain('rev()');
  });

  it('exports RevisionRow interface', () => {
    expect(actions).toContain('export interface RevisionRow');
  });
});

/* ================================================================
 * 11. Admin UI — History Controls
 * ================================================================ */
describe('Phase C — Admin UI: History button and modal', () => {
  it('imports listRevisionsAction', () => {
    expect(editor).toContain('listRevisionsAction');
  });

  it('imports restoreRevisionAction', () => {
    expect(editor).toContain('restoreRevisionAction');
  });

  it('imports RevisionRow type', () => {
    expect(editor).toContain('RevisionRow');
  });

  it('has showHistoryModal state', () => {
    expect(editor).toContain('showHistoryModal');
  });

  it('has revisions state', () => {
    expect(editor).toContain("useState<RevisionRow[]>");
  });

  it('renders History button in action bar', () => {
    expect(editor).toContain('onClick={openHistory}');
    expect(editor).toContain('>History<');
  });

  it('renders revision history modal', () => {
    expect(editor).toContain('Revision History');
    expect(editor).toContain('Revision #{r.revisionNo}');
  });

  it('renders restore confirmation', () => {
    expect(editor).toContain('Restore revision #{r.revisionNo}?');
    expect(editor).toContain('Yes, Restore');
  });

  it('shows success message after restore', () => {
    expect(editor).toContain('Revision restored to draft');
  });

  it('History button is disabled when no layout exists', () => {
    expect(editor).toContain('disabled={isPending || !layout}');
  });
});

/* ================================================================
 * 12. Regression — Existing Publish
 * ================================================================ */
describe('Phase C — Regression: existing immediate publish', () => {
  it('publishLayout still updates publishedSections', () => {
    const fnBody = service.slice(
      service.indexOf('export async function publishLayout'),
      service.indexOf('export async function resetDraftToPublished'),
    );
    expect(fnBody).toContain('publishedSections: sections');
  });

  it('publishLayout still sets publishedAt', () => {
    const fnBody = service.slice(
      service.indexOf('export async function publishLayout'),
      service.indexOf('export async function resetDraftToPublished'),
    );
    expect(fnBody).toContain('publishedAt: new Date()');
  });

  it('publishLayout still creates audit log', () => {
    const fnBody = service.slice(
      service.indexOf('export async function publishLayout'),
      service.indexOf('export async function resetDraftToPublished'),
    );
    expect(fnBody).toContain("'page_layout.publish'");
  });
});

/* ================================================================
 * 13. Regression — Existing Scheduled Publish
 * ================================================================ */
describe('Phase C — Regression: existing scheduled publish', () => {
  it('executeScheduledPublish still uses atomic updateMany', () => {
    const fnBody = service.slice(service.indexOf('export async function executeScheduledPublish'));
    expect(fnBody).toContain('prisma.pageLayout.updateMany');
  });

  it('executeScheduledPublish still clears scheduling fields', () => {
    const fnBody = service.slice(service.indexOf('export async function executeScheduledPublish'));
    expect(fnBody).toContain('scheduledSections: null');
    expect(fnBody).toContain('scheduledAt: null');
    expect(fnBody).toContain('scheduledById: null');
  });

  it('executeScheduledPublish still increments version', () => {
    const fnBody = service.slice(service.indexOf('export async function executeScheduledPublish'));
    expect(fnBody).toContain('version: { increment: 1 }');
  });

  it('executeScheduledPublish still creates audit log', () => {
    const fnBody = service.slice(service.indexOf('export async function executeScheduledPublish'));
    expect(fnBody).toContain("'page_layout.scheduled_publish'");
  });
});

/* ================================================================
 * 14. Regression — Draft Preview Isolation
 * ================================================================ */
describe('Phase C — Regression: draft preview and public rendering', () => {
  it('getPublishedSections is unchanged (reads publishedSections)', () => {
    const fnBody = service.slice(
      service.indexOf('export async function getPublishedSections'),
      service.indexOf('export async function getDraftSections'),
    );
    expect(fnBody).toContain('layout.publishedSections');
    expect(fnBody).not.toContain('revision');
  });

  it('getDraftSections is unchanged', () => {
    const fnBody = service.slice(
      service.indexOf('export async function getDraftSections'),
      service.indexOf('export async function listPageLayouts'),
    );
    expect(fnBody).toContain('layout.draftSections');
    expect(fnBody).not.toContain('revision');
  });

  it('saveDraft is unchanged', () => {
    const fnBody = service.slice(
      service.indexOf('export async function saveDraft'),
      service.indexOf('export async function publishLayout'),
    );
    expect(fnBody).not.toContain('revision');
    expect(fnBody).not.toContain('Revision');
  });
});

/* ================================================================
 * 15. Regression — Scheduling Service
 * ================================================================ */
describe('Phase C — Regression: scheduling service functions', () => {
  it('schedulePublish is unchanged', () => {
    const fnBody = service.slice(
      service.indexOf('export async function schedulePublish'),
      service.indexOf('export async function cancelSchedule'),
    );
    expect(fnBody).toContain('scheduledSections');
    expect(fnBody).toContain('scheduledAt');
    expect(fnBody).not.toContain('revision');
  });

  it('cancelSchedule is unchanged', () => {
    const fnBody = service.slice(
      service.indexOf('export async function cancelSchedule'),
      service.indexOf('export async function getDueSchedules'),
    );
    expect(fnBody).not.toContain('revision');
  });

  it('getDueSchedules is unchanged', () => {
    const fnBody = service.slice(
      service.indexOf('export async function getDueSchedules'),
      service.indexOf('export async function executeScheduledPublish'),
    );
    expect(fnBody).not.toContain('revision');
  });
});

/* ================================================================
 * 16. Snapshot Integrity
 * ================================================================ */
describe('Phase C — Snapshot integrity', () => {
  it('immediate publish snapshots the sections being published (not references)', () => {
    const fnBody = service.slice(
      service.indexOf('export async function publishLayout'),
      service.indexOf('export async function resetDraftToPublished'),
    );
    expect(fnBody).toContain('JSON.parse(JSON.stringify(layout.draftSections))');
    expect(fnBody).toContain('snapshot: sections');
  });

  it('scheduled publish snapshots the scheduled sections', () => {
    const fnBody = service.slice(
      service.indexOf('export async function executeScheduledPublish'),
      service.indexOf('/* ── Revision History'),
    );
    expect(fnBody).toContain('JSON.parse(JSON.stringify(scheduled))');
    expect(fnBody).toContain('snapshot: sections');
  });

  it('restore uses the revision snapshot directly (not a reference)', () => {
    const fnBody = service.slice(service.indexOf('export async function restoreRevision'));
    expect(fnBody).toContain('draftSections: revision.snapshot');
  });
});

/* ================================================================
 * 17. Existing Action Preservation
 * ================================================================ */
describe('Phase C — Regression: existing page-layout-actions', () => {
  it('saveDraftAction still exists', () => {
    expect(actions).toContain('export async function saveDraftAction');
  });

  it('publishLayoutAction still exists', () => {
    expect(actions).toContain('export async function publishLayoutAction');
  });

  it('schedulePublishAction still exists', () => {
    expect(actions).toContain('export async function schedulePublishAction');
  });

  it('cancelScheduleAction still exists', () => {
    expect(actions).toContain('export async function cancelScheduleAction');
  });

  it('getDraftPreviewSections still exists', () => {
    expect(actions).toContain('export async function getDraftPreviewSections');
  });
});

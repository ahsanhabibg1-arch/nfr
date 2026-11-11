import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/* ── 1. Schema — scheduledSections, scheduledAt, scheduledById ── */

describe('Phase D — Prisma schema for scheduled publishing', () => {
  const schema = read('prisma/schema.prisma');

  it('PageLayout model has scheduledSections field', () => {
    expect(schema).toContain('scheduledSections');
  });

  it('PageLayout model has scheduledAt field', () => {
    expect(schema).toContain('scheduledAt');
  });

  it('PageLayout model has scheduledById field', () => {
    expect(schema).toContain('scheduledById');
  });

  it('scheduledSections is optional Json', () => {
    expect(schema).toMatch(/scheduledSections\s+Json\?/);
  });

  it('scheduledAt is optional DateTime', () => {
    expect(schema).toMatch(/scheduledAt\s+DateTime\?/);
  });

  it('scheduledById is optional String', () => {
    expect(schema).toMatch(/scheduledById\s+String\?/);
  });
});

/* ── 2. Migration exists ────────────────────────────────────────── */

describe('Phase D — Migration', () => {
  it('migration file exists for scheduled publishing', () => {
    const sql = read('prisma/migrations/20261108120000_phase_d_scheduled_publishing/migration.sql');
    expect(sql).toContain('scheduledById');
    expect(sql).toContain('ALTER TABLE');
    expect(sql).toContain('"PageLayout"');
  });
});

/* ── 3. Service layer — scheduling operations ───────────────────── */

describe('Phase D — pageLayoutService scheduling exports', () => {
  const src = read('lib/cms/pageLayoutService.ts');

  it('exports schedulePublish function', () => {
    expect(src).toContain('export async function schedulePublish');
  });

  it('exports cancelSchedule function', () => {
    expect(src).toContain('export async function cancelSchedule');
  });

  it('exports getDueSchedules function', () => {
    expect(src).toContain('export async function getDueSchedules');
  });

  it('exports executeScheduledPublish function', () => {
    expect(src).toContain('export async function executeScheduledPublish');
  });
});

describe('Phase D — schedulePublish validation contracts', () => {
  const src = read('lib/cms/pageLayoutService.ts');

  it('requires system.config permission', () => {
    const fn = src.slice(src.indexOf('async function schedulePublish'));
    expect(fn).toContain('need(actor)');
  });

  it('validates pageKey against KNOWN_PAGE_KEYS', () => {
    const fn = src.slice(src.indexOf('async function schedulePublish'));
    expect(fn).toContain('validatePageKey');
  });

  it('rejects scheduling in the past', () => {
    const fn = src.slice(src.indexOf('async function schedulePublish'));
    expect(fn).toContain('must be in the future');
  });

  it('rejects scheduling an empty draft', () => {
    const fn = src.slice(src.indexOf('async function schedulePublish'));
    expect(fn).toContain('empty draft');
  });

  it('snapshots the draft into scheduledSections', () => {
    const fn = src.slice(src.indexOf('async function schedulePublish'));
    expect(fn).toContain('scheduledSections: JSON.parse(JSON.stringify(draft))');
  });

  it('records scheduledById for audit trail', () => {
    const fn = src.slice(src.indexOf('async function schedulePublish'));
    expect(fn).toContain('scheduledById: actor.id');
  });

  it('logs the scheduling action to audit', () => {
    const fn = src.slice(src.indexOf('async function schedulePublish'), src.indexOf('async function cancelSchedule'));
    expect(fn).toContain("'page_layout.schedule'");
  });
});

describe('Phase D — cancelSchedule contracts', () => {
  const src = read('lib/cms/pageLayoutService.ts');

  it('requires system.config permission', () => {
    const fn = src.slice(src.indexOf('async function cancelSchedule'));
    expect(fn).toContain('need(actor)');
  });

  it('rejects cancellation when no schedule exists', () => {
    const fn = src.slice(src.indexOf('async function cancelSchedule'));
    expect(fn).toContain('No schedule exists');
  });

  it('clears scheduledSections on cancellation', () => {
    // Stage 09 Task I (S08-5): SQL NULL via Prisma.DbNull; a bare `null` was
    // coerced to a JSON null literal and the cancelled schedule stayed due.
    const fn = src.slice(src.indexOf('async function cancelSchedule'), src.indexOf('async function getDueSchedules'));
    expect(fn).toContain('scheduledSections: Prisma.DbNull');
    expect(fn).not.toMatch(/scheduledSections: null\b/);
  });

  it('clears scheduledAt on cancellation', () => {
    const fn = src.slice(src.indexOf('async function cancelSchedule'));
    expect(fn).toContain('scheduledAt: null');
  });

  it('clears scheduledById on cancellation', () => {
    const fn = src.slice(src.indexOf('async function cancelSchedule'));
    expect(fn).toContain('scheduledById: null');
  });

  it('logs the cancellation to audit', () => {
    const fn = src.slice(src.indexOf('async function cancelSchedule'), src.indexOf('async function getDueSchedules'));
    expect(fn).toContain("'page_layout.cancel_schedule'");
  });
});

describe('Phase D — getDueSchedules contracts', () => {
  const src = read('lib/cms/pageLayoutService.ts');

  it('filters by scheduledAt <= now', () => {
    const fn = src.slice(src.indexOf('async function getDueSchedules'));
    expect(fn).toContain('scheduledAt: { lte: new Date() }');
  });

  it('requires scheduledSections to be non-null', () => {
    // Stage 09 Task I: `AnyNull` excludes both SQL NULL and a legacy JSON null
    // literal left by the pre-Stage-09 clear.
    const fn = src.slice(src.indexOf('async function getDueSchedules'), src.indexOf('async function executeScheduledPublish'));
    expect(fn).toContain('scheduledSections: { not: Prisma.AnyNull }');
  });
});

describe('Phase D — executeScheduledPublish contracts', () => {
  const src = read('lib/cms/pageLayoutService.ts');

  it('uses an atomic conditional updateMany for concurrency safety [structural]', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    // Stage 08 Task B: now `tx.pageLayout.updateMany`, inside the shared
    // transaction that also records the revision, so a published schedule can
    // never exist without its history. Behavioural proof:
    // tests/stage08-scheduler.test.ts.
    expect(fn).toContain('updateMany');
    expect(fn).toContain('publishWithRevision');
  });

  it('WHERE clause requires scheduledAt not null (prevents double publish)', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    expect(fn).toContain('scheduledAt: { not: null }');
  });

  it('WHERE clause requires scheduledSections not null', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    // Stage 09 Task I: the claim guard rejects SQL NULL AND a legacy JSON null.
    expect(fn).toContain('scheduledSections: { not: Prisma.AnyNull }');
  });

  it('returns null when updateMany count is 0 (already executed or cancelled)', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    expect(fn).toContain('if (count === 0) return null');
  });

  it('copies scheduledSections to publishedSections', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    expect(fn).toContain('JSON.parse(JSON.stringify(scheduled))');
    expect(fn).toContain('publishedSections: sections');
  });

  it('clears scheduling fields after publication', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    // Stage 09 Task I: SQL NULL, never the JSON-null-coercing bare `null`.
    expect(fn).toContain('scheduledSections: Prisma.DbNull');
    expect(fn).toContain('scheduledAt: null');
    expect(fn).toContain('scheduledById: null');
  });

  it('increments the version on publication', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    expect(fn).toContain('version: { increment: 1 }');
  });

  it('attributes the publication to the scheduling actor', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    expect(fn).toContain('publishedById: layout.scheduledById');
  });

  it('logs the scheduled publish to audit', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    expect(fn).toContain("'page_layout.scheduled_publish'");
  });
});

/* ── 4. Scheduled publish runner ────────────────────────────────── */

describe('Phase D — scheduledPublishRunner', () => {
  const src = read('lib/cms/scheduledPublishRunner.ts');

  it('is a server-only module', () => {
    expect(src).toMatch(/^import 'server-only'/);
  });

  it('exports runDuePublications function', () => {
    expect(src).toContain('export async function runDuePublications');
  });

  it('exports startScheduler function', () => {
    expect(src).toContain('export function startScheduler');
  });

  it('exports stopScheduler function', () => {
    expect(src).toContain('export function stopScheduler');
  });

  it('calls getDueSchedules', () => {
    expect(src).toContain('getDueSchedules');
  });

  it('calls executeScheduledPublish for each due layout', () => {
    expect(src).toContain('executeScheduledPublish');
  });

  it('logs successful publications', () => {
    expect(src).toContain("'scheduled publish executed'");
  });

  it('logs failures without crashing', () => {
    expect(src).toContain("'scheduled publish failed'");
    expect(src).toContain('catch (err)');
  });

  it('prevents double start', () => {
    expect(src).toContain('if (started) return');
  });

  it('uses unref to not block process exit', () => {
    expect(src).toContain('.unref()');
  });

  it('runs immediately on start then at interval', () => {
    expect(src).toContain('runDuePublications().catch');
    expect(src).toContain('setInterval');
  });
});

/* ── 5. Instrumentation registers the scheduler ─────────────────── */

describe('Phase D — Instrumentation startup', () => {
  const src = read('instrumentation.ts');

  it('imports and starts the scheduler on non-build startup', () => {
    expect(src).toContain('startScheduler');
    expect(src).toContain('scheduledPublishRunner');
  });

  it('does not start scheduler during build', () => {
    expect(src).toContain('if (!isBuild)');
  });
});

/* ── 6. Server actions for scheduling ───────────────────────────── */

describe('Phase D — Server actions', () => {
  const src = read('app/admin/page-layout-actions.ts');

  it('exports schedulePublishAction', () => {
    expect(src).toContain('export async function schedulePublishAction');
  });

  it('exports cancelScheduleAction', () => {
    expect(src).toContain('export async function cancelScheduleAction');
  });

  it('schedulePublishAction requires system.config', () => {
    const fn = src.slice(src.indexOf('async function schedulePublishAction'), src.indexOf('async function cancelScheduleAction'));
    expect(fn).toContain("requireActor('system.config')");
  });

  it('schedulePublishAction validates the date', () => {
    const fn = src.slice(src.indexOf('async function schedulePublishAction'), src.indexOf('async function cancelScheduleAction'));
    expect(fn).toContain('Invalid date');
  });

  it('cancelScheduleAction requires system.config', () => {
    const fn = src.slice(src.indexOf('async function cancelScheduleAction'), src.indexOf('async function getDraftPreviewSections'));
    expect(fn).toContain("requireActor('system.config')");
  });

  it('both actions revalidate the draft tier [structural]', () => {
    /**
     * Stage 08 Task D split the single `rev()` helper — which flushed the whole
     * public site — into draft and publish tiers. Scheduling and cancelling
     * write only the scheduled columns and publish nothing, so both belong to
     * the draft tier.
     */
    expect(src).toContain('revalidateDraft()');
  });
});

/* ── 7. Admin UI — scheduling controls ──────────────────────────── */

describe('Phase D — AdminPageLayoutEditor scheduling UI', () => {
  const src = read('views/admin/AdminPageLayoutEditor.tsx');

  it('imports schedulePublishAction', () => {
    expect(src).toContain('schedulePublishAction');
  });

  it('imports cancelScheduleAction', () => {
    expect(src).toContain('cancelScheduleAction');
  });

  it('LayoutRow interface includes scheduledAt', () => {
    expect(src).toContain('scheduledAt: string | null');
  });

  it('has Schedule/Reschedule button', () => {
    expect(src).toContain("'Reschedule'");
    expect(src).toContain("'Schedule'");
  });

  it('has Cancel schedule button', () => {
    expect(src).toContain('Cancel schedule');
  });

  it('has a schedule modal with datetime-local input', () => {
    expect(src).toContain('datetime-local');
    expect(src).toContain('Schedule Publication');
  });

  it('displays currently scheduled date', () => {
    expect(src).toContain('Currently scheduled:');
  });

  it('validates future date before scheduling', () => {
    expect(src).toContain('future date and time');
  });

  it('shows scheduling status in top bar', () => {
    expect(src).toContain('Scheduled:');
    expect(src).toContain('text-violet-600');
  });

  it('confirms before cancelling a schedule', () => {
    expect(src).toContain('Cancel the scheduled publication?');
  });
});

/* ── 8. Admin website page passes scheduledAt ───────────────────── */

describe('Phase D — Admin website page data', () => {
  const src = read('app/admin/(dashboard)/website/page.tsx');

  it('passes scheduledAt to layout rows', () => {
    expect(src).toContain('scheduledAt: l.scheduledAt');
  });
});

/* ── 9. Existing immediate publish still works ──────────────────── */

describe('Phase D — Existing publish regression', () => {
  const src = read('lib/cms/pageLayoutService.ts');

  it('publishLayout still copies draftSections to publishedSections', () => {
    const fn = src.slice(src.indexOf('async function publishLayout'), src.indexOf('async function resetDraftToPublished'));
    expect(fn).toContain('JSON.parse(JSON.stringify(layout.draftSections))');
    expect(fn).toContain('publishedSections: sections');
  });

  it('publishLayout does not touch scheduling fields', () => {
    const fn = src.slice(src.indexOf('async function publishLayout'), src.indexOf('async function resetDraftToPublished'));
    expect(fn).not.toContain('scheduledSections');
    expect(fn).not.toContain('scheduledAt');
  });

  it('resetDraftToPublished does not touch scheduling fields', () => {
    const fn = src.slice(src.indexOf('async function resetDraftToPublished'), src.indexOf('async function restoreDefaults'));
    expect(fn).not.toContain('scheduledSections');
    expect(fn).not.toContain('scheduledAt');
  });
});

/* ── 10. Public rendering remains unaffected ────────────────────── */

describe('Phase D — Public rendering isolation', () => {
  const src = read('lib/cms/pageLayoutService.ts');

  // Stage 03 Task G routes both through `resolveSections(pageKey, column)`, so
  // the guarantee is now asserted on the shared resolver: it reads exactly the
  // requested column and never consults `scheduledSections`. The behaviour is
  // proven directly in tests/stage03-layout-observability.test.ts, which asserts
  // draft and published retrieval return different stored columns.
  it('retrieval routes through the shared resolver with an explicit column', () => {
    expect(src).toContain("resolveSections(pageKey, 'publishedSections')");
    expect(src).toContain("resolveSections(pageKey, 'draftSections')");
  });

  it('the shared resolver never reads scheduledSections', () => {
    const resolver = src.slice(
      src.indexOf('async function resolveSections'),
      src.indexOf('export async function getPublishedSectionsResolved'),
    );
    expect(resolver).toContain('layout[column]');
    expect(resolver).not.toContain('scheduledSections');
  });
});

/* ── 11. Draft preview remains functional ───────────────────────── */

describe('Phase D — Draft preview regression', () => {
  const routes = [
    'app/(public)/page.tsx',
    'app/(public)/[section]/page.tsx',
    'app/(public)/rodeo-events/page.tsx',
    'app/(public)/competitors/page.tsx',
    'app/(public)/venues/page.tsx',
    'app/(public)/articles/[slug]/page.tsx',
  ];

  for (const route of routes) {
    it(`${route} still imports isStaffDraftPreview`, () => {
      const src = read(route);
      expect(src).toContain('isStaffDraftPreview');
    });
  }
});

/* ── 12. Concurrency and reliability design ─────────────────────── */

describe('Phase D — Concurrency protection design', () => {
  const src = read('lib/cms/pageLayoutService.ts');

  it('uses atomic updateMany with conditional WHERE (prevents double publish across instances)', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    expect(fn).toContain('updateMany');
    expect(fn).toContain('scheduledAt: { not: null }');
    // Stage 09 Task I: AnyNull (SQL NULL and legacy JSON null both rejected).
    expect(fn).toContain('scheduledSections: { not: Prisma.AnyNull }');
  });

  it('returns null when no rows matched (already executed or cancelled)', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    expect(fn).toContain('count === 0');
    expect(fn).toContain('return null');
  });

  it('clears scheduling fields atomically in the same update', () => {
    const fn = src.slice(src.indexOf('async function executeScheduledPublish'));
    const updateData = fn.slice(fn.indexOf('data: {'), fn.indexOf('});'));
    expect(updateData).toContain('scheduledAt: null');
    // Stage 09 Task I: SQL NULL in the same atomic update.
    expect(updateData).toContain('scheduledSections: Prisma.DbNull');
    expect(updateData).toContain('publishedSections:');
  });

  it('runner handles individual layout failures without aborting others', () => {
    const runner = read('lib/cms/scheduledPublishRunner.ts');
    const loopBody = runner.slice(runner.indexOf('for (const layout of due)'));
    expect(loopBody).toContain('try {');
    expect(loopBody).toContain('} catch (err) {');
  });
});

/* ── 13. Cache invalidation ────────────────────────────────────── */

describe('Phase D — Cache invalidation via internal API', () => {
  it('runner triggers revalidation via HTTP fetch instead of direct revalidatePath', () => {
    const runner = read('lib/cms/scheduledPublishRunner.ts');
    expect(runner).toContain('/api/internal/revalidate');
    expect(runner).toContain('fetch(');
    expect(runner).not.toContain("from 'next/cache'");
  });

  it('revalidation endpoint exists and calls revalidatePath inside request context', () => {
    const route = read('app/api/internal/revalidate/route.ts');
    expect(route).toContain('revalidatePath');
    expect(route).toContain('export async function POST');
  });

  it('revalidation endpoint validates a shared secret', () => {
    const route = read('app/api/internal/revalidate/route.ts');
    expect(route).toContain('secret');
    expect(route).toContain('403');
  });

  it('runner only triggers revalidation when publications were made', () => {
    const runner = read('lib/cms/scheduledPublishRunner.ts');
    expect(runner).toContain('if (published > 0)');
    expect(runner).toContain('triggerRevalidation');
  });
});

#!/usr/bin/env node
/**
 * CI gate (Batch A, A6): fail when any Vitest test was skipped unexpectedly.
 *
 * DB integration suites self-skip when their database is unreachable, which would let a
 * broken CI database report "green". This reads Vitest's JSON report and classifies every
 * non-run test:
 *   - intentional   — listed in tests/allowed-skips.json (fullName), with a reason;
 *   - unexpected    — anything else skipped / pending / todo  → exit 1.
 * It also fails on a report with zero executed tests, or any failure.
 *
 * Usage: node scripts/assert-no-skipped-tests.mjs vitest-results.json [tests/allowed-skips.json]
 */
import fs from 'node:fs';

/**
 * Pure classification so it can be unit-tested.
 * @param {{ testResults?: { name?: string, assertionResults?: { fullName: string, status: string }[] }[] }} report
 * @param {{ fullName: string, reason: string }[]} [allowed]
 * @returns {{ ok: boolean, passed: number, failed: number,
 *   intentional: { name: string, reason: string | undefined }[],
 *   unexpected: { name: string, status: string, file: string | undefined }[] }}
 */
export function classifyReport(report, allowed = []) {
  const allow = new Map(allowed.map((a) => [a.fullName, a.reason]));
  /** @type {ReturnType<typeof classifyReport>} */
  const out = { ok: false, passed: 0, failed: 0, intentional: [], unexpected: [] };
  for (const file of report.testResults ?? []) {
    for (const t of file.assertionResults ?? []) {
      if (t.status === 'passed') out.passed++;
      else if (t.status === 'failed') out.failed++;
      else if (allow.has(t.fullName)) out.intentional.push({ name: t.fullName, reason: allow.get(t.fullName) });
      else out.unexpected.push({ name: t.fullName, status: t.status, file: file.name });
    }
  }
  out.ok = out.failed === 0 && out.unexpected.length === 0 && out.passed > 0;
  return out;
}

if (/assert-no-skipped-tests\.mjs$/.test(process.argv[1] ?? '')) {
  const [reportPath, allowPath = 'tests/allowed-skips.json'] = process.argv.slice(2);
  if (!reportPath || !fs.existsSync(reportPath)) {
    console.error(`assert-no-skipped-tests: report not found (${reportPath ?? 'no path given'}). Did vitest run with --reporter=json?`);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const allowed = fs.existsSync(allowPath) ? JSON.parse(fs.readFileSync(allowPath, 'utf8')) : [];
  const r = classifyReport(report, allowed);
  console.log(`Tests: ${r.passed} passed, ${r.failed} failed, ${r.intentional.length} intentionally skipped, ${r.unexpected.length} unexpectedly not run.`);
  for (const s of r.intentional) console.log(`  allowed skip: ${s.name} — ${s.reason}`);
  for (const s of r.unexpected) console.error(`  UNEXPECTED ${s.status}: ${s.name} (${s.file})`);
  if (r.passed === 0) console.error('No tests executed.');
  process.exit(r.ok ? 0 : 1);
}

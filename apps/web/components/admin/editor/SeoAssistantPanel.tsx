'use client';

import React, { useMemo, useState } from 'react';
import type { ArticleValidationReport, ValidationFinding, DisplayCategory } from '../../../utils/seoValidator';
import { DISPLAY_CATEGORIES } from '../../../utils/seoValidator';

/**
 * Batch 25 — Article Editor SEO Assistant. Renders the FULL, structured output of the
 * existing `validateArticle` engine (no new engine): every check grouped by category,
 * with status, severity, the detected problem, how to fix it, the relevant field, and
 * whether it blocks publication. "Check SEO" re-stamps the review time and jumps to the
 * first blocker; it never saves or publishes. The report is computed live from the
 * current (unsaved) editor content, and the final publication gate is enforced
 * server-side — this panel says so rather than guaranteeing a publish will succeed.
 */

type Status = 'passed' | 'failed' | 'not-evaluated';
function statusOf(f: ValidationFinding): Status {
  if (!f.evaluated) return 'not-evaluated';
  return f.passed ? 'passed' : 'failed';
}

const SEVERITY_LABEL: Record<ValidationFinding['severity'], string> = {
  blocker: 'Editorial blocker', compliance: 'Compliance blocker', warning: 'Warning', notice: 'Recommendation',
};

/** One-sentence editorial rationale per category (static guidance — not a validation result). */
const WHY_MATTERS: Record<DisplayCategory, string> = {
  'Publication Readiness': 'These gate whether the article is eligible to go live.',
  'Editorial Quality': 'Core editorial fields readers and index cards depend on.',
  'SEO Metadata': 'Controls how the page is titled and described in search results.',
  'Content Structure': 'Well-structured bodies are easier to read, scan and extract.',
  'Images & Accessibility': 'Screen-reader users and image search rely on descriptive text.',
  'Internal & External Links': 'Links aid reader recirculation and establish context.',
  'Entity Relationships': 'Linking rodeo disciplines/events connects coverage across the site.',
  'Structured Data': 'Citations and provenance strengthen trust (E-E-A-T).',
  'Rights, Safety & Compliance': 'Publishing policy requires verified rights and honest disclosures.',
};

function StatusDot({ status, severity }: { status: Status; severity: ValidationFinding['severity'] }) {
  const cls = status === 'passed' ? 'bg-emerald-500'
    : status === 'not-evaluated' ? 'bg-stone-300'
    : (severity === 'blocker' || severity === 'compliance') ? 'bg-rose-500' : 'bg-amber-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} shrink-0`} aria-hidden="true" />;
}

function sevBadgeClass(severity: ValidationFinding['severity']) {
  return severity === 'blocker' || severity === 'compliance'
    ? 'bg-rose-100 text-rose-700'
    : severity === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800';
}

function FindingRow({ f, onGoToField }: { f: ValidationFinding; onGoToField: (anchor: string) => void }) {
  const [open, setOpen] = useState(false);
  const status = statusOf(f);
  const statusText = status === 'passed' ? 'Passed' : status === 'not-evaluated' ? 'Not evaluated' : 'Failed';
  return (
    <li className="border-b border-stone-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-start gap-2 py-2 text-left hover:bg-stone-50/60 rounded-xs px-1"
      >
        <span className="mt-1.5"><StatusDot status={status} severity={f.severity} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[12px] text-stone-800">{f.rule}</span>
          <span className="flex flex-wrap items-center gap-1.5 mt-0.5">
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-xs ${status === 'passed' ? 'bg-emerald-100 text-emerald-800' : status === 'not-evaluated' ? 'bg-stone-100 text-ink-muted' : sevBadgeClass(f.severity)}`}>{statusText}</span>
            {status !== 'passed' && <span className="text-[9px] font-mono text-ink-muted">{SEVERITY_LABEL[f.severity]}</span>}
            {f.blocksPublication && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-xs bg-rose-50 text-rose-700 border border-rose-200">Blocks publication</span>}
          </span>
        </span>
        <svg className={`w-3.5 h-3.5 mt-1 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="pl-6 pr-1 pb-3 text-[11px] space-y-1.5 text-stone-700">
          <p><span className="font-semibold text-stone-900">Detected:</span> {f.message}</p>
          <p><span className="font-semibold text-stone-900">Standard:</span> {f.rule}.</p>
          {status !== 'passed' && <p><span className="font-semibold text-stone-900">How to fix:</span> {f.remediation}</p>}
          <p className="flex items-center gap-2 flex-wrap">
            <span><span className="font-semibold text-stone-900">Field:</span> {f.fieldLabel}</span>
            {f.fieldAnchor && (
              <button type="button" onClick={() => onGoToField(f.fieldAnchor)} className="text-[10px] font-mono text-[#8B5E3C] underline hover:text-[#6f4a2f]">Go to field →</button>
            )}
          </p>
        </div>
      )}
    </li>
  );
}

export interface SeoAssistantPanelProps {
  report: ArticleValidationReport;
  isDirty: boolean;
  lastCheckedAt: number | null;
  onCheck: () => void;
  onGoToField: (anchor: string) => void;
}

export const SeoAssistantPanel: React.FC<SeoAssistantPanelProps> = ({ report, isDirty, lastCheckedAt, onCheck, onGoToField }) => {
  const failedBlocking = report.blockers.length + report.compliance.length;
  const failedTotal = failedBlocking + report.warnings.length + report.notices.length;

  const grouped = useMemo(() => {
    return DISPLAY_CATEGORIES.map((cat) => ({
      cat,
      items: report.findings.filter((f) => f.displayCategory === cat),
    })).filter((g) => g.items.length > 0);
  }, [report.findings]);

  const summary = report.canPublish
    ? (report.warnings.length > 0
        ? `All mandatory editor checks passed. Review ${report.warnings.length} non-blocking warning${report.warnings.length === 1 ? '' : 's'}.`
        : 'All mandatory editor checks passed.')
    : `Publication blocked: ${failedBlocking} mandatory issue${failedBlocking === 1 ? '' : 's'} remain${failedBlocking === 1 ? 's' : ''}.`;

  return (
    <div className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs space-y-4" data-testid="seo-assistant">
      <div className="flex items-center justify-between pb-2 border-b border-stone-100">
        <h4 className="font-serif font-bold text-stone-900 text-sm">SEO Assistant</h4>
        <button
          type="button"
          onClick={onCheck}
          data-testid="seo-check-button"
          className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-xs bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 transition-colors"
        >
          Check SEO
        </button>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-2 text-center" data-testid="seo-counts">
        <Stat label="Checks" value={report.totalChecks} />
        <Stat label="Passed" value={report.passedChecks} tone="emerald" />
        <Stat label="Failed" value={failedTotal} tone={failedTotal ? 'rose' : 'stone'} />
        <Stat label="Blockers" value={failedBlocking} tone={failedBlocking ? 'rose' : 'stone'} />
        <Stat label="Warnings" value={report.warnings.length} tone={report.warnings.length ? 'amber' : 'stone'} />
        <Stat label="Not eval." value={report.notEvaluated.length} tone="stone" />
      </div>

      {/* Publication readiness summary */}
      <div className={`rounded-xs px-3 py-2 text-xs font-medium ${report.canPublish ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`} data-testid="seo-readiness" role="status">
        {summary}
      </div>

      {/* Provenance / honesty notes */}
      <p className="text-[10px] text-ink-muted leading-relaxed">
        Validating your current <strong>unsaved</strong> editor content (updates live as you edit).
        {lastCheckedAt ? ` Last manual check: ${new Date(lastCheckedAt).toLocaleTimeString()}.` : ''}
        {isDirty ? ' You have unsaved changes.' : ''}
        {' '}The final publication gate is enforced server-side, which also verifies image rights,
        relationships and sources — passing here does not guarantee the server will accept publication.
      </p>

      {/* Grouped findings */}
      <div className="space-y-3">
        {grouped.map(({ cat, items }) => {
          const failed = items.filter((f) => f.evaluated && !f.passed).length;
          return (
            <details key={cat} open={failed > 0} className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none py-1 text-[11px] font-bold uppercase tracking-wider text-stone-600">
                <span className="flex items-center gap-2">
                  {cat}
                  <span className="font-mono text-[9px] text-ink-muted">({items.filter((f) => f.passed && f.evaluated).length}/{items.filter((f) => f.evaluated).length})</span>
                </span>
                {failed > 0 && <span className="text-[9px] font-mono text-rose-700">{failed} to fix</span>}
              </summary>
              <ul className="mt-1">
                {items.map((f) => <FindingRow key={f.id} f={f} onGoToField={onGoToField} />)}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
};

function Stat({ label, value, tone = 'stone' }: { label: string; value: number; tone?: 'emerald' | 'rose' | 'amber' | 'stone' }) {
  const color = tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-700' : tone === 'amber' ? 'text-amber-700' : 'text-stone-700';
  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xs py-1.5">
      <div className={`text-sm font-mono font-bold ${color}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-ink-muted">{label}</div>
    </div>
  );
}

export default SeoAssistantPanel;

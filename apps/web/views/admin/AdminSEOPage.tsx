'use client';

import React, { useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { AdminModal } from '../../components/admin/AdminModal';
import { SEO_ISSUES } from '../../data/mockAdminData';
import { SEOGroup, SEOIssue } from '../../types/admin';

const SEO_GROUPS: SEOGroup[] = [
  'On-page',
  'Search Appearance',
  'Technical',
  'Content & Topic',
  'External Links',
  'Internal Links',
  'Image SEO',
  'Structured Data',
  'AI Search Readiness',
  'Freshness',
  'Event SEO',
  'Redirects',
];

export const AdminSEOPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'issues' | 'groups' | 'audit' | 'sitemap'>('issues');
  const [selectedIssue, setSelectedIssue] = useState<SEOIssue | null>(null);
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>('all');
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditNotice, setAuditNotice] = useState<string | null>(null);


  const filteredIssues = SEO_ISSUES.filter(
    (i) => activeGroupFilter === 'all' || i.group === activeGroupFilter
  );

  const handleRunAudit = () => {
    setAuditRunning(true);
    setTimeout(() => {
      setAuditRunning(false);
      setAuditNotice('Automated 12-Group audit completed across 18 routes in demonstration mode.');
      setTimeout(() => setAuditNotice(null), 4000);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="SEO Intelligence &amp; 12-Group Rules Engine"
        description="Unified editorial SEO audit console: evaluates on-page titles, Schema.org structured data, AI search readiness, image ALT tags, and commercial link compliance."
        badge="Engine v1.0"
        actions={
          <button
            onClick={handleRunAudit}
            disabled={auditRunning}
            className="px-4 py-2 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            {auditRunning ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Auditing 18 Routes...
              </>
            ) : (
              'Run Full 12-Group Audit'
            )}
          </button>
        }
      />

      {auditNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-sans rounded-xs flex items-center justify-between">
          <span>{auditNotice}</span>
          <button onClick={() => setAuditNotice(null)} className="font-bold">&times;</button>
        </div>
      )}

      {/* Primary Tabs */}
      <AdminTabs
        tabs={[
          { id: 'issues', label: 'Actionable Issues & Findings', count: SEO_ISSUES.length },
          { id: 'groups', label: '12 Standard SEO Groups', count: 12 },
          { id: 'audit', label: 'Structured Data Validator', count: 7 },
          { id: 'sitemap', label: 'Sitemap & Robots Directives' },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as any)}
      />

      {/* Tab 1: Issues & Findings */}
      {activeTab === 'issues' && (
        <div className="space-y-4">
          {/* Group Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none font-sans text-xs">
            <span className="text-[11px] font-mono text-stone-500 uppercase tracking-wider mr-1">
              Group Filter:
            </span>
            <button
              onClick={() => setActiveGroupFilter('all')}
              className={`px-2.5 py-1 rounded-xs uppercase tracking-wider text-[11px] font-semibold transition-colors ${
                activeGroupFilter === 'all'
                  ? 'bg-[#0F1115] text-[#D4A757]'
                  : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
              }`}
            >
              All ({SEO_ISSUES.length})
            </button>
            {SEO_GROUPS.map((grp) => {
              const count = SEO_ISSUES.filter((i) => i.group === grp).length;
              if (count === 0) return null;
              return (
                <button
                  key={grp}
                  onClick={() => setActiveGroupFilter(grp)}
                  className={`px-2.5 py-1 rounded-xs uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    activeGroupFilter === grp
                      ? 'bg-[#0F1115] text-[#D4A757]'
                      : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
                  }`}
                >
                  {grp} ({count})
                </button>
              );
            })}
          </div>

          {/* Issues Table */}
          <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs font-sans border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Rule &amp; Group</th>
                  <th className="py-3 px-4">Affected Route / Content</th>
                  <th className="py-3 px-4">Evidence</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredIssues.map((issue) => (
                  <tr key={issue.id} className="hover:bg-stone-50 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <AdminStatusBadge status={issue.severity.toUpperCase()} variant={issue.severity} />
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <span className="font-bold text-stone-900 block leading-snug">{issue.rule}</span>
                      <span className="text-[10px] font-mono text-[#8B5E3C] mt-0.5 block">{issue.group}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-stone-600 max-w-xs truncate">
                      {issue.affectedContent}
                    </td>
                    <td className="py-3 px-4 text-stone-600 max-w-xs text-xs truncate">
                      {issue.evidence}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="capitalize font-medium text-stone-700">{issue.status.replace('_', ' ')}</span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setSelectedIssue(issue)}
                        className="text-[#8B5E3C] hover:underline font-bold"
                      >
                        Remediate &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: 12 Standard Groups */}
      {activeTab === 'groups' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-sans">
          {SEO_GROUPS.map((grp, idx) => (
            <div key={grp} className="p-4 bg-white border border-stone-200 rounded-sm shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-stone-400">
                  Group 0{idx + 1}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-xs bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                  Rule Active
                </span>
              </div>
              <h4 className="font-serif font-bold text-base text-stone-900 mb-1">{grp}</h4>
              <p className="text-xs text-stone-500 leading-relaxed">
                Automated continuous verification rule set validating SERP presentation, schema compliance, and link topology.
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Structured Data Validator */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-stone-200 rounded-sm p-6 shadow-2xs space-y-4 font-sans text-xs">
          <h3 className="font-serif font-bold text-base text-stone-900">
            Schema.org JSON-LD Verification
          </h3>
          <p className="text-stone-600 leading-relaxed">
            NFRGuide dynamically generates compliant JSON-LD structured data for Articles, Disciplines, and BreadcrumbTrails via the client-side useSEO hook.
          </p>

          <div className="p-4 bg-[#0F1115] text-[#D4A757] font-mono text-[11px] rounded-xs overflow-x-auto">
            <pre>
{`{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Inside the Chutes: Why the 8-Second Ride Remains Sport’s Purest Crucible",
  "author": { "@type": "Person", "name": "Clayton Vance" },
  "publisher": { "@type": "Organization", "name": "NFRGuide" },
  "articleSection": "NFR Competition"
}`}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 4: Sitemap & Robots */}
      {activeTab === 'sitemap' && (
        <div className="bg-white border border-stone-200 rounded-sm p-6 shadow-2xs space-y-4 font-sans text-xs">
          <h3 className="font-serif font-bold text-base text-stone-900">
            Sitemap Index &amp; Robots.txt Staging
          </h3>
          <p className="text-stone-600 leading-relaxed">
            All 18 canonical editorial routes, section landings, and discipline guides are registered in the sitemap builder.
          </p>
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-xs font-mono text-xs text-stone-700 space-y-1">
            <p>User-agent: *</p>
            <p>Allow: /</p>
            <p>Disallow: /admin/</p>
            <p>Sitemap: https://nfrguide.com/sitemap.xml</p>
          </div>
        </div>
      )}

      {/* Remediate Issue Modal */}
      {selectedIssue && (
        <AdminModal
          isOpen={true}
          onClose={() => setSelectedIssue(null)}
          title={`Remediate Issue: ${selectedIssue.group}`}
          subtitle={`Rule: ${selectedIssue.rule}`}
          footerActions={
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedIssue(null)}
                className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs text-stone-600"
              >
                Close
              </button>
              <button
                onClick={() => {
                  alert('Remediation action recorded in demonstration audit trail.');
                  setSelectedIssue(null);
                }}
                className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs uppercase tracking-wider"
              >
                Mark Resolved
              </button>
            </div>
          }
        >
          <div className="space-y-3 font-sans text-xs">
            <div>
              <strong className="block text-stone-900 mb-0.5">Affected URL Route:</strong>
              <code className="p-1.5 bg-stone-100 rounded-xs block font-mono text-[11px] text-stone-800">
                {selectedIssue.affectedContent}
              </code>
            </div>
            <div>
              <strong className="block text-stone-900 mb-0.5">Observed Evidence:</strong>
              <p className="text-stone-700 p-2.5 bg-rose-50 border border-rose-200 rounded-xs text-rose-900">
                {selectedIssue.evidence}
              </p>
            </div>
            <div>
              <strong className="block text-stone-900 mb-0.5">Suggested Technical Resolution:</strong>
              <p className="text-stone-700 p-2.5 bg-stone-50 border border-stone-200 rounded-xs">
                {selectedIssue.suggestedResolution}
              </p>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
};

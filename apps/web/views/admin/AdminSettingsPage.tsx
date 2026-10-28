'use client';

import React, { useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { BACKGROUND_JOBS } from '../../data/mockAdminData';
import { BackgroundJob } from '../../types/admin';

export const AdminSettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'identity' | 'editorial' | 'jobs' | 'system'>('identity');
  const [jobs, setJobs] = useState<BackgroundJob[]>(BACKGROUND_JOBS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleRunJob = (jobId: string) => {
    setJobs(prev =>
      prev.map(j => {
        if (j.id === jobId) {
          return {
            ...j,
            status: 'completed',
            lastRun: 'Just now (Manual Trigger)',
            itemsProcessed: j.itemsProcessed + 1,
          };
        }
        return j;
      })
    );
    showToast(`Background job executed successfully`);
  };

  const handleDownloadBackup = () => {
    const backupData = {
      timestamp: new Date().toISOString(),
      publication: 'NFRGuide.com',
      version: '0.3.0-demo',
      systemHealth: '100% Nominal',
      manifest: {
        articles: 8,
        mediaAssets: 4,
        sources: 4,
        hubs: 2,
        recurringEvents: 2,
        eventEditions: 2,
        disciplines: 7,
      },
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nfrguide-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported editorial database snapshot (JSON)');
  };

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono animate-fade-in flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toastMessage}
        </div>
      )}

      <AdminPageHeader
        title="System Settings & Maintenance"
        description="Configure publication branding, editorial algorithms, automated background jobs, and migration parameters."
        breadcrumbs={[
          { label: 'Admin', path: '/admin/' },
          { label: 'System Settings' },
        ]}
        actions={
          <button
            onClick={handleDownloadBackup}
            className="px-3.5 py-1.5 text-xs font-sans font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export JSON Snapshot
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          title="Active Cron Tasks"
          value={jobs.length.toString()}
          change="All Systems Healthy"
          trend="up"
          description="SEO, sitemaps, link integrity"
        />
        <AdminStatCard
          title="Publication Timezone"
          value="PT (Vegas)"
          change="America/Los_Angeles"
          trend="neutral"
          description="Aligned with Thomas & Mack"
        />
        <AdminStatCard
          title="Canonical Base Domain"
          value="nfrguide.com"
          change="SSL Enforced"
          trend="neutral"
          description="Canonical HTTPS trailing-slash"
        />
        <AdminStatCard
          title="App Architecture"
          value="React 19"
          change="Next.js App Router Ready"
          trend="up"
          description="Clean decoupled data contracts"
        />
      </div>

      <AdminTabs
        tabs={[
          { id: 'identity', label: 'Site Identity & Canonical' },
          { id: 'editorial', label: 'Editorial Rules & Standards' },
          { id: 'jobs', label: 'Automated Background Jobs', count: jobs.length },
          { id: 'system', label: 'System & Architecture' },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
      />

      {/* TAB 1: IDENTITY */}
      {activeTab === 'identity' && (
        <div className="bg-white border border-stone-200 rounded-xs p-6 max-w-3xl space-y-4">
          <div>
            <h3 className="font-sans font-bold text-sm text-stone-900 mb-1">
              Publication Identity & DNS Canonical Settings
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              These properties define the global OpenGraph metadata, schema.org publisher node, and canonical URLs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Publication Brand Name
              </label>
              <input
                type="text"
                defaultValue="NFRGuide"
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Canonical Base URL
              </label>
              <input
                type="text"
                defaultValue="https://nfrguide.com"
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Institutional Editorial Tagline
              </label>
              <input
                type="text"
                defaultValue="The Premier Independent Editorial Publication for Championship Rodeo"
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Editorial Desk Email
              </label>
              <input
                type="email"
                defaultValue="editorial@nfrguide.com"
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Default Editorial Timezone
              </label>
              <select
                defaultValue="America/Los_Angeles"
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              >
                <option value="America/Los_Angeles">Pacific Time (America/Los_Angeles) [Vegas Event Local]</option>
                <option value="America/Denver">Mountain Time (America/Denver) [PRCA Colorado Springs HQ]</option>
                <option value="America/Chicago">Central Time (America/Chicago) [Texas Rodeos]</option>
                <option value="America/New_York">Eastern Time (America/New_York)</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-stone-200">
            <button
              onClick={() => showToast('Identity parameters saved')}
              className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-sans font-semibold rounded-xs hover:bg-stone-800 transition-colors"
            >
              Save Brand Settings
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: EDITORIAL STANDARDS */}
      {activeTab === 'editorial' && (
        <div className="bg-white border border-stone-200 rounded-xs p-6 max-w-3xl space-y-4">
          <div>
            <h3 className="font-sans font-bold text-sm text-stone-900 mb-1">
              Editorial Quality & Publishing Gatekeepers
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Enforce strict journalism standards before articles can be marked as published.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3">
              <input type="checkbox" id="chkAnswer" defaultChecked className="mt-1 rounded-xs text-[#D4A757]" />
              <div>
                <label htmlFor="chkAnswer" className="text-xs font-semibold text-stone-900">
                  Enforce Direct Answer Capsule on All Explainer Articles
                </label>
                <p className="text-[11px] text-stone-500">
                  Ensures high visibility in Google AI Overviews and featured snippet blocks.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <input type="checkbox" id="chkSources" defaultChecked className="mt-1 rounded-xs text-[#D4A757]" />
              <div>
                <label htmlFor="chkSources" className="text-xs font-semibold text-stone-900">
                  Require Verified Source Provenance on Rule & Scoring Guides
                </label>
                <p className="text-[11px] text-stone-500">
                  Prevents publishing unverified scoring rules without citing the official PRCA or WPRA rulebook.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <input type="checkbox" id="chkRel" defaultChecked className="mt-1 rounded-xs text-[#D4A757]" />
              <div>
                <label htmlFor="chkRel" className="text-xs font-semibold text-stone-900">
                  Automated Enforcement of rel="sponsored" on Commercial External Links
                </label>
                <p className="text-[11px] text-stone-500">
                  Automatically rewrites any link to an approved affiliate partner domain to include rel="sponsored".
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3">
              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                  Words-Per-Minute Read Speed Benchmark
                </label>
                <input
                  type="number"
                  defaultValue={225}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                  Minimum Words for "In-Depth Feature" Flag
                </label>
                <input
                  type="number"
                  defaultValue={1000}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-stone-200">
              <button
                onClick={() => showToast('Editorial standards saved')}
                className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-sans font-semibold rounded-xs hover:bg-stone-800 transition-colors"
              >
                Save Editorial Rules
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BACKGROUND JOBS */}
      {activeTab === 'jobs' && (
        <div className="bg-white border border-stone-200 rounded-xs shadow-2xs overflow-hidden">
          <div className="px-4 py-3 bg-stone-50/50 border-b border-stone-200 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
              Automated Background & Cron Jobs ({jobs.length})
            </span>
            <span className="text-[11px] text-stone-500 font-mono">
              Monitors SEO health, link integrity, and structured sitemaps
            </span>
          </div>

          <div className="divide-y divide-stone-200">
            {jobs.map((job) => (
              <div key={job.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-stone-50/50">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-sans font-bold text-sm text-stone-900">
                      {job.name}
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold bg-emerald-100 text-emerald-800">
                      {job.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-stone-500 font-mono">
                    <span>Schedule: {job.schedule}</span>
                    <span>•</span>
                    <span>Last Run: {job.lastRun}</span>
                    <span>•</span>
                    <span>Duration: {job.duration}</span>
                    <span>•</span>
                    <span className="text-[#8B5E3C] font-semibold">Items Processed: {job.itemsProcessed}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleRunJob(job.id)}
                    className="px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-xs transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5 text-[#D4A757]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Run Job Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SYSTEM & ARCHITECTURE */}
      {activeTab === 'system' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
            <h4 className="font-sans font-bold text-sm text-stone-900">
              Frontend & Routing Stack
            </h4>
            <div className="text-xs text-stone-600 space-y-2">
              <div className="flex justify-between py-1 border-b border-stone-100 font-mono">
                <span className="text-stone-500">Framework</span>
                <span className="font-bold text-stone-800">React 19.0.1</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 font-mono">
                <span className="text-stone-500">Bundler / Dev</span>
                <span className="font-bold text-stone-800">Vite 8.3.0</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 font-mono">
                <span className="text-stone-500">Client Router</span>
                <span className="font-bold text-stone-800">React Router 7</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 font-mono">
                <span className="text-stone-500">Styling</span>
                <span className="font-bold text-stone-800">Tailwind CSS v4</span>
              </div>
              <div className="flex justify-between py-1 font-mono">
                <span className="text-stone-500">Next.js App Router Target</span>
                <span className="font-bold text-emerald-700">100% Migration Ready</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
            <h4 className="font-sans font-bold text-sm text-stone-900">
              Data Store & Persistence Layer
            </h4>
            <div className="text-xs text-stone-600 space-y-2">
              <div className="flex justify-between py-1 border-b border-stone-100 font-mono">
                <span className="text-stone-500">Current Storage</span>
                <span className="font-bold text-stone-800">Typed In-Memory Data Store</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 font-mono">
                <span className="text-stone-500">Data Contracts</span>
                <span className="font-bold text-stone-800">TypeScript Strict Types</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 font-mono">
                <span className="text-stone-500">Database Ready</span>
                <span className="font-bold text-stone-800">PostgreSQL / Cloud SQL</span>
              </div>
              <div className="flex justify-between py-1 font-mono">
                <span className="text-stone-500">Auth Mechanism</span>
                <span className="font-bold text-amber-700">Phase 0 Demo (Non-Persistent)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

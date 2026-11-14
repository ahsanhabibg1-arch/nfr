'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  SearchEngineConfig, VerificationRecord, DnsRecord, TrackingSettings, IndexingHealth,
  VerificationAuditRow,
} from '../../lib/cms/searchEngineService';
import {
  saveVerificationRecordAction, deleteVerificationRecordAction, checkVerificationRecordAction,
  saveDnsRecordAction, deleteDnsRecordAction, checkDnsRecordAction,
  updateTrackingAction, getIndexingHealthAction, listVerificationAuditAction,
} from '../../app/admin/search-engine-actions';

/**
 * Settings → Search Engines & Verification.
 *
 * SIX SECTIONS, BECAUSE THEY ARE SIX DIFFERENT THINGS. Verification, DNS,
 * tracking, API connections, robots/sitemap and indexing health get conflated
 * constantly — an administrator asks "how do I get on Google?" and is offered a
 * tracking id, which does nothing for it. Each section therefore says what it
 * is for, and what it is NOT.
 *
 * EVERY CONTROL HERE DOES SOMETHING. The checks make real requests and report
 * three honest outcomes; "not checked" is shown as not checked rather than as
 * success. Where a capability is not implemented — automatic DNS writing — the
 * section says so and gives the record to copy instead of a button that fails.
 */

const inputCls = 'w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]';
const labelCls = 'block text-xs font-mono uppercase text-ink-muted font-medium mb-1';
const btnPrimary = 'px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50';
const btnQuiet = 'px-3 py-1.5 text-xs border border-stone-300 rounded-xs bg-white hover:bg-stone-50 disabled:opacity-40';
const card = 'bg-white border border-stone-200 rounded-xs p-6 space-y-4';

/** One honest state badge, never green unless something was actually observed. */
function StateBadge({ state, at }: { state?: string; at?: string }) {
  const tone =
    state === 'detected' || state === 'found' ? 'bg-emerald-100 text-emerald-800'
      : state === 'absent' ? 'bg-amber-100 text-amber-800'
        : state === 'unreachable' ? 'bg-rose-100 text-rose-700'
          : 'bg-stone-100 text-stone-600';
  const label =
    state === 'detected' ? 'Serving'
      : state === 'found' ? 'In public DNS'
        : state === 'absent' ? 'Not seen yet'
          : state === 'unreachable' ? 'Could not check'
            : 'Not checked';
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold ${tone}`} title={at ? `Last checked ${new Date(at).toLocaleString()}` : undefined}>
      {label}
    </span>
  );
}

export interface AdminSearchEnginePanelProps {
  config: SearchEngineConfig;
}

export const AdminSearchEnginePanel: React.FC<AdminSearchEnginePanelProps> = ({ config }) => {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 4000); };

  const [records, setRecords] = useState<VerificationRecord[]>(config.verification);
  const [dns, setDns] = useState<DnsRecord[]>(config.dns);
  const [tracking, setTracking] = useState<TrackingSettings>(config.tracking);
  const [health, setHealth] = useState<IndexingHealth | null>(null);
  const [auditRows, setAuditRows] = useState<VerificationAuditRow[]>([]);

  // --- verification form ---
  const [provider, setProvider] = useState(config.providers[0]?.key ?? 'google');
  const [customName, setCustomName] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const selected = config.providers.find((p) => p.key === provider);

  const resetForm = () => { setEditingId(null); setValue(''); setNote(''); setCustomName(''); };

  const saveRecord = () => start(async () => {
    const res = await saveVerificationRecordAction({
      id: editingId ?? undefined,
      provider,
      customMetaName: provider === 'custom' ? customName : undefined,
      value,
      enabled: true,
      note: note || undefined,
    });
    if (!res.ok) { notify(res.error); return; }
    setRecords((prev) => {
      const next = prev.filter((r) => r.id !== res.record.id);
      return [...next, res.record];
    });
    resetForm();
    notify('Verification record saved. Use Check to confirm it is being served.');
    router.refresh();
  });

  const toggleRecord = (r: VerificationRecord) => start(async () => {
    const res = await saveVerificationRecordAction({
      id: r.id, provider: r.provider, customMetaName: r.customMetaName,
      value: r.value, enabled: !r.enabled, note: r.note,
    });
    if (!res.ok) { notify(res.error); return; }
    setRecords((prev) => prev.map((x) => (x.id === r.id ? res.record : x)));
    notify(res.record.enabled ? 'Record is now served on the public site.' : 'Record is no longer served.');
    router.refresh();
  });

  const removeRecord = (r: VerificationRecord) => start(async () => {
    if (!window.confirm(`Remove the ${r.metaName} verification record? The tag stops being served immediately.`)) return;
    const res = await deleteVerificationRecordAction(r.id);
    if (!res.ok) { notify(res.error); return; }
    setRecords((prev) => prev.filter((x) => x.id !== r.id));
    notify('Verification record removed.');
    router.refresh();
  });

  const checkRecord = (r: VerificationRecord) => start(async () => {
    const res = await checkVerificationRecordAction(r.id);
    if (!res.ok) { notify(res.error); return; }
    setRecords((prev) => prev.map((x) => (x.id === r.id ? res.record : x)));
    notify(res.record.lastCheck?.detail ?? 'Checked.');
  });

  // --- DNS form ---
  const [dnsProvider, setDnsProvider] = useState('google');
  const [dnsHost, setDnsHost] = useState('@');
  const [dnsValue, setDnsValue] = useState('');

  const saveDns = () => start(async () => {
    const res = await saveDnsRecordAction({ provider: dnsProvider, host: dnsHost, value: dnsValue });
    if (!res.ok) { notify(res.error); return; }
    setDns((prev) => [...prev.filter((r) => r.id !== res.record.id), res.record]);
    setDnsValue('');
    notify('DNS record noted. Add it at your DNS provider, then use Check.');
  });

  const checkDns = (r: DnsRecord) => start(async () => {
    const res = await checkDnsRecordAction(r.id);
    if (!res.ok) { notify(res.error); return; }
    setDns((prev) => prev.map((x) => (x.id === r.id ? res.record : x)));
    notify(res.record.lastCheck?.detail ?? 'Checked.');
  });

  const removeDns = (r: DnsRecord) => start(async () => {
    if (!window.confirm('Remove this DNS record from the tracked list? Your actual DNS is not changed.')) return;
    const res = await deleteDnsRecordAction(r.id);
    if (!res.ok) { notify(res.error); return; }
    setDns((prev) => prev.filter((x) => x.id !== r.id));
    notify('Removed from the tracked list. Your DNS was not changed.');
  });

  const saveTracking = () => start(async () => {
    const res = await updateTrackingAction(tracking);
    if (!res.ok) { notify(res.error); return; }
    setTracking(res.tracking);
    notify('Tracking settings saved.');
    router.refresh();
  });

  const loadHealth = () => start(async () => {
    const res = await getIndexingHealthAction();
    if (!res.ok) { notify(res.error); return; }
    setHealth(res.health);
  });

  const loadAudit = () => start(async () => {
    const res = await listVerificationAuditAction();
    if (!res.ok) { notify(res.error); return; }
    setAuditRows(res.rows);
  });

  const host = (() => { try { return new URL(config.siteUrl).hostname; } catch { return config.siteUrl; } })();

  return (
    <div className="space-y-6" data-testid="search-engine-panel">
      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-6 right-6 z-50 max-w-sm bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">
          {toast}
        </div>
      )}

      {/* ---------------- 1. Search Engine Verification ---------------- */}
      <section className={card} aria-labelledby="se-verification-h">
        <div>
          <h3 id="se-verification-h" className="font-serif font-bold text-stone-900 text-sm">1 · Search Engine Verification</h3>
          <p className="text-[11px] text-ink-muted mt-1">
            Proves to a search engine that this site is yours, by serving a meta tag in the public page head.
            It does not affect what readers see, and it does not by itself get pages indexed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="se-provider" className={labelCls}>Provider</label>
            <select id="se-provider" className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)}>
              {config.providers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              <option value="custom">Other (custom meta tag)</option>
            </select>
            <p className="text-[11px] text-ink-muted mt-1">
              {selected ? selected.where : 'Only verification tags are accepted — names that control crawling are refused.'}
            </p>
          </div>
          {provider === 'custom' ? (
            <div>
              <label htmlFor="se-custom-name" className={labelCls}>Meta tag name</label>
              <input id="se-custom-name" className={inputCls} value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. example-site-verification" />
            </div>
          ) : (
            <div>
              <span className={labelCls}>Meta tag name</span>
              <code className="block px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xs font-mono text-stone-700">{selected?.metaName}</code>
            </div>
          )}
          <div className="md:col-span-2">
            <label htmlFor="se-value" className={labelCls}>Verification token</label>
            <input id="se-value" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} placeholder={selected?.valueHint ?? 'The content value only'} />
            <p className="text-[11px] text-ink-muted mt-1">Paste the <strong>content</strong> value only — not the whole &lt;meta&gt; tag.</p>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="se-note" className={labelCls}>Note (optional)</label>
            <input id="se-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this exists, who added it" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" disabled={pending || !value.trim()} onClick={saveRecord} className={btnPrimary} data-testid="se-save-verification">
            {editingId ? 'Update record' : 'Add verification record'}
          </button>
          {editingId && <button type="button" onClick={resetForm} className={btnQuiet}>Cancel</button>}
        </div>

        <div className="border-t border-stone-100 pt-4">
          {records.length === 0 ? (
            <p className="text-[11px] font-mono text-stone-600">No verification records yet.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-stone-500">
                  <th className="py-2">Tag</th><th className="py-2">Token</th><th className="py-2">Served</th><th className="py-2">Public check</th><th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {records.map((r) => (
                  <tr key={r.id} data-testid="se-verification-row">
                    <td className="py-2 font-mono text-[11px] text-stone-800">{r.metaName}</td>
                    <td className="py-2 font-mono text-[11px] text-stone-500 max-w-[14rem] truncate" title={r.value}>{r.value}</td>
                    <td className="py-2">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold ${r.enabled ? 'bg-stone-900 text-[#D4A757]' : 'bg-stone-100 text-stone-600'}`}>
                        {r.enabled ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td className="py-2">
                      <StateBadge state={r.lastCheck?.state} at={r.lastCheck?.at} />
                      {r.lastCheck?.detail && <span className="block text-[10px] text-stone-500 mt-0.5 max-w-xs">{r.lastCheck.detail}</span>}
                    </td>
                    <td className="py-2 text-right space-x-2 whitespace-nowrap">
                      <button type="button" disabled={pending} onClick={() => checkRecord(r)} className={btnQuiet} data-testid="se-check">Check</button>
                      <button type="button" disabled={pending} onClick={() => toggleRecord(r)} className={btnQuiet}>{r.enabled ? 'Disable' : 'Enable'}</button>
                      <button type="button" disabled={pending} onClick={() => removeRecord(r)} className="px-3 py-1.5 text-xs text-stone-500 hover:text-rose-600">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[11px] text-ink-muted mt-3">
            <strong>Check</strong> fetches {config.siteUrl}/ and looks for the tag in the real response, so it reports what is
            actually being served rather than what was saved.
          </p>
        </div>
      </section>

      {/* ---------------- 2. DNS Verification ---------------- */}
      <section className={card} aria-labelledby="se-dns-h">
        <div>
          <h3 id="se-dns-h" className="font-serif font-bold text-stone-900 text-sm">2 · DNS Verification</h3>
          <p className="text-[11px] text-ink-muted mt-1">
            An alternative to the meta tag: a TXT record on <code className="font-mono">{host}</code>. Google verifies a whole
            domain this way, which covers every subdomain at once.
          </p>
        </div>

        <div className={`p-3 rounded-xs border text-[11px] ${config.cloudflare.configured ? 'bg-stone-50 border-stone-200 text-stone-700' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          <strong>{config.cloudflare.configured ? 'Cloudflare credentials present' : 'Manual DNS'}</strong> — {config.cloudflare.detail}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="se-dns-provider" className={labelCls}>Provider</label>
            <input id="se-dns-provider" className={inputCls} value={dnsProvider} onChange={(e) => setDnsProvider(e.target.value)} />
          </div>
          <div>
            <label htmlFor="se-dns-host" className={labelCls}>Host</label>
            <input id="se-dns-host" className={inputCls} value={dnsHost} onChange={(e) => setDnsHost(e.target.value)} placeholder="@" />
          </div>
          <div>
            <label htmlFor="se-dns-value" className={labelCls}>TXT value</label>
            <input id="se-dns-value" className={inputCls} value={dnsValue} onChange={(e) => setDnsValue(e.target.value)} placeholder="google-site-verification=..." />
          </div>
        </div>
        <button type="button" disabled={pending || !dnsValue.trim()} onClick={saveDns} className={btnPrimary} data-testid="se-save-dns">
          Track this DNS record
        </button>

        {dns.length > 0 && (
          <table className="w-full text-left text-xs border-t border-stone-100 pt-2">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-stone-500">
                <th className="py-2">Record to add</th><th className="py-2">Status</th><th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {dns.map((r) => (
                <tr key={r.id} data-testid="se-dns-row">
                  <td className="py-2">
                    <code className="block font-mono text-[11px] text-stone-800">
                      {r.host === '@' ? host : `${r.host}.${host}`} &nbsp; TXT &nbsp; {r.value}
                    </code>
                    <span className="text-[10px] text-stone-500">{r.provider}</span>
                  </td>
                  <td className="py-2">
                    <StateBadge state={r.lastCheck?.state} at={r.lastCheck?.at} />
                    {r.lastCheck?.detail && <span className="block text-[10px] text-stone-500 mt-0.5 max-w-sm">{r.lastCheck.detail}</span>}
                  </td>
                  <td className="py-2 text-right space-x-2 whitespace-nowrap">
                    <button type="button" disabled={pending} onClick={() => checkDns(r)} className={btnQuiet} data-testid="se-dns-check">Check public DNS</button>
                    <button type="button" disabled={pending} onClick={() => removeDns(r)} className="px-3 py-1.5 text-xs text-stone-500 hover:text-rose-600">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-ink-muted">
          Nothing here writes to DNS. Add the record at your DNS provider, then use <strong>Check public DNS</strong> — it asks a
          public resolver, so the answer is what the world sees, not a local cache.
        </p>
      </section>

      {/* ---------------- 3. Analytics & Tracking IDs ---------------- */}
      <section className={card} aria-labelledby="se-tracking-h">
        <div>
          <h3 id="se-tracking-h" className="font-serif font-bold text-stone-900 text-sm">3 · Analytics &amp; Tracking IDs</h3>
          <p className="text-[11px] text-ink-muted mt-1">
            Measurement, not verification and not indexing. Saving an id changes nothing on its own; switching it on loads
            that provider&rsquo;s script into every reader&rsquo;s browser.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="se-ga4" className={labelCls}>Google Analytics 4 measurement id</label>
            <input id="se-ga4" className={inputCls} value={tracking.ga4MeasurementId ?? ''} onChange={(e) => setTracking({ ...tracking, ga4MeasurementId: e.target.value.toUpperCase() })} placeholder="G-XXXXXXXXXX" />
            <label className="flex items-center gap-2 text-xs mt-2">
              <input type="checkbox" className="accent-[#0F1115]" checked={tracking.ga4Enabled} onChange={(e) => setTracking({ ...tracking, ga4Enabled: e.target.checked })} />
              <span>Load GA4 on the public site</span>
            </label>
          </div>
          <div>
            <label htmlFor="se-gtm" className={labelCls}>Google Tag Manager container id</label>
            <input id="se-gtm" className={inputCls} value={tracking.gtmContainerId ?? ''} onChange={(e) => setTracking({ ...tracking, gtmContainerId: e.target.value.toUpperCase() })} placeholder="GTM-XXXXXXX" />
            <label className="flex items-center gap-2 text-xs mt-2">
              <input type="checkbox" className="accent-[#0F1115]" checked={tracking.gtmEnabled} onChange={(e) => setTracking({ ...tracking, gtmEnabled: e.target.checked })} />
              <span>Load Tag Manager on the public site</span>
            </label>
          </div>
        </div>
        <button type="button" disabled={pending} onClick={saveTracking} className={btnPrimary} data-testid="se-save-tracking">Save tracking settings</button>
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xs p-2">
          Consent is not handled here. If this site must ask readers before tracking them, that has to be in place before
          either of these is switched on.
        </p>
      </section>

      {/* ---------------- 4. Search Console connections ---------------- */}
      <section className={card} aria-labelledby="se-api-h">
        <div>
          <h3 id="se-api-h" className="font-serif font-bold text-stone-900 text-sm">4 · Search Console API connection</h3>
          <p className="text-[11px] text-ink-muted mt-1">
            Reading performance data (clicks, impressions, position) from Search Console is a separate thing from owning the
            site: it needs a service account with access to the verified property.
          </p>
        </div>
        <p className="text-[11px] text-ink-muted">
          The connection is configured with server environment variables, not from this screen, because it involves a private
          credential that must never pass through a browser. Its live status is shown on{' '}
          <Link href="/admin/analytics/" className="text-[#8B5E3C] underline">Analytics &amp; Search</Link>.
        </p>
        <p className="text-[11px] text-ink-muted">
          There is no &ldquo;submit to Google&rdquo; or &ldquo;index now&rdquo; button here on purpose: nothing this site can do makes a search engine
          index a page, and a control that implied otherwise would be a lie. What helps is a reachable sitemap and pages worth
          indexing, both of which are reported below.
        </p>
      </section>

      {/* ---------------- 5 & 6. Sitemap, robots and indexing health ---------------- */}
      <section className={card} aria-labelledby="se-health-h">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="se-health-h" className="font-serif font-bold text-stone-900 text-sm">5 · Sitemap, robots &amp; indexing health</h3>
            <p className="text-[11px] text-ink-muted mt-1">
              Diagnostics only. <code className="font-mono">robots.txt</code> is generated in code and cannot be edited here —
              one wrong save could remove the whole site from every search engine, and no routine task needs that.
            </p>
          </div>
          <button type="button" disabled={pending} onClick={loadHealth} className={btnQuiet} data-testid="se-run-health">Run checks</button>
        </div>

        {!health ? (
          <p className="text-[11px] font-mono text-stone-600">Not checked yet.</p>
        ) : (
          <div className="space-y-3" data-testid="se-health">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-stone-50 border border-stone-200 rounded-xs p-3">
                <div className="text-[10px] uppercase tracking-wider text-stone-500">robots.txt</div>
                <div className="font-mono text-sm text-stone-900">{health.robots.state === 'ok' ? `HTTP ${health.robots.status}` : 'Unreachable'}</div>
                {health.robots.state === 'ok' && (
                  <ul className="mt-1 space-y-0.5 text-[11px]">
                    <li className={health.robots.allowsIndexing ? 'text-emerald-700' : 'text-rose-700'}>
                      {health.robots.allowsIndexing ? 'Does not block the site' : 'BLOCKS the whole site'}
                    </li>
                    <li className={health.robots.declaresSitemap ? 'text-emerald-700' : 'text-amber-700'}>
                      {health.robots.declaresSitemap ? 'Declares the sitemap' : 'No sitemap line'}
                    </li>
                  </ul>
                )}
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-xs p-3">
                <div className="text-[10px] uppercase tracking-wider text-stone-500">sitemap.xml</div>
                <div className="font-mono text-sm text-stone-900">{health.sitemap.state === 'ok' ? `${health.sitemap.urlCount ?? 0} URLs` : 'Unreachable'}</div>
                <a href={health.sitemapUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#8B5E3C] underline">Open</a>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-xs p-3">
                <div className="text-[10px] uppercase tracking-wider text-stone-500">Content</div>
                <ul className="text-[11px] space-y-0.5 mt-1">
                  <li>{health.publishedArticles} published article(s)</li>
                  <li>{health.noindexArticles} article(s) set to noindex</li>
                  <li>{health.noindexEntities} landing page(s) set to noindex</li>
                </ul>
              </div>
            </div>
            {health.robots.state === 'ok' && (
              <details>
                <summary className="text-[11px] cursor-pointer text-stone-600">Show the served robots.txt</summary>
                <pre className="mt-2 p-3 bg-stone-900 text-stone-100 text-[11px] font-mono rounded-xs overflow-x-auto">{health.robots.body}</pre>
              </details>
            )}
            <p className="text-[11px] text-ink-muted">
              Per-page indexing stays where it is set: an article&rsquo;s robots directive in the article editor, and a landing
              page&rsquo;s noindex in <Link href="/admin/seo/" className="text-[#8B5E3C] underline">SEO Intelligence</Link>.
            </p>
          </div>
        )}
      </section>

      {/* ---------------- Audit history ---------------- */}
      <section className={card} aria-labelledby="se-audit-h">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="se-audit-h" className="font-serif font-bold text-stone-900 text-sm">6 · Change history</h3>
            <p className="text-[11px] text-ink-muted mt-1">Every change and check on this screen is recorded against the signed-in administrator.</p>
          </div>
          <button type="button" disabled={pending} onClick={loadAudit} className={btnQuiet} data-testid="se-load-audit">Load history</button>
        </div>
        {auditRows.length === 0 ? (
          <p className="text-[11px] font-mono text-stone-600">Not loaded.</p>
        ) : (
          <table className="w-full text-left text-xs" data-testid="se-audit-table">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-stone-500">
                <th className="py-2">When</th><th className="py-2">Who</th><th className="py-2">Action</th><th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {auditRows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 font-mono text-[11px] text-stone-500">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="py-2">{r.actorName ?? '—'}</td>
                  <td className="py-2 font-mono text-[11px]">{r.action}</td>
                  <td className="py-2 text-stone-600">{r.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

export default AdminSearchEnginePanel;

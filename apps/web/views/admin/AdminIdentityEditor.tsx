'use client';

import React, { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteConfigRow, SiteIdentityConfig } from '@/lib/cms/siteConfigService';
import { MediaPickerModal, type SelectedMediaData } from '@/components/admin/editor/MediaPickerModal';
import {
  saveSiteConfigDraftAction,
  publishSiteConfigAction,
  resetSiteConfigDraftAction,
} from '@/app/admin/site-config-actions';

/**
 * Site Identity & Branding (Stage 06-R, R-06).
 *
 * Draft → publish, through the SAME generic SiteConfig actions the Footer and
 * Appearance editors use, so RBAC (`system.config`), CSRF, audit logging,
 * server-side zod validation and the draft/published split are inherited rather
 * than reimplemented. Media comes from the existing Media Library picker; there
 * is no second upload path.
 *
 * The browser-side checks below are convenience only. `SiteIdentityConfigSchema`
 * re-validates every field on the server, which is what actually enforces the
 * same-origin media rule.
 */

const inp = 'w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-1';

/** Mirrors the server rule in `siteConfigService`. */
const isSiteMediaUrl = (v: string) =>
  v === '' || (/^\/(api\/media|media)\/[A-Za-z0-9._\-/]+$/.test(v) && !v.split('/').includes('..'));

type Slot = 'primary' | 'light' | 'dark';

interface Props {
  config: SiteConfigRow | undefined;
  canManage: boolean;
}

export const AdminIdentityEditor: React.FC<Props> = ({ config, canManage }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<Slot | null>(null);

  const flash = (m: string) => { setError(null); setNotice(m); setTimeout(() => setNotice(null), 6000); };
  const fail = (m: string) => { setNotice(null); setError(m); };

  const initial = (config?.draft ?? {}) as SiteIdentityConfig;
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? '');
  const [logoMediaId, setLogoMediaId] = useState(initial.logoMediaId ?? '');
  const [logoAlt, setLogoAlt] = useState(initial.logoAlt ?? '');
  const [lightUrl, setLightUrl] = useState(initial.logoLightUrl ?? '');
  const [lightMediaId, setLightMediaId] = useState(initial.logoLightMediaId ?? '');
  const [darkUrl, setDarkUrl] = useState(initial.logoDarkUrl ?? '');
  const [darkMediaId, setDarkMediaId] = useState(initial.logoDarkMediaId ?? '');
  const [maxHeight, setMaxHeight] = useState(initial.logoMaxHeight ?? 40);

  const gather = useCallback((): SiteIdentityConfig => ({
    logoUrl: logoUrl || undefined,
    logoMediaId: logoMediaId || undefined,
    logoAlt: logoAlt || undefined,
    logoLightUrl: lightUrl || undefined,
    logoLightMediaId: lightMediaId || undefined,
    logoDarkUrl: darkUrl || undefined,
    logoDarkMediaId: darkMediaId || undefined,
    logoMaxHeight: maxHeight,
  }), [logoUrl, logoMediaId, logoAlt, lightUrl, lightMediaId, darkUrl, darkMediaId, maxHeight]);

  /** Blocks the obvious mistakes before a round trip; the server decides. */
  const localProblem = (): string | null => {
    for (const [label, v] of [['Primary logo', logoUrl], ['Light override', lightUrl], ['Dark override', darkUrl]] as const) {
      if (!isSiteMediaUrl(v)) return `${label} must be a Media Library file on this site (a /api/media/… path).`;
    }
    if (logoUrl && !logoAlt.trim()) return 'Give the logo alternative text — it is the site name for screen readers.';
    return null;
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    const problem = localProblem();
    if (problem) return fail(problem);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) { flash(okMsg); router.refresh(); } else fail(r.error || 'Error');
    });
  };

  const saveDraft = () => run(() => saveSiteConfigDraftAction('identity', gather()), 'Draft saved.');
  const publish = () => run(async () => {
    const saved = await saveSiteConfigDraftAction('identity', gather());
    if (!saved.ok) return saved;
    return publishSiteConfigAction('identity');
  }, 'Published — branding is live.');

  const revert = () => {
    if (!window.confirm('Discard draft and revert to the published branding?')) return;
    startTransition(async () => {
      const r = await resetSiteConfigDraftAction('identity');
      if (r.ok) { flash('Reverted.'); router.refresh(); } else fail(r.error || 'Error');
    });
  };

  const setSlot = (slot: Slot, url: string, mediaId: string) => {
    if (slot === 'primary') { setLogoUrl(url); setLogoMediaId(mediaId); }
    else if (slot === 'light') { setLightUrl(url); setLightMediaId(mediaId); }
    else { setDarkUrl(url); setDarkMediaId(mediaId); }
  };

  const onPicked = (media: SelectedMediaData) => {
    const slot = picking;
    setPicking(null);
    if (!slot) return;
    if (!isSiteMediaUrl(media.url)) {
      return fail('That file is not served from this site’s Media Library, so it cannot be used as a logo.');
    }
    setSlot(slot, media.url, (media as { id?: string }).id ?? '');
    if (slot === 'primary' && !logoAlt.trim()) setLogoAlt(media.altText?.trim() || 'NFRGuide');
  };

  /** Removing a logo restores the wordmark — it never leaves a broken reference. */
  const clearSlot = (slot: Slot) => setSlot(slot, '', '');

  const resetAll = () => {
    if (!window.confirm('Reset to the built-in NFRGuide wordmark? This clears every logo.')) return;
    setLogoUrl(''); setLogoMediaId(''); setLogoAlt('');
    setLightUrl(''); setLightMediaId(''); setDarkUrl(''); setDarkMediaId('');
    setMaxHeight(40);
  };

  const Preview: React.FC<{ url: string; dark?: boolean }> = ({ url, dark }) => (
    <div className={`mt-2 p-4 rounded border flex items-center justify-center min-h-[72px] ${dark ? 'bg-[#0F1115] border-white/10' : 'bg-white border-stone-200'}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin preview of a height-bounded brand mark
        <img src={url} alt="Logo preview" style={{ maxHeight: `${maxHeight}px` }} className="w-auto h-auto object-contain" />
      ) : (
        <span className={`font-serif text-2xl font-extrabold uppercase tracking-tight ${dark ? 'text-white' : 'text-[#0F1115]'}`}>
          NFR<span className="text-[#D4A757]">Guide</span>
        </span>
      )}
    </div>
  );

  const SlotEditor: React.FC<{ slot: Slot; title: string; url: string; help: string; dark?: boolean }> = ({ slot, title, url, help, dark }) => (
    <div className="bg-white border border-stone-200 rounded p-4">
      <h3 className="text-xs font-bold uppercase text-stone-600">{title}</h3>
      <p className="text-[11px] text-stone-500 mt-1">{help}</p>
      <Preview url={url} dark={dark} />
      {canManage && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={() => setPicking(slot)} disabled={isPending} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">
            {url ? 'Replace…' : 'Choose from Media Library…'}
          </button>
          {url && (
            <button onClick={() => clearSlot(slot)} disabled={isPending} className="px-3 py-1.5 text-xs text-red-700 border border-red-200 rounded disabled:opacity-50">
              Remove
            </button>
          )}
        </div>
      )}
      {url && <p className="mt-2 text-[10px] font-mono text-stone-400 break-all">{url}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {notice && <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded">{notice}</div>}
      {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded">{error}</div>}
      {!canManage && <div className="p-3 bg-stone-50 border border-stone-200 text-stone-600 text-xs rounded">Read-only — you do not have the system.config permission.</div>}

      {canManage && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-stone-500">
            One logo for the whole site: public header and footer, the admin sidebar and the sign-in screens.
            Leave everything empty to keep the built-in NFRGuide wordmark.
          </p>
          <div className="flex gap-2">
            <button onClick={resetAll} disabled={isPending} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">Reset to wordmark</button>
            <button onClick={revert} disabled={isPending} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">Revert to Published</button>
            <button onClick={saveDraft} disabled={isPending} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">Save Draft</button>
            <button onClick={publish} disabled={isPending} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded disabled:opacity-50">Publish</button>
          </div>
        </div>
      )}

      {config?.publishedAt && (
        <div className="text-[10px] text-stone-400">Last published: {new Date(config.publishedAt).toLocaleString()}</div>
      )}

      <SlotEditor
        slot="primary"
        title="Primary logo"
        url={logoUrl}
        help="Used everywhere unless a theme override below applies. A primary logo on its own is enough."
      />

      <div className="bg-white border border-stone-200 rounded p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase text-stone-600">Logo details</h3>
        <div>
          <label className={lbl} htmlFor="logo-alt">Alternative text</label>
          <input id="logo-alt" value={logoAlt} onChange={(e) => setLogoAlt(e.target.value)} className={inp} placeholder="NFRGuide" disabled={!canManage} />
          <p className="text-[10px] text-stone-400 mt-1">Read aloud in place of the logo. A logo is never decorative, so this should name the publication.</p>
        </div>
        <div>
          <label className={lbl} htmlFor="logo-h">Maximum height (16–160px)</label>
          <input
            id="logo-h" type="number" min={16} max={160} value={maxHeight} disabled={!canManage}
            onChange={(e) => setMaxHeight(Math.min(160, Math.max(16, Number(e.target.value) || 40)))}
            className={inp}
          />
          <p className="text-[10px] text-stone-400 mt-1">Width scales automatically — the logo is never stretched or cropped.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SlotEditor slot="light" title="Light-background override (optional)" url={lightUrl} help="Only if the primary logo is hard to read on light surfaces." />
        <SlotEditor slot="dark" title="Dark-background override (optional)" url={darkUrl} help="Used by the footer, the admin sidebar and the sign-in screens." dark />
      </div>

      <p className="text-[11px] text-stone-500">
        The favicon is configured separately and is never replaced by this logo.
      </p>

      <MediaPickerModal isOpen={picking !== null} onClose={() => setPicking(null)} onSelect={onPicked} />
    </div>
  );
};

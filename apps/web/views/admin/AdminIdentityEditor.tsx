'use client';

import React, { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteConfigRow, SiteIdentityConfig } from '@/lib/cms/siteConfigService';
import { MediaPickerModal, type SelectedMediaData } from '@/components/admin/editor/MediaPickerModal';
import {
  saveSiteConfigDraftAction,
  publishSiteConfigAction,
  resetSiteConfigDraftAction,
  prepareBrandingUploadAction,
} from '@/app/admin/site-config-actions';
import { isSafeLogoUrl } from '@/lib/cms/brandingShared';

/**
 * Site Identity & Branding (Stage 06-R, R-06).
 *
 * Draft → publish, through the SAME generic SiteConfig actions the Footer and
 * Appearance editors use, so RBAC (`system.config`), CSRF, audit logging,
 * server-side validation and the draft/published split are inherited.
 *
 * The browser-side checks below are convenience only. `SiteIdentityConfigSchema`
 * re-validates every field on the server, which is what actually enforces the
 * same-origin media rule.
 */

const inp = 'w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-1';

/** Mirrors the server rule in `siteConfigService`. */
const isSiteMediaUrl = (v: string) =>
  v === '' || isSafeLogoUrl(v);

type Slot = 'primary' | 'light' | 'dark' | 'favicon';

interface Props {
  config: SiteConfigRow | undefined;
  canManage: boolean;
  singleLogo?: boolean;
}

export const AdminIdentityEditor: React.FC<Props> = ({ config, canManage, singleLogo = false }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [uploading, setUploading] = useState<Slot | null>(null);
  const [uploadRights, setUploadRights] = useState(false);
  const busy = isPending || uploading !== null;

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
  const [faviconUrl, setFaviconUrl] = useState(initial.faviconUrl ?? '');
  const [faviconMediaId, setFaviconMediaId] = useState(initial.faviconMediaId ?? '');

  const gather = useCallback((): SiteIdentityConfig => ({
    logoUrl: logoUrl || undefined,
    logoMediaId: logoMediaId || undefined,
    logoAlt: logoAlt || undefined,
    logoLightUrl: lightUrl || undefined,
    logoLightMediaId: lightMediaId || undefined,
    logoDarkUrl: darkUrl || undefined,
    logoDarkMediaId: darkMediaId || undefined,
    logoMaxHeight: maxHeight,
    faviconUrl: faviconUrl || undefined,
    faviconMediaId: faviconMediaId || undefined,
  }), [logoUrl, logoMediaId, logoAlt, lightUrl, lightMediaId, darkUrl, darkMediaId, maxHeight, faviconUrl, faviconMediaId]);

  /** Blocks the obvious mistakes before a round trip; the server decides. */
  const localProblem = (): string | null => {
    for (const [label, v] of [['Primary logo', logoUrl], ['Light override', lightUrl], ['Dark override', darkUrl], ['Favicon', faviconUrl]] as const) {
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
      if (!r.ok) return fail(r.error || 'Error');
      const published = (config?.published ?? {}) as SiteIdentityConfig;
      setLogoUrl(published.logoUrl ?? ''); setLogoMediaId(published.logoMediaId ?? ''); setLogoAlt(published.logoAlt ?? '');
      setLightUrl(published.logoLightUrl ?? ''); setLightMediaId(published.logoLightMediaId ?? '');
      setDarkUrl(published.logoDarkUrl ?? ''); setDarkMediaId(published.logoDarkMediaId ?? '');
      setFaviconUrl(published.faviconUrl ?? ''); setFaviconMediaId(published.faviconMediaId ?? '');
      setMaxHeight(published.logoMaxHeight ?? 40);
      flash('Reverted.');
      router.refresh();
    });
  };

  const setSlot = (slot: Slot, url: string, mediaId: string) => {
    if (slot === 'primary') {
      setLogoUrl(url); setLogoMediaId(mediaId);
      if (singleLogo) {
        setLightUrl(''); setLightMediaId(''); setDarkUrl(''); setDarkMediaId('');
      }
    }
    else if (slot === 'light') { setLightUrl(url); setLightMediaId(mediaId); }
    else if (slot === 'dark') { setDarkUrl(url); setDarkMediaId(mediaId); }
    else { setFaviconUrl(url); setFaviconMediaId(mediaId); }
  };

  const upload = async (slot: Slot, file: File) => {
    if (!uploadRights || busy) return;
    setUploading(slot);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/admin/media/upload/', { method: 'POST', body: form });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok || typeof result.id !== 'string') return fail(result?.error || 'Image upload failed.');
      const asset = await prepareBrandingUploadAction(result.id, uploadRights);
      if (!asset.ok) return fail(asset.error);
      setSlot(slot, asset.url, result.id);
      if (slot === 'primary' && !logoAlt.trim()) setLogoAlt('NFRGuide');
      flash('Image uploaded. Publish to apply it to the site.');
    } catch {
      fail('Image upload failed. Try again.');
    } finally {
      setUploading(null);
    }
  };

  const onPicked = (media: SelectedMediaData) => {
    const slot = picking;
    setPicking(null);
    if (!slot) return;
    if (!media.id || !isSafeLogoUrl(media.url)) {
      return fail('Choose an image from this site’s Media Library.');
    }
    setSlot(slot, media.url, media.id);
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

  const renderSlot = (slot: Slot, title: string, url: string, help: string, dark = false) => (
    <div className="bg-white border border-stone-200 rounded p-4">
      <h3 className="text-xs font-bold uppercase text-stone-600">{title}</h3>
      <p className="text-[11px] text-stone-500 mt-1">{help}</p>
      <p className="mt-1 text-[11px] text-stone-600">
        {slot === 'favicon'
          ? 'Recommended: 64 × 64 px (square PNG).'
          : 'Recommended: 320 × 100 px (wide PNG with a transparent background).'}
        {' Accepted formats: PNG, JPEG, WebP.'}
      </p>
      {slot === 'favicon' ? (
        <div className="mt-2 flex h-12 items-center gap-2 rounded border border-stone-200 px-3 text-xs text-stone-500">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin favicon preview
            <img src={url} alt="Favicon preview" className="size-6 object-contain" />
          ) : <span>No custom favicon</span>}
        </div>
      ) : <Preview url={url} dark={dark} />}
      {canManage && (
        <div className="flex flex-wrap gap-2 mt-3">
          <label className={`rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600 focus-within:ring-2 focus-within:ring-[#8B5E3C] ${!uploadRights || busy ? 'opacity-50' : 'cursor-pointer'}`}>
            {uploading === slot ? 'Uploading…' : slot === 'favicon' ? 'Upload favicon' : 'Upload logo'}
            <input
              type="file"
              aria-label={`Upload ${title.toLowerCase()}`}
              accept="image/png,image/jpeg,image/webp"
              disabled={!uploadRights || busy}
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void upload(slot, file);
              }}
            />
          </label>
          <button type="button" onClick={() => setPicking(slot)} disabled={busy} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">
            Choose from Media Library…
          </button>
          {url && (
            <button type="button" onClick={() => clearSlot(slot)} disabled={busy} className="px-3 py-1.5 text-xs text-red-700 border border-red-200 rounded disabled:opacity-50">
              Remove
            </button>
          )}
        </div>
      )}
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
            Publish to update the public site and CMS. Clear the logo to use the built-in wordmark.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={resetAll} disabled={busy} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">Reset to wordmark</button>
            <button onClick={revert} disabled={busy || !config} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">Revert to Published</button>
            <button onClick={saveDraft} disabled={busy} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">Save Draft</button>
            <button onClick={publish} disabled={busy} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded disabled:opacity-50">Publish</button>
          </div>
        </div>
      )}

      {config?.publishedAt && (
        <div className="text-[10px] text-stone-400">Last published: {new Date(config.publishedAt).toLocaleString()}</div>
      )}

      {canManage && (
        <label className="flex items-start gap-2 text-xs text-stone-700">
          <input type="checkbox" checked={uploadRights} onChange={(event) => setUploadRights(event.target.checked)} disabled={busy} />
          I have permission to make the images I upload publicly available.
        </label>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {renderSlot('primary', 'Primary logo', logoUrl, singleLogo
          ? 'Used throughout the site and CMS. Choosing a new logo here replaces any light and dark overrides.'
          : 'Used throughout the site and CMS unless a theme override applies.')}
        {renderSlot('favicon', 'Favicon', faviconUrl, 'Shown in browser tabs.')}
      </div>

      <div className="bg-white border border-stone-200 rounded p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase text-stone-600">Logo details</h3>
        <div>
          <label className={lbl} htmlFor="logo-alt">Alternative text</label>
          <input id="logo-alt" value={logoAlt} onChange={(e) => setLogoAlt(e.target.value)} className={inp} placeholder="NFRGuide" disabled={!canManage || busy} />
          <p className="text-[10px] text-stone-400 mt-1">Read aloud in place of the logo. A logo is never decorative, so this should name the publication.</p>
        </div>
        <div>
          <label className={lbl} htmlFor="logo-h">Maximum height (16–160px)</label>
          <input
            id="logo-h" type="number" min={16} max={160} value={maxHeight} disabled={!canManage || busy}
            onChange={(e) => setMaxHeight(Math.min(160, Math.max(16, Number(e.target.value) || 40)))}
            className={inp}
          />
          <p className="text-[10px] text-stone-400 mt-1">Width scales automatically — the logo is never stretched or cropped.</p>
        </div>
      </div>

      {!singleLogo && (
        <div className="grid gap-4 md:grid-cols-2">
          {renderSlot('light', 'Light-background override', lightUrl, 'Use when the primary logo is hard to read on light surfaces.')}
          {renderSlot('dark', 'Dark-background override', darkUrl, 'Use when the primary logo is hard to read on dark surfaces.', true)}
        </div>
      )}

      <p className="text-[11px] text-stone-500">
        The favicon is configured separately and is never replaced by this logo.
      </p>

      <MediaPickerModal isOpen={picking !== null} onClose={() => setPicking(null)} onSelect={onPicked} publishedOnly />
    </div>
  );
};

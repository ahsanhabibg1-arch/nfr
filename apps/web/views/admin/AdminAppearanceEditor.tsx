'use client';

import React, { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteConfigRow } from '@/lib/cms/siteConfigService';
import type { AppearanceConfig, IntroBannerStyle } from '@/lib/cms/siteConfigService';

const INTRO_BANNER_STYLES: { id: IntroBannerStyle; label: string; description: string }[] = [
  { id: 'editorial', label: 'Editorial', description: 'Classic editorial hero with overlay text' },
  { id: 'stadium', label: 'Stadium', description: 'Full-bleed arena atmosphere with bold headline' },
  { id: 'bottom-caption', label: 'Bottom Caption', description: 'Image fills the frame, text at bottom edge' },
  { id: 'right-focus', label: 'Right Focus', description: 'Text left, image cropped right' },
  { id: 'glass', label: 'Glass', description: 'Frosted glass card overlaying the image' },
  { id: 'framed', label: 'Framed', description: 'Inset image with decorative border' },
  { id: 'split', label: 'Split', description: '50/50 text-image horizontal split' },
  { id: 'spotlight', label: 'Spotlight', description: 'Centered text with vignette' },
  { id: 'amber', label: 'Amber', description: 'NFRGuide gold accent treatment' },
  { id: 'minimal', label: 'Minimal', description: 'Clean type-forward hero, subtle image' },
];
import { saveSiteConfigDraftAction, publishSiteConfigAction, resetSiteConfigDraftAction } from '@/app/admin/site-config-actions';

const inp = 'w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-1';

interface Props { config: SiteConfigRow | undefined; canManage: boolean; }

export const AdminAppearanceEditor: React.FC<Props> = ({ config, canManage }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 6000); };

  const initial = (config?.draft ?? {}) as AppearanceConfig;
  const [style, setStyle] = useState<IntroBannerStyle>(initial.introBannerStyle ?? 'editorial');
  const [imageUrl, setImageUrl] = useState(initial.introBannerImageUrl ?? '');
  const [imageAlt, setImageAlt] = useState(initial.introBannerImageAlt ?? '');
  const [eyebrow, setEyebrow] = useState(initial.introBannerEyebrow ?? '');
  const [headline, setHeadline] = useState(initial.introBannerHeadline ?? '');
  const [description, setDescription] = useState(initial.introBannerDescription ?? '');
  const [ctaLabel, setCtaLabel] = useState(initial.introBannerCtaLabel ?? '');
  const [ctaUrl, setCtaUrl] = useState(initial.introBannerCtaUrl ?? '');
  const [ctaSecLabel, setCtaSecLabel] = useState(initial.introBannerCtaSecondaryLabel ?? '');
  const [ctaSecUrl, setCtaSecUrl] = useState(initial.introBannerCtaSecondaryUrl ?? '');
  const [focalX, setFocalX] = useState(initial.introBannerFocalX ?? 50);
  const [focalY, setFocalY] = useState(initial.introBannerFocalY ?? 50);
  const [mobileFocalX, setMobileFocalX] = useState(initial.introBannerMobileFocalX ?? 50);
  const [mobileFocalY, setMobileFocalY] = useState(initial.introBannerMobileFocalY ?? 50);
  const [zoom, setZoom] = useState(initial.introBannerZoom ?? 100);
  const [overlayDarkness, setOverlayDarkness] = useState(initial.introBannerOverlayDarkness ?? 40);
  const [desktopHeight, setDesktopHeight] = useState(initial.introBannerDesktopHeight ?? '70vh');
  const [mobileHeight, setMobileHeight] = useState(initial.introBannerMobileHeight ?? '50vh');
  const [textAlign, setTextAlign] = useState(initial.introBannerTextAlign ?? 'left');
  const [verticalAlign, setVerticalAlign] = useState(initial.introBannerVerticalAlign ?? 'center');
  const [fullWidth, setFullWidth] = useState(initial.introBannerFullWidth ?? false);

  const gather = useCallback((): AppearanceConfig => ({
    introBannerStyle: style,
    introBannerImageUrl: imageUrl || undefined,
    introBannerImageAlt: imageAlt || undefined,
    introBannerEyebrow: eyebrow || undefined,
    introBannerHeadline: headline || undefined,
    introBannerDescription: description || undefined,
    introBannerCtaLabel: ctaLabel || undefined,
    introBannerCtaUrl: ctaUrl || undefined,
    introBannerCtaSecondaryLabel: ctaSecLabel || undefined,
    introBannerCtaSecondaryUrl: ctaSecUrl || undefined,
    introBannerFocalX: focalX,
    introBannerFocalY: focalY,
    introBannerMobileFocalX: mobileFocalX,
    introBannerMobileFocalY: mobileFocalY,
    introBannerZoom: zoom,
    introBannerOverlayDarkness: overlayDarkness,
    introBannerDesktopHeight: desktopHeight || undefined,
    introBannerMobileHeight: mobileHeight || undefined,
    introBannerTextAlign: textAlign as AppearanceConfig['introBannerTextAlign'],
    introBannerVerticalAlign: verticalAlign as AppearanceConfig['introBannerVerticalAlign'],
    introBannerFullWidth: fullWidth,
  }), [style, imageUrl, imageAlt, eyebrow, headline, description, ctaLabel, ctaUrl, ctaSecLabel, ctaSecUrl, focalX, focalY, mobileFocalX, mobileFocalY, zoom, overlayDarkness, desktopHeight, mobileHeight, textAlign, verticalAlign, fullWidth]);

  const saveDraft = () => startTransition(async () => {
    const r = await saveSiteConfigDraftAction('appearance', gather());
    flash(r.ok ? 'Draft saved.' : r.error || 'Error');
    if (r.ok) router.refresh();
  });

  const publish = () => startTransition(async () => {
    await saveSiteConfigDraftAction('appearance', gather());
    const r = await publishSiteConfigAction('appearance');
    flash(r.ok ? 'Published!' : r.error || 'Error');
    if (r.ok) router.refresh();
  });

  const reset = () => {
    if (!window.confirm('Discard draft and revert to published version?')) return;
    startTransition(async () => {
      const r = await resetSiteConfigDraftAction('appearance');
      flash(r.ok ? 'Reverted.' : r.error || 'Error');
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded">{notice}</div>}
      {!canManage && <div className="p-3 bg-stone-50 border border-stone-200 text-stone-600 text-xs rounded">Read-only.</div>}

      {canManage && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">Configure the homepage intro banner style and content.</p>
          <div className="flex gap-2">
            <button onClick={reset} disabled={isPending} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">Revert to Published</button>
            <button onClick={saveDraft} disabled={isPending} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">Save Draft</button>
            <button onClick={publish} disabled={isPending} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded disabled:opacity-50">Publish</button>
          </div>
        </div>
      )}

      {config?.publishedAt && <div className="text-[10px] text-stone-400">Last published: {new Date(config.publishedAt).toLocaleString()}</div>}

      <div className="bg-white border border-stone-200 rounded p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase text-stone-600">Banner Style</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {INTRO_BANNER_STYLES.map((s) => (
            <button key={s.id} onClick={() => setStyle(s.id)} className={`text-left p-2.5 rounded border-2 transition-colors ${style === s.id ? 'border-[#D4A757] bg-[#D4A757]/5' : 'border-stone-200 hover:border-stone-300'}`}>
              <div className="text-[11px] font-semibold text-stone-900">{s.label}</div>
              <div className="text-[9px] text-stone-500 mt-0.5 leading-tight">{s.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase text-stone-600">Banner Content</h3>
        <div><label className={lbl}>Eyebrow</label><input value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} className={inp} placeholder="Small text above headline" /></div>
        <div><label className={lbl}>Headline</label><input value={headline} onChange={(e) => setHeadline(e.target.value)} className={inp} placeholder="Main banner headline" /></div>
        <div><label className={lbl}>Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inp} rows={2} placeholder="Supporting text" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Primary CTA Label</label><input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Primary CTA URL</label><input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} className={inp} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Secondary CTA Label</label><input value={ctaSecLabel} onChange={(e) => setCtaSecLabel(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Secondary CTA URL</label><input value={ctaSecUrl} onChange={(e) => setCtaSecUrl(e.target.value)} className={inp} /></div>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase text-stone-600">Image</h3>
        <div><label className={lbl}>Image URL</label><input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inp} placeholder="/images/hero.jpg or https://..." /></div>
        <div><label className={lbl}>Image Alt Text</label><input value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} className={inp} /></div>
        {imageUrl && (
          <div className="relative w-full aspect-[21/9] rounded overflow-hidden border border-stone-200 bg-stone-100">
            <img src={imageUrl} alt={imageAlt} className="w-full h-full object-cover" style={{ objectPosition: `${focalX}% ${focalY}%`, transform: `scale(${zoom / 100})` }} />
            <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: overlayDarkness / 100 }} />
          </div>
        )}
      </div>

      <div className="bg-white border border-stone-200 rounded p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase text-stone-600">Focal Point & Effects</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className={lbl}>Desktop Focal X (%)</label><input type="range" min={0} max={100} value={focalX} onChange={(e) => setFocalX(Number(e.target.value))} className="w-full" /><div className="text-center text-[10px] text-stone-500">{focalX}%</div></div>
          <div><label className={lbl}>Desktop Focal Y (%)</label><input type="range" min={0} max={100} value={focalY} onChange={(e) => setFocalY(Number(e.target.value))} className="w-full" /><div className="text-center text-[10px] text-stone-500">{focalY}%</div></div>
          <div><label className={lbl}>Mobile Focal X (%)</label><input type="range" min={0} max={100} value={mobileFocalX} onChange={(e) => setMobileFocalX(Number(e.target.value))} className="w-full" /><div className="text-center text-[10px] text-stone-500">{mobileFocalX}%</div></div>
          <div><label className={lbl}>Mobile Focal Y (%)</label><input type="range" min={0} max={100} value={mobileFocalY} onChange={(e) => setMobileFocalY(Number(e.target.value))} className="w-full" /><div className="text-center text-[10px] text-stone-500">{mobileFocalY}%</div></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className={lbl}>Zoom (%)</label><input type="range" min={100} max={200} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" /><div className="text-center text-[10px] text-stone-500">{zoom}%</div></div>
          <div><label className={lbl}>Overlay Darkness (%)</label><input type="range" min={0} max={100} value={overlayDarkness} onChange={(e) => setOverlayDarkness(Number(e.target.value))} className="w-full" /><div className="text-center text-[10px] text-stone-500">{overlayDarkness}%</div></div>
          <div><label className={lbl}>Desktop Height</label><input value={desktopHeight} onChange={(e) => setDesktopHeight(e.target.value)} className={inp} placeholder="70vh" /></div>
          <div><label className={lbl}>Mobile Height</label><input value={mobileHeight} onChange={(e) => setMobileHeight(e.target.value)} className={inp} placeholder="50vh" /></div>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase text-stone-600">Layout</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={lbl}>Text Align</label>
            <select value={textAlign} onChange={(e) => setTextAlign(e.target.value as typeof textAlign)} className={inp}>
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Vertical Align</label>
            <select value={verticalAlign} onChange={(e) => setVerticalAlign(e.target.value as typeof verticalAlign)} className={inp}>
              <option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option>
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-xs text-stone-700">
              <input type="checkbox" checked={fullWidth} onChange={(e) => setFullWidth(e.target.checked)} />
              Full Width
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

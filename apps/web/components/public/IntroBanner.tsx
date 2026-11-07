import React from 'react';
import type { AppearanceConfig } from '@/lib/cms/siteConfigService';

interface Props { config: AppearanceConfig; }

export const IntroBanner: React.FC<Props> = ({ config }) => {
  const style = config.introBannerStyle ?? 'editorial';
  const img = config.introBannerImageUrl;
  const alt = config.introBannerImageAlt ?? '';
  const eyebrow = config.introBannerEyebrow;
  const headline = config.introBannerHeadline;
  const desc = config.introBannerDescription;
  const cta1 = config.introBannerCtaLabel;
  const cta1Url = config.introBannerCtaUrl;
  const cta2 = config.introBannerCtaSecondaryLabel;
  const cta2Url = config.introBannerCtaSecondaryUrl;
  const focalX = config.introBannerFocalX ?? 50;
  const focalY = config.introBannerFocalY ?? 50;
  const zoom = config.introBannerZoom ?? 100;
  const overlay = config.introBannerOverlayDarkness ?? 40;
  const dH = config.introBannerDesktopHeight ?? '70vh';
  const mH = config.introBannerMobileHeight ?? '50vh';
  const tAlign = config.introBannerTextAlign ?? 'left';
  const vAlign = config.introBannerVerticalAlign ?? 'center';
  const fullW = config.introBannerFullWidth ?? false;

  if (!headline && !img) return null;

  const objPos = `${focalX}% ${focalY}%`;
  const scale = `scale(${zoom / 100})`;

  const vAlignClass = vAlign === 'top' ? 'items-start pt-16' : vAlign === 'bottom' ? 'items-end pb-16' : 'items-center';
  const tAlignClass = tAlign === 'center' ? 'text-center mx-auto' : tAlign === 'right' ? 'text-right ml-auto' : 'text-left';
  const containerClass = fullW ? 'w-full' : 'max-w-screen-xl mx-auto';

  const imgElement = img ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={img} alt={alt} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: objPos, transform: scale }} />
  ) : null;

  const overlayEl = <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: overlay / 100 }} />;

  const textBlock = (extraClass = '') => (
    <div className={`relative z-10 ${tAlignClass} ${extraClass}`}>
      {eyebrow && <div className="text-xs uppercase tracking-[0.2em] text-[#D4A757] font-semibold mb-3">{eyebrow}</div>}
      {headline && <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">{headline}</h1>}
      {desc && <p className="mt-4 text-base md:text-lg text-stone-200 max-w-2xl">{desc}</p>}
      {(cta1 || cta2) && (
        <div className={`mt-6 flex gap-3 flex-wrap ${tAlign === 'center' ? 'justify-center' : tAlign === 'right' ? 'justify-end' : ''}`}>
          {cta1 && cta1Url && <a href={cta1Url} className="px-6 py-2.5 bg-[#D4A757] text-[#0F1115] rounded font-semibold text-sm hover:bg-[#c49a4a] transition-colors">{cta1}</a>}
          {cta2 && cta2Url && <a href={cta2Url} className="px-6 py-2.5 border border-white/50 text-white rounded font-semibold text-sm hover:bg-white/10 transition-colors">{cta2}</a>}
        </div>
      )}
    </div>
  );

  const darkTextBlock = (extraClass = '') => (
    <div className={`relative z-10 ${tAlignClass} ${extraClass}`}>
      {eyebrow && <div className="text-xs uppercase tracking-[0.2em] text-[#D4A757] font-semibold mb-3">{eyebrow}</div>}
      {headline && <h1 className="text-3xl md:text-5xl font-bold text-[#0F1115] leading-tight">{headline}</h1>}
      {desc && <p className="mt-4 text-base md:text-lg text-stone-600 max-w-2xl">{desc}</p>}
      {(cta1 || cta2) && (
        <div className={`mt-6 flex gap-3 flex-wrap ${tAlign === 'center' ? 'justify-center' : tAlign === 'right' ? 'justify-end' : ''}`}>
          {cta1 && cta1Url && <a href={cta1Url} className="px-6 py-2.5 bg-[#0F1115] text-[#D4A757] rounded font-semibold text-sm hover:bg-stone-800 transition-colors">{cta1}</a>}
          {cta2 && cta2Url && <a href={cta2Url} className="px-6 py-2.5 border border-stone-300 text-stone-700 rounded font-semibold text-sm hover:bg-stone-100 transition-colors">{cta2}</a>}
        </div>
      )}
    </div>
  );

  switch (style) {
    case 'editorial':
      return (
        <section className="relative w-full overflow-hidden" style={{ height: `clamp(300px, ${mH}, ${dH})` }}>
          {imgElement}{overlayEl}
          <div className={`absolute inset-0 flex flex-col justify-center ${vAlignClass} px-4`}>
            <div className={containerClass}>{textBlock('max-w-2xl')}</div>
          </div>
        </section>
      );

    case 'stadium':
      return (
        <section className="relative w-full overflow-hidden" style={{ height: `clamp(400px, ${mH}, ${dH})` }}>
          {imgElement}{overlayEl}
          <div className={`absolute inset-0 flex flex-col justify-center items-center px-4`}>
            <div className={`${containerClass} text-center`}>{textBlock('text-center mx-auto')}</div>
          </div>
        </section>
      );

    case 'bottom-caption':
      return (
        <section className="relative w-full overflow-hidden" style={{ height: `clamp(300px, ${mH}, ${dH})` }}>
          {imgElement}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-4 pb-8">
            <div className={containerClass}>{textBlock()}</div>
          </div>
        </section>
      );

    case 'right-focus':
      return (
        <section className="relative w-full overflow-hidden bg-[#0F1115]" style={{ minHeight: `clamp(300px, ${mH}, ${dH})` }}>
          <div className="flex flex-col md:flex-row min-h-[inherit]">
            <div className="flex-1 flex flex-col justify-center px-8 py-12 md:py-0">
              {textBlock()}
            </div>
            {img && (
              <div className="relative w-full md:w-1/2 min-h-[300px]">
                {imgElement}
              </div>
            )}
          </div>
        </section>
      );

    case 'glass':
      return (
        <section className="relative w-full overflow-hidden" style={{ height: `clamp(300px, ${mH}, ${dH})` }}>
          {imgElement}{overlayEl}
          <div className={`absolute inset-0 flex flex-col ${vAlignClass} justify-center px-4`}>
            <div className={containerClass}>
              <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-xl p-8 max-w-xl">
                {textBlock()}
              </div>
            </div>
          </div>
        </section>
      );

    case 'framed':
      return (
        <section className="w-full bg-[#0F1115] px-4 py-8">
          <div className={`${containerClass} relative overflow-hidden rounded-xl border border-stone-700`} style={{ height: `clamp(280px, ${mH}, calc(${dH} - 4rem))` }}>
            {imgElement}{overlayEl}
            <div className={`absolute inset-0 flex flex-col ${vAlignClass} justify-center px-8`}>
              {textBlock('max-w-2xl')}
            </div>
          </div>
        </section>
      );

    case 'split':
      return (
        <section className="w-full bg-[#0F1115]" style={{ minHeight: `clamp(300px, ${mH}, ${dH})` }}>
          <div className="flex flex-col md:flex-row min-h-[inherit]">
            <div className="flex-1 flex flex-col justify-center px-8 py-12">
              {textBlock()}
            </div>
            {img && (
              <div className="relative flex-1 min-h-[300px]">
                {imgElement}
              </div>
            )}
          </div>
        </section>
      );

    case 'spotlight':
      return (
        <section className="relative w-full overflow-hidden" style={{ height: `clamp(300px, ${mH}, ${dH})` }}>
          {imgElement}
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,${overlay / 100}) 0%, rgba(0,0,0,${Math.min(overlay + 30, 100) / 100}) 100%)` }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
            <div className="text-center max-w-3xl">{textBlock('text-center mx-auto')}</div>
          </div>
        </section>
      );

    case 'amber':
      return (
        <section className="relative w-full overflow-hidden" style={{ height: `clamp(300px, ${mH}, ${dH})` }}>
          {imgElement}
          <div className="absolute inset-0 bg-gradient-to-r from-[#D4A757]/80 via-[#D4A757]/40 to-transparent" />
          <div className={`absolute inset-0 flex flex-col ${vAlignClass} justify-center px-4`}>
            <div className={containerClass}>
              <div className="relative z-10 max-w-2xl">
                {eyebrow && <div className="text-xs uppercase tracking-[0.2em] text-[#0F1115] font-semibold mb-3">{eyebrow}</div>}
                {headline && <h1 className="text-3xl md:text-5xl font-bold text-[#0F1115] leading-tight">{headline}</h1>}
                {desc && <p className="mt-4 text-base md:text-lg text-stone-800 max-w-2xl">{desc}</p>}
                {(cta1 || cta2) && (
                  <div className="mt-6 flex gap-3 flex-wrap">
                    {cta1 && cta1Url && <a href={cta1Url} className="px-6 py-2.5 bg-[#0F1115] text-[#D4A757] rounded font-semibold text-sm">{cta1}</a>}
                    {cta2 && cta2Url && <a href={cta2Url} className="px-6 py-2.5 border border-[#0F1115]/30 text-[#0F1115] rounded font-semibold text-sm">{cta2}</a>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      );

    case 'minimal':
      return (
        <section className="w-full bg-white px-4 py-16">
          <div className={`${containerClass} flex flex-col md:flex-row gap-8 items-center`}>
            <div className="flex-1">
              {darkTextBlock('max-w-xl')}
            </div>
            {img && (
              <div className="relative w-full md:w-2/5 aspect-[4/3] rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={alt} className="w-full h-full object-cover" style={{ objectPosition: objPos }} />
              </div>
            )}
          </div>
        </section>
      );

    default:
      return null;
  }
};

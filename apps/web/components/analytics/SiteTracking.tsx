import React from 'react';
import Script from 'next/script';

/**
 * Third-party analytics, loaded only when an administrator has switched it on.
 *
 * WHY THIS IS NARROW ON PURPOSE. Everything else on this site is first-party:
 * no tracking script is injected and no measurement id is hardcoded anywhere.
 * This component is the single exception, and it exists because an
 * administrator asked to be able to connect GA4 or Tag Manager without a
 * developer. It therefore does the least that can work:
 *
 *   - it renders NOTHING unless an id is both present and explicitly enabled;
 *   - the id is the ONLY thing interpolated, and it has already been held to
 *     `G-XXXXXXXXXX` / `GTM-XXXXXXX` by the service — there is no path by which
 *     configuration becomes arbitrary script;
 *   - the snippets are the providers' own documented ones, unmodified, so what
 *     loads is what their documentation says loads.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not implement consent. A site that
 * must ask before tracking has to gate this on that answer, and pretending
 * otherwise by adding a checkbox here would be worse than leaving the decision
 * visible and unmade.
 */

export interface SiteTrackingProps {
  /** A GA4 measurement id, already validated, or undefined when switched off. */
  ga4?: string;
  /** A Tag Manager container id, already validated, or undefined when off. */
  gtm?: string;
}

/** Defence in depth: the shapes the service already enforces, re-checked here. */
const GA4 = /^G-[A-Z0-9]{4,20}$/;
const GTM = /^GTM-[A-Z0-9]{4,12}$/;

export const SiteTracking: React.FC<SiteTrackingProps> = ({ ga4, gtm }) => {
  const ga = ga4 && GA4.test(ga4) ? ga4 : null;
  const tag = gtm && GTM.test(gtm) ? gtm : null;
  if (!ga && !tag) return null;

  return (
    <>
      {ga && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      )}
      {tag && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${tag}');`}
        </Script>
      )}
    </>
  );
};

export default SiteTracking;

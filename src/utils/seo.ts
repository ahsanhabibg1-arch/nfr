import { useEffect } from 'react';

export interface SEOProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  publishedTime?: string;
  authorName?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

/**
 * Client-Side SEO & OpenGraph Tag Manager
 * NOTE: For full production SEO, Next.js server components or static generation (SSG)
 * should render these tags into the initial server HTML. This utility provides client-side
 * simulation and demonstration compliance for Phase 0.
 */
export function useSEO({
  title,
  description,
  canonicalPath,
  ogType = 'website',
  ogImage = '/src/assets/images/hero_bull_riding_1793166440262.jpg',
  publishedTime,
  authorName,
  jsonLd,
}: SEOProps) {
  useEffect(() => {
    // 1. Document Title
    const formattedTitle = title.includes('NFRGuide') ? title : `${title} — NFRGuide`;
    document.title = formattedTitle;

    // Helper to safely set meta tag
    const setMeta = (nameOrProp: string, value: string, isProp = false) => {
      const selector = isProp ? `meta[property="${nameOrProp}"]` : `meta[name="${nameOrProp}"]`;
      let element = document.querySelector(selector);
      if (!element) {
        element = document.createElement('meta');
        if (isProp) {
          element.setAttribute('property', nameOrProp);
        } else {
          element.setAttribute('name', nameOrProp);
        }
        document.head.appendChild(element);
      }
      element.setAttribute('content', value);
    };

    // 2. Standard Meta
    setMeta('description', description);

    // 3. OpenGraph Tags
    setMeta('og:title', formattedTitle, true);
    setMeta('og:description', description, true);
    setMeta('og:type', ogType, true);
    if (ogImage) {
      setMeta('og:image', ogImage, true);
    }
    const currentUrl = typeof window !== 'undefined' 
      ? window.location.origin + (canonicalPath || window.location.pathname)
      : '';
    if (currentUrl) {
      setMeta('og:url', currentUrl, true);
    }

    // 4. Twitter / X Card Tags
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', formattedTitle);
    setMeta('twitter:description', description);
    if (ogImage) {
      setMeta('twitter:image', ogImage);
    }

    // 5. Canonical Link
    if (currentUrl) {
      let canonicalLink = document.querySelector('link[rel="canonical"]');
      if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute('href', currentUrl);
    }

    // 6. JSON-LD Structured Data
    const scriptId = 'nfrguide-seo-jsonld';
    let scriptTag = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (jsonLd) {
      if (!scriptTag) {
        scriptTag = document.createElement('script');
        scriptTag.id = scriptId;
        scriptTag.type = 'application/ld+json';
        document.head.appendChild(scriptTag);
      }
      scriptTag.text = JSON.stringify(jsonLd);
    } else if (scriptTag) {
      scriptTag.remove();
    }
  }, [title, description, canonicalPath, ogType, ogImage, publishedTime, authorName, jsonLd]);
}

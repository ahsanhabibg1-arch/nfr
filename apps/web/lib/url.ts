/**
 * NFRGuide — Shared outbound URL protocol allowlist (Batch 01 §14).
 *
 * The Phase 0 QA report claimed "link protocol sanitization" that did not exist
 * in code. This utility implements a real allowlist so the claim becomes true:
 * only http(s), mailto and tel (plus site-relative) URLs are considered safe to
 * render as hrefs. Anything else (javascript:, data:, vbscript:, …) is rejected.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Returns true if `href` is safe to render in an anchor tag. */
export function isSafeHref(href: string | undefined | null): boolean {
  if (!href) return false;
  const value = href.trim();
  if (value === '') return false;
  // Site-relative or fragment/query links are always safe.
  if (value.startsWith('/') || value.startsWith('#') || value.startsWith('?')) {
    return true;
  }
  try {
    // Resolve against a dummy base so relative values don't throw.
    const parsed = new URL(value, 'https://nfrguide.com');
    // If the original had no scheme it resolved to https (safe). If it did have
    // a scheme, it must be on the allowlist.
    const hasExplicitScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
    if (!hasExplicitScheme) return true;
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/** Returns `href` when safe, otherwise a neutral '#'. Use for untrusted URLs. */
export function safeHref(href: string | undefined | null): string {
  return isSafeHref(href) ? (href as string) : '#';
}

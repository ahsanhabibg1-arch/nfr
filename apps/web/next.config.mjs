/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this app (the repo root also has a package-lock.json
  // from the preserved Vite reference app, which Next would otherwise warn about).
  turbopack: {
    root: import.meta.dirname,
  },

  // Canonical URL policy (Master Requirements v2.0 §2.2): one resolved public
  // path per entity, enforced with a consistent trailing slash.
  trailingSlash: true,

  // Harden against accidental leakage of unfinished/demo content indexing.
  // (Deployment-level noindex is still required on non-production — see docs.)
  reactStrictMode: true,

  // The media storage adapter loads the AWS SDK lazily only when a cloud
  // provider (R2/S3) is selected. Treat it as an optional external package so
  // the bundler does not try to resolve it at build time when it is not
  // installed (the local foundation needs no cloud SDK). See STORAGE_PROVIDER_DECISION.md.
  serverExternalPackages: ['@aws-sdk/client-s3'],

  async redirects() {
    // Server-level HTTP 308 permanent redirects replacing the Phase 0
    // client-side <Navigate> compatibility routes (ROUTES.md §1).
    const map = [
      ['/nfr-competition', '/competition/'],
      ['/nfr-entertainment', '/entertainment/'],
      ['/nfr-events-and-shopping', '/events-shopping/'],
      ['/nfr-plan-and-watch', '/plan-watch/'],
      ['/more-rodeo', '/rodeo-events/'],
    ];
    const rules = [];
    for (const [from, to] of map) {
      rules.push({ source: from, destination: to, permanent: true });
      // Preserve the Phase 0 `/legacy/*` catch-all behaviour.
      rules.push({ source: `${from}/:path*`, destination: to, permanent: true });
    }
    return rules;
  },

  // Baseline security headers (Batch 13 §12). Hosting-independent; HSTS is ignored over
  // plain HTTP (local dev) and takes effect only under HTTPS in production. Admin routes
  // additionally forbid shared/browser caching of private pages.
  async headers() {
    // Content Security Policy — Batch 17 §B. Shipped as REPORT-ONLY first: it never
    // blocks a request, only reports violations, so it cannot break Next.js hydration,
    // the rich-block editor, Google Fonts or gated media while the policy is tuned.
    // 'unsafe-inline' is tolerated for scripts/styles ONLY because Next injects an inline
    // bootstrap and Tailwind emits inline styles; the enforcing follow-up should move to a
    // nonce-based script-src and drop 'unsafe-inline' for scripts (documented as a phased
    // rollout — do NOT flip to the enforcing header until the report stream is clean).
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      // 'self', not 'none' — Stage 06. The Page Builder canvas embeds our own
      // draft pages in an iframe on our own admin origin, so a blanket refusal
      // makes a visual builder impossible. 'self' still refuses EVERY
      // third-party framing attempt, so clickjacking protection is unchanged;
      // what it permits is exactly one case: our origin framing our origin.
      // Do not widen this to a host list or a wildcard.
      "frame-ancestors 'self'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' https://fonts.gstatic.com data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      // 'self' — the admin Builder frames the draft-preview route (Stage 06).
      // Same reasoning and same limit as frame-ancestors above.
      "frame-src 'self'",
      // First-party violation receiver (Batch 21 §D). report-uri is deprecated but still
      // the most broadly supported directive for report-only collection today.
      'report-uri /api/csp-report/',
    ].join('; ');

    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      /**
       * SAMEORIGIN, not DENY — Stage 06.
       *
       * This was the header that actually blocked the Builder canvas. The CSP
       * above is report-only, so its `frame-ancestors` denial only logged;
       * `X-Frame-Options: DENY` is enforcing, and it made the public pages
       * refuse to render inside the admin's own iframe. Browser verification
       * caught it — the canvas was blank in Chromium while every unit test
       * passed.
       *
       * SAMEORIGIN still blocks all cross-origin framing, which is the entire
       * clickjacking threat this header addresses: an attacker's page cannot
       * frame ours either way. The only behaviour it adds is our own origin
       * framing itself. `tests/stage06-frame-headers.test.ts` pins both values
       * so this cannot quietly drift to a weaker setting.
       */
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
      // HSTS without `preload` on purpose (Batch 17 §B3): preload is an irreversible,
      // apex+subdomain commitment that must be verified at deploy time, not enabled here.
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
      { key: 'Content-Security-Policy-Report-Only', value: csp },
    ];
    return [
      { source: '/:path*', headers: security },
      { source: '/admin/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default nextConfig;

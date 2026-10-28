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
};

export default nextConfig;

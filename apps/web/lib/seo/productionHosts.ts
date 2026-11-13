/**
 * IDX-02 — which hostname is allowed to be indexed.
 *
 * THE PROBLEM. `nfrguide.com` and the Render service hostname now resolve to the
 * SAME running service. One process therefore serves both the public site and a
 * staging URL, so the previous site-wide switch (`STAGING_NOINDEX`) can no longer
 * express the requirement: turning it on would de-index the real site, and
 * leaving it off lets the Render hostname be indexed as a duplicate of it.
 * The decision has to be made per request, from the hostname the visitor used.
 *
 * WHICH HEADER. The `Host` header, and only that one.
 *
 *   - `X-Forwarded-Host` is NOT read here. It is set by whatever spoke to the
 *     proxy last, so a client can send any value it likes unless the proxy is
 *     known to overwrite it — and that is not something this application can
 *     verify from inside the container. Worse, it is not part of an HTTP cache
 *     key, so a shared cache that stored a response produced from a forged
 *     `X-Forwarded-Host` would later serve it for ordinary requests: a
 *     cache-poisoning route to de-indexing the production site.
 *   - `Host` is also client-supplied, but it IS part of the effective request
 *     URI, which every conformant cache keys on, so one host's response can
 *     never be served for another host. Render additionally routes by it, so a
 *     request only reaches this service when it carries a hostname pointed here.
 *
 * FAIL-SAFE DIRECTION. Anything not provably one of the official hostnames —
 * the Render hostname, an unknown domain pointed at the service, a forged or
 * malformed value, a missing header — is treated as NOT indexable. The
 * asymmetry is deliberate: wrongly noindexing a host nobody publishes costs
 * nothing, while wrongly indexing a staging hostname is the defect being fixed.
 *
 * NO NEW ENVIRONMENT VARIABLE. The official origin is already declared once, as
 * `PRODUCTION_SITE_URL`, and is imported rather than retyped so the two cannot
 * drift apart. This module is pure and dependency-free so it is safe to pull
 * into the edge middleware bundle.
 */

import { PRODUCTION_SITE_URL } from './canonical';

/**
 * The hostnames that may be indexed: the official apex plus its `www.` form.
 *
 * `www.` is included because a visitor (or a crawler following an old link) can
 * arrive on it, and a redirect to the apex is not guaranteed to exist at the DNS
 * or platform layer. Serving it with `noindex` would suppress real pages.
 */
export const PRODUCTION_HOSTNAMES: readonly string[] = (() => {
  const apex = new URL(PRODUCTION_SITE_URL).hostname.toLowerCase();
  return Object.freeze([apex, `www.${apex}`]);
})();

const INDEXABLE: ReadonlySet<string> = new Set(PRODUCTION_HOSTNAMES);

/**
 * Ports the public origin can legitimately arrive on: none (the normal case —
 * browsers and HTTP/2 omit a default port), or an explicitly written default.
 *
 * A non-default port means the request did not come through the published
 * origin: a tunnel, a port-forward, a preview proxy, a local build. Those are
 * not the production site and must not be indexed. Both defaults are accepted,
 * rather than 443 alone, so that an unexpected-but-harmless `:80` on a
 * platform-level redirect can never de-index the real site.
 */
const DEFAULT_PORTS: ReadonlySet<string> = new Set(['', '80', '443']);

/** A hostname of ASCII labels: letters/digits, inner hyphens, dot-separated. */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

export interface ParsedHost {
  /** Lower-cased, trailing dot removed. */
  hostname: string;
  /** Digits only; the empty string when no port was present. */
  port: string;
}

/**
 * Parse a `Host` header into a hostname and port, or `null` if it is not a
 * plain host.
 *
 * Returning `null` is what makes a hostile or malformed value safe: every
 * caller treats it as "not the production site". Rejected, among others:
 * header-injection attempts (`nfrguide.com, evil.example` — comma and space),
 * values carrying a path or scheme, non-numeric ports, empty labels, and
 * bracketed IPv6 literals (no official hostname is an IP address, so refusing
 * them costs nothing and keeps this parser small).
 */
export function parseHostHeader(raw: string | null | undefined): ParsedHost | null {
  if (typeof raw !== 'string') return null;

  const value = raw.trim().toLowerCase();
  if (!value) return null;

  let hostname = value;
  let port = '';

  // Split on the LAST colon so a malformed value cannot hide a second one.
  const colon = value.lastIndexOf(':');
  if (colon !== -1) {
    hostname = value.slice(0, colon);
    port = value.slice(colon + 1);
    if (!/^[0-9]{1,5}$/.test(port)) return null;
  }

  // `nfrguide.com.` is the fully-qualified form of the same name and resolves
  // identically, so one trailing dot is normalised away rather than rejected.
  if (hostname.endsWith('.')) hostname = hostname.slice(0, -1);

  if (hostname.length > 253 || !HOSTNAME.test(hostname)) return null;

  return { hostname, port };
}

/**
 * True only for a request that arrived on an official production hostname, on a
 * default port. Everything else — including an absent or unparsable header — is
 * false, by design (see the fail-safe note at the top of this file).
 */
export function isIndexableHost(raw: string | null | undefined): boolean {
  const parsed = parseHostHeader(raw);
  if (!parsed) return false;
  if (!DEFAULT_PORTS.has(parsed.port)) return false;
  return INDEXABLE.has(parsed.hostname);
}

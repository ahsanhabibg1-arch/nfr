/**
 * Server-side commercial URL validation (Batch 08 §7/§24). Pure + no network.
 * Rejects dangerous protocols (javascript:, data:, vbscript:, file:, ftp:) and
 * private/local/link-local/metadata targets (SSRF hardening) — these rules apply
 * whether or not optional link-health checking is ever added. Only http(s) to a
 * public, dotted host is accepted.
 */
export interface UrlCheck {
  ok: boolean;
  reason?: string;
  normalized?: string;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true;
  if (h === '0.0.0.0' || h === 'metadata.google.internal') return true;
  if (/^(0|127|10)\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m) {
    const o = Number(m[1]);
    if (o >= 16 && o <= 31) return true;
  }
  // Reject bare hostnames with no dot (not a public FQDN) and raw IPs are covered above.
  if (!h.includes('.') && !h.includes(':')) return true;
  return false;
}

export function validateCommercialUrl(raw: string | null | undefined): UrlCheck {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'empty' };
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'not a valid absolute URL' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, reason: `protocol "${u.protocol}" is not allowed` };
  }
  if (isPrivateHost(u.hostname)) {
    return { ok: false, reason: 'private/local/metadata hosts are not allowed' };
  }
  return { ok: true, normalized: u.toString() };
}

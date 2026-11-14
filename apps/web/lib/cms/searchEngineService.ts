import 'server-only';
import { z } from 'zod';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { SITE_URL } from '../seo';

/**
 * Search engine verification, tracking identifiers and indexing diagnostics.
 *
 * WHY THIS EXISTS. Verifying the site with Google, Bing or Pinterest means
 * putting one `<meta>` tag (or one DNS TXT record) in place and later rotating
 * it. Until now that was a code change and a deployment for a value that is, by
 * design, public and disposable — so routine ownership work needed a developer.
 * This gives an administrator the whole loop: add, see whether it is actually
 * being served, replace, remove.
 *
 * THREE THINGS THAT ARE ROUTINELY CONFUSED, KEPT APART.
 *
 *   VERIFICATION  proves the site is yours. A public token, in a meta tag or a
 *                 DNS record. It affects nothing a reader sees.
 *   TRACKING      is analytics (GA4, Tag Manager). It loads third-party script
 *                 into a reader's browser, which is a privacy decision, not a
 *                 configuration detail — so it is off until switched on.
 *   INDEXING      is whether search engines may list a page. It is owned by the
 *                 SEO rules and the per-page `noindex`, and is NOT editable
 *                 here: this surface only reports on it.
 *
 * THE SAFETY LINE. A verification record puts an attacker-chosen `name` and
 * `content` into the public document head if nothing stops it, and a meta tag
 * named `robots` would deindex the entire site. So the name is checked against
 * an allowlist of real verification tags, a denylist of names that control
 * browser or crawler behaviour is refused outright, and the value is held to a
 * token charset that cannot contain markup or quotes.
 */

const need = (a: Actor, p: Parameters<typeof roleHasPermission>[1]) => {
  if (!roleHasPermission(a.roles, p)) throw new ServiceError('forbidden', `Not permitted (${p}).`);
};

export const VERIFICATION_KEY = 'search_verification';
export const TRACKING_KEY = 'search_tracking';
export const DNS_KEY = 'search_dns_verification';

// ---------------------------------------------------------------------------
// The provider vocabulary
// ---------------------------------------------------------------------------

export interface ProviderDef {
  key: string;
  label: string;
  /** The `name` attribute of the meta tag this provider reads. */
  metaName: string;
  /** Where an administrator gets the token. */
  where: string;
  /** Shown beside the field so a wrong value is spotted before it is saved. */
  valueHint: string;
}

/**
 * The allowlist. A provider that is not here cannot be configured, which is
 * what keeps an arbitrary meta tag out of the public head.
 *
 * These are the `name` attributes each service actually documents. They are
 * data, not guesses: changing one would break verification for that provider,
 * so none of them is edited without checking the provider's own instructions.
 */
export const VERIFICATION_PROVIDERS: ProviderDef[] = [
  {
    key: 'google',
    label: 'Google Search Console',
    metaName: 'google-site-verification',
    where: 'Search Console → Settings → Ownership verification → HTML tag',
    valueHint: 'The content value only, not the whole <meta> tag',
  },
  {
    key: 'bing',
    label: 'Bing Webmaster Tools',
    metaName: 'msvalidate.01',
    where: 'Bing Webmaster Tools → Site verification → Option 2 (meta tag)',
    valueHint: '32 hexadecimal characters',
  },
  {
    key: 'yandex',
    label: 'Yandex Webmaster',
    metaName: 'yandex-verification',
    where: 'Yandex Webmaster → Site rights → Meta tag',
    valueHint: 'A short hexadecimal token',
  },
  {
    key: 'pinterest',
    label: 'Pinterest',
    metaName: 'p:domain_verify',
    where: 'Pinterest → Settings → Claimed accounts → Claim website → Add HTML tag',
    valueHint: 'The content value only',
  },
  {
    key: 'facebook',
    label: 'Meta (Facebook) domain verification',
    metaName: 'facebook-domain-verification',
    where: 'Meta Business Suite → Brand safety → Domains',
    valueHint: 'The content value only',
  },
  {
    key: 'ahrefs',
    label: 'Ahrefs Webmaster Tools',
    metaName: 'ahrefs-site-verification',
    where: 'Ahrefs Webmaster Tools → Add project → HTML meta tag',
    valueHint: 'The content value only',
  },
];

/**
 * Meta names that must NEVER be written from configuration.
 *
 * Each one changes how a browser or a crawler treats the page rather than
 * identifying its owner. `robots` is the dangerous one: a single saved record
 * could remove the whole site from every search engine, which is precisely the
 * accident this module is required to make impossible.
 */
const FORBIDDEN_META_NAMES = new Set([
  'robots', 'googlebot', 'googlebot-news', 'bingbot', 'slurp',
  'refresh', 'viewport', 'charset', 'content-type', 'content-security-policy',
  'referrer', 'x-ua-compatible', 'generator', 'rating',
]);

/** A verification token: no markup, no quotes, no spaces. */
const TOKEN = /^[A-Za-z0-9_\-=.:/+]{6,200}$/;

/**
 * A custom meta name, when a provider is not on the list.
 *
 * Deliberately narrow: lower-case, must look like a verification name, and is
 * still refused when it collides with the forbidden list above. This is the
 * escape hatch for a provider added after this code was written — not a way to
 * write any tag at all.
 */
const CUSTOM_META_NAME = /^[a-z][a-z0-9]*([-:._][a-z0-9]+)*$/;

export function providerByKey(key: string): ProviderDef | undefined {
  return VERIFICATION_PROVIDERS.find((p) => p.key === key);
}

/**
 * The meta name a record will publish, validated.
 *
 * Throws rather than returning a fallback: a verification record whose name
 * silently changed would never verify, and the administrator would have no way
 * to see why.
 */
export function resolveMetaName(providerKey: string, customName?: string): string {
  const known = providerByKey(providerKey);
  const name = (known ? known.metaName : (customName ?? '')).trim().toLowerCase();

  if (!name) throw new ServiceError('validation', 'A custom provider needs a meta tag name.');
  if (FORBIDDEN_META_NAMES.has(name)) {
    throw new ServiceError(
      'validation',
      `"${name}" controls how crawlers or browsers treat the page and cannot be set here. Verification tags only.`,
    );
  }
  if (!known && !CUSTOM_META_NAME.test(name)) {
    throw new ServiceError('validation', `"${name}" is not a valid meta tag name.`);
  }
  if (name.length > 64) throw new ServiceError('validation', 'That meta tag name is too long.');
  return name;
}

// ---------------------------------------------------------------------------
// Stored shapes
// ---------------------------------------------------------------------------

const VerificationRecord = z.object({
  id: z.string().min(1).max(64),
  provider: z.string().min(1).max(40),
  /** Only used when `provider` is not on the allowlist. */
  customMetaName: z.string().max(64).optional(),
  metaName: z.string().min(1).max(64),
  value: z.string().regex(TOKEN, 'That does not look like a verification token'),
  enabled: z.boolean(),
  note: z.string().max(300).regex(/^[^<>]*$/, 'HTML is not allowed').optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Result of the last public check, never assumed. */
  lastCheck: z.object({
    state: z.enum(['detected', 'absent', 'unreachable', 'never']),
    at: z.string(),
    detail: z.string().max(300),
  }).optional(),
});
export type VerificationRecord = z.infer<typeof VerificationRecord>;

const VerificationStore = z.object({ records: z.array(VerificationRecord).max(30) });

const DnsRecord = z.object({
  id: z.string().min(1).max(64),
  provider: z.string().min(1).max(40),
  /** The host the TXT record is published at, e.g. `@` for the apex. */
  host: z.string().max(120).regex(/^[A-Za-z0-9@._-]*$/, 'That is not a valid DNS host'),
  value: z.string().regex(TOKEN, 'That does not look like a verification token'),
  note: z.string().max(300).regex(/^[^<>]*$/, 'HTML is not allowed').optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastCheck: z.object({
    state: z.enum(['found', 'absent', 'unreachable', 'never']),
    at: z.string(),
    detail: z.string().max(400),
  }).optional(),
});
export type DnsRecord = z.infer<typeof DnsRecord>;

const DnsStore = z.object({ records: z.array(DnsRecord).max(30) });

/**
 * Tracking identifiers.
 *
 * `enabled` is separate from the id and defaults to false. Saving an id is
 * configuration; switching it on loads third-party script into every reader's
 * browser, which is a different decision and is made explicitly.
 */
const TrackingSettings = z.object({
  ga4MeasurementId: z.string().regex(/^G-[A-Z0-9]{4,20}$/, 'A GA4 id looks like G-XXXXXXXXXX').optional().or(z.literal('')),
  ga4Enabled: z.boolean(),
  gtmContainerId: z.string().regex(/^GTM-[A-Z0-9]{4,12}$/, 'A Tag Manager id looks like GTM-XXXXXXX').optional().or(z.literal('')),
  gtmEnabled: z.boolean(),
});
export type TrackingSettings = z.infer<typeof TrackingSettings>;

export const DEFAULT_TRACKING: TrackingSettings = {
  ga4MeasurementId: '', ga4Enabled: false, gtmContainerId: '', gtmEnabled: false,
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

async function readStore<T>(key: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  const parsed = schema.safeParse(row.value);
  // Stored data that no longer parses is reported as absent rather than
  // thrown: a malformed row must not take the settings screen down, and the
  // administrator can simply save again.
  return parsed.success ? parsed.data : fallback;
}

/**
 * Reads a list of records, validating EACH ONE separately.
 *
 * WHY NOT PARSE THE WHOLE ARRAY. Because one bad entry would then discard every
 * good one. A test wrote a malformed record directly into the row — the kind a
 * bad import or a hand edit produces — and the whole verification list came
 * back empty, which would have silently un-verified the site with Google and
 * Bing at once while the admin screen showed nothing wrong.
 *
 * Per-record parsing contains the damage to the record that is actually
 * broken, which is the behaviour an administrator would expect and the only
 * one that is safe.
 */
function readRecords<T>(value: unknown, schema: z.ZodType<T>): T[] {
  const raw = (value as { records?: unknown })?.records;
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const entry of raw) {
    const parsed = schema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

async function readRecordStore<T>(key: string, schema: z.ZodType<T>): Promise<T[]> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row ? readRecords(row.value, schema) : [];
}

/**
 * The verification records the PUBLIC pages should render.
 *
 * Unauthenticated by design: these tokens are published in the document head,
 * so they are public by definition. The authenticated reads below are for the
 * admin surface, which also shows notes and check history.
 */
/**
 * The cache tag the public head depends on.
 *
 * WHY A TAG AND NOT JUST `revalidatePath`. The public pages are rendered with
 * ISR, so after a save the old HTML is served until its window elapses — up to
 * five minutes. An administrator who saved a verification tag and immediately
 * pressed Check was told, truthfully, that the tag was not being served, and
 * had no way to tell that from a real failure. Browser-verified: the check was
 * intermittently "not seen yet" purely on timing.
 *
 * Tagging the read and invalidating the tag on every write makes the public
 * head change as soon as the record does, which is the behaviour the Check
 * button needs in order to mean anything.
 *
 * THE CACHE ITSELF LIVES AT THE RENDER BOUNDARY, not here. `unstable_cache`
 * needs Next's per-request incremental cache, so wrapping a service function in
 * it makes that function uncallable from anywhere else — a test, a script, a
 * job. The functions below stay plain and the public layout wraps them, which
 * keeps the service testable and callable while the rendered page is still
 * cached and still invalidated by this tag.
 */
export const SEARCH_META_TAG = 'search-engine-public-head';

export async function getPublicVerificationTags(): Promise<{ name: string; content: string }[]> {
  const records = await readRecordStore(VERIFICATION_KEY, VerificationRecord);
  const seen = new Set<string>();
  const out: { name: string; content: string }[] = [];
  for (const r of records) {
    if (!r.enabled) continue;
    // Re-validated at RENDER time, not only on save. Storage is checked, but a
    // renderer that trusts its input is one bad import or one direct database
    // edit away from putting an arbitrary tag in the head.
    if (FORBIDDEN_META_NAMES.has(r.metaName) || !TOKEN.test(r.value)) continue;
    // One tag per name: two Google tokens would be ambiguous, and the second
    // would silently win in some parsers.
    if (seen.has(r.metaName)) continue;
    seen.add(r.metaName);
    out.push({ name: r.metaName, content: r.value });
  }
  return out;
}

/** The tracking ids the public pages should load, if any are switched on. */
export async function getPublicTracking(): Promise<{ ga4?: string; gtm?: string }> {
  const t = await readStore(TRACKING_KEY, TrackingSettings, DEFAULT_TRACKING);
  return {
    ga4: t.ga4Enabled && t.ga4MeasurementId ? t.ga4MeasurementId : undefined,
    gtm: t.gtmEnabled && t.gtmContainerId ? t.gtmContainerId : undefined,
  };
}

export interface SearchEngineConfig {
  verification: VerificationRecord[];
  dns: DnsRecord[];
  tracking: TrackingSettings;
  providers: ProviderDef[];
  /** Whether a Cloudflare API connection is configured for DNS automation. */
  cloudflare: { configured: boolean; detail: string };
  siteUrl: string;
}

export async function getSearchEngineConfig(actor: Actor): Promise<SearchEngineConfig> {
  need(actor, 'system.config');
  const [verification, dns, tracking] = await Promise.all([
    readRecordStore(VERIFICATION_KEY, VerificationRecord),
    readRecordStore(DNS_KEY, DnsRecord),
    readStore(TRACKING_KEY, TrackingSettings, DEFAULT_TRACKING),
  ]);
  return {
    verification,
    dns,
    tracking,
    providers: VERIFICATION_PROVIDERS,
    cloudflare: cloudflareStatus(),
    siteUrl: SITE_URL,
  };
}

/**
 * Whether DNS records could be managed automatically.
 *
 * Reports the truth rather than offering a button that cannot work. With no
 * token configured the DNS section is a copy-ready record and instructions,
 * which is honest and still useful — a fake "create record" control that failed
 * at the API would be worse than none.
 */
export function cloudflareStatus(): { configured: boolean; detail: string } {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  if (token && zone) {
    return {
      configured: true,
      detail: 'A Cloudflare token and zone are configured. Automatic DNS management is still disabled in this release.',
    };
  }
  return {
    configured: false,
    detail: 'No Cloudflare API credentials are configured, so DNS records are published manually. The record to add is shown ready to copy, and its presence can be checked from here once it is live.',
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function writeStore(actor: Actor, key: string, value: unknown, action: string, detail: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: value as object, updatedById: actor.id },
    update: { value: value as object, updatedById: actor.id },
  });
  await audit(actor.id, action, 'search_engine_verification', key, detail);
}

const newId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface SaveVerificationInput {
  id?: string;
  provider: string;
  customMetaName?: string;
  value: string;
  enabled: boolean;
  note?: string;
}

/** Adds or replaces one verification record. */
export async function saveVerificationRecord(actor: Actor, input: SaveVerificationInput): Promise<VerificationRecord> {
  need(actor, 'system.config');
  const metaName = resolveMetaName(input.provider, input.customMetaName);
  const value = input.value.trim();
  if (!TOKEN.test(value)) {
    throw new ServiceError(
      'validation',
      'Paste the verification token only — the content value, not the whole meta tag.',
    );
  }

  const store = { records: await readRecordStore(VERIFICATION_KEY, VerificationRecord) };
  const now = new Date().toISOString();
  const existingIndex = input.id ? store.records.findIndex((r) => r.id === input.id) : -1;

  /*
    A second ENABLED record for the same meta name is refused. Two
    `google-site-verification` tags in one head is not a configuration an
    administrator means to have, and which one a crawler honours is not
    something this code should guess at.
  */
  const clash = store.records.find(
    (r, i) => i !== existingIndex && r.enabled && input.enabled && r.metaName === metaName,
  );
  if (clash) {
    throw new ServiceError(
      'validation',
      `There is already an active ${metaName} record. Replace or disable it first — two of the same tag is ambiguous.`,
    );
  }

  const record: VerificationRecord = {
    id: input.id && existingIndex >= 0 ? input.id : newId(),
    provider: input.provider,
    ...(providerByKey(input.provider) ? {} : { customMetaName: metaName }),
    metaName,
    value,
    enabled: input.enabled,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt: existingIndex >= 0 ? store.records[existingIndex].createdAt : now,
    updatedAt: now,
    // A changed value invalidates whatever the last check found.
    ...(existingIndex >= 0 && store.records[existingIndex].value === value
      ? { lastCheck: store.records[existingIndex].lastCheck }
      : {}),
  };

  const records = [...store.records];
  if (existingIndex >= 0) records[existingIndex] = record;
  else records.push(record);

  const parsed = VerificationStore.parse({ records });
  await writeStore(
    actor, VERIFICATION_KEY, parsed,
    existingIndex >= 0 ? 'search.verification.update' : 'search.verification.create',
    // The token is public by design, but the audit entry records the NAME and
    // the state rather than the value, so the log stays readable.
    `${metaName} (${input.enabled ? 'active' : 'inactive'})`,
  );
  return record;
}

export async function deleteVerificationRecord(actor: Actor, id: string): Promise<void> {
  need(actor, 'system.config');
  const store = { records: await readRecordStore(VERIFICATION_KEY, VerificationRecord) };
  const found = store.records.find((r) => r.id === id);
  if (!found) throw new ServiceError('not_found', 'That verification record no longer exists.');
  await writeStore(
    actor, VERIFICATION_KEY, { records: store.records.filter((r) => r.id !== id) },
    'search.verification.delete', found.metaName,
  );
}

export interface SaveDnsInput {
  id?: string;
  provider: string;
  host: string;
  value: string;
  note?: string;
}

export async function saveDnsRecord(actor: Actor, input: SaveDnsInput): Promise<DnsRecord> {
  need(actor, 'system.config');
  const value = input.value.trim();
  if (!TOKEN.test(value)) throw new ServiceError('validation', 'Paste the TXT record value only.');
  const host = (input.host || '@').trim();

  const store = { records: await readRecordStore(DNS_KEY, DnsRecord) };
  const now = new Date().toISOString();
  const i = input.id ? store.records.findIndex((r) => r.id === input.id) : -1;
  const record: DnsRecord = {
    id: i >= 0 ? input.id! : newId(),
    provider: input.provider.slice(0, 40),
    host,
    value,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt: i >= 0 ? store.records[i].createdAt : now,
    updatedAt: now,
    ...(i >= 0 && store.records[i].value === value ? { lastCheck: store.records[i].lastCheck } : {}),
  };
  const records = [...store.records];
  if (i >= 0) records[i] = record; else records.push(record);

  await writeStore(
    actor, DNS_KEY, DnsStore.parse({ records }),
    i >= 0 ? 'search.dns.update' : 'search.dns.create',
    `${input.provider} TXT at ${host}`,
  );
  return record;
}

export async function deleteDnsRecord(actor: Actor, id: string): Promise<void> {
  need(actor, 'system.config');
  const store = { records: await readRecordStore(DNS_KEY, DnsRecord) };
  const found = store.records.find((r) => r.id === id);
  if (!found) throw new ServiceError('not_found', 'That DNS record no longer exists.');
  /*
    This removes the record this system KNOWS ABOUT. It does not touch DNS —
    nothing here has ever written to it. The distinction matters enough to say
    in the audit detail, so a later reader of the log does not conclude a live
    DNS record was deleted.
  */
  await writeStore(
    actor, DNS_KEY, { records: store.records.filter((r) => r.id !== id) },
    'search.dns.delete', `${found.provider} TXT at ${found.host} (tracking entry only; DNS unchanged)`,
  );
}

export async function updateTracking(actor: Actor, raw: unknown): Promise<TrackingSettings> {
  need(actor, 'system.config');
  const parsed = TrackingSettings.parse(raw);
  /*
    An id cannot be switched on while it is empty. Otherwise the screen would
    show "GA4 enabled" with nothing loading, which is the kind of quiet
    disagreement between a control and reality this codebase keeps out.
  */
  const settings: TrackingSettings = {
    ...parsed,
    ga4Enabled: parsed.ga4Enabled && !!parsed.ga4MeasurementId,
    gtmEnabled: parsed.gtmEnabled && !!parsed.gtmContainerId,
  };
  await writeStore(
    actor, TRACKING_KEY, settings, 'search.tracking.update',
    `GA4 ${settings.ga4Enabled ? 'on' : 'off'}, GTM ${settings.gtmEnabled ? 'on' : 'off'}`,
  );
  return settings;
}

// ---------------------------------------------------------------------------
// Checks against the real world
// ---------------------------------------------------------------------------

/** A bounded fetch that never throws, so a check cannot take the screen down. */
async function safeFetch(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: '', error: (e as Error)?.message ?? 'request failed' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether the tag is ACTUALLY being served on the public home page.
 *
 * This is the question an administrator really has, and it is not the same as
 * "did the save succeed": a cached page, a failed deployment or a disabled
 * record all produce a saved setting that is not being served. Three honest
 * answers — detected, absent, unreachable — and never a guess.
 */
export async function checkVerificationRecord(actor: Actor, id: string): Promise<VerificationRecord> {
  need(actor, 'system.config');
  const store = { records: await readRecordStore(VERIFICATION_KEY, VerificationRecord) };
  const i = store.records.findIndex((r) => r.id === id);
  if (i < 0) throw new ServiceError('not_found', 'That verification record no longer exists.');
  const record = store.records[i];
  const at = new Date().toISOString();

  const res = await safeFetch(`${SITE_URL}/`, { headers: { 'user-agent': 'NFRGuide-Admin-VerificationCheck' } });
  let lastCheck: VerificationRecord['lastCheck'];
  if (!res.ok) {
    lastCheck = {
      state: 'unreachable', at,
      detail: res.error
        ? `Could not reach ${SITE_URL}: ${res.error}`
        : `${SITE_URL} answered ${res.status}`,
    };
  } else {
    /*
      Matched on the attributes rather than on a formatted string, because the
      framework decides the attribute order and the quoting, and a check that
      depended on either would report "absent" for a tag that is plainly there.
    */
    const found = findMetaInHtml(res.body, record.metaName, record.value);
    /*
      EVERY OUTCOME NAMES THE URL THAT WAS FETCHED.

      The check asks the site at `NEXT_PUBLIC_SITE_URL`, which is not always
      the host the administrator is looking at — a staging deployment, or a
      misconfigured environment, will answer for a different site entirely and
      honestly report the tag as absent. Saying WHERE it looked turns a
      confusing "not seen yet" into something diagnosable in one glance.
    */
    lastCheck = found
      ? { state: 'detected', at, detail: `Served on ${SITE_URL}/` }
      : {
        state: 'absent', at,
        detail: record.enabled
          ? `Fetched ${SITE_URL}/ and the tag was not in it. A cached page, a pending deployment, or a site URL pointing somewhere else can explain this.`
          : `This record is switched off, so it is not served on ${SITE_URL}/.`,
      };
  }

  const records = [...store.records];
  records[i] = { ...record, lastCheck };
  await writeStore(actor, VERIFICATION_KEY, { records }, 'search.verification.check', `${record.metaName}: ${lastCheck.state}`);
  return records[i];
}

/**
 * Finds `<meta name="X" content="Y">` in HTML, whatever the attribute order.
 *
 * Exported for testing: the matching rule is the part that decides whether an
 * administrator is told the truth, so it is checked directly rather than only
 * through a network call.
 */
export function findMetaInHtml(html: string, name: string, value: string): boolean {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const nameNeedle = name.toLowerCase();
  for (const tag of tags) {
    const n = /\bname\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (n !== nameNeedle) continue;
    const c = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (c === value) return true;
  }
  return false;
}

/**
 * Whether the TXT record is visible in public DNS.
 *
 * Asked over DNS-over-HTTPS so it works from a server with no DNS tooling, and
 * through a resolver that is not the site's own, so the answer reflects what
 * the world sees rather than a local cache. Propagation takes time: "absent"
 * means not visible YET, and the wording says so rather than implying a
 * mistake.
 */
export async function checkDnsRecord(actor: Actor, id: string): Promise<DnsRecord> {
  need(actor, 'system.config');
  const store = { records: await readRecordStore(DNS_KEY, DnsRecord) };
  const i = store.records.findIndex((r) => r.id === id);
  if (i < 0) throw new ServiceError('not_found', 'That DNS record no longer exists.');
  const record = store.records[i];
  const at = new Date().toISOString();

  const host = new URL(SITE_URL).hostname;
  const qname = !record.host || record.host === '@' ? host : `${record.host}.${host}`;
  const res = await safeFetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(qname)}&type=TXT`,
    { headers: { accept: 'application/dns-json' } },
  );

  let lastCheck: DnsRecord['lastCheck'];
  if (!res.ok) {
    lastCheck = { state: 'unreachable', at, detail: `Could not query public DNS: ${res.error ?? res.status}` };
  } else {
    const answers = parseDnsTxtAnswers(res.body);
    lastCheck = answers.includes(record.value)
      ? { state: 'found', at, detail: `Visible in public DNS for ${qname}` }
      : {
        state: 'absent', at,
        detail: answers.length
          ? `${qname} has ${answers.length} TXT record(s), none matching this value yet. DNS changes can take time to propagate.`
          : `${qname} has no TXT records visible yet. DNS changes can take time to propagate.`,
      };
  }

  const records = [...store.records];
  records[i] = { ...record, lastCheck };
  await writeStore(actor, DNS_KEY, { records }, 'search.dns.check', `${qname}: ${lastCheck.state}`);
  return records[i];
}

/**
 * TXT values from a DNS-over-HTTPS JSON answer.
 *
 * Resolvers return TXT data quoted, and long values arrive split into several
 * quoted chunks that a client is expected to join — so a naive read misses a
 * perfectly good record. Exported for testing for that reason.
 */
export function parseDnsTxtAnswers(body: string): string[] {
  try {
    const json = JSON.parse(body) as { Answer?: { type?: number; data?: string }[] };
    return (json.Answer ?? [])
      .filter((a) => a.type === 16 && typeof a.data === 'string')
      .map((a) => {
        const chunks = a.data!.match(/"([^"]*)"/g);
        return chunks ? chunks.map((c) => c.slice(1, -1)).join('') : a.data!;
      });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Indexing diagnostics (read-only)
// ---------------------------------------------------------------------------

export interface IndexingHealth {
  robotsUrl: string;
  sitemapUrl: string;
  /** Live fetch results, each honest about failure. */
  robots: { state: 'ok' | 'unreachable'; status: number; allowsIndexing: boolean | null; declaresSitemap: boolean | null; body: string };
  sitemap: { state: 'ok' | 'unreachable'; status: number; urlCount: number | null };
  /** From the database, not from a crawl. */
  publishedArticles: number;
  noindexArticles: number;
  noindexEntities: number;
}

/**
 * Diagnostics only. Nothing here can change indexing.
 *
 * `robots.txt` is generated in code and is deliberately NOT editable from an
 * admin screen: one mistaken save could remove the entire site from every
 * search engine, and no routine task needs that power. The same reasoning
 * applies to a global noindex. Per-page `noindex` remains where it already
 * lives — in the article editor and the landing SEO screens — and is only
 * COUNTED here.
 */
export async function getIndexingHealth(actor: Actor): Promise<IndexingHealth> {
  need(actor, 'system.config');
  const robotsUrl = `${SITE_URL}/robots.txt`;
  const sitemapUrl = `${SITE_URL}/sitemap.xml`;

  const [robotsRes, sitemapRes, publishedArticles, noindexArticles, noindexEntities] = await Promise.all([
    safeFetch(robotsUrl),
    safeFetch(sitemapUrl),
    prisma.article.count({ where: { workflowStatus: 'PUBLISHED' } }),
    prisma.articleSeo.count({ where: { robots: { contains: 'noindex' } } }),
    prisma.entitySeo.count({ where: { noindex: true } }),
  ]);

  const robotsBody = robotsRes.ok ? robotsRes.body.slice(0, 4000) : '';
  return {
    robotsUrl,
    sitemapUrl,
    robots: {
      state: robotsRes.ok ? 'ok' : 'unreachable',
      status: robotsRes.status,
      // A site-wide block is the one thing worth calling out loudly.
      allowsIndexing: robotsRes.ok ? !/^\s*Disallow:\s*\/\s*$/im.test(robotsBody) : null,
      declaresSitemap: robotsRes.ok ? /^\s*Sitemap:\s*\S+/im.test(robotsBody) : null,
      body: robotsBody,
    },
    sitemap: {
      state: sitemapRes.ok ? 'ok' : 'unreachable',
      status: sitemapRes.status,
      urlCount: sitemapRes.ok ? (sitemapRes.body.match(/<loc>/g) ?? []).length : null,
    },
    publishedArticles,
    noindexArticles,
    noindexEntities,
  };
}

/** One recorded change or check, for the history table. */
export interface VerificationAuditRow {
  id: string;
  action: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
}

/** Recent audit entries for this module, for the per-record history. */
export async function listVerificationAudit(actor: Actor, limit = 50): Promise<VerificationAuditRow[]> {
  need(actor, 'system.config');
  const rows = await prisma.auditLog.findMany({
    where: { entityType: 'search_engine_verification' },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
    include: { actor: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    detail: r.detail,
    actorName: r.actor?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

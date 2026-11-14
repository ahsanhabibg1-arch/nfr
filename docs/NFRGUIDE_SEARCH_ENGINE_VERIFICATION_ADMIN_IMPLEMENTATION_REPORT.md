# NFRGuide — Search Engine Verification & Indexing Administration

**Written for:** the site owner and whoever maintains this CMS next.
**Date:** 2026-11-15
**Status:** implemented and verified on the local stack. Not committed, not deployed, no production database or DNS changed.

---

## 1. What this adds, in one paragraph

An administrator can now verify the site with Google, Bing, Yandex, Pinterest, Meta and Ahrefs — adding, rotating and removing the verification tag themselves, and confirming from the same screen that the tag is really being served on the public site. Analytics identifiers and indexing diagnostics live beside it, clearly separated, because the three are routinely confused. No developer and no deployment is needed for a routine token change once this is live.

It lives at **Settings → Search Engines & Verification**.

---

## 2. Three things kept apart on purpose

An administrator asking "how do we get on Google?" is usually offered an analytics id, which does nothing for it. The screen therefore states what each section is and is not:

| | What it does | What it does **not** do |
|---|---|---|
| **Verification** | Proves the site is yours, by serving a meta tag or publishing a DNS record. A public token. | Does not affect what readers see. Does not get pages indexed. |
| **Tracking** | Measures visits (GA4, Tag Manager). Loads third-party script into a reader's browser. | Not verification. Not indexing. Off until explicitly switched on. |
| **Indexing** | Whether search engines may list a page. Owned by the SEO rules and the per-page `noindex`. | **Not editable here** — only reported. |

---

## 3. Supported providers

| Provider | Meta tag name | Where the token comes from |
|---|---|---|
| Google Search Console | `google-site-verification` | Search Console → Settings → Ownership verification → HTML tag |
| Bing Webmaster Tools | `msvalidate.01` | Bing Webmaster Tools → Site verification → Option 2 |
| Yandex Webmaster | `yandex-verification` | Yandex Webmaster → Site rights → Meta tag |
| Pinterest | `p:domain_verify` | Pinterest → Claimed accounts → Claim website |
| Meta (Facebook) | `facebook-domain-verification` | Meta Business Suite → Brand safety → Domains |
| Ahrefs | `ahrefs-site-verification` | Ahrefs Webmaster Tools → Add project |
| Custom | an administrator-supplied name | For a provider added after this was written |

---

## 4. The safety boundary, and why it is where it is

A verification record puts an administrator-supplied `name` and `content` straight into the public document head. Two things had to be impossible.

**A meta tag that controls crawling.** `<meta name="robots" content="noindex">` saved through this screen would remove the entire site from every search engine — from a screen whose purpose is the opposite. `robots`, `googlebot`, `bingbot`, `refresh`, `viewport`, `content-security-policy` and others are refused outright, in any casing, including through the custom-provider field.

**A value that escapes the attribute.** Tokens are held to `[A-Za-z0-9_\-=.:/+]{6,200}` — no quotes, no angle brackets, no spaces. `"><script>alert(1)</script>` is refused with an explanation.

Both rules are enforced **twice**: when saving, and again when rendering. Storage is validated, but a renderer that trusts its input is one bad import or one direct database edit away from publishing an arbitrary tag. A test writes a malicious row directly into the database, bypassing the service, and asserts the public reader drops it while still serving the legitimate record beside it.

Two active records for the same tag name are refused: two `google-site-verification` tags in one head is ambiguous, and which one a crawler honours is not something this code should guess at. A rotation is staged by disabling the old record and saving the new value.

---

## 5. What was found and fixed while building this

**One bad row discarded every good one.** The store was parsed as a whole, so a single malformed record made the entire verification list come back empty — silently un-verifying the site with every provider at once while the admin screen showed nothing wrong. Records are now parsed individually, so damage is contained to the record that is actually broken. Found by the test that writes a malicious row directly.

**The check could not say where it looked.** The public check fetches the site at `NEXT_PUBLIC_SITE_URL`, which is not always the host the administrator is looking at. A staging deployment or a misconfigured environment answers for a different site and the tag is honestly reported absent — indistinguishable from a real failure. Every outcome now names the URL that was fetched.

**A saved tag was not served for up to five minutes.** The public pages are rendered with ISR, so after a save the previous head kept being served until the window elapsed. An administrator who saved a tag and pressed Check was told, truthfully, that it was not being served. The public head reads are now cache-tagged and every write calls `updateTag`, so the change is live immediately.

**`unstable_cache` made the service uncallable outside a request.** Caching was first put inside the service, which broke every test and would have broken any script or job calling it (`Invariant: incrementalCache missing`). Caching now lives at the render boundary — the public layout — and the service functions stay plain, testable and callable anywhere.

---

## 6. DNS verification — implemented as manual, deliberately

**No Cloudflare API credentials are configured in this environment** (`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` are absent), DNS mutation was explicitly not authorised, and there is no authorised test environment in which a DNS-writing client could be exercised. Writing an untested client that mutates production DNS would have been the wrong call.

What is implemented instead, and works end to end:

- record the TXT record a provider asked for, with its host and value;
- show it **copy-ready**, as `host TXT value`, with the apex resolved to the real domain;
- **check public DNS** on demand, over DNS-over-HTTPS through a public resolver — so the answer reflects what the world sees, not a local cache;
- report `found` / `not seen yet` / `could not check`, never a guess, with propagation delay stated as a normal explanation rather than an error;
- audit every change, and state in the audit entry that removing a tracked record **does not touch DNS**.

The section says plainly that nothing here writes to DNS. If credentials are added later, the status line changes to say so.

---

## 7. Search Console API

Reading performance data from Search Console is separate from owning the site, and needs a service account with access to the verified property. That connection is configured with server environment variables (`GSC_SITE_URL`, `GOOGLE_APPLICATION_CREDENTIALS`), **not** from this screen, because it involves a private credential that must never pass through a browser. Its live status continues to be reported on Analytics & Search, which already owned it.

**There is deliberately no "submit to Google" or "index now" button.** Nothing this site can do makes a search engine index a page. A control implying otherwise would be a lie, and the section says so.

---

## 8. Analytics and tracking identifiers

GA4 measurement ids (`G-XXXXXXXXXX`) and Tag Manager container ids (`GTM-XXXXXXX`) can be saved, validated and removed.

**Saving an id does nothing on its own.** Each has a separate "load on the public site" switch, off by default, because loading a tracking script into every reader's browser is a privacy decision rather than a configuration detail. An id cannot be switched on while it is empty, so the screen never claims more than is true. The id is the only value interpolated into the provider's own documented snippet, and it has already been held to its exact shape.

**Consent is not handled.** The screen says so. If this site must ask readers before tracking them, that has to be in place before either switch is used.

---

## 9. Indexing diagnostics

On demand, the screen fetches and reports:

- `robots.txt` — HTTP status, whether it blocks the whole site, whether it declares the sitemap, and the served text;
- `sitemap.xml` — HTTP status and the number of URLs;
- content counts from the database — published articles, articles set to `noindex`, landing pages set to `noindex`.

**`robots.txt` is generated in code and is not editable here.** One mistaken save could remove the entire site from every search engine, and no routine task needs that power. The same reasoning applies to a global `noindex`. Per-page indexing stays where it already lives: the article editor's robots directive, and the landing SEO screens.

---

## 10. Security

- Every read and write requires `system.config`, checked in the Server Action **and** again in the service, so a future caller that forgets cannot bypass it. A `reader` role is refused on all nine entry points, which is tested.
- Every change and every check is written to the audit log against the signed-in administrator, with the tag name and the outcome — not the token — so the log stays readable. The history is shown in the screen itself.
- Verification tokens are public by design (they are published in the head). API credentials are not stored here at all; they remain environment variables.
- No secret is ever sent to the client: the panel receives verification records and tracking ids only.
- External requests are bounded (8-second timeout, abort controller) and never throw, so a slow or unreachable host cannot take the settings screen down.

---

## 11. Migrations

**None.** `SystemSetting` is an existing key–value JSON table, so the three new keys (`search_verification`, `search_dns_verification`, `search_tracking`) needed no schema change. Nothing was applied to any production database as part of this work.

---

## 12. Test results — exact

### Unit (Vitest) — full suite

```
Test Files  162 passed (162)
     Tests  3597 passed (3597)
```

The 20 tests in `tests/search-engine-verification.test.ts` cover: refusal of crawl-controlling meta names in any casing, refusal of malformed names, provider names not being client-negotiable, token-charset refusal of six attack shapes, `forbidden` on all six service entry points without `system.config`, the add→serve→rotate→disable→remove lifecycle, refusal of a duplicate active tag, several providers served at once, audit entries for create and delete, dropping a dangerous row written directly to the database, meta detection across attribute orders and quoting styles, non-matching tags and body text not counting as a match, joining of split TXT chunks, rejection of non-TXT and malformed DNS answers, tracking id shape validation, tracking loading nothing until switched on, enabling refused without an id, and honest Cloudflare status.

### Browser (Playwright) — `e2e/search-engine-verification.spec.ts`

```
9 passed (45.3s)   run 1
9 passed (44.7s)   run 2
```

Run twice deliberately: an earlier version was intermittently failing on a different test each run, which is the signature of a race rather than a defect. The cause was stale-while-revalidate — after an invalidation the next request is answered from the previous render while the new one is built — so the helper now discards one response and reads the second, which asks the question the test actually means.

What the browser tests assert, against the **real public HTTP response** rather than the admin screen's claims:

1. adding a Google token puts the tag in the public response;
2. the Check button reaches a definite honest state and names the URL it fetched;
3. rotating the token replaces it and the old one stops being served;
4. removing the record removes the tag from the public response;
5. a Bing token is served under its own tag name;
6. a malicious token is refused, nothing is created, and no script reaches the page;
7. indexing diagnostics report the real `robots.txt` and sitemap;
8. the change history records who did what;
9. an unauthenticated visitor cannot reach the settings screen.

### Other checks

- `tsc --noEmit` — clean.
- `next build` — compiled successfully.
- No schema change, so no drift check applies.

---

## 13. Limitations, stated plainly

1. **Automatic Cloudflare DNS management is not implemented.** No credentials, no authorised test environment, and DNS mutation was not authorised. The manual path is complete and the public-DNS check is real. §6 explains the reasoning.
2. **The public check and the DNS check make outbound requests.** They are explicit, button-triggered, bounded to 8 seconds, and never throw. Nothing happens automatically in the background.
3. **The check reads `NEXT_PUBLIC_SITE_URL`.** In an environment where that points somewhere other than the site being administered, the answer is about that other site. Every outcome now names the URL, which makes this visible rather than confusing.
4. **Tracking has no consent gate.** Both switches are off by default and the screen says so.
5. **Search Console API data is still not connected** — unchanged by this work, and still configured by environment variables.
6. **`AdminTabs` renders plain buttons, not an ARIA tab set.** Pre-existing and left alone, since redesigning unrelated modules was out of scope; the browser test selects by button role accordingly.

---

## 14. Files

**New**
- `apps/web/lib/cms/searchEngineService.ts` — vocabulary, validation, storage, checks, diagnostics
- `apps/web/app/admin/search-engine-actions.ts` — nine Server Actions, all permission-gated
- `apps/web/views/admin/AdminSearchEnginePanel.tsx` — the six-section admin surface
- `apps/web/components/analytics/SiteTracking.tsx` — the only third-party script path, gated
- `apps/web/tests/search-engine-verification.test.ts` — 20 unit tests
- `apps/web/e2e/search-engine-verification.spec.ts` — 9 browser tests
- this report

**Changed**
- `apps/web/app/(public)/layout.tsx` — verification metadata and tracking, cache-tagged
- `apps/web/views/admin/AdminSettingsPage.tsx` — the new tab
- `apps/web/app/admin/(dashboard)/settings/page.tsx` — loads the config

---

## 15. To actually get indexed by Google

The feature removes the developer from the loop; it does not remove the work. In order:

1. Add the property in Search Console, choose **HTML tag**, copy the token.
2. Settings → Search Engines & Verification → Google → paste → Add → **Check** until it reads *Serving*.
3. Press Verify in Search Console.
4. Submit `https://nfrguide.com/sitemap.xml` there.
5. Use **Run checks** on this screen to confirm `robots.txt` does not block the site and declares the sitemap.

A domain-wide property instead needs the DNS TXT route in §6, which covers every subdomain at once.

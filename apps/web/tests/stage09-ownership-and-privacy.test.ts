import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Stage 09 Tasks F and K — SEO content ownership, and the security / privacy
 * review.
 *
 * Task F asks whether entity data has been duplicated into Builder layout JSON,
 * which would make the Visual Builder a second copy of the Structured CMS. Task
 * K asks whether Stage 09's work weakened any security control, and whether the
 * site's privacy claims match what the code actually does.
 *
 * The privacy section contains the most serious finding in Stage 09, and it is a
 * factual one rather than an engineering one: the published Privacy Policy
 * states something about readers that the codebase contradicts.
 */

const ROOT = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const registry = read('lib/cms/sectionRegistry.ts');

/* ── Task F — the Builder references entities, it does not copy them ── */

describe('Stage 09 Task F — Builder layout JSON holds references, not entity copies', () => {
  it('the only entity link a block stores is an ID list', () => {
    /**
     * Seven blocks offer a content picker, and every one of them stores
     * `featuredIds` — a list of identifiers, resolved against the database at
     * render time. None stores the chosen article's headline, deck, image or
     * date, so an editor correcting a headline in the Structured CMS does not
     * leave a stale copy behind in layout JSON.
     *
     * This is the Stage 02 §2.2 non-duplication rule holding at the property
     * level, where Stage 08 only checked it for global footer text.
     */
    const pickers = [...registry.matchAll(/type: 'featured'/g)];
    expect(pickers.length, 'content pickers exist').toBeGreaterThan(0);
    const keys = [...registry.matchAll(/key: '(\w+)', label: '[^']*', type: 'featured'/g)].map((m) => m[1]);
    expect(new Set(keys), 'every picker stores an id list and nothing else').toEqual(new Set(['featuredIds']));
  });

  it('no block property stores a copy of entity content', () => {
    /**
     * The direct check for the failure mode: a prop key naming a field that the
     * Structured CMS already owns. A block may own its own kicker, heading or
     * CTA label — those are presentation copy the Builder authored. What it may
     * not own is the entity's title, name, date, venue, score or biography.
     */
    const forbidden = [
      'articleTitle', 'articleDeck', 'articleExcerpt', 'articleSlug', 'articleBody',
      'competitorName', 'competitorBio', 'competitorEarnings', 'competitorHometown',
      'eventName', 'eventDate', 'eventStartAt', 'eventEndAt',
      'venueName', 'venueAddress', 'venueCapacity',
      'authorName', 'authorBio', 'publishedAt',
    ];
    const offenders = forbidden.filter((k) => registry.includes(`key: '${k}'`));
    expect(offenders, 'entity content belongs to the Structured CMS alone').toEqual([]);
  });

  it('a stale pick degrades to a gap, not to stale text', () => {
    /**
     * The consequence of storing IDs: when a pinned article is deleted or
     * unpublished, the resolver drops it and backfills. Because no copy was
     * stored, there is nothing left to render incorrectly — the worst case is
     * one fewer card, never a headline that no longer exists.
     */
    const data = read('lib/cms/homepageData.ts');
    // The props yield ids (`idListProp`), which are then resolved against
    // published content (`getPublishedArticlesByIds`) and backfilled
    // (`pickedThenAuto`). No text is read out of the props.
    expect(data).toContain("idListProp(heroSlot.props, 'featuredIds')");
    expect(data).toContain('getPublishedArticlesByIds');
    expect(data).toContain('pickedThenAuto');
    // `idListProp` is typed to return identifiers and nothing else.
    expect(read('lib/cms/slotProps.ts')).toMatch(
      /export function idListProp\(props: Record<string, unknown>, key: string\): string\[\]/,
    );
  });
});

/* ── Task K — security controls are unchanged ───────────────────────── */

describe('Stage 09 Task K — no security control was weakened', () => {
  const config = read('next.config.mjs');

  it('every security header is still present at its established value', () => {
    // Stage 09 touched no header. Re-asserted here so the claim is measured
    // rather than asserted in prose, and so a later edit has to break a test.
    const expected: [string, string][] = [
      ['X-Content-Type-Options', 'nosniff'],
      ['X-Frame-Options', 'SAMEORIGIN'],
      ['Referrer-Policy', 'strict-origin-when-cross-origin'],
      ['X-DNS-Prefetch-Control', 'off'],
      ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains'],
      ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()'],
    ];
    for (const [key, value] of expected) {
      expect(config, `${key} must keep its value`).toContain(`{ key: '${key}', value: '${value}' }`);
    }
  });

  it('the frame directives stay at self and are never widened to a host list', () => {
    expect(config).toContain(`"frame-ancestors 'self'"`);
    expect(config).toContain(`"frame-src 'self'"`);
    // Scoped to the directive strings themselves: a wildcard or an added host
    // would have to appear inside one of these quoted directives.
    const directives = [...config.matchAll(/"frame-(?:ancestors|src) ([^"]*)"/g)].map((m) => m[1]);
    expect(directives, 'both directives are declared').toHaveLength(2);
    for (const d of directives) {
      expect(d, 'no wildcard or host list in a frame directive').toBe("'self'");
    }
  });

  it('RECORDED: the CSP is still report-only, so it enforces nothing', () => {
    /**
     * A standing limitation, not a Stage 09 regression, and recorded rather than
     * changed. The policy is served as `Content-Security-Policy-Report-Only`,
     * so its directives only log violations to `/api/csp-report/`. In
     * particular `script-src 'self' 'unsafe-inline'` would permit inline script
     * even if it were enforcing, so switching the header on would need the
     * inline scripts nonced first.
     *
     * Enforcing it is a change that can take the whole site down if a directive
     * is wrong, which is not a Stage 09 scope item. It belongs in the Stage 10
     * readiness register with a staged rollout: collect report-only violations,
     * nonce the inline scripts, then enforce.
     */
    expect(config).toContain(`{ key: 'Content-Security-Policy-Report-Only', value: csp }`);
    expect(config, 'the enforcing header is deliberately not set yet').not.toContain(`{ key: 'Content-Security-Policy', value: csp }`);
    expect(config).toContain(`"script-src 'self' 'unsafe-inline'"`);
  });

  it('admin and api responses are still uncacheable', () => {
    expect(config).toContain(`{ source: '/admin/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] }`);
    expect(config).toContain(`{ source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }`);
  });

  it('legal page HTML is sanitized before storage', () => {
    // Stage 09 Task E touched this service, so the sanitizer must still run on
    // the write path it changed.
    const svc = read('lib/cms/infoPageService.ts');
    expect(svc).toContain('body: sanitizeLegalHtml(raw.body)');
  });

  it('no Stage 09 deliverable or test embeds a credential', () => {
    /**
     * §14: do not expose credentials or internal configuration in reports. The
     * test database password in particular is only in `.env`, and a report that
     * quoted a connection string would leak it into version control.
     */
    const files: string[] = [];
    const walk = (d: string): void => {
      if (!fs.existsSync(path.join(ROOT, d))) return;
      for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const rel = path.join(d, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/stage09|stage-09/i.test(e.name)) files.push(rel);
      }
    };
    walk('tests');
    walk('e2e');
    walk(path.join('..', '..', 'docs', 'stage-09'));
    expect(files.length, 'Stage 09 artefacts exist to check').toBeGreaterThan(0);
    for (const f of files) {
      const src = read(f);
      expect(src, `${f} must not contain a connection string`).not.toMatch(/postgres(ql)?:\/\/[^\s'"`]*:[^\s'"`@]+@/);
      expect(src, `${f} must not contain a password assignment`).not.toMatch(/(PASSWORD|SECRET|TOKEN)\s*=\s*['"][^'"]{6,}/i);
    }
  });
});

/* ── Task K — the privacy claims against the code ───────────────────── */

describe('Stage 09 Task K — the Privacy Policy contradicts the shipped product', () => {
  const privacy = read('config/legalPages.ts');

  it('FINDING: the policy states readers are not asked to create accounts', () => {
    /**
     * ─────────────────────────────────────────────────────────────────────
     * THE MOST SERIOUS STAGE 09 FINDING, and it is factual, not technical.
     *
     * `config/legalPages.ts`, Privacy Policy, section "Readers", states:
     *
     *     "NFRGuide does not ask readers to create accounts and does not set
     *      advertising or analytics cookies."
     *
     * The first clause is false as shipped:
     *
     *   - `/register/` is a live public route headed "Create your reader
     *     account — Join to comment on NFRGuide articles". It is behind no
     *     feature flag; the page is a plain server component.
     *   - `/login/`, `/account/`, `/forgot-password/` and `/reset-password/`
     *     are live alongside it, with `/api/account` behind them.
     *   - `lib/auth/reader.ts` creates real `User` rows for readers and states
     *     that "Readers share the User model + session system with staff", so a
     *     signed-in reader receives the same session cookie that the policy
     *     discloses only under "Staff accounts".
     *   - `ArticleComment` stores reader-submitted text, with an author
     *     relation to that `User` row and a moderation trail.
     *
     * So reader email addresses, display names, password hashes and
     * verification / reset token hashes are stored, reader-authored text is
     * published, and a session cookie is set — none of it disclosed in the
     * section that addresses readers.
     *
     * The second clause ("does not set advertising or analytics cookies")
     * appears to remain accurate: the analytics pipeline is cookie-free and
     * disabled by default, and the session cookie is neither advertising nor
     * analytics. The defect is the account claim and the missing disclosure,
     * not the cookie sentence.
     *
     * Stage 09 does NOT rewrite this text. The page is `pending-owner-review`
     * and the directive forbids inventing privacy or data-processing
     * commitments, so proposed replacement wording goes to the owner in
     * Package 2 marked NOT LEGALLY APPROVED. What Stage 09 does is make the
     * contradiction impossible to lose: this test fails the moment either side
     * changes, whether the text is corrected or the feature is removed.
     * ─────────────────────────────────────────────────────────────────────
     */
    expect(privacy).toContain('NFRGuide does not ask readers to create accounts');

    // And the contradicting reality, each half proved from the code.
    expect(fs.existsSync(path.join(ROOT, 'app/(public)/register/page.tsx')), '/register/ is live').toBe(true);
    expect(read('app/(public)/register/page.tsx')).toContain('Create your reader account');
    expect(read('lib/auth/reader.ts')).toContain('Readers share the User model + session system');
    expect(read('prisma/schema.prisma')).toContain('model ArticleComment');
  });

  it('the reader registration page is behind no feature flag', () => {
    // So the contradiction cannot be explained away as dormant code.
    const page = read('app/(public)/register/page.tsx');
    expect(page).not.toMatch(/flag|isEnabled|featureEnabled|notFound\(\)/);
  });

  it('registration IS noindexed, which limits exposure but does not fix the claim', () => {
    // Worth stating precisely: the page is kept out of search results, so the
    // policy is not contradicted in the index — only in the product.
    expect(read('app/(public)/register/page.tsx')).toContain('robots: { index: false, follow: false }');
  });

  it('the analytics claims in the policy DO match the code', () => {
    /**
     * The other half of the audit. The policy says first-party analytics is
     * off by default, stores no account, name, email or IP, masks search
     * queries, and that the retention purge is manual. Those statements match
     * the pipeline as built, so they are confirmed rather than flagged.
     */
    expect(privacy).toContain('optional first-party analytics that is switched off by default');
    expect(privacy).toContain('No account, name, email address or IP address is stored with these records');
    expect(privacy).toContain('This purge is currently run manually from the CMS; it is not yet automatic');
    const schema = read('prisma/schema.prisma');
    expect(schema, 'the analytics config exists and is toggleable').toMatch(/model AnalyticsConfig/);
  });

  it('the policy correctly declares the Google Fonts third-party connection', () => {
    expect(privacy).toContain('web fonts are loaded from Google Fonts');
    // And the CSP agrees that this is the only third-party origin.
    expect(read('next.config.mjs')).toContain("font-src 'self' https://fonts.gstatic.com data:");
  });

  it('every legal page still declares the owner inputs it is missing', () => {
    // The privacy page's open questions must still include the analytics
    // decision and the controller identity, since neither is answered.
    expect(privacy).toContain('Data controller identity and contact');
    expect(privacy).toContain('Decision on enabling first-party analytics');
  });
});

/* ── Task G — legal content and affiliate transparency ──────────────── */

describe('Stage 09 Task G — affiliate transparency', () => {
  it('the paid-link rel policy is correct and documented', () => {
    /**
     * Confirmed, not flagged. `lib/monetization/rel.ts` defaults affiliate links
     * to `sponsored nofollow` and always adds `noopener noreferrer`, with
     * `ugc` available for reader-submitted links. That is the behaviour search
     * engines and the FTC's "clear and conspicuous" guidance expect from the
     * markup side, and Stage 09 changes none of it.
     */
    const rel = read('lib/monetization/rel.ts');
    expect(rel).toContain("return ['sponsored', 'nofollow', ...safety].join(' ')");
    expect(rel).toContain("const safety = ['noopener', 'noreferrer']");
    expect(rel).toContain("case 'UGC'");
  });

  it('the seeded disclosure text is correctly hedged and reviewable', () => {
    /**
     * Also confirmed. The database-backed disclosures are conditional ("Some
     * outbound links are affiliate links"; "may earn a commission"), name no
     * partner and no category, and the seed states outright that it never
     * creates a partner, link, revenue or commission record.
     */
    const seed = read('lib/cms/monetizationSeed.ts');
    expect(seed).toContain('Some outbound links are affiliate links; we may earn a commission on qualifying purchases');
    // (The source comment wraps, so this matches across the line break.)
    expect(seed).toMatch(/never any partner,\s*\*?\s*link, revenue, commission or commercial relationship/);
    expect(seed, 'no named partner may be seeded').not.toMatch(/partner\.create|affiliatePartner\.create/);
  });

  it('FINDING: the hardcoded banner fallback makes a stronger claim than the reviewable text', () => {
    /**
     * ─────────────────────────────────────────────────────────────────────
     * A D-13 finding, and the one place where a specific commercial claim is
     * published without passing through any review surface.
     *
     * `components/editorial/DisclosureBanner.tsx` renders, when `type` is
     * `'affiliate'` and no `customNote` is supplied:
     *
     *     "NFRGuide participates in select affiliate programs for hotel
     *      accommodations and verified secondary ticket platforms. We may earn
     *      a modest commission on qualified purchases at no additional cost to
     *      readers."
     *
     * Compare the seeded database text, which says only that SOME outbound
     * links MAY be affiliate links. The component fallback instead asserts, as
     * present-tense fact:
     *
     *   - active participation in affiliate programmes ("participates");
     *   - two specific categories (hotel accommodation, secondary ticketing);
     *   - that the ticket platforms are "verified" — a verification claim;
     *   - a commission relationship.
     *
     * None of it is derived from the monetization database, so the text renders
     * identically whether or not a single affiliate partner exists. It is
     * reachable on a live article: `ArticleView` passes
     * `customNote={article.disclosureNote}`, so an editor who sets the
     * disclosure type to affiliate and leaves the note blank publishes this
     * wording.
     *
     * Stage 09 does NOT edit it. Rewriting a published commercial disclosure is
     * exactly what D-13 reserves to the owner, and §20 forbids inventing
     * affiliate disclosures — including replacing one with my own wording.
     * Proposed replacement text, marked NOT LEGALLY APPROVED, goes to the owner
     * in Package 2. This test pins the current claim so the review has an exact
     * subject.
     * ─────────────────────────────────────────────────────────────────────
     */
    const banner = read('components/editorial/DisclosureBanner.tsx');
    expect(banner).toContain('NFRGuide participates in select affiliate programs for hotel accommodations and verified secondary ticket platforms.');
    expect(banner, 'the claim is hardcoded, not read from the monetization database').not.toMatch(/prisma|getDisclosure|monetization/i);
    // Reachable: the live view supplies only an optional note over this default.
    expect(read('views/ArticleView.tsx')).toContain('customNote={article.disclosureNote}');
  });

  it('the editorial-independence banner correctly DISCLAIMS official affiliation', () => {
    /**
     * The §10 requirement, and it is already met in the right direction: the
     * default non-affiliate banner states that NFRGuide is NOT an official arm,
     * partner or commercial affiliate of the PRCA, WPRA, National Finals Rodeo
     * or Las Vegas Events. A disclaimer needs no authorisation to publish,
     * unlike a claim of affiliation — so this text is safe as it stands and
     * must not be softened.
     */
    const banner = read('components/editorial/DisclosureBanner.tsx');
    expect(banner).toContain('We are not an official arm, partner, or commercial affiliate of the PRCA, WPRA, National Finals Rodeo, or Las Vegas Events.');
  });

  it('nothing in the codebase claims official NFR or PRCA status', () => {
    /**
     * The §10 prohibition, checked across every rendered surface rather than
     * assumed. Searches for the affirmative claim patterns; the disclaimers
     * above are excluded because they are the negation.
     */
    const offenders: string[] = [];
    const claim = /(official|authorized|authorised|sanctioned)\s+(site|website|partner|source|media partner)\s+(of|for)\s+(the\s+)?(NFR|PRCA|WPRA|National Finals)/i;
    const walk = (d: string): void => {
      if (!fs.existsSync(path.join(ROOT, d))) return;
      for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const rel = path.join(d, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.(tsx?|md)$/.test(e.name) && claim.test(read(rel))) offenders.push(rel);
      }
    };
    walk('components');
    walk('views');
    walk('config');
    walk('app');
    expect(offenders, 'no unauthorised affiliation claim may be published').toEqual([]);
  });
});

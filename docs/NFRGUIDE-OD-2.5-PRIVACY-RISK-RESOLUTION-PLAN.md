# NFRGuide — OD-2.5 Privacy Risk Resolution Plan

**Phase 1 — audit and technical containment plan. AUDIT ONLY.**

**Date:** 2026-11-12 · **Repository:** `D:/office/NFR/nfr-main` · **Branch:** `main`
**Owner decision:** OD-2.5 Option B approved — resolve the privacy risk before sharing a staging URL.

No application code, database, schema, migration, legal wording, route, dependency,
infrastructure or user data was modified by this audit. No `.env` file was read. No personal
data, password hash, token or secret value appears anywhere in this report. Nothing was
committed or pushed.

---

## 1. Initial Git checkpoint

| | |
|---|---|
| Repository root | `D:/office/NFR/nfr-main` |
| Branch | `main` ✓ |
| HEAD | `60f08d71e2cb2a3c35094727d183ea6f85198103` — **matches the expected commit** ✓ |
| `origin/main` | `60f08d71e2cb2a3c35094727d183ea6f85198103` — 0 ahead, 0 behind ✓ |
| Working tree | **clean** · Staged 0 · Stashes 0 ✓ |

No discrepancy. Remote state unchanged since the OD-1 push.

---

## 2. Existing reader account architecture

Readers and staff **share one identity system**. `User` is the single account model, and the
distinction is made only by assigned roles — never by a column:

- `lib/auth/reader.ts` → `READER_ROLE_KEY = 'reader'`; `ensureReaderRole()` creates/returns
  the least-privilege `Reader` role, which carries **zero** admin permissions.
- `registerReader()` creates the `User` with `status: 'ACTIVE'` and attaches **only** that
  role, so public registration can never grant CMS access.
- `lib/auth/session.ts` issues the same `nfrguide_session` cookie to readers and staff.
- `lib/auth/rbac.ts` / `permissions.ts` gate every admin capability by permission, so a
  reader session reaching an admin route is rejected server-side.

Consequence for this audit: the privacy question concerns **reader-origin personal data**
inside a shared model, not a separate reader database.

---

## 3. Public route inventory

All six reader pages are `noindex, nofollow` (verified in each file's `metadata`).

| Route | File | Auth required | Behaviour |
|---|---|---|---|
| `/register/` | `app/(public)/register/page.tsx` | No — **fully public** | Renders `RegisterForm`; heading "Create your reader account" |
| `/login/` | `app/(public)/login/page.tsx` | No — public | Sign-in for readers **and** staff |
| `/forgot-password/` | `app/(public)/forgot-password/page.tsx` | No — public | Requests a reset token |
| `/reset-password/` | `app/(public)/reset-password/page.tsx` | No — public | Consumes a reset token |
| `/account/` | `app/(public)/account/page.tsx` | Yes | `redirect('/login/')` when unauthenticated |
| `/account/comments/` | `app/(public)/account/comments/page.tsx` | Yes | Reader's own comment history |

**Server actions** (`app/(public)/account/actions.ts`) — the real enforcement surface, since
each is a POST endpoint callable independently of the page that renders its form:

| Action | Auth | Rate limit | Notes |
|---|---|---|---|
| `registerAction` | **none** | 5 / hour / IP (`register:<ip>`) | **The only unauthenticated path that creates personal data.** Auto-creates a session and redirects to `/` |
| `loginAction` | none | 5 / 15 min per ip+email, 50 / hour per account | Enumeration-safe; audited as `auth.login` |
| `requestPasswordResetAction` | none | 5 / hour per ip+email | Always a generic response |
| `resetPasswordAction` | none (token-bearing) | — | Consumes a single-use token |
| `logoutAction` | session | — | Invalidates the session row |
| `updateProfileAction` | session | — | Own display name only |
| `changePasswordAction` | session | — | Re-authenticates, then revokes all other sessions |
| `submitCommentAction` | session | — | Creates a `PENDING` comment |

**API routes:** only `app/api/account/me/route.ts` (`GET`). No reader-data mutation API.

**Middleware:** `apps/web/middleware.ts` performs **no authentication or gating** — it only
sets `X-Robots-Tag` when `STAGING_NOINDEX=true`. All access control lives in pages, actions
and services.

**Promotion of the feature.** Registration is not an obscure URL; it is advertised in the
site header and under every article:
- `components/account/AccountMenu.tsx:67-68, 86-87` — "Sign in" and a gold "Create account" CTA.
- `components/editorial/CommentSection.tsx:82` — "Sign in or create an account to join the conversation."
- `components/account/forms.tsx:30, 51, 63` — cross-links between the auth forms.

---

## 4. Personal data inventory

| Data | Model · field | Created by | Read by | Public exposure |
|---|---|---|---|---|
| Email address | `User.email` (unique) | `registerReader()` (`lib/auth/reader.ts:55`) | login, `/account/`, admin readers module | **Never public.** Admin-only |
| Display name | `User.name` | same | account, comments | **Public** — shown as the comment author |
| Password | `User.passwordHash` | same (bcrypt, cost 12) | login, password change | Never exposed |
| Account status | `User.status` (`ACTIVE`) | same | login, admin | Not public |
| Verification state | `User.emailVerifiedAt` | never set in practice (§6) | `/account/`, admin | Not public |
| Last login | `User.lastLoginAt` | `loginAction` | admin | Not public |
| Session | `Session.tokenHash`, `expiresAt`, **`ipAddress`**, **`userAgent`** | `createSession()` | session validation | Not public. Note: IP and user-agent are retained per session |
| Reader-authored text | `ArticleComment.body` | `submitCommentAction` → `createComment()` | public article page (approved only) | **Public once approved** |
| Moderation trail | `ArticleComment.status`, `moderatedById`, `moderatedAt`, `moderationReason` | moderation actions | admin | Not public |
| Password-reset token | `PasswordResetToken.tokenHash` | `createPasswordResetToken()` | reset consumption | Hash only, single-use, 1 h TTL |
| Email-verification token | `EmailVerificationToken.tokenHash` | `createEmailVerificationToken()` — **not called during registration** | — | Hash only, 24 h TTL |
| Login audit | `AuditLog` (`auth.login`, with `ip=`) | `loginAction` | admin | Not public |

Only the **display name** and **approved comment body** are reader data visible to the
public. Everything else is admin-scoped or never readable.

---

## 5. Database relationship analysis

```
User ──1:N── Session              (onDelete: Cascade)
     ──1:N── PasswordResetToken   (onDelete: Cascade)
     ──1:N── EmailVerificationToken (onDelete: Cascade)
     ──1:N── ArticleComment  (relation "CommentAuthor", onDelete: Cascade)
     ──1:N── ArticleComment  (relation "CommentModerator", optional → SetNull)
     ──1:N── AuditLog              (actor optional → SetNull)
     ──1:N── UserRole
```

Two consequences that matter for any future deletion policy:

1. **Deleting a reader leaves no orphaned personal data.** Sessions, both token types and
   the reader's own comments cascade away. `AuditLog.actorId` is optional, so audit history
   survives with the actor nulled — which is the correct trade-off between erasure and an
   auditable trail.
2. **Deleting a reader also deletes their comments**, including approved public ones. That is
   a content decision as much as a privacy one, and belongs in the owner's deletion policy
   (§12).

**Account-creation writers — exhaustive.** Only two places call `prisma.user.create`:

| Location | Reachable by |
|---|---|
| `lib/auth/reader.ts:55` (`registerReader`) | **Anyone, unauthenticated** |
| `lib/cms/teamService.ts:103` (staff invitation, `status: 'INVITED'`) | Admin with the staff permission |

This is the single most useful finding in the audit: **exactly one unauthenticated code path
creates personal data**, so containment can be both surgical and provable.

---

## 6. Registration and authentication lifecycle

Traced end to end through `app/(public)/account/actions.ts` and `lib/auth/*`.

| Stage | Works today? | Evidence / limitation |
|---|---|---|
| Registration | **Yes, fully** | `registerAction` → `validateRegistration` → rate limit → `registerReader` → `User` created `ACTIVE` with the reader role |
| Email verification | **No** | `createEmailVerificationToken()` exists but **`registerAction` never calls it**, so `emailVerifiedAt` stays null indefinitely. Verification is deliberately **not** required for login |
| Auto-login after sign-up | Yes | `createSession` + `setSessionCookie`, redirect to `/` |
| Login | Yes, readers and staff | Rejects `SUSPENDED`; generic error message prevents account enumeration |
| Session | Yes | 7-day TTL; `httpOnly`, `secure` in production, `sameSite=lax`; **only the SHA-256 hash is stored**; expiry checked on validation |
| Logout | Yes | Session row deleted, cookie cleared |
| Password change | Yes | Re-authenticates, revokes **all** other sessions, re-establishes the current one |
| Password recovery | **Effectively unusable by readers** | `requestPasswordResetAction` mints a token but **no email provider is configured**, so nothing is sent and nothing is logged. A reader who forgets their password cannot self-recover |
| Password reset | Yes, if a token is somehow held | `consumePasswordResetToken` — single-use, 1 h TTL |
| Self-service deletion | **Does not exist** | No action, route or API deletes one's own account |
| Admin-mediated deletion | **Yes** | `lib/cms/readerAdminService.ts:118` `deleteReader()` — requires `reader.manage`, blocked from touching staff accounts by `assertManageableReader()`, audited as `reader.delete`. Also `setReaderStatus()` (suspend) and `revokeReaderSessions()` |

**Correction carried forward:** earlier reports stated "no account deletion exists". More
precisely: **no self-service deletion exists, but an audited admin-mediated deletion does.**
That distinction changes what the owner must promise in the policy.

Abuse protections present: durable (database-backed) rate limiting on registration, login
(two scopes) and password-reset requests; fail-closed on limiter storage errors;
enumeration-safe responses.

---

## 7. Comments and reader-generated content

| Aspect | Behaviour | Source |
|---|---|---|
| Submission | Authenticated only; stored `PENDING` | `submitCommentAction` → `createComment()` |
| Moderation | Nothing is public until approved | `ArticleComment.status`, default `PENDING` |
| Public display | **Display name only** — `include: { author: { select: { name: true } } }`; email is never selected on the public path | `lib/cms/commentService.ts:35-42` |
| Admin display | Name **and email**, with article context — appropriate for moderation | `lib/cms/commentService.ts:70-74` |
| Reader's own view | `/account/comments/` lists their own comments with status | `listMyComments()` |
| Reader editing/deletion | **No reader-facing edit or delete path** | no such action exists |
| Account-deletion dependency | Cascades: deleting the author deletes their comments | schema FK |
| Orphaned data risk | **None found** — every reader-linked row cascades or nulls deliberately | §5 |

---

## 8. Privacy Policy contradiction — evidence

**The false statement.** `apps/web/config/legalPages.ts:149`, Privacy Policy → section
"Readers" (heading at line 147):

> "NFRGuide does not ask readers to create accounts and does not set advertising or
> analytics cookies."

**Contradicted by, in the same build:**

| Evidence | Location |
|---|---|
| A public page headed "Create your reader account" | `app/(public)/register/page.tsx:9` |
| A "Create account" CTA in the site header | `components/account/AccountMenu.tsx:68, 87` |
| "Sign in or create an account to join the conversation" under every article | `components/editorial/CommentSection.tsx:82` |
| An unauthenticated action that creates a `User` row | `app/(public)/account/actions.ts:28` → `lib/auth/reader.ts:55` |
| Reader-authored text stored against that account | `ArticleComment` model |
| A session cookie issued to readers, disclosed in the policy only under "Staff accounts" | `lib/auth/session.ts:32-41`; policy section at `config/legalPages.ts:162-166` |

**Second-order problem.** Registration requires ticking *"I accept the Terms and Privacy
Policy"* (`components/account/forms.tsx:47-48`). Readers are therefore asked to consent to a
document that denies the very feature they are using, and the Terms themselves state they
are a draft (`config/legalPages.ts:193`).

**Accurate half, for the record.** The cookie clause **is** correct: analytics is
cookie-free and off by default, and the session cookie is neither advertising nor analytics.
The defect is the account claim and the missing reader-data disclosure — not the cookie
sentence.

**Status of the page itself.** All seven legal pages are `pending-owner-review`, render a
visible draft notice, are `noindex` and are excluded from the sitemap. So the contradiction
is published on a reachable page, but not in any search index.

---

## 9. Technical risk assessment

| # | Risk | Severity | Reasoning |
|---|---|---|---|
| R1 | A visitor to a shared staging URL registers, and their email, display name and password hash are stored under a policy that says accounts are not offered | **High** | Single unauthenticated path, actively advertised in the header and on every article |
| R2 | Consent is collected against a contradictory and self-declared draft policy | **High** | `forms.tsx:47` requires acceptance; the policy denies the feature |
| R3 | A reader cannot recover their own password (no email provider) and cannot delete their own account | **Medium** | Support burden and a weak position on erasure requests |
| R4 | No email verification, so any address — including someone else's — can be registered | **Medium** | `emailVerifiedAt` never set; verification not required for login |
| R5 | Session rows retain IP address and user-agent with no stated retention period | **Medium** | `Session.ipAddress`, `Session.userAgent`; no purge job found |
| R6 | A reader's display name becomes public once a comment is approved | Low–Medium | Intended behaviour, but not disclosed in the "Readers" section |
| R7 | Staging is publicly reachable, so R1–R6 apply to real strangers, not just testers | **High** | See §10 |
| R8 | Reader data reaches an admin surface (name + email) | Low | Appropriate and permission-gated; listed for completeness |

**Not at risk:** privilege escalation (reader role carries no admin permission, enforced
server-side), password storage (bcrypt cost 12), session theft via XSS (`httpOnly`), token
storage (hashes only, single-use, expiring), and account enumeration (generic responses).

---

## 10. Staging exposure — three different things

The deployment blueprint sets `STAGING_NOINDEX=true`, which `middleware.ts` turns into
`X-Robots-Tag: noindex, nofollow`. It is important not to mistake that for protection:

| Control | What it actually does | What it does **not** do |
|---|---|---|
| **Indexing prevention** (`noindex`) | Asks compliant crawlers not to list the pages in search results | Does not stop anyone who has the URL; does not stop non-compliant crawlers; does not stop link sharing, referrer leakage or scanning of Render's hostname space |
| **Access control** (none today) | — | There is no HTTP auth, IP allow-list, VPN or invite gate in front of staging. Every public route is reachable by anyone who learns the URL |
| **Personal-data protection** (partial) | Hashing, `httpOnly` cookies, permission gates and `noindex` all reduce *exposure of stored* data | None of it prevents **collection**. A stranger can still create an account, and the data is then stored under a policy that says this does not happen |

So `noindex` addresses discoverability, not access, and certainly not collection. R1, R2 and
R7 are unaffected by it. Any access-control measure (HTTP basic auth, IP allow-list) is an
infrastructure change and is **out of scope for this task** — but it is listed as Option D
below so the owner can weigh it.

---

## 11. Containment options compared

### Option A — disable public reader registration server-side, behind an environment flag (RECOMMENDED)

A single flag, e.g. `READER_ACCOUNTS_ENABLED`, read server-side and enforced at the **action**
first, then reflected in the UI.

1. **Privacy/security benefit.** Closes the only unauthenticated personal-data entry point.
   On a fresh staging database no reader data is ever collected, which makes the policy
   sentence *"does not ask readers to create accounts"* **true for that environment** — the
   contradiction disappears without touching a word of legal text.
2. **Functional consequences.** No new sign-ups. Existing readers can still sign in, view
   `/account/`, change their password and see their comments. Commenting still works for
   anyone already registered. The "Create account" CTA and the comment-section invitation
   must be hidden so navigation is not misleading, and `/register/` should return 404.
3. **Existing-user impact.** **None.** No account is suspended, deleted or logged out.
4. **Database implications.** **None** — no schema change, no migration, no data touched.
5. **Required code changes.** Small and contained — see §13.
6. **Tests.** See §14; crucially, an action-level test proving a direct POST is refused.
7. **Rollback.** Flip the flag. No code revert, no data restoration.

**Default value matters.** Recommend the flag **defaults to enabled** and is set to `false`
explicitly for staging in `render.yaml` (a non-secret `value:`, visible and auditable).
Rationale: a default-disabled flag would change behaviour in development and would break the
existing Vitest and Playwright suites that register readers, creating noise that hides real
failures. Fail-safe-by-default is the more cautious design in the abstract, but here the
environment that needs protecting is explicitly configured, and the blueprint is the right
place to state it.

### Option B — remove or 404 all reader account routes
1. Benefit: the largest reduction in surface — no login, no account pages, no comments.
2. Consequences: existing readers are locked out of their own data; commenting dies entirely;
   the account menu and comment section need wider changes. **Staff login shares `/login/`**,
   so disabling that route would also break staff access to the CMS.
3. Existing-user impact: **severe** — effectively an outage of a shipped feature.
4. Database: none.
5. Code: wider than A, and more likely to break navigation.
6. Tests: large surface.
7. Rollback: code revert.
**Not recommended** — disproportionate, and it endangers staff login.

### Option C — correct the Privacy Policy wording instead
1. Benefit: resolves the contradiction at its source and is the *right* long-term answer.
2. Consequences: **this is a legal decision, not a technical containment**, and OD-2.5 does
   not authorise publishing legal text. It also cannot be done safely today, because it
   depends on facts nobody has supplied yet (retention period, deletion route, controller
   identity).
3–7. Not applicable while the wording is unapproved.
**Required eventually, but it cannot gate the staging URL.** Draft wording already exists,
marked NOT LEGALLY APPROVED, in `docs/audits/NFRGUIDE_OWNER_DECISIONS_REQUIRED.md` (OD-2).

### Option D — put access control in front of staging
1. Benefit: removes R7 wholesale — strangers never reach any page.
2. Consequences: every tester needs the credential; an HTTP-auth layer can interfere with
   crawler/SEO checks and the health probe.
3. Existing-user impact: none (staging only).
4. Database: none.
5. Code: none — it is **infrastructure configuration, explicitly out of scope here**.
6. Tests: smoke the probes behind the gate.
7. Rollback: remove the gate.
**Complementary to A, not a substitute** — it hides the problem from strangers rather than
stopping collection, and it does not help production.

### Option E — hide the registration UI only
**Rejected, and the prompt is right to warn against it.** `registerAction` is a POST endpoint
reachable without the page: hiding the button leaves the data path fully open to anyone who
replays the form. Acceptable only as the cosmetic half of Option A, never alone.

---

## 12. Recommended technical approach

**Option A — environment-gated, server-side disabling of public reader registration, with
the UI entry points hidden to match, plus Option D at the owner's discretion.**

Enforcement order, which is what makes it real rather than cosmetic:
1. **`registerAction` refuses** when the flag is off, before validation and before any
   database write — this is the authoritative gate.
2. **`/register/` returns 404** via `notFound()`, so the page does not advertise a dead form.
3. **UI links hidden** in `AccountMenu` and `CommentSection`, so navigation is honest; the
   comment section should say commenting is unavailable rather than linking a dead route.
4. **`/login/`, `/account/`, `/account/comments/`, password routes, and staff login remain
   untouched**, so no existing user loses access and the CMS is unaffected.

Because registration is the only unauthenticated writer of personal data (§5), this is
sufficient to stop collection — and it is verifiable by a test that POSTs the action directly.

---

## 13. Implementation file inventory (for Phase 2, on approval)

| File | Change | Why |
|---|---|---|
| `apps/web/lib/env.ts` | Read and expose the flag (e.g. `readerAccountsEnabled()`), defaulting to enabled | Keeps environment parsing in the one module that already owns it |
| `apps/web/app/(public)/account/actions.ts` | `registerAction` returns a refusal before `validateRegistration` / `registerReader` | **The authoritative server-side gate** |
| `apps/web/app/(public)/register/page.tsx` | `notFound()` when disabled | No dead form |
| `apps/web/components/account/AccountMenu.tsx` | Hide "Create account" (keep "Sign in") | Honest navigation |
| `apps/web/components/editorial/CommentSection.tsx` | Replace the invitation with an unavailable notice when disabled | Avoid linking a 404 |
| `render.yaml` | Add the flag as a non-secret `value: "false"` for the staging service | Auditable, visible in the blueprint |
| `apps/web/tests/…` + `apps/web/e2e/…` | New tests per §14 | Prove the gate, not the button |

**Not to be touched:** Prisma schema, migrations, existing reader rows, comments,
`config/legalPages.ts`, `lib/auth/reader.ts` internals, `/login/`, staff authentication,
`middleware.ts`.

---

## 14. Required regression tests

1. **Action-level (the important one):** with the flag off, calling `registerAction` directly
   returns a refusal **and creates no `User` row** — asserted by counting users before and
   after against the isolated test database.
2. Action-level: with the flag **on**, registration still succeeds (no regression to the
   shipped feature).
3. Rate limiting still applies when the flag is on.
4. Route-level: `/register/` returns **404** when disabled; 200 when enabled.
5. UI: `AccountMenu` renders no "Create account" link when disabled; still renders "Sign in".
6. UI: `CommentSection` shows the unavailable notice and **no link to `/register/`** when disabled.
7. Unaffected paths: `loginAction` succeeds for an existing reader **and** for staff;
   `/account/` still redirects unauthenticated visitors to `/login/`.
8. Existing-data safety: an existing reader keeps their comments and can still sign in.
9. Browser (Chromium): with the flag off, no public page links to `/register/`.
10. Full regression afterwards on **Node 22.23.4**: `tsc`, full Vitest, production build,
    route and cache harnesses, Playwright, accessibility.

---

## 15. Rollback strategy

- **Primary:** set the flag back to enabled (or remove it from the staging environment) —
  registration resumes immediately. No code revert, no migration, no data restoration.
- **Code-level:** the change is additive and confined to the files in §13; reverting the
  commit restores the previous behaviour exactly.
- **Data-level:** nothing to roll back — no schema change and no data mutation at any point.
- **Risk of rollback:** none to existing accounts; the only effect is whether new sign-ups
  are accepted.

---

## 16. Explicit remaining risks after containment

| ID | Risk | Still open because |
|---|---|---|
| RR1 | The Privacy Policy sentence remains **wrong for production**, where reader accounts are presumably intended | Fixing it is a legal decision (Option C / OD-2) |
| RR2 | If the owner enables registration on staging or production before the wording is corrected, R1 and R2 return in full | The flag is a control, not a policy |
| RR3 | Staging stays reachable by anyone with the URL (R7) | Option D is infrastructure, out of scope here |
| RR4 | Readers still cannot self-recover a password or self-delete an account | Needs an email provider and a deletion policy |
| RR5 | No stated retention for `Session.ipAddress` / `userAgent`, and no purge job | Needs an owner-set retention period |
| RR6 | Existing reader rows, if any exist in a target database, remain stored under the current wording | Deletion/retention is an owner decision; this audit deleted nothing |
| RR7 | No email verification, so addresses are unconfirmed | Blocked on the email provider decision |

Note on RR6: a **newly created** staging database contains **zero** reader accounts, so with
Option A in place no reader personal data would exist on staging at all. That is why Option A
plus a fresh staging database is a genuinely clean position, rather than a mitigation.

---

## 17. Final recommendation

**READY FOR OWNER APPROVAL.**

The privacy risk is well-bounded and the containment is unusually clean, because exactly one
unauthenticated code path creates personal data and it can be closed by a flag without
touching the schema, existing accounts, comments or legal text.

**Approval requested for Phase 2:** implement Option A as specified in §12–§14 —
server-side-first, environment-gated, default enabled, explicitly disabled for staging in
`render.yaml`.

**Owner/legal decisions still required, which this audit did not and cannot answer**
(consolidated as OD-2 in `docs/audits/NFRGUIDE_OWNER_DECISIONS_REQUIRED.md`):

1. Should public reader registration remain available in **production** once the policy is corrected?
2. Should existing reader accounts remain accessible, be suspended, or be deleted?
3. The account-deletion policy — self-service, admin-mediated (which already exists), or none — and whether deleting an account should delete the reader's approved public comments.
4. The data-retention period, including session IP/user-agent retention and whether a purge job is required.
5. The Data Controller identity and contact.
6. Whether email verification and transactional email are to be configured, which also governs password recovery.
7. Approval of corrected Privacy Policy wording (draft supplied, **NOT LEGALLY APPROVED**).
8. Whether to add access control in front of staging (Option D).

**Stopping here, as instructed.** No implementation will begin without explicit approval.

---

### Confirmation

No application code, database schema, migration, data, legal wording, route, dependency,
infrastructure or security configuration was modified. No `.env` file was accessed. No
personal data, hash, token or secret value is reproduced in this report. Nothing was
committed, pushed, deployed or branched. The only file created is this report.

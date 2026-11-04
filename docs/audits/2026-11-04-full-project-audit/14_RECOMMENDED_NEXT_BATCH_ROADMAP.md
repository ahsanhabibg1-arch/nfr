# 14 — Recommended Next Development Batch

**Mode:** READ-ONLY (recommendation only — not implemented).

## The single most important next batch
**Batch 17 — "Pre-Launch Security & Integrity Hardening"** (locally-implementable engineering only).

Rationale: P0 credential rotation, host selection, backups, and NFR 2026 content all require **user/owner action or external verification** and cannot be safely done by an agent in a read-only→implement step. The highest-value work that is *safe to implement locally now* and directly de-risks launch is the security/integrity engineering layer. It unblocks the deploy and content tracks without needing cloud access.

### Include (all local, additive, no cloud writes)
1. **P1-CONC-01** — Optimistic concurrency for CompetitionSession/Result/Standing (additive `version` migration + conflict checks + unit tests). Highest-correctness item; pattern already proven on Article.
2. **P1-SEC-01** — Add CSP (report-only first) + HSTS `preload` in `next.config.mjs`.
3. **P1-SEC-02** — App-level rate limiting for `/admin/login/` and media upload.
4. **P1-SEC-03** — Verify article-body HTML sanitization; add `npm audit` CI gate.
5. **P1-UI-01** — Root-cause the horizontal overflow (replace blanket `overflow-x:hidden` reliance).
6. **P1-DOC-01** — Correct the stale Phase 0 preamble in `KNOWN_LIMITATIONS.md`.

### Explicitly EXCLUDE from Batch 17
- ❌ Credential rotation (owner-performed; secrets).
- ❌ Aiven connection / migration-status verification (needs prod creds).
- ❌ Host/CD/staging/backup provisioning (infra decisions + approvals).
- ❌ NFR 2026 content entry (editorial, source-verified, human).
- ❌ Any R2/DNS/TLS changes.
- ❌ Repo-root Vite cleanup (defer to P2; keep batch focused).

## Decision answers (brief §15)
1. **Most important next batch:** Batch 17 — Pre-Launch Security & Integrity Hardening.
2. **Include:** items 1–6 above.
3. **Exclude:** credential rotation, cloud verification, host/CD/staging/backup, NFR content, DNS/TLS, repo cleanup.
4. **Require user approval:** P0-SEC-ROTATE, P0-DB-LEASTPRIV, P0-DB-AIVEN-VERIFY, P0-INFRA-HOST, P0-INFRA-BACKUP, P1-SSL-01 (all touch cloud/secrets/infra).
5. **Safe to implement locally:** all of Batch 17 (P1-CONC-01, SEC-01/02/03, UI-01, DOC-01) + P2-CLEANUP-01.
6. **Must wait for staging/launch:** host/CD/staging, backup/rollback validation, SSL CA pinning, post-deploy SEO/OG/live-a11y checks, launch smoke against staging.
7. **Minimum safe launch scope:** P0-SEC-ROTATE + P0-DB-LEASTPRIV + P0-DB-AIVEN-VERIFY + P0-INFRA-HOST + P0-INFRA-BACKUP + P0-CONTENT-NFR2026 + Batch 17 (P1 security/concurrency). Everything else deferrable.
8. **Defer post-launch:** P2 items (Vite cleanup, APM/observability depth, public author profiles, advanced analytics, perf tuning).

## Suggested sequencing
```
Batch 17 (local eng, now) ──► Launch-Prep (owner: rotate creds, least-priv role, verify Aiven)
                                   └─► Deploy (host + CD + staging + backup/rollback + SSL)
                                          └─► Content (NFR 2026 source-verified entry)
                                                 └─► Post-deploy QA (live a11y/SEO/OG/smoke) ──► Launch
```

> No launch date is implied or guaranteed. Readiness depends on owner-driven P0 tracks that are outside agent control.

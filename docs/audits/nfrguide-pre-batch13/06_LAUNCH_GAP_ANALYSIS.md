# 06 — Launch Gap Analysis (P0–P3)

Gaps only (implemented features are in docs 02/03). Each: impact, dependency, recommended fix.
**P0** blocker · **P1** launch-critical · **P2** important · **P3** enhancement.

## P0 — must fix before any deploy
| Gap | Why it blocks | Fix (not done in this audit) |
|---|---|---|
| **Exposed credentials still active** (admin login, Aiven DB password, R2 token) | Compromised secrets reach production | Rotate all three; update local `.env` + host secrets; change admin password after first cloud login |

## P1 — launch-critical
| Gap | Impact | Dependency | Fix |
|---|---|---|---|
| **No real, verified NFR-2026 content** | Publication has only seed/demo articles | Editorial research (official sources) | Research + author; never fabricate |
| **NFR-2026 schedules / results / standings** have no data model | Core NFR coverage can't be structured | small additive schema | New batch: `Schedule`, `Result`, `Standing` (+admin+public), verified data only |
| **NFR-2026 landing hub page** missing | No flagship entry experience | content + a page | Build landing (reuse Hub/Event + SEO/FAQ) |
| **Deployment unconfigured** (env validation, health, monitoring, CI/CD, rollback) | Unsafe/opaque production ops | infra decisions | Deploy-readiness batch |
| **Environment-mixing unguarded** (`provider=r2` + local DB) | Local uploads pollute prod R2 / orphan metadata | startup check | Add boot guard asserting storage/DB environment agree |
| **Least-privilege runtime DB role** absent | Broad `avnadmin` used by app | Aiven role setup | Dedicated app role (DML only); keep `avnadmin` for migrations |
| **Connection pooling** for serverless not set | Trial connection cap exhaustion | hosting choice | PgBouncer pool / `pgbouncer=true` / Accelerate |
| **Backup/PITR policy** not configured/documented | Recovery risk | Aiven plan | Enable/verify backups; document restore |
| **Cookie `secure` + session TTL** unverified in prod | Session security | deployed HTTPS | Verify on host |
| Post-deploy **SEO verification** (Search Console, CWV) | Can't confirm SEO outcomes | deployed site | Submit sitemap; monitor |

## P2 — important (soon after launch)
| Gap | Impact | Fix |
|---|---|---|
| Public **index pages** for competitors & venues | Discoverability + internal links + crawl | `/competitors/`, `/venues/` list pages |
| **CDN delivery** for published media (no offload today) | Server bandwidth/cost | Public custom domain for published derivatives only |
| **Subcategory** surface | Finer taxonomy | optional model/UX |
| **Analytics dashboards** depth | Insight | expand views (collection stays opt-in) |
| **SEO Intelligence scheduled scans** | Automated audits | worker/cron |
| **Accessibility** automated checks | a11y assurance | add axe/lighthouse to CI |
| **Article preview** UX | Author confidence | preview route |
| View analytics for venues/competitors | Not tracked (enum not extended) | extend `AnalyticsEntityType` |

## P3 — enhancements (can wait)
- Monetization activation (AdSense/affiliate) — not a launch prerequisite; keep disabled until approved.
- Richer media galleries / in-page media picker for venues & competitors.
- Standings history, multi-year comparisons, advanced search facets.
- Image optimization pipeline tuning; multi-region R2 replication.

## Dependency notes
- All NFR-2026 structured features (schedules/results/standings/broadcast/tickets) depend on **verified
  official data** — a content/editorial dependency, not just code.
- Deployment items depend on owner choices (host, domain, monitoring vendor, pooling strategy).
- The P0 rotation must precede any deploy and ideally precede further cloud work.

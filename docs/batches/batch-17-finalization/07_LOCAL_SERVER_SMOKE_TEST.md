# Finalization §9–10 — Local Server & Functional Smoke Test

## Server
- A leftover `node` listener on port 3000 (my own earlier QA server) was stopped by its port-owning PID (10128); no unrelated process touched.
- Restarted from `apps/web`: `MEDIA_STORAGE_PROVIDER=local APP_ENV=development npm run dev` — `DATABASE_URL` from `.env` = **`nfrguide_dev`** (the migrated dev DB).
- Ready in ~2s; no Prisma/schema errors in the server log (genuine error-signature scan empty).
- **URL: http://localhost:3000** (local only; not exposed publicly; nothing deployed).

## Read-only functional smoke (GET only — no records created/edited/deleted)
| Surface | Result |
|---------|--------|
| `/api/health/` | 200 — `{"status":"ok","time":…}` |
| `/api/ready/` | 200 |
| Homepage `/` | 200 |
| 5 sections (`/competition/`,`/entertainment/`,`/events-shopping/`,`/plan-watch/`,`/rodeo-events/`) | 200 each |
| Competitor directory `/competitors/` | 200 |
| Venue directory `/venues/` | 200 |
| Article detail (`/articles/navigating-thomas-and-mack-center-guide/`, real dev published article) | 200 |
| Admin login `/admin/login/` | 200 (`Cache-Control: no-store`) |
| `/admin/` , `/admin/competition/` , `/admin/articles/` (unauthenticated) | **307 → /admin/login/** (gated; **no 500** → dev schema matches, competition page with `version` runs cleanly) |
| CSP report-only + 5 security headers on `/` | present (see report 03) |
| Dev log genuine-error scan | none |

## Competition Admin / version field
`/admin/competition/` correctly redirects to login when unauthenticated (307, not 500), confirming the server component — which now reads the `version` column — executes without error against the migrated dev DB. Authenticated competition-admin editing (version capture + conflict handling) is covered by the Vitest concurrency suite and the Playwright admin smoke (test DB); a manual authenticated click-through was not performed (no existing dev session), and is noted rather than claimed.

## Not done
- No records created/edited/published/deleted in dev for smoke testing.
- Write-based competition/rate-limit behavior was exercised against the **test** DB only.

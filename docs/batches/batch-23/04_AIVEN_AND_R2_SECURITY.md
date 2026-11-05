# Batch 23 §4.3–4.4 — Aiven & Cloudflare R2 Security Preparation

**No live cloud service modified. No credential displayed, copied, or rotated.** Documentation + safe instructions only.

## Aiven PostgreSQL
| Item | State | Owner action |
|------|-------|--------------|
| TLS verification | Scripts use `ssl:{rejectUnauthorized:false}` (self-signed workaround); `.env.example` mandates `?sslmode=require`. | **Pin the Aiven CA** and enable verified TLS for the app/prod connection (replace `rejectUnauthorized:false`). |
| Insecure SSL bypass | Present in maintenance scripts only (not the app runtime). | Remove once CA pinning is in place. |
| Least-privilege app role | App likely uses an elevated role today. | Create a **scoped app role** for `DATABASE_URL` (CRUD on app schema; no DDL). |
| Separate migration role | Not separated. | Use a distinct **privileged role** only for `prisma migrate deploy`. |
| Connection-string security | Server-only; `.env` gitignored; redacted in logs (`lib/env.ts redactUrl`, `lib/logger.ts`). | Store in the host secret store; never in code/image. |
| Credential rotation | Admin/Aiven/R2 secrets were exposed earlier in chat. | **Rotate all three** before any real deployment (P0). |
| Backup / recovery | Not configured. | Enable Aiven automated backups / PITR; test a restore into a disposable DB. |

> **Do not treat the existing Aiven database as disposable or as the staging DB.** Provision a **separate staging database (or role/schema)** on Aiven for Render staging (report 07).

## Cloudflare R2 (verified in code — unchanged)
| Control | Evidence | Status |
|---------|----------|--------|
| Private bucket + gated delivery | `app/api/media/[...key]/route.ts` — non-public assets require `media.view`; drafts/private → 404 (no existence leak). | ✅ keep private |
| Upload authorization | `app/api/admin/media/upload/route.ts` — RBAC `media.upload` + durable rate limit (429/503). | ✅ |
| MIME & file-signature validation | browser MIME re-verified against the file signature inside `uploadMedia`; `DEFAULT_MAX_BYTES` cap + a pre-parse content-length check (413). | ✅ |
| Object-key handling | key must match the asset's `storageKey` or a known derivative, else 404 (no traversal). | ✅ |
| Cache-control | public assets long-immutable; private `private, no-store`; `X-Content-Type-Options: nosniff`. | ✅ |
| Error handling | structured JSON + correct status; never logs secrets. | ✅ |
| `publicUrl` contract | returns the gated **proxy path**, not a direct bucket URL → drafts never exposed. | ✅ do not change |

### Render / VPS compatibility
- The S3 adapter (`@aws-sdk/client-s3`) is host-agnostic; works on Render and a future VPS with the `MEDIA_S3_*` env vars.
- **On Render's ephemeral filesystem, `MEDIA_STORAGE_PROVIDER` MUST be `r2`** (local disk is wiped on redeploy/restart). The app already supports this via env.
- Keep the bucket **private**; serve through the gated proxy. `MEDIA_S3_PUBLIC_BASE_URL` / a public domain remains an approval gate.

## Safety
No Aiven/R2 configuration, bucket ACL, or credential was modified. The bucket must remain private.

# RBAC Governance (Batch 09)

A single, maintainable permission architecture over the existing five roles. **No new
permission strings and no role changes were introduced in Batch 09** — this is organization +
consistent enforcement, not a privilege broadening.

## Source of truth

`lib/auth/rbac.ts` — the enforced `Permission` union + `ROLE_PERMISSIONS` map (default-deny).
Every service re-checks permissions server-side; the UI only hides controls cosmetically.

## Registry (`lib/auth/permissions.ts`)

- `CMS_MODULES` — the 12 modules, each mapped to the EXISTING permission that gates its view.
- `visibleModuleIds(roles)` — the modules a role may see; the admin sidebar is filtered by this
  server-derived set, so UI visibility and server authorization agree.
- `buildPermissionMatrix()` — generates the Team page's permission matrix directly from
  `ROLE_PERMISSIONS`, so the displayed matrix can never drift from what is enforced.

## Module → view permission

| Module | View permission | Visible to |
|---|---|---|
| Overview, Articles, Rodeo, Organization, Sources, Website | `cms.access` | all staff |
| Media Library | `media.view` | all staff |
| SEO Intelligence | `seo.audit.view` | all staff |
| Analytics & Search | `analytics.view` | all staff |
| Monetization | `monetization.view` | all staff |
| Team & Permissions | `user.manage` | Super Admin, Administrator |
| System Settings | `system.config` | Super Admin only |

(Mutations within each module remain gated by finer permissions in the services, unchanged.)

## Assignment boundaries

- `role.assign` is required to change roles (Super Admin, Administrator).
- Only a Super Admin may grant or remove `super_admin`.
- No self role/status change; last active Super Admin protected (serializable).
- All role/status changes are audited and revoke the target's sessions on privilege change.

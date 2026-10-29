# Media Data Model (Batch 05)

> Audience: engineers. The extended `MediaAsset` and the media relationship
> tables. Migration `20261029200000_batch05_media` (additive).

## MediaAsset (extended, not duplicated)

Binaries live in object storage; this row is metadata only.

| Field | Purpose |
|---|---|
| `id` | asset id (also embedded in the storage key) |
| `storageProvider` | `local` \| `r2` \| `s3` \| `legacy-local` |
| `storageKey` (unique) | object key within the provider |
| `url` | public URL (route handler in dev, CDN in prod); legacy keeps `/assets/...` |
| `filename`, `safeFilename`, `extension` | original + sanitized names + ext |
| `mimeType`, `format`, `bytes` | detected type/size |
| `width`, `height`, `dimensions` | pixel dims (ints) + legacy display string |
| `checksum` | sha256 of the original (dedup + integrity) |
| `title`, `seoTitle`, `altText`, `caption`, `credit` | reusable asset metadata |
| `copyrightHolder`, `licenseType`, `licenseSourceUrl`, `usageRestrictions`, `sourceAttribution` | licensing/attribution (§11) |
| `rightsStatus` | kept for legacy compatibility |
| `rightsConfirmed`, `rightsConfirmedById`, `rightsConfirmedAt` | the publish-eligibility gate |
| `processingStatus` | `UPLOADING`\|`PROCESSING`\|`READY`\|`FAILED` |
| `visibility` | `DRAFT`\|`PUBLIC`\|`ARCHIVED` |
| `derivatives` (JSON) | `{ thumb:{key,w,h,bytes}, md:{…}, lg:{…} }` |
| `uploadedById` → User | ownership (SetNull) |
| `uploadedAt`, `updatedAt` | timestamps |

Enums added: `MediaLicenseType` (OWNED, LICENSED, PERMISSION_GRANTED,
PUBLIC_DOMAIN, OTHER, UNCONFIRMED), `MediaProcessingStatus`, `MediaVisibility`.

Indexes: `storageKey` unique; `(visibility, processingStatus)`; `uploadedById`;
`checksum`.

## Relationships

- `ArticleMedia` (existing) — article ↔ asset by `usageKey` ('hero', 'inline-N'),
  with context-specific `altText`/`caption`. **Article-specific** metadata,
  distinct from the asset's reusable metadata.
- New junctions (reuse one binary across entities, no duplication):
  `RodeoHubMedia`, `RodeoEventMedia`, `RodeoEventEditionMedia`, `DisciplineMedia`,
  `VenueMedia` — each `(entityId, mediaId)` PK + `role` ('hero'|'gallery') +
  `sortOrder`, indexed on `mediaId`. Events and editions are **separate tables**,
  preserving the recurring-event vs. annual-edition distinction.

## Migration safety

Additive only — existing `MediaAsset` columns are untouched; new columns have
defaults so the seeded rows backfill (`storageProvider='legacy-local'`,
`visibility='PUBLIC'`, `processingStatus='READY'`, `updatedAt=now()`). No data
reset; the 11 seeded media references keep their `/assets/...` URLs and are
grandfathered past the rights gate. See [MIGRATION_STATUS.md](MIGRATION_STATUS.md).

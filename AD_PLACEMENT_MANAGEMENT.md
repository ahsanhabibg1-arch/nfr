# Ad Placement Management (Batch 08)

AdSense-ready logical placements. **External ad serving is DISABLED by default and no AdSense
script is injected in this batch** (owner-gated, §9/§30).

## Model: `AdPlacement`

`slot` (HOMEPAGE / ARTICLE_HEADER / ARTICLE_INCONTENT / ARTICLE_FOOTER / CATEGORY /
RODEO_EVENT / SIDEBAR), `name`, `pageScope` (home/article/category/rodeo_event/global),
`enabled` (default false), `device`, `position`, `priority`, `responsive`, `adUnitConfig`
(JSON; publisher/ad-unit id **only** when authorized; null by default), `complianceNotes`.

## Config: `MonetizationConfiguration`

`adsenseEnabled` (false), `adsensePublisherId` (null), `clickTrackingEnabled` (false),
`siteDisclosureEnabled` (true). No publisher/ad-unit id is invented; no AdSense approval is
claimed.

## Public rendering (`AdPlacementSlot`)

`getActiveAdPlacements(scope)` returns `[]` unless `adsenseEnabled` is true. Even when
enabled, `AdPlacementSlot` renders a **reserved, clearly-labeled "Advertisement" container
with no ad script** — space is reserved to avoid layout shift when ads are eventually,
owner-approvedly, enabled. So by default the public site shows no ad boxes.

## UX & compliance rules (§10)

Ads are labeled, never mimic navigation or editorial content, never obscure article text,
and are not placed inside restricted CMS pages. Admin shows configuration + a reserved-space
preview only; no fake creatives. Enabling a placement is `monetization.placement.manage`;
flipping `adsenseEnabled`/publisher id is `monetization.config` (Admin/Super Admin).

## Future activation (owner-gated)

Injecting the real AdSense script, setting a real publisher id, and enabling serving require
explicit owner approval and are out of scope here.

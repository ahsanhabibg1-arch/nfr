# Affiliate Partner Management (Batch 08)

CMS management of commercial partners. **No partners are pre-populated** and none is treated
as official/authorized without verified evidence (§6).

## Model: `AffiliatePartner`

`name`, `slug` (unique), `website`, `category` (STREAMING / TICKETS / TRAVEL / APPAREL /
BOOTS / ACCESSORIES / EQUIPMENT / OTHER), `programType`, `isActive`, `verificationStatus`
(UNVERIFIED / PENDING / VERIFIED / REJECTED), `verifiedAt`, `lastVerifiedAt`,
`complianceNotes`, audit fields.

## Lifecycle

1. **Create** — starts `UNVERIFIED` + `isActive = false`. Website (if given) is URL-validated.
2. **Verify** — `setPartnerVerification` records who/when; de-verifying also deactivates.
3. **Activate** — `setPartnerActive(true)` is **blocked unless `VERIFIED`** (guards against
   claiming an unverified/official partner).
4. **Delete** — reference-safe: blocked if the partner has any links (deactivate/remove first);
   cascades its programs and associations.

## Operations (service)

`listPartners`, `createPartner`, `updatePartner`, `setPartnerActive`,
`setPartnerVerification`, `deletePartner`. All require `monetization.partner.manage` except
`listPartners` (`monetization.view`). Every mutation is audited.

## Categorization & topics

Partners carry a commercial category and may be associated with rodeo topics via
`CommercialEntityAssociation` (see rodeo integration). A partner's commercial status is never
conflated with official broadcast rights or official source status.

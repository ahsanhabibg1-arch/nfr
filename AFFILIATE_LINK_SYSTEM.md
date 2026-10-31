# Affiliate Link System (Batch 08)

A centralized link registry + a safe first-party redirect.

## Model: `AffiliateLink`

`partnerId`, optional `programId`, `label`, `merchantUrl` (original destination),
`trackingUrl` (affiliate destination), `category`, `rel` (paid-link policy), `status`,
`isActive`, `editorialContext`, `effectiveFrom`/`effectiveTo`, `lastVerifiedAt`,
`verificationNotes`, audit fields.

## URL validation (server-side, `lib/monetization/url.ts`)

Rejects: `javascript:`, `data:`, `vbscript:`, `file:`, `ftp:` and any non-http(s) scheme;
`localhost`, loopback (`127.0.0.0/8`), private ranges (`10/8`, `172.16–31/12`, `192.168/16`),
link-local (`169.254/16`, incl. the cloud metadata IP), IPv6 private/link-local, and bare
non-dotted hosts. No server-side fetch of untrusted URLs is performed. Optional external
link-health checking is **not** implemented in this batch (would be bounded + SSRF-safe +
clearly distinguished from editorial verification).

## Rel policy (`lib/monetization/rel.ts`) — documented, not blanket

| Enum | `rel` emitted |
|---|---|
| `SPONSORED_NOFOLLOW` (default) | `sponsored nofollow noopener noreferrer` |
| `SPONSORED` (sponsored content) | `sponsored noopener noreferrer` |
| `NOFOLLOW` | `nofollow noopener noreferrer` |
| `UGC` | `ugc noopener noreferrer` |

## First-party redirect — `/go/[id]/` (owner-approved routing decision, §8)

- Resolves the destination **only** from the DB by stable link id (`trackingUrl ?? merchantUrl`),
  never from the request → cannot be an open redirect.
- Serves only links that are `isActive`, within effective dates, and whose partner is active.
- Re-validates the destination before redirecting (302).
- Inactive/expired/invalid/unknown → safe fallback to `/` (no broken redirect, no leak).
- Records an outbound click only when owner-enabled (see `clicks.ts`); recording never blocks
  the redirect. Destinations are not cloaked deceptively; disclosure context is rendered on
  the page that contains the link.

## Assignment to content

Links reach content via `AffiliatePlacement` (article/rodeo). Editors (any article) and
Authors (own article) propose placements through their article-edit rights; **activation**
requires `monetization.placement.manage`. Reference-safe deletion: a link with placements
cannot be deleted (remove placements first).

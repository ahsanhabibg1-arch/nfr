# NFRGuide.com — Explicit Demonstration Boundaries & Known Limitations

> Specification: **NFRGuide Developer Master Requirements v2.0 Aligned**

This document transparently defines the technical boundaries, prototype scopes, and intentional Phase 0 limitations of NFRGuide.com.

---

## 1. Phase 0 Prototype Scope

Phase 0 is an **Editorial Design Foundation, Responsive UI System, and Custom CMS Prototype**. It is designed to prove editorial UX, validate Concept C visual hierarchy, establish typed data contracts, and demonstrate the 12 CMS workflows prior to backend engineering.

The following systems are intentional client-side demonstration implementations:

---

## 2. Persistence & Storage Boundaries

- **In-Memory & Session Storage**:
  - All article creations, updates, deletions, and revision snapshots are stored in the browser's `sessionStorage` (`nfrguide_demo_articles_v1`).
  - **Limitation**: Changes persist across page navigations and refreshes within the same browser tab, but are NOT shared across different browsers, devices, or users.
  - **Reset**: Navigating to `/admin/settings/` and clicking **Reset Demo Store** (or clearing session storage) restores the baseline editorial catalog.
- **No Remote Database**:
  - There is no active PostgreSQL or Cloud SQL database running in Phase 0.
  - A production-ready Prisma schema and relational migration guide are provided in [DATA_MODELS.md](./DATA_MODELS.md) for Phase 1 implementation.

---

## 3. Authentication & Security Boundaries

- **Simulated Editorial Roles (DEMO ONLY)**:
  - User role switching between the 5 approved roles (`Super Admin`, `Administrator`, `Editor`, `Author`, `SEO Manager`) is a client-side prototype. It allows evaluating how different roles experience the publishing interface and least-privilege rules (e.g. Authors cannot publish directly).
  - **Limitation**: There is no server-side cryptographic token verification (JWT / OAuth2). No password authentication is required to access `/admin/`.
  - **Disclaimer**: All administrative actions and roles are clearly labeled with `(DEMO)` indicators.

- **Public Content Eligibility vs Server-Side Access Control**:
  - In Phase 0, unpublished content isolation is enforced on the client via `isArticlePubliclyEligible()` in React components.
  - **Limitation**: Client-side filtering is NOT a substitute for server-side security. In a production deployment, unpublished drafts must be protected by server-side query filters and authentication middleware so draft data is never transmitted across the network to unauthenticated users.

---

## 4. Search Engine Indexing & Routing (SSR vs SPA)

- **Client-Side Rendering (SPA)**:
  - NFRGuide currently operates as a Vite + React 19 Single Page Application.
  - Metadata, canonical links, and Schema.org JSON-LD are dynamically injected via DOM manipulation (`src/utils/seo.ts`).
  - **Limitation**: While modern Googlebot renders JavaScript, optimal search crawler indexation and social card preview bots (Twitter, Facebook, iMessage) require pre-rendered HTML.
  - **Remediation**: The architecture is decoupled to transition directly into Next.js App Router (SSR/ISR) as outlined in [MIGRATION_PLAN.md](./MIGRATION_PLAN.md).

- **Client-Side Navigation vs HTTP 301/308 Redirects**:
  - Compatibility routes (e.g. `/nfr-competition` &rarr; `/competition/`) are handled on the client using React Router's `<Navigate to="..." replace />`.
  - **Limitation**: Client-side navigation does not return an HTTP 301 or 308 response code to search engine crawlers. In Phase 1, these redirects will be handled at the server level via Next.js configuration.

---

## 5. External API Integrations

- **Weather & Live Ticker Stubs**:
  - The Thomas & Mack Center temperature widget and live scoring alerts in the header ticker use realistic mock data reflecting typical December Las Vegas climate and competition scores.
  - Real-time weather APIs and live PRCA scoring webhooks will be connected via server-side proxies in Phase 1.
- **Commercial Affiliates & Ticketing**:
  - Hotel booking and Cowboy Christmas merchandise links include sample tracking parameters to illustrate FTC-compliant disclosure notices. No real affiliate transactions are processed.

---

## 6. Media Asset Hosting

- **Local & Sample Photography**:
  - Images are bundled as local static assets or curated editorial action photography.
  - There is no cloud blob storage (GCS / S3) upload pipeline in Phase 0. The Media Picker operates against the curated demonstration catalog.

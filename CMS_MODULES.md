# NFRGuide.com — Custom Admin CMS Modules & Authoring Suite

> Specification: **NFRGuide Developer Master Requirements v2.0 Aligned**

This document details the functional specifications, editorial workflows, and interaction mechanics of the **twelve approved CMS modules** built for NFRGuide.com.

---

## 1. CMS Navigation & Operational Domains

The CMS interface is accessible at `/admin/` and is divided into four operational domains:
1. **Editorial Publishing**: Overview, Articles, Rodeo Coverage, Organization & Taxonomy.
2. **Assets & Sources**: Media Library, Sources & References.
3. **Quality & Distribution**: SEO Intelligence, Website & Navigation, Analytics & Search.
4. **Operations & Governance**: Monetization & Ads, Team & Permissions, System Settings.

---

## 2. The Twelve Approved Modules

### Module 01: Overview (`AdminOverviewPage.tsx`)
- **Route**: `/admin/`
- **Key Capabilities**:
  - Live editorial pulse: total articles, published counts, pending reviews, scheduled dispatches.
  - Urgent alerts panel highlighting unverified photography rights, pending reviews, or scheduled releases.
  - Recent activity timeline tracking editorial edits and status updates.
  - Quick action buttons: Compose New Article, Launch Media Uploader, Audit SEO Health.

### Module 02: Articles & Publishing Queue (`AdminArticlesPage.tsx`)
- **Route**: `/admin/articles/`
- **Key Capabilities**:
  - Filterable master table with workflow status tabs (`All`, `Published`, `In Review`, `Approved`, `Scheduled`, `Drafts`).
  - Search by headline, author, or keyword.
  - Multi-select row selection for bulk operations: Move to Review, Publish Selected, Delete Selected.
  - **Shared Publishing Gatekeeper**: Bulk publishing automatically validates every selected article against Category A (editorial blockers) and Category B (rights/compliance blockers). Blocked articles are skipped and reported.
  - Direct actions per row: Edit Dispatch, View Public Article (if published), Delete from Session Store.

### Sub-Interface: Advanced Article Authoring Suite (`AdminArticleEditorShell.tsx`)
- **Routes**: `/admin/articles/new/` and `/admin/articles/:id/edit/`
- **Field Sequence (Strict 8-Field Editorial Order)**:
  1. *Field 01*: **Main Headline (H1)** — Primary editorial title with auto-slug trigger.
  2. *Field 02*: **Secondary Editorial Deck** — Rich contextual subtitle displayed below H1 on public reading views; stored independently from excerpt.
  3. *Field 03*: **Editorial Excerpt / Summary** — 1–2 sentence summary (100–220 chars) for index cards, RSS feeds, and search cards.
  4. *Field 04*: **Article Body** (`RichBlockEditor.tsx`) — 10 typed JSON content blocks (paragraphs with drop-cap, H2/H3 headings, blockquotes, comparison tables, callouts, photography, source links, lists, disclosures, dividers).
  5. *Field 05*: **SEO Title** — 35–65 character guidance with SERP preview.
  6. *Field 06*: **Meta Description** — 110–165 character guidance with snippet preview.
  7. *Field 07*: **Image SEO Title** — For Google Images media indexing.
  8. *Field 08*: **Image ALT Text** — Accessibility description (&ge;10 characters required for compliance).
- **Secondary Metadata & Inspectors (Right Column)**:
  - **URL Slug & Route Path Inspector**: Manual editing with validation; auto-generates for new dispatches but **never overwrites custom user-edited slugs** when headline changes. Includes "Sync with Headline" button.
  - **Quality & SEO Gates**: Real-time deterministic audits across Categories A, B, and C.
  - **Rodeo Relationships Panel**: Multi-discipline, Hub, Recurring Event, and Edition tagger.
  - **Primary Sources Panel**: Attaches authoritative citations and links directly to rulebooks.
  - **Media Picker Modal**: Asset browser enforcing rights statuses (`Staff Photo`, `Editorial Pool`, `PRCA Archive`, `Licensed Creative`, `Unresolved`).
  - **Revision History Modal**: Historical snapshot comparison with restore capability.
  - **Responsive Draft Preview**: Modal rendering live article draft in Desktop (1280px), Tablet (768px), and Mobile (390px) frames with draft watermarks.

### Module 03: Rodeo Coverage (`AdminRodeoCoveragePage.tsx`)
- **Route**: `/admin/rodeo-coverage/`
- **Key Capabilities**:
  - Unified coverage headquarters integrating sub-tab views for:
    - **Rodeo Hubs**: Major geographical rodeo centers (Las Vegas, Texas Circuit, Alberta).
    - **Recurring Events**: Championship fixtures (NFR, Calgary Stampede, Cheyenne Frontier Days, Pendleton).
    - **Yearly Editions**: Specific annual editions (2026 NFR, 2025 NFR, purse amounts, venues).
    - **Seven Disciplines**: Bareback, Steer Wrestling, Team Roping, Saddle Bronc, Tie-Down, Barrel Racing, Bull Riding.
    - **Venues**: Thomas & Mack Center, South Point Arena, Las Vegas Convention Center, Stampede Park.

### Module 04: Organization & Taxonomy (`AdminEditorialOrgPage.tsx`)
- **Route**: `/admin/editorial-organization/`
- **Key Capabilities**:
  - Governs 7 official disciplines, primary editorial sections, tags, and search keywords.
  - Displays article counts per tag and allows creating new taxonomy terms.

### Module 05: Media Library (`AdminMediaPage.tsx`)
- **Route**: `/admin/media/`
- **Key Capabilities**:
  - Media asset repository with rights status indicators: Staff Photo, Editorial Pool, PRCA Archive, Licensed Creative, and Unresolved.
  - ALT text completeness auditor to prevent accessibility lapses.
  - Dimension, file size, and photographer attribution tracking.

### Module 06: Sources & References (`AdminSourcesPage.tsx`)
- **Route**: `/admin/sources/`
- **Key Capabilities**:
  - Manages verified research documentation (PRCA Rulebook, WPRA Historical Records, University Equine Kinematics Papers).
  - Tracks citations across dispatches to reinforce E-E-A-T and factual accuracy.

### Module 07: SEO Intelligence (`AdminSEOPage.tsx`)
- **Route**: `/admin/seo/`
- **Key Capabilities**:
  - Audits 12 SEO rule groups across the publication.
  - Google Search Result SERP simulator (Desktop & Mobile) and OpenGraph social share card preview.
  - Displays publication-wide health score (prototype heuristic) and prioritized remediation queue.

### Module 08: Website & Navigation (`AdminWebsitePage.tsx`)
- **Route**: `/admin/website/`
- **Key Capabilities**:
  - Pin lead hero stories and secondary features for the homepage.
  - Reorder homepage sections and configure breaking news ticker items.
  - Preview homepage layout changes before applying.

### Module 09: Analytics & Search (`AdminAnalyticsPage.tsx`)
- **Route**: `/admin/analytics/`
- **Key Capabilities**:
  - Editorial engagement metrics: read completion rate, scroll depth, session duration.
  - Performance breakdown by primary department (Competition, Entertainment, Shopping, Plan & Watch).
  - Identifies top-performing analysis dispatches and reader search queries.

### Module 10: Monetization & Ads (`AdminMonetizationPage.tsx`)
- **Route**: `/admin/monetization/`
- **Key Capabilities**:
  - Monitors commercial disclosures on all articles.
  - Ensures affiliate partner links (e.g. Las Vegas hotel blocks, authorized merchandise) include visible reader transparency disclaimers.

### Module 11: Team & Permissions (`AdminTeamPage.tsx`)
- **Route**: `/admin/team/`
- **Key Capabilities**:
  - Manages approved 5-role permission model: `Super Admin`, `Administrator`, `Editor`, `Author`, `SEO Manager`.
  - Least-privilege governance: Authors cannot publish directly without review; SEO Managers cannot administer users.
  - Author bio management: credentials, rodeo background, and editorial beats.
  - *Explicitly labeled as DEMO ENVIRONMENT (no server-side RBAC).*

### Module 12: System Settings (`AdminSettingsPage.tsx`)
- **Route**: `/admin/settings/`
- **Key Capabilities**:
  - Configures canonical domain (`https://nfrguide.com`), RSS feeds, robots.txt directives, and default JSON-LD publisher schemas.
  - Includes a one-click **Reset Demo Store** button to restore sample editorial data.

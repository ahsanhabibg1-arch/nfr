# 04 — Public-to-Admin Control Matrix

**Audited:** 2026-11-07

This is the primary deliverable: a verified mapping of every public content entity to its Admin CMS management capability.

## Legend

- **FC** = FULLY CONTROLLED (create, edit, SEO, media, relationships, publish/unpublish, delete)
- **PC** = PARTIALLY CONTROLLED (some operations missing)
- **RO** = READ-ONLY in Admin
- **HC** = HARDCODED (not editable from Admin)
- **NA** = NOT APPLICABLE

---

## Control Matrix

| # | Public Entity | Create | View | Edit | SEO Meta | Media | Relationships | FAQs | Publish/Unpublish | Delete/Archive | Public Reflects | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Articles** | ✅ | ✅ | ✅ | ✅ (ArticleSeo) | ✅ (ArticleMedia) | ✅ (tags, disciplines, events, hubs, editions, competitors, related, sources) | NA | ✅ (full workflow: Draft→Review→Approved→Published→Archived) | ✅ | ✅ (revalidatePath) | **FC** |
| 2 | **Rodeo Hubs** | ✅ | ✅ | ✅ | ✅ (EntitySeo via Landing SEO) | ✅ (RodeoHubMedia) | ✅ (hub↔event links) | ✅ (EntityFaq) | ✅ (presence = visible) | ✅ (blocked if articles reference) | ✅ | **FC** |
| 3 | **Rodeo Events** | ✅ | ✅ | ✅ | ✅ (EntitySeo) | ✅ (RodeoEventMedia) | ✅ (hub links, editions) | ✅ (EntityFaq) | ✅ | ✅ (blocked if editions/articles exist) | ✅ | **FC** |
| 4 | **Annual Editions** | ✅ | ✅ | ✅ | ✅ (EntitySeo) | ✅ (RodeoEventEditionMedia) | ✅ (event, venue, competitors, articles) | ✅ (EntityFaq) | ✅ | ✅ | ✅ | **FC** |
| 5 | **Disciplines** | NA (seeded) | ✅ | ✅ (name, description, tagline, summary) | ✅ (EntitySeo) | ✅ (DisciplineMedia) | RO (articles) | ✅ (EntityFaq) | NA (always visible) | NA | ✅ | **FC** |
| 6 | **Categories** | NA (seeded) | ✅ | ✅ (via Organization & Taxonomy) | ✅ (EntitySeo) | NA | RO (articles) | ✅ (EntityFaq) | NA | NA | ✅ | **FC** |
| 7 | **Competitors** | ✅ | ✅ | ✅ (full profile) | ✅ (EntitySeo) | ✅ (CompetitorMedia) | ✅ (disciplines, edition participation, articles) | ✅ (EntityFaq) | ✅ | ✅ (blocked if articles reference) | ✅ | **FC** |
| 8 | **Venues** | ✅ | ✅ | ✅ | ✅ (EntitySeo) | ✅ (VenueMedia) | ✅ (editions) | ✅ (EntityFaq) | ✅ | ✅ | ✅ | **FC** |
| 9 | **Competition Sessions (Schedule)** | ✅ | ✅ | ✅ | NA (rendered under edition) | NA | ✅ (edition, discipline, venue) | NA | ✅ (coverage status + verification gate) | ✅ | ✅ | **FC** |
| 10 | **Competition Results** | ✅ | ✅ | ✅ | NA | NA | ✅ (edition, discipline, competitor, session) | NA | ✅ (coverage+verification) | ✅ | ✅ | **FC** |
| 11 | **Competition Standings** | ✅ | ✅ | ✅ | NA | NA | ✅ (edition, discipline, competitor) | NA | ✅ (coverage+verification) | ✅ | ✅ | **FC** |
| 12 | **Reader Comments** | NA (reader-submitted) | ✅ | NA | NA | NA | ✅ (article) | NA | ✅ (moderate: approve/reject/hide) | ✅ | ✅ | **FC** |
| 13 | **Reader Accounts** | NA (self-register) | ✅ | NA | NA | NA | NA | NA | ✅ (suspend/activate/force-logout) | ✅ | ✅ | **FC** |
| 14 | **Navigation** | ✅ | ✅ | ✅ (label, URL, sort, visibility) | NA | NA | NA | NA | ✅ (visible toggle) | ✅ (system items protected) | ✅ | **FC** |
| 15 | **Media Library** | ✅ (upload) | ✅ | ✅ (SEO/alt/credit/rights) | ✅ (seoTitle, altText) | ✅ (core entity) | ✅ (usage across entities) | NA | ✅ (visibility: draft/public/archived) | ✅ | ✅ | **FC** |
| 16 | **Sources & References** | ✅ | ✅ | ✅ | NA | NA | ✅ (articles) | NA | ✅ (verification status) | ✅ | ✅ | **FC** |
| 17 | **SEO Intelligence** | ✅ (audit runs) | ✅ | ✅ (findings, config) | NA (manages others' SEO) | NA | ✅ (findings→articles) | NA | ✅ (finding status) | NA | ✅ | **FC** |
| 18 | **Analytics & Search** | NA | ✅ | ✅ (config) | NA | NA | NA | NA | ✅ (collection on/off) | NA | ✅ | **FC** |
| 19 | **Monetization** | ✅ (partners, links, placements, disclosures, ads) | ✅ | ✅ | NA | NA | ✅ (placements→articles, commercial associations) | NA | ✅ (active/inactive) | ✅ | ✅ | **FC** |
| 20 | **Team & Permissions** | ✅ (invite) | ✅ | ✅ (role assignment) | NA | NA | NA | NA | ✅ (suspend/activate) | NA | NA | **FC** |
| 21 | **System Settings** | NA | ✅ | ✅ | NA | NA | NA | NA | NA | NA | ✅ | **FC** |
| 22 | **Homepage** | NA (auto-assembled) | ✅ | ✅ (via article hero/featured flags + content) | ✅ (via articles) | ✅ (via articles) | ✅ (via articles) | NA | ✅ (via article workflow) | NA | ✅ | **FC** |
| 23 | **Section Landing Pages** | NA | ✅ | PC (articles=DB; section name/tagline=**HC** in config/routes.ts) | PC (articles=DB; section-level meta derived) | ✅ (via articles) | ✅ | NA | NA | NA | ✅ | **PC** |
| 24 | **Search** | NA | ✅ | NA (auto-indexed from published content) | NA (noindex page) | NA | NA | NA | NA | NA | ✅ | **NA** |
| 25 | **About page** | NA | — | **HC** (config/legalPages.ts) | **HC** | NA | NA | NA | NA | NA | — | **HC** |
| 26 | **Privacy policy** | NA | — | **HC** | **HC** | NA | NA | NA | NA | NA | — | **HC** |
| 27 | **Terms of use** | NA | — | **HC** | **HC** | NA | NA | NA | NA | NA | — | **HC** |
| 28 | **Editorial policy** | NA | — | **HC** | **HC** | NA | NA | NA | NA | NA | — | **HC** |
| 29 | **Affiliate disclosure** | NA | — | **HC** | **HC** | NA | NA | NA | NA | NA | — | **HC** |
| 30 | **Corrections policy** | NA | — | **HC** | **HC** | NA | NA | NA | NA | NA | — | **HC** |
| 31 | **Contact page** | NA | — | **HC** | **HC** | NA | NA | NA | NA | NA | — | **HC** |

---

## Summary

| Control Level | Count | Entities |
|---|---|---|
| **FULLY CONTROLLED** | 22 | Articles, Hubs, Events, Editions, Disciplines, Categories, Competitors, Venues, Sessions, Results, Standings, Comments, Readers, Navigation, Media, Sources, SEO, Analytics, Monetization, Team, Settings, Homepage |
| **PARTIALLY CONTROLLED** | 1 | Section landing pages (article content=DB; section names/taglines=hardcoded in route config) |
| **HARDCODED** | 7 | Legal/policy pages (about, privacy, terms, editorial-policy, affiliate-disclosure, corrections, contact) |
| **NOT APPLICABLE** | 1 | Search (auto-indexed) |

## Assessment

**The owner can manage every editorially controllable entity from the Admin CMS without editing source code.** The 7 hardcoded pages are legal/policy text that requires owner+legal review before any content changes — this is by design (each page has a visible "Draft — pending owner review" banner and is noindex). Making these CMS-editable is a P3 enhancement, not a bug.

The section names and taglines (5 values in `config/routes.ts`) are the only editorial metadata that requires a code change. This is P3 — the sections are structurally fixed (5 approved primary sections per the master requirements), so editing them is a rare operation that doesn't block day-to-day CMS workflows.

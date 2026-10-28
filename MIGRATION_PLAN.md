# NFRGuide.com — Next.js App Router & Backend Integration Blueprint

This document provides a technical migration plan for transitioning NFRGuide.com from the Phase 0 React 19 / Vite prototype to a production **Next.js 15+ App Router** architecture backed by **PostgreSQL** and **Prisma ORM**.

---

## 1. Migration Goals & Target Architecture

| Component | Phase 0 (Current) | Phase 1 (Target) |
|---|---|---|
| **Framework** | React 19 + Vite 8.3 (SPA) | Next.js 15+ (App Router with React Server Components) |
| **Rendering** | Client-Side SPA (`react-router-dom`) | Hybrid: Static Generation (SSG), ISR, and Server Components (SSR) |
| **SEO Metadata** | Client DOM Injection (`document.title`, meta tags) | Built-in `generateMetadata()` with server-rendered OpenGraph |
| **Database** | In-Memory & `sessionStorage` (`articleStore`) | PostgreSQL (Cloud SQL) with Prisma ORM |
| **Media Storage** | Local static asset URLs | Google Cloud Storage / S3 with CDN delivery (`next/image`) |
| **Authentication** | Simulated role switching (`DEMO`) | Production NextAuth.js / Firebase Auth with JWT sessions |

---

## 2. Directory & Route Mapping

The existing flat component structure maps cleanly into the Next.js `app/` hierarchy:

```
Phase 0 File Path                       Target Next.js App Router Path
─────────────────────────────────────────────────────────────────────────────
src/pages/HomePage.tsx               -> app/(public)/page.tsx
src/pages/SectionLandingPage.tsx     -> app/(public)/[section]/page.tsx
src/pages/ArticleDetailPage.tsx      -> app/(public)/articles/[slug]/page.tsx
src/pages/DisciplineGuidePage.tsx    -> app/(public)/disciplines/[slug]/page.tsx
src/pages/CategoryArchivePage.tsx    -> app/(public)/categories/[slug]/page.tsx

src/components/layout/SiteHeader.tsx -> app/(public)/layout.tsx
src/components/layout/SiteFooter.tsx -> app/(public)/layout.tsx

src/pages/admin/AdminOverviewPage.tsx   -> app/admin/page.tsx
src/pages/admin/AdminArticlesPage.tsx   -> app/admin/articles/page.tsx
src/pages/admin/AdminArticleEditorShell -> app/admin/articles/[id]/edit/page.tsx
src/pages/admin/AdminHubsPage.tsx       -> app/admin/hubs/page.tsx
src/pages/admin/AdminEventsPage.tsx     -> app/admin/events/page.tsx
src/pages/admin/AdminEditionsPage.tsx   -> app/admin/editions/page.tsx
src/pages/admin/AdminTaxonomyPage.tsx   -> app/admin/taxonomy/page.tsx
src/pages/admin/AdminMediaPage.tsx      -> app/admin/media/page.tsx
src/pages/admin/AdminSourcesPage.tsx    -> app/admin/sources/page.tsx
src/pages/admin/AdminSEOIntelligence... -> app/admin/seo/page.tsx
src/pages/admin/AdminWebsitePage.tsx    -> app/admin/website/page.tsx
src/pages/admin/AdminAnalyticsPage.tsx  -> app/admin/analytics/page.tsx
src/pages/admin/AdminMonetizationPage.  -> app/admin/monetization/page.tsx
src/pages/admin/AdminUsersPage.tsx      -> app/admin/users/page.tsx
src/pages/admin/AdminSettingsPage.tsx   -> app/admin/settings/page.tsx
src/components/admin/AdminShell.tsx     -> app/admin/layout.tsx
```

---

## 3. Server Components vs Client Components

To maximize performance, readability, and SEO crawlability:

### Server Components (`app/(public)/...`)
- `app/(public)/page.tsx` (Homepage): Fetches published stories directly from PostgreSQL via Prisma; streams HTML.
- `app/(public)/articles/[slug]/page.tsx` (Article Detail):
  - Fetches article data server-side.
  - Implements `generateMetadata({ params })` returning pure HTML `<title>`, `<meta name="description">`, canonical `<link>`, and JSON-LD `<script>`.
  - Re-validates every 60 seconds via Incremental Static Regeneration (`export const revalidate = 60;`).
- `app/(public)/[section]/page.tsx` (Section Landing): Static rendering with ISR.

### Client Components (`'use client'`)
- Interactive editorial components:
  - `src/components/editorial/TableOfContents.tsx` (Tracks active scroll position and intersection observers).
  - `src/components/SearchModal.tsx` (Live keystroke filtering and modal state).
  - `src/components/admin/editor/RichBlockEditor.tsx` (JSON block manipulation, drag-and-drop, inline typing).
  - `src/components/admin/editor/SearchAppearancePreview.tsx` (Dynamic SERP simulator).
  - Admin interactive modals: `MediaPickerModal`, `RevisionHistoryModal`, `ArticleDraftPreview`.

---

## 4. Database Layer Migration (Prisma ORM)

### Step 1: Install Prisma & Initialize
```bash
npm install @prisma/client
npm install -D prisma
npx prisma init
```

### Step 2: Configure Schema
Apply the Prisma schema specified in [DATA_MODELS.md](./DATA_MODELS.md).

### Step 3: Seed Baseline Editorial Data
Create a migration script `prisma/seed.ts` that iterates over `ALL_ARTICLES` from `src/data/mockEditorialData.ts` and inserts them into the PostgreSQL database.

```bash
npx prisma migrate dev --name init_editorial_schema
npx prisma db seed
```

---

## 5. Server Actions for Editorial CMS

Replace client-side `articleStore` calls with secure Next.js Server Actions:

```ts
// app/actions/articleActions.ts
'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { validateArticle } from '@/utils/seoValidator';

export async function saveArticleAction(articleData: any, actorId: string) {
  // 1. Authorize session
  // 2. Validate Category A blockers if status === 'PUBLISHED'
  if (articleData.workflowStatus === 'PUBLISHED') {
    const val = validateArticle(articleData);
    if (!val.canPublish) {
      throw new Error('Article contains Category A publishing blockers.');
    }
  }

  // 3. Upsert article and record revision
  const article = await prisma.article.upsert({ ... });
  await prisma.articleRevision.create({ ... });

  // 4. Revalidate public cache
  revalidatePath('/');
  revalidatePath(`/articles/${article.slug}`);

  return { success: true, article };
}
```

---

## 6. Migration Schedule & Phasing

- **Phase 1.1**: Scaffold Next.js 15 App Router project structure and configure Tailwind CSS v4.
- **Phase 1.2**: Provision PostgreSQL instance and deploy Prisma schema migrations.
- **Phase 1.3**: Port public reader templates into React Server Components (`app/(public)`).
- **Phase 1.4**: Port Admin CMS shell and RichBlockEditor into client components (`app/admin`).
- **Phase 1.5**: Wire Server Actions for article CRUD, revision diffing, and media uploads.
- **Phase 1.6**: Configure Google Cloud Storage bucket for image uploads and optimize via `next/image`.
- **Phase 1.7**: Production deployment, automated sitemap generation, and search engine crawler audit.

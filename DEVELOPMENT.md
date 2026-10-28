# NFRGuide.com — Developer Guide & Local Workflow

This document provides setup instructions, development conventions, workflow standards, and script definitions for engineers contributing to NFRGuide.com.

---

## 1. System Requirements & Environment

### Prerequisites
- **Node.js**: Minimum `v18.0.0` (LTS versions `v20.x` or `v22.x` strongly recommended)
- **NPM**: `v9.0.0` or higher
- **Modern Browser**: Chrome 120+, Firefox 120+, Safari 17+, Edge 120+

### Environment Setup
1. Clone the repository to your local development machine.
2. Ensure you have Node.js installed:
   ```bash
   node -v
   npm -v
   ```
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Install all project dependencies:
   ```bash
   npm install
   ```

---

## 2. Available Scripts

The project includes the following npm commands configured in `package.json`:

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `vite --port=3000 --host=0.0.0.0` | Starts the Vite dev server with Hot Module Replacement on port 3000. |
| `npm run build` | `vite build` | Compiles TypeScript and packages production-ready assets into `dist/`. |
| `npm run preview` | `vite preview` | Serves the production build from `dist/` locally for release inspection. |
| `npm run lint` | `tsc --noEmit` | Executes TypeScript type checking across all files with strict error reporting. |
| `npm test` | `tsx tests/runner.ts` | Runs the automated verification suite covering eligibility, SEO, and workflows. |
| `npm run clean` | `rm -rf dist server.js` | Removes compiled artifacts and caches. |

---

## 3. Engineering & Coding Conventions

### TypeScript Standards
- **Strict Mode Enabled**: `noImplicitAny`, `strictNullChecks`, and standard enums only.
- **Top-Level Imports**: All imports must be placed cleanly at the top of files.
- **Type Coherence**: Prefer shared definitions from `src/types/index.ts` and `src/types/admin.ts`. Avoid defining ad-hoc duplicate types inside page components.
- **No `any` Escapes**: Do not use `any` unless wrapping un-typed third-party dynamic payloads.

### Styling & Tailwind CSS v4 Rules
- **CSS Import**: Global stylesheet is located at `src/index.css` using `@import "tailwindcss";`.
- **Zero Inline Styles**: Use utility classes exclusively. Never use `style={{ ... }}` for layout, colors, or typography.
- **Concept C Palette Tokens**:
  - `bg-[#0F1115]`: Dark Charcoal for admin sidebar, public header, and hero backgrounds.
  - `bg-[#1E293B]`: Deep Navy for secondary callouts, badges, and card headers.
  - `text-[#D4A757]` / `border-[#D4A757]`: Western Gold for active indicators, primary CTAs, and championship badges.
  - `bg-[#8B5E3C]`: Terrain Brown for discipline accents and subtle borders.
  - `bg-[#F7F3EA]`: Warm Sand for editorial article reading backgrounds and section dividers.
  - `bg-[#FFFFFF]`: Crisp White for content cards and data panels.
- **Typography Pairing**:
  - `font-serif`: Playfair Display / Georgia for article titles, decks, section kickers, and editorial quotes.
  - `font-sans`: Inter for body paragraphs, UI controls, buttons, metadata labels, and tables.
  - `font-mono`: For timestamps, character counters, revision IDs, and slug previews.

### State Management & Data Flow
- **Session-Based Storage**: In Phase 0, the reactive singleton `articleStore` maintains state in `sessionStorage` (under `nfrguide_demo_articles_v1` and `nfrguide_demo_revisions_v1`).
- **Reactive Subscriptions**: Components subscribe to `articleStore.subscribe(() => { ... })` in `useEffect` hooks to ensure instantaneous UI synchronization when edits occur in the CMS.
- **Content Eligibility Boundary**: Whenever querying articles for public readers, ALWAYS filter through `isArticlePubliclyEligible(article)` from `src/utils/contentEligibility.ts`.

---

## 4. How to Extend the Application

### Adding a New Article
1. In the running application, navigate to `/admin/articles/new/` or click **Create New Article** in the top navigation.
2. Fill out the 8 editorial fields in strict order:
   - Field 01: Main Editorial Headline (H1)
   - Field 02: URL Slug (auto-generated or custom hyphenated)
   - Field 03: Editorial Excerpt / Summary (1–2 sentences)
   - Field 04: Structured Article Body (compose using the 10 block types)
   - Field 05: SEO Title Tag (35–65 characters)
   - Field 06: Meta Description (110–165 characters)
   - Field 07: Featured Photography SEO Title
   - Field 08: Contextual ALT Text & Media Rights
3. Select relevant rodeo entity relationships in the **Rodeo Relationships Panel**.
4. Check the **SEO & Quality Validation Panel** on the right sidebar. Address any Category A blockers.
5. Move status from `Draft` to `In Review`, `Approved`, or `Published`.

### Adding a New Structured Content Block
To introduce a new block type to the editor:
1. Update `ContentBlock` type union in `src/types/index.ts`.
2. Add block insertion and editing controls in `src/components/admin/editor/RichBlockEditor.tsx`.
3. Add render logic in `src/components/editorial/ArticleBody.tsx`.
4. Add a test case in `tests/runner.ts` and verify with `npm test`.

---

## 5. Verification & Testing Workflow

Before committing code or submitting pull requests, execute the verification sequence:
```bash
# 1. Verify TypeScript types
npm run lint

# 2. Verify business logic, SEO rules, and eligibility policies
npm test

# 3. Verify production compilation
npm run build
```
All three commands must exit with code `0`.

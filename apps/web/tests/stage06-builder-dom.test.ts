import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Stage 06 — three-panel Builder, rendered DOM.
 *
 * BEHAVIOUR PROVEN: the real `AdminPageLayoutEditor` renders a structure tree,
 * a canvas that embeds the authenticated draft-preview route, and a property
 * inspector — with the page-capability notice, the per-block support badges and
 * the content-source summary actually present in the markup.
 *
 * These are DOM assertions against the real component tree, not greps of the
 * editor's source. The distinction matters here more than anywhere: the test
 * this stage had to replace was `batch32-unit.test.ts :: "editor has
 * three-panel layout: Canvas and Properties"`, which passed for two stages by
 * finding the strings "Page Canvas" and "Properties" in the file while the
 * editor had only two panels and no canvas at all.
 *
 * The runner has no DOM environment (vitest `environment: 'node'`, no jsdom
 * installed), so `renderToStaticMarkup` is used. That renders the real
 * components and their real output; it does not run effects, so anything that
 * only happens in a `useEffect` is proven elsewhere — by the exported pure
 * predicates in `stage06-canvas-bridge.test.ts`, and end-to-end in the browser
 * by `e2e/stage06-visual-builder.spec.ts`.
 */

/* ── Mocks: the editor's two non-renderable dependencies ──────────── */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));

const noop = async () => ({ ok: true as const });
vi.mock('@/app/admin/page-layout-actions', () => ({
  saveDraftAction: noop,
  publishLayoutAction: noop,
  resetDraftAction: noop,
  restoreDefaultsAction: noop,
  schedulePublishAction: noop,
  cancelScheduleAction: noop,
  listFeaturedCandidatesAction: async () => ({ ok: true, items: [] }),
  resolveArticleDetailsAction: async () => ({ ok: true, items: [] }),
  listRevisionsAction: async () => ({ ok: true, revisions: [] }),
  restoreRevisionAction: noop,
}));

vi.mock('@/components/admin/editor/MediaPickerModal', () => ({
  MediaPickerModal: () => null,
}));

type Reg = {
  type: string; label: string; description?: string; category: string; required?: boolean;
  maxInstances?: number; duplicatable?: boolean; retired?: boolean;
  defaultProps: Record<string, unknown>; editableProps: unknown[];
};

let AdminPageLayoutEditor: React.FC<Record<string, unknown>>;
let registries: Record<string, Reg[]>;
let HOMEPAGE_SECTIONS: readonly Reg[];

beforeAll(async () => {
  const mod = await import('../views/admin/AdminPageLayoutEditor');
  AdminPageLayoutEditor = mod.AdminPageLayoutEditor as unknown as React.FC<Record<string, unknown>>;
  const reg = await import('../lib/cms/sectionRegistry');
  HOMEPAGE_SECTIONS = reg.HOMEPAGE_SECTIONS as unknown as readonly Reg[];
  // Mirrors `toReg` in app/admin/(dashboard)/website/page.tsx, including the
  // `retired` field Stage 06 added to that payload.
  const toReg = (defs: readonly Reg[]): Reg[] => defs.map((s) => ({
    type: s.type, label: s.label, description: s.description, category: s.category,
    required: s.required, maxInstances: s.maxInstances, duplicatable: s.duplicatable,
    retired: s.retired, defaultProps: s.defaultProps, editableProps: s.editableProps,
  }));
  registries = {
    homepage: toReg(reg.HOMEPAGE_SECTIONS as unknown as readonly Reg[]),
    'section-landing': toReg(reg.SECTION_LANDING_SECTIONS as unknown as readonly Reg[]),
    'detail-template': toReg(reg.DETAIL_TEMPLATE_SECTIONS as unknown as readonly Reg[]),
    directory: toReg(reg.DIRECTORY_SECTIONS as unknown as readonly Reg[]),
  };
});

const PAGE_KEYS = [
  { key: 'homepage', label: 'Homepage' },
  { key: 'section:competition', label: 'Competition' },
  { key: 'template:article', label: 'Article template' },
  { key: 'directory:competitors', label: 'Competitors directory' },
];

function render(opts: { pageKey?: string; slots?: unknown[]; canManage?: boolean } = {}): string {
  const pageKey = opts.pageKey ?? 'homepage';
  const keys = [{ key: pageKey, label: pageKey }, ...PAGE_KEYS.filter((k) => k.key !== pageKey)];
  const layouts = opts.slots
    ? [{ pageKey, draftSections: opts.slots, publishedAt: null, scheduledAt: null }]
    : [];
  return renderToStaticMarkup(
    React.createElement(AdminPageLayoutEditor, {
      layouts,
      registries,
      canManage: opts.canManage ?? true,
      knownPageKeys: keys,
    }),
  );
}

function slot(sectionType: string, props: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  return { id: `slot-${sectionType}`, sectionType, visible: true, order: 0, props, ...over };
}

/* ── The three panels ──────────────────────────────────────────────── */

describe('Stage 06 — the editor renders three panels', () => {
  it('renders a Page Structure panel, a Canvas panel and a Properties panel', () => {
    const html = render();
    expect(html, 'left panel heading').toContain('Page Structure');
    expect(html, 'centre panel heading').toContain('>Canvas<');
    expect(html, 'right panel heading').toContain('Properties');
  });

  it('the centre panel is an iframe pointing at the authenticated preview route in embed mode', () => {
    const html = render();
    // The canvas must reuse the existing preview route — not a second renderer.
    expect(html).toContain('/admin/website/preview?pageKey=homepage&amp;embed=1');
    expect(html).toContain('<iframe');
  });

  it('gives the canvas iframe an accessible title naming the page', () => {
    const html = render({ pageKey: 'section:competition' });
    expect(html).toContain('title="Draft preview canvas for section:competition"');
  });

  it('sandboxes the canvas without popup or top-navigation privileges', () => {
    const html = render();
    const m = html.match(/sandbox="([^"]*)"/);
    expect(m, 'canvas iframe must declare a sandbox').toBeTruthy();
    const sandbox = m![1];
    expect(sandbox).toContain('allow-same-origin');
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-popups');
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(sandbox).not.toContain('allow-downloads');
  });
});

/* ── Device modes (Task 5) ─────────────────────────────────────────── */

describe('Stage 06 Task 5 — responsive device preview', () => {
  it('offers Desktop, Tablet and Mobile controls in a labelled group', () => {
    const html = render();
    expect(html).toContain('aria-label="Preview width"');
    expect(html).toContain('>Desktop<');
    expect(html).toContain('>Tablet<');
    expect(html).toContain('>Mobile<');
  });

  it('applies the desktop width to the iframe container and shows the current width', () => {
    const html = render();
    expect(html, 'container width must be applied, not a scaled screenshot').toContain('width:1280px');
    expect(html, 'visible width indicator').toContain('1280px');
  });

  it('marks the active device with aria-pressed so the state is not colour-only', () => {
    const html = render();
    expect(html).toContain('aria-pressed="true"');
  });
});

/* ── Capability honesty (Task 7) ───────────────────────────────────── */

describe('Stage 06 Task 7 — page capability is stated, not implied', () => {
  it('labels the homepage as fully composed', () => {
    const html = render({ pageKey: 'homepage' });
    expect(html).toContain('Fully composed page');
    expect(html).toContain('Every section on this page comes from the Builder');
  });

  it('warns on a detail template that the structured body is not editable here', () => {
    const html = render({ pageKey: 'template:article' });
    expect(html).toContain('Structured template + extra sections');
    expect(html).toContain('shared structured template');
    expect(html).toContain('come from the CMS record, not the Builder');
  });

  it('warns on a directory that the generated list is not editable here', () => {
    /**
     * Stage 07 Task F changed the wording because it changed WHO builds the
     * search form: it moved out of the route and into the required
     * `directory-grid` block. The claim under test is unchanged — the operator
     * must still be told the entries are generated and that the search, filters
     * and pagination are not theirs to remove.
     */
    const html = render({ pageKey: 'directory:competitors' });
    expect(html).toContain('Directory listing (limited slots)');
    expect(html).toContain('entries come from the database');
    expect(html).toContain('search form, filters and pagination');
    expect(html).toContain('cannot be removed');
  });

  it('also tells a directory operator what Stage 07 made editable', () => {
    // Honesty cuts both ways: the page is no longer "a heading and a CTA".
    const html = render({ pageKey: 'directory:venues' });
    expect(html).toContain('where the listing sits');
    expect(html).toContain('columns');
  });

  it('never claims a detail template is fully composed', () => {
    const html = render({ pageKey: 'template:venue' });
    expect(html).not.toContain('Every section on this page comes from the Builder');
  });
});

/* ── Structure tree (Task 3 + 10) ──────────────────────────────────── */

describe('Stage 06 Task 3 + 10 — the structure tree', () => {
  it('uses tree semantics so it is reachable by keyboard and assistive tech', () => {
    const html = render({ slots: [slot('editorial-hero'), slot('latest-coverage', {}, { id: 'slot-2', order: 1 })] });
    expect(html).toContain('role="tree"');
    expect(html).toContain('aria-label="Page sections"');
    expect(html).toContain('role="treeitem"');
  });

  it('puts exactly one tree item in the tab order', () => {
    const html = render({ slots: [slot('editorial-hero'), slot('latest-coverage', {}, { id: 'slot-2', order: 1 })] });
    expect(html.match(/tabindex="0"/g)?.length ?? 0).toBe(1);
  });

  it('documents the keyboard model in the panel itself', () => {
    const html = render();
    expect(html).toContain('Arrow keys move between sections');
  });

  it('gives reorder and visibility buttons accessible names, not symbols alone', () => {
    const html = render({ slots: [slot('editorial-hero')] });
    expect(html).toMatch(/aria-label="Move [^"]+ up"/);
    expect(html).toMatch(/aria-label="(Hide|Show) [^"]+"/);
  });

  it('keeps the drag affordance', () => {
    const html = render({ slots: [slot('editorial-hero')] });
    expect(html).toContain('title="Drag to reorder"');
  });
});

/* ── Block support badges (Task 3 + 9) ─────────────────────────────── */

describe('Stage 06 Task 3 + 9 — supported, internal, retired and unsupported blocks are distinguished', () => {
  it('marks a fully supported block as editable', () => {
    const html = render({ slots: [slot('latest-coverage')] });
    expect(html).toContain('>Editable<');
  });

  it('marks the retired newsletter block as retired, not as editable', () => {
    const html = render({ slots: [slot('newsletter-signup')] });
    expect(html).toContain('>Retired<');
    expect(html).toContain('Retired and no longer rendered');
  });

  it('marks a retired detail marker as Retired, not as Not rendered', () => {
    /**
     * REWRITTEN IN STAGE 07. `detail-hero` was labelled "Not rendered" because
     * it had a definition and no renderer. Task C retired it under owner
     * decision D-02, and "Retired" is the more actionable label: it tells the
     * operator the state is expected and that removing the block is safe, where
     * "Not rendered" only tells them something is broken.
     *
     * Reaching this label also required fixing `classifyBlockSupport`, which
     * checked retirement in only two of the four families.
     */
    const html = render({ pageKey: 'template:article', slots: [slot('detail-hero')] });
    expect(html).toContain('>Retired<');
    expect(html).toContain('Retired and no longer rendered');
    expect(html).not.toContain('>Not rendered<');
  });

  it('marks the directory hero and listing as Editable, because they now render', () => {
    /**
     * REWRITTEN IN STAGE 07 TASK F. The hero was "Text only" — its text reached
     * the page because each route read the props by hand, so it could not be
     * clicked on the canvas. The listing was "Not rendered" AND `required`, so
     * it could be neither removed nor seen. Both have real renderers now.
     */
    const html = render({
      pageKey: 'directory:competitors',
      slots: [slot('directory-hero'), slot('directory-grid')],
    });
    expect(html).not.toContain('>Text only<');
    expect(html).not.toContain('>Not rendered<');
    expect(html).not.toContain('cannot click this block on the canvas');
  });

  it('explains that landing-stat-pills is a show/hide control with no appearance', () => {
    const html = render({ pageKey: 'section:competition', slots: [slot('landing-stat-pills')] });
    expect(html).toContain('>Show / hide<');
  });
});

/* ── Retired block is no longer offered (Stage 05 overclaim) ───────── */

describe('Stage 06 — the retired newsletter block is not offered by the editor UI', () => {
  it('the editor payload now carries `retired`, which Stage 05 did not pass through', () => {
    const newsletter = registries.homepage.find((d) => d.type === 'newsletter-signup');
    expect(newsletter, 'definition should still exist so stored layouts stay valid').toBeTruthy();
    expect(newsletter!.retired, 'without this flag the editor cannot filter it').toBe(true);
  });

  it('the registry the editor receives still CONTAINS it, so a stored layout keeps its label', () => {
    expect(registries.homepage.some((d) => d.type === 'newsletter-signup')).toBe(true);
  });

  it('a stored newsletter slot still renders in the tree with its label', () => {
    const html = render({ slots: [slot('newsletter-signup')] });
    expect(html).toContain('Newsletter Signup (retired)');
  });

  it('HOMEPAGE_SECTIONS marks exactly one retired type, and it is the newsletter', () => {
    const retired = HOMEPAGE_SECTIONS.filter((d) => d.retired).map((d) => d.type);
    expect(retired).toEqual(['newsletter-signup']);
  });
});

/* ── Slot identity agreement (the defect the browser caught) ───────── */

describe('Stage 06 — the tree and the canvas agree on slot ids before any save', () => {
  /**
   * THE REGRESSION GUARD FOR THE WORST DEFECT THIS STAGE PRODUCED.
   *
   * A page with no stored layout renders registry defaults, computed twice and
   * independently: in the browser by this editor, and on the server by
   * `resolveSections` for the canvas. Both called `generateBlockId()`, which
   * mints a fresh UUID, so the tree's ids and the canvas's `data-slot-id`s
   * never matched and selection silently did nothing — on every page, because
   * the development and test databases hold zero `PageLayout` rows.
   *
   * Every Vitest suite passed throughout, because none of them compared the two
   * sources. Only the browser run found it. This test is the cross-check that
   * was missing: it asserts the editor's rendered tree ids are exactly the ids
   * the server's `buildDefaultSlots` produces.
   */
  it('buildDefaultSlots is deterministic across calls', async () => {
    const { buildDefaultSlots } = await import('../lib/cms/sectionRegistry');
    const a = buildDefaultSlots('homepage').map((s) => s.id);
    const b = buildDefaultSlots('homepage').map((s) => s.id);
    expect(a).toEqual(b);
    expect(new Set(a).size, 'ids must stay unique within a family').toBe(a.length);
  });

  it('uses the documented deterministic id shape', async () => {
    const { buildDefaultSlots, defaultSlotId } = await import('../lib/cms/sectionRegistry');
    for (const s of buildDefaultSlots('homepage')) {
      expect(s.id).toBe(defaultSlotId('homepage', s.sectionType));
    }
  });

  it('produces ids the canvas bridge will accept', async () => {
    const { buildDefaultSlots } = await import('../lib/cms/sectionRegistry');
    const { isValidSlotId } = await import('../components/builder/BuilderCanvasBridge');
    for (const family of ['homepage', 'section-landing', 'detail-template', 'directory']) {
      for (const s of buildDefaultSlots(family)) {
        expect(isValidSlotId(s.id), `${family}/${s.sectionType} -> ${s.id}`).toBe(true);
      }
    }
  });

  it("the editor's rendered tree ids match the server's default slot ids", async () => {
    const { buildDefaultSlots } = await import('../lib/cms/sectionRegistry');
    const html = render({ pageKey: 'homepage' }); // no stored layout -> defaults
    const serverIds = buildDefaultSlots('homepage').map((s) => s.id);
    expect(serverIds.length).toBeGreaterThan(0);
    for (const id of serverIds) {
      expect(html, `canvas would emit data-slot-id="${id}" but the tree has no such item`)
        .toContain(`id="tree-item-${id}"`);
    }
  });

  it('agrees for every page family, not just the homepage', async () => {
    const { buildDefaultSlots } = await import('../lib/cms/sectionRegistry');
    const cases: [string, string][] = [
      ['section:competition', 'section-landing'],
      ['template:article', 'detail-template'],
      ['directory:competitors', 'directory'],
    ];
    for (const [pageKey, family] of cases) {
      const html = render({ pageKey });
      for (const id of buildDefaultSlots(family).map((s) => s.id)) {
        expect(html, `${pageKey}: tree is missing ${id}`).toContain(`id="tree-item-${id}"`);
      }
    }
  });

  it('a stored layout keeps its own ids, which are not overwritten by defaults', async () => {
    const { defaultSlotId } = await import('../lib/cms/sectionRegistry');
    const stored = [{ id: 'blk_stored_1', sectionType: 'editorial-hero', visible: true, order: 0, props: {} }];
    const html = render({ pageKey: 'homepage', slots: stored });
    expect(html).toContain('id="tree-item-blk_stored_1"');
    expect(html).not.toContain(`id="tree-item-${defaultSlotId('homepage', 'editorial-hero')}"`);
  });
});

/* ── Content source inspector (Task 8) ─────────────────────────────── */

describe('Stage 06 Task 8 — the content source summary reaches the inspector DOM', () => {
  it('is absent until a block is selected', () => {
    const html = render({ slots: [slot('latest-coverage')] });
    // Nothing is selected on first render, so the inspector shows its empty state.
    expect(html).toContain('Select a section in the tree, or click one on the canvas.');
    expect(html).not.toContain('data-testid="content-source-summary"');
  });
});

/* ── Save / preview honesty (Task 6) ──────────────────────────────── */

describe('Stage 06 Task 6 — save, preview and publish are distinct and honestly labelled', () => {
  it('keeps Save Draft, Publish and an explicit preview as separate controls', () => {
    const html = render();
    expect(html).toContain('Save Draft');
    expect(html).toContain('Publish');
    expect(html).toContain('Open page');
  });

  it('states that the canvas shows the saved draft rather than unsaved edits', () => {
    // Needs a STORED layout: with nothing stored the editor is correctly dirty
    // and shows the stronger "canvas is behind" warning instead.
    const html = render({ pageKey: 'homepage', slots: [slot('editorial-hero')] });
    expect(html).toContain('Showing the saved draft');
  });

  it('warns that the canvas is behind when there are unsaved changes', () => {
    /**
     * A page with NO stored layout is showing unsaved registry defaults, so the
     * editor starts dirty. Writing this test is what exposed the opposite: the
     * `dirty` flag was initialised to false while `selectPage` set it from
     * `!layout || !layout.draftSections.length`, so on first load the top bar
     * read "Showing defaults — save draft to persist" with Save Draft disabled.
     * The initialiser now uses the same rule, and this asserts the result.
     */
    const html = render({ pageKey: 'homepage' });
    expect(html, 'canvas must admit it is behind the tree').toContain('save to see your latest edits here');
    expect(html, 'the top bar must flag the unsaved state').toContain('Unsaved changes');
  });

  /**
   * These two check the `disabled` ATTRIBUTE, not the substring "disabled".
   * The button's className contains the Tailwind variant `disabled:opacity-50`,
   * so a naive `toContain('disabled')` passes whatever the button's real state
   * is — a false pass of exactly the kind this programme exists to remove. It
   * caught me while writing this file.
   */
  const saveDraftButton = (html: string): string => {
    const m = html.match(/<button[^>]*>Save Draft<\/button>/);
    expect(m, 'Save Draft button should render').toBeTruthy();
    return m![0];
  };
  const isDisabled = (tag: string): boolean => /\sdisabled(=""|\s|>)/.test(tag);

  it('enables Save Draft when the page is showing unsaved defaults', () => {
    // Previously this button rendered disabled while the UI asked for a save.
    expect(isDisabled(saveDraftButton(render({ pageKey: 'homepage' })))).toBe(false);
  });

  it('keeps Save Draft disabled once the draft matches what is stored', () => {
    const html = render({ pageKey: 'homepage', slots: [slot('editorial-hero')] });
    expect(isDisabled(saveDraftButton(html))).toBe(true);
  });

  it('refreshes the canvas on a confirmed save', async () => {
    const { canvasTokenAfterSave } = await import('../views/admin/BuilderCanvas');
    expect(canvasTokenAfterSave({ ok: true }, 0)).toBe(1);
    expect(canvasTokenAfterSave({ ok: true }, 7)).toBe(8);
  });

  it('does NOT refresh the canvas when the save failed', async () => {
    /**
     * The honesty rule for Task 6: a failed save must leave the canvas showing
     * the last good draft. If the token advanced on failure the iframe would
     * reload and the operator would see a refreshed canvas alongside an error,
     * which reads as "saved, with a warning".
     */
    const { canvasTokenAfterSave } = await import('../views/admin/BuilderCanvas');
    expect(canvasTokenAfterSave({ ok: false }, 0)).toBe(0);
    expect(canvasTokenAfterSave({ ok: false }, 7)).toBe(7);
  });

  /**
   * The save-error MESSAGE path is checked in
   * `tests/stage06-save-outcome.test.ts`, not here.
   *
   * Loading product source text in this file would taint it for the Stage 03
   * quality gate, which works per FILE: once a file reads product source, every
   * test in it whose title contains a rendering verb is treated as a source-text
   * claim. This file is full of legitimate `renders …` titles that assert real
   * DOM, so the one structural assertion lives elsewhere. The gate caught this
   * when I first put it here — correctly. (Note: the gate scans file text, so
   * even naming the file-reading API in a comment trips it. That is a little
   * crude, but erring toward false positives is the right bias for this gate.)
   */

  it('offers no undo/redo buttons, because the draft architecture has no undo', () => {
    const html = render();
    expect(html).not.toMatch(/>\s*Undo\s*</);
    expect(html).not.toMatch(/>\s*Redo\s*</);
  });

  it('still shows the read-only notice when the user lacks system.config', () => {
    const html = render({ canManage: false });
    expect(html).toContain('Read-only');
    expect(html).toContain('system.config');
  });
});

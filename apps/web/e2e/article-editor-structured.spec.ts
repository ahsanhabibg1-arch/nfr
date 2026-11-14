import { test, expect, type Page } from '@playwright/test';
import { readState, testDb } from './support';
import { FIXTURE_SLUGS } from '../prisma/fixtures';

/**
 * Structured insertion, typography, alignment, checklists and the document
 * tools — browser verification.
 *
 * WHY THIS SPEC EXISTS. The owner looked at the Write toolbar and asked whether
 * the article body was missing elements. It was: the surface reached prose and
 * links only, so a table, an image, a callout, a citation or a disclosure could
 * only be created by leaving it for the Blocks composer. These tests cover the
 * controls that closed that gap, and the typography the brief asked for
 * alongside them.
 *
 * EVERY TEST ASSERTS PERSISTENCE OR STORED SHAPE, not just what appears on
 * screen. An Insert menu that puts a card in the document but loses it on save,
 * or a checklist whose ticks come back against the wrong items, would pass a
 * purely visual test and fail an author.
 *
 * It uses its OWN draft article rather than the one
 * `article-editor-richtext.spec.ts` creates, so neither spec can be affected by
 * the other's leftovers, and neither touches seeded or published content.
 */

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

let draftId = '';
let draftSlug = '';

test.beforeAll(async () => {
  const db = testDb();
  try {
    const seed = await db.article.findFirstOrThrow({
      where: { slug: FIXTURE_SLUGS.publishedArticle },
      select: { authorId: true, categoryId: true, createdById: true },
    });
    draftSlug = `e2e-struct-draft-${Date.now()}`;
    const created = await db.article.create({
      data: {
        slug: draftSlug,
        title: 'Fixture: Structured Elements Draft (e2e)',
        excerpt: 'A synthetic draft used to verify structured insertion and typography.',
        articleType: 'General Information',
        workflowStatus: 'DRAFT',
        authorId: seed.authorId,
        categoryId: seed.categoryId,
        createdById: seed.createdById,
        blocks: {
          create: [
            {
              sortOrder: 0,
              blockType: 'paragraph',
              data: { type: 'paragraph', text: 'An opening paragraph that already exists in this draft body.' },
            },
          ],
        },
      },
      select: { id: true },
    });
    draftId = created.id;
  } finally {
    await db.$disconnect();
  }
});

test.afterAll(async () => {
  if (!draftId) return;
  const db = testDb();
  try {
    await db.articleBlock.deleteMany({ where: { articleId: draftId } });
    await db.articleSeo.deleteMany({ where: { articleId: draftId } });
    await db.articleTag.deleteMany({ where: { articleId: draftId } });
    await db.articleMedia.deleteMany({ where: { articleId: draftId } });
    await db.articleRevision.deleteMany({ where: { articleId: draftId } });
    await db.article.delete({ where: { id: draftId } });
  } catch {
    // Reported, not thrown: a teardown failure must not mask a real result.
    console.warn(`[e2e] could not fully remove draft ${draftSlug}`);
  } finally {
    await db.$disconnect();
  }
});

const editPath = () => `/admin/articles/${draftId}/edit/`;
const surface = (page: Page) => page.locator('#article-body-surface [contenteditable="true"]');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Article body formatting' });
const cards = (page: Page) => page.locator('#article-body-surface [data-structured-block]');

/**
 * Saves and waits for the dirty badge to clear.
 *
 * The badge is used rather than the success toast because the toast hides
 * itself after 3.5 s and raced the assertion — reporting failure for a save
 * that had actually succeeded.
 */
async function saveDraft(page: Page) {
  const dirty = page.getByTestId('editor-dirty-badge');
  await expect(dirty).toBeVisible();
  await page.getByRole('button', { name: /^(Save Draft|Create Draft)$/ }).click();
  await expect(dirty, 'the save must clear the dirty state').toHaveCount(0, { timeout: 25_000 });
}

/** Puts the caret on a fresh empty paragraph at the end of the body. */
async function newLine(page: Page) {
  const s = surface(page);
  await s.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
}

/** Reads this draft's stored body blocks straight from the database. */
async function storedBlocks<T = Record<string, unknown>>(): Promise<T[]> {
  const db = testDb();
  try {
    const rows = await db.articleBlock.findMany({
      where: { articleId: draftId },
      orderBy: { sortOrder: 'asc' },
      select: { data: true },
    });
    return rows.map((r) => r.data as T);
  } finally {
    await db.$disconnect();
  }
}

test.describe('inserting and editing structured elements from Write', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(editPath());
  });

  test('the toolbar exposes every new control, each with an accessible name', async ({ page }) => {
    const tb = toolbar(page);
    /*
      Four names carry their glyph as a prefix, and that is the contract.

      WCAG 2.5.3 "Label in Name" requires the accessible name to contain the
      visible text, so that someone driving the page by voice can activate a
      control by saying what they see. `x²` against a bare "Superscript" fails
      that — and axe reported it as `label-content-name-mismatch` — so the
      editor composes `x² — Superscript`. Controls whose glyph already appears
      in the description ("H4" in "H4 sub-section heading") are untouched, which
      is why most of this list is unchanged.
    */
    for (const name of [
      'x² — Superscript', 'x₂ — Subscript', 'Tx — Clear formatting from the selection',
      'H4 sub-section heading', 'Align left (default)', 'Align centre', 'Align right', 'Justify',
      '☑ List — Checklist', 'Insert an editorial element', 'Find and replace', 'Write in full screen',
    ]) {
      await expect(tb.getByRole('button', { name, exact: true }), name).toBeVisible();
    }
  });

  test('the INSERT MENU lists every structured element and inserts one at the cursor', async ({ page }) => {
    await newLine(page);
    await toolbar(page).getByRole('button', { name: 'Insert an editorial element' }).click();

    const menu = page.getByTestId('rt-insert-menu');
    await expect(menu).toBeVisible();
    /*
      The elements that were previously unreachable from Write, addressed by
      their block key rather than by a name pattern.

      A substring match on the accessible name is ambiguous now that an Image
      gallery block exists: /Image/ resolves to both "Image" and "Image
      gallery", and Playwright's strict mode rightly refuses. Anchoring the
      pattern would not help either — each item's accessible name is its label
      followed by its hint sentence, so there is nothing stable to anchor to,
      and forcing a short `aria-label` onto the button would hide the hint from
      assistive technology and reintroduce a label-in-name mismatch.

      The block key is what the editor actually dispatches on, so asserting it
      verifies the same thing without the ambiguity. The visible label is still
      checked, so a renamed or blanked item still fails.
    */
    for (const [key, label] of [
      ['table', 'Table'], ['comparisonTable', 'Comparison table'], ['takeaway', 'Key takeaway'],
      ['callout', 'Callout'], ['quote', 'Attributed quote'], ['sourceLink', 'Citation / source reference'],
      ['disclosure', 'Disclosure'], ['image', 'Image'], ['gallery', 'Image gallery'],
    ] as const) {
      const item = menu.getByTestId(`rt-insert-${key}`);
      await expect(item, key).toBeVisible();
      await expect(item, `${key} label`).toContainText(label);
    }

    const before = await cards(page).count();
    await page.getByTestId('rt-insert-table').click();
    await expect(cards(page)).toHaveCount(before + 1);
    await expect(cards(page).last()).toContainText('[table]');
  });

  test('an inserted table is EDITED in Write and its cell survives save and reload', async ({ page }) => {
    await newLine(page);
    await toolbar(page).getByRole('button', { name: 'Insert an editorial element' }).click();
    await page.getByTestId('rt-insert-table').click();

    await cards(page).last().click();

    // The structured panel is the whole point: no trip to the Blocks view.
    const panel = page.getByTestId('rt-block-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Editing table block');

    const value = `cell-${Date.now()}`;
    await panel.locator('tbody input').first().fill(value);

    await saveDraft(page);
    await page.reload();

    await cards(page).last().click();
    await expect(page.getByTestId('rt-block-panel').locator('tbody input').first()).toHaveValue(value);
  });

  test('a table row and column can be REMOVED, keeping every row the same width', async ({ page }) => {
    await newLine(page);
    await toolbar(page).getByRole('button', { name: 'Insert an editorial element' }).click();
    await page.getByTestId('rt-insert-table').click();
    await cards(page).last().click();

    const panel = page.getByTestId('rt-block-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('thead input')).toHaveCount(2);
    await expect(panel.locator('tbody tr')).toHaveCount(2);

    await panel.getByRole('button', { name: 'Remove row 2' }).click();
    await expect(panel.locator('tbody tr')).toHaveCount(1);

    await panel.getByRole('button', { name: 'Remove column 2' }).click();
    await expect(panel.locator('thead input')).toHaveCount(1);
    // Every remaining row must be exactly as wide as the header list, or the
    // renderer would draw cells under the wrong columns.
    await expect(panel.locator('tbody tr').first().locator('input')).toHaveCount(1);
  });

  test('an inserted citation is SAVEABLE immediately, unfilled', async ({ page }) => {
    /*
      A template whose starting payload the schema refuses makes the article
      unsaveable the moment it is inserted — reported as "Article body block N
      cannot be saved", with nothing pointing at the control responsible. This
      happened for real with a `https://` placeholder URL, so the whole insert
      path is exercised against the save boundary here as well as in the unit
      tests.
    */
    await newLine(page);
    await toolbar(page).getByRole('button', { name: 'Insert an editorial element' }).click();
    await page.getByTestId('rt-insert-sourceLink').click();
    await expect(cards(page).last()).toContainText('[sourceLink]');

    await saveDraft(page);
    const blocks = await storedBlocks<{ type: string }>();
    expect(blocks.some((b) => b.type === 'sourceLink'), 'the citation must reach the database').toBe(true);
  });

  test('the SLASH MENU opens on an empty line and inserts the chosen element', async ({ page }) => {
    await newLine(page);
    await page.keyboard.type('/');
    const menu = page.getByTestId('rt-slash-menu');
    await expect(menu).toBeVisible();

    await page.keyboard.type('callout');
    await expect(menu.getByTestId('rt-slash-callout')).toBeVisible();

    const before = await cards(page).count();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    await expect(cards(page)).toHaveCount(before + 1);
    await expect(cards(page).last()).toContainText('[callout]');
    // The typed "/callout" is gone — not left behind as stray text.
    await expect(surface(page)).not.toContainText('/callout');
  });

  test('the slash menu stays out of the way of ordinary prose', async ({ page }) => {
    // "and/or", "9/11" and a pasted URL all contain a slash. A looser trigger
    // would open a block menu in the middle of a sentence.
    await newLine(page);
    await page.keyboard.type('Entries are due and/or paid by 9/11 at https://example.com/');
    await expect(page.getByTestId('rt-slash-menu')).toHaveCount(0);
  });

  test('Escape closes the slash menu and leaves the typed text alone', async ({ page }) => {
    await newLine(page);
    await page.keyboard.type('/tab');
    await expect(page.getByTestId('rt-slash-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('rt-slash-menu')).toHaveCount(0);
    await expect(surface(page)).toContainText('/tab');
  });
});

test.describe('typography, alignment and checklists', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(editPath());
  });

  test('H4 persists as a real h4 through save and reload', async ({ page }) => {
    await newLine(page);
    const h = `Subpoint ${Date.now()}`;
    await page.keyboard.type(h);
    for (let i = 0; i < h.length; i += 1) await page.keyboard.press('Shift+ArrowLeft');
    await toolbar(page).getByRole('button', { name: 'H4 sub-section heading' }).click();
    await expect(surface(page).locator('h4', { hasText: h })).toHaveCount(1);

    await saveDraft(page);
    await page.reload();
    await expect(surface(page).locator('h4', { hasText: h })).toHaveCount(1);

    const blocks = await storedBlocks<{ type: string; level?: number; text?: string }>();
    const stored = blocks.find((b) => b.type === 'heading' && (b.text ?? '').includes('Subpoint'));
    expect(stored?.level, 'the stored level must be 4, not a restyled 3').toBe(4);
  });

  test('SUPERSCRIPT and SUBSCRIPT persist, and are mutually exclusive', async ({ page }) => {
    await newLine(page);
    const marker = `sup${Date.now()}`;
    await page.keyboard.type(`E=mc${marker}`);
    for (let i = 0; i < marker.length; i += 1) await page.keyboard.press('Shift+ArrowLeft');

    await toolbar(page).getByRole('button', { name: 'Superscript' }).click();
    await expect(surface(page).locator('sup', { hasText: marker })).toHaveCount(1);

    // Applying subscript to the same selection replaces it rather than stacking
    // a raised-and-lowered span nothing can draw.
    await toolbar(page).getByRole('button', { name: 'Subscript' }).click();
    await expect(surface(page).locator('sub', { hasText: marker })).toHaveCount(1);
    await expect(surface(page).locator('sup', { hasText: marker })).toHaveCount(0);

    await toolbar(page).getByRole('button', { name: 'Superscript' }).click();
    await saveDraft(page);
    await page.reload();
    await expect(surface(page).locator('sup', { hasText: marker })).toHaveCount(1);
  });

  test('CLEAR FORMATTING strips the marks from the selection and keeps the words', async ({ page }) => {
    await newLine(page);
    const word = `clearme${Date.now()}`;
    await page.keyboard.type(word);
    for (let i = 0; i < word.length; i += 1) await page.keyboard.press('Shift+ArrowLeft');
    await toolbar(page).getByRole('button', { name: 'Bold (Ctrl/Cmd+B)' }).click();
    await toolbar(page).getByRole('button', { name: 'Italic (Ctrl/Cmd+I)' }).click();
    await expect(surface(page).locator('em', { hasText: word })).toHaveCount(1);

    await toolbar(page).getByRole('button', { name: 'Clear formatting from the selection' }).click();
    await expect(surface(page).locator('strong', { hasText: word })).toHaveCount(0);
    await expect(surface(page).locator('em', { hasText: word })).toHaveCount(0);
    await expect(surface(page)).toContainText(word);
  });

  test('ALIGNMENT applies to the paragraph, persists, and stores nothing for the default', async ({ page }) => {
    await newLine(page);
    const word = `centred${Date.now()}`;
    await page.keyboard.type(word);
    await toolbar(page).getByRole('button', { name: 'Align centre' }).click();

    await expect(surface(page).locator('p', { hasText: word })).toHaveAttribute('style', /text-align:\s*center/);

    await saveDraft(page);
    await page.reload();
    await expect(surface(page).locator('p', { hasText: word })).toHaveAttribute('style', /text-align:\s*center/);

    const centred = (await storedBlocks<{ text?: string; align?: string }>())
      .find((b) => (b.text ?? '').includes(word));
    expect(centred?.align).toBe('center');

    // And back to the default, which must store no alignment at all.
    await surface(page).locator('p', { hasText: word }).click();
    await toolbar(page).getByRole('button', { name: 'Align left (default)' }).click();
    await expect(surface(page).locator('p', { hasText: word })).not.toHaveAttribute('style', /text-align/);
    await saveDraft(page);

    const after = (await storedBlocks<{ text?: string; align?: string }>())
      .find((b) => (b.text ?? '').includes(word));
    expect(after, 'the paragraph must still be in the body').toBeTruthy();
    expect(after?.align, 'the default alignment must not be stored').toBeUndefined();
  });

  test('a CHECKLIST persists with its ticks, against the right items', async ({ page }) => {
    await newLine(page);
    await toolbar(page).getByRole('button', { name: 'Checklist' }).click();
    const first = `entered${Date.now()}`;
    await page.keyboard.type(first);
    await page.keyboard.press('Enter');
    await page.keyboard.type('paid the fee');

    const items = surface(page).locator('ul[data-type="taskList"] li');
    await expect(items).toHaveCount(2);

    // Tick the FIRST item only.
    await items.first().locator('input[type="checkbox"]').check();
    await saveDraft(page);

    const list = (await storedBlocks<{ type: string; items?: string[]; checklist?: boolean; checked?: boolean[] }>())
      .find((b) => b.type === 'list' && b.checklist && (b.items ?? []).some((i) => i.includes(first)));
    expect(list, 'the checklist must be stored as a list block').toBeTruthy();
    expect(list?.items).toHaveLength(2);
    // The tick belongs to the item that was ticked, not to the other one.
    const at = (list?.items ?? []).findIndex((i) => i.includes(first));
    expect(list?.checked?.[at]).toBe(true);
    expect(list?.checked?.filter(Boolean)).toHaveLength(1);

    await page.reload();
    await expect(surface(page).locator('ul[data-type="taskList"] li input:checked')).toHaveCount(1);
  });
});

test.describe('document tools', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(editPath());
  });

  test('FIND moves the selection to a match and reports where it is', async ({ page }) => {
    await newLine(page);
    const term = `findable${Date.now()}`;
    await page.keyboard.type(`one ${term} two`);

    await toolbar(page).getByRole('button', { name: 'Find and replace' }).click();
    await expect(page.getByTestId('rt-find-panel')).toBeVisible();
    await page.locator('#rt-find').fill(term);
    await page.getByTestId('rt-find-next').click();

    await expect(page.getByTestId('rt-find-note')).toContainText(/Match 1 of 1/);
    // The match is actually selected in the document, not merely counted.
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toBe(term);
  });

  test('FIND reports an honest miss instead of silently doing nothing', async ({ page }) => {
    await toolbar(page).getByRole('button', { name: 'Find and replace' }).click();
    await page.locator('#rt-find').fill(`absent-${Date.now()}`);
    await page.getByTestId('rt-find-next').click();
    await expect(page.getByTestId('rt-find-note')).toContainText(/No match/);
  });

  test('REPLACE ALL rewrites every occurrence, and ONE undo puts them all back', async ({ page }) => {
    await newLine(page);
    const term = `swapme${Date.now()}`;
    await page.keyboard.type(`${term} and ${term} and ${term}`);

    /*
      SAVED AND RELOADED BEFORE THE REPLACEMENT, DELIBERATELY.

      ProseMirror's history groups transactions that happen within half a second
      of each other, so typing the text and then replacing it immediately is ONE
      undoable step — correct editor behaviour, and it made the first version of
      this test fail intermittently: a single undo removed the replacement AND
      the typed paragraph, depending only on how fast the machine filled the
      fields.

      The reload gives the replacement a history of its own, so "one undo" here
      measures what it claims to: that replacing N occurrences is a single step,
      not N.
    */
    await saveDraft(page);
    await page.reload();
    await expect(surface(page)).toContainText(term);

    await toolbar(page).getByRole('button', { name: 'Find and replace' }).click();
    await page.locator('#rt-find').fill(term);
    await page.locator('#rt-replace').fill('REPLACED');
    await page.getByTestId('rt-replace-all').click();

    await expect(page.getByTestId('rt-find-note')).toContainText(/Replaced 3 occurrences/);
    await expect(surface(page)).not.toContainText(term);
    expect((await surface(page).innerText()).match(/REPLACED/g)?.length).toBe(3);

    // One transaction, so one undo — an author who replaced the wrong word must
    // not have to press Ctrl+Z once per occurrence.
    await toolbar(page).getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)' }).click();
    await expect(surface(page)).toContainText(`${term} and ${term} and ${term}`);
  });

  test('replacement text survives save and reload', async ({ page }) => {
    await newLine(page);
    const term = `persistswap${Date.now()}`;
    await page.keyboard.type(`${term} here`);

    await toolbar(page).getByRole('button', { name: 'Find and replace' }).click();
    await page.locator('#rt-find').fill(term);
    await page.locator('#rt-replace').fill('AFTERSAVE');
    await page.getByTestId('rt-replace-all').click();
    await saveDraft(page);
    await page.reload();
    await expect(surface(page)).toContainText('AFTERSAVE here');
  });

  test('FULL SCREEN takes over the viewport and Escape returns', async ({ page }) => {
    const shell = page.getByTestId('rt-shell');
    await expect(shell).toHaveAttribute('data-fullscreen', 'false');

    await toolbar(page).getByRole('button', { name: 'Write in full screen' }).click();
    await expect(shell).toHaveAttribute('data-fullscreen', 'true');
    // It really covers the viewport, rather than only claiming to.
    const box = await shell.boundingBox();
    const view = page.viewportSize();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual((view?.width ?? 0) - 2);
    await expect(surface(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(shell).toHaveAttribute('data-fullscreen', 'false');
  });

  test('a structured block can be MOVED up through the document', async ({ page }) => {
    await newLine(page);
    const marker = `moveanchor${Date.now()}`;
    await page.keyboard.type(marker);

    // Insert a card AFTER that paragraph, then move it above it.
    await page.keyboard.press('Control+End');
    await toolbar(page).getByRole('button', { name: 'Insert an editorial element' }).click();
    await page.getByTestId('rt-insert-takeaway').click();

    await cards(page).last().click();
    const panel = page.getByTestId('rt-block-panel');
    await expect(panel).toBeVisible();

    const order = (text: string) => surface(page).evaluate((host, needle) => {
      const kids = Array.from(host.children);
      return {
        paragraph: kids.findIndex((k) => (k.textContent ?? '').includes(needle)),
        card: kids.findIndex((k) => k.hasAttribute('data-structured-block') && (k.textContent ?? '').includes('callout')),
      };
    }, text);

    const before = await order(marker);
    expect(before.card, 'the card starts after the paragraph').toBeGreaterThan(before.paragraph);

    await panel.getByTestId('rt-block-up').click();

    const after = await order(marker);
    expect(after.card, 'the card must now come before the paragraph').toBeLessThan(after.paragraph);
    expect(after.card).toBeGreaterThanOrEqual(0);
  });
});

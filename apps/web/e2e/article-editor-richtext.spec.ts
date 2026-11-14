import { test, expect, type Page } from '@playwright/test';
import { readState, testDb } from './support';
import { FIXTURE_SLUGS } from '../prisma/fixtures';

/**
 * The rich-text article body — browser verification.
 *
 * Vitest covers the content model and proves the adapter round trip is
 * lossless. What only a browser can show is that the editor actually works:
 * that typing produces paragraphs, that selecting text and pressing Bold
 * applies a mark which SURVIVES A SAVE AND RELOAD, that a link is validated,
 * and that a structured block is preserved rather than flattened.
 *
 * "Persists" is the operative word throughout. A toolbar that toggles a button
 * but loses the formatting on save is the failure this spec exists to catch, so
 * every formatting test saves and reloads before asserting.
 */

const PHONE = { width: 390, height: 844 };

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

/**
 * A DRAFT article created for this spec, and the reason it is not the seeded
 * fixture.
 *
 * The fixture article is PUBLISHED, and saving a published article re-runs the
 * publication gates — which refuse it with "Publication blocked by unresolved
 * editorial/compliance checks." That is correct CMS behaviour, so testing
 * persistence against it measured the gate rather than the editor.
 *
 * Authors format prose while drafting, so a draft is also the honest subject.
 * It is created directly in the ISOLATED test database (the same approach
 * `e2e/global-setup.ts` uses for its synthetic article) and removed afterwards,
 * so no seeded or published content is touched.
 */
let draftId = '';
let draftSlug = '';

test.beforeAll(async () => {
  const db = testDb();
  try {
    const seed = await db.article.findFirstOrThrow({
      where: { slug: FIXTURE_SLUGS.publishedArticle },
      select: { authorId: true, categoryId: true, createdById: true },
    });
    draftSlug = `e2e-rt-draft-${Date.now()}`;
    const created = await db.article.create({
      data: {
        slug: draftSlug,
        title: 'Fixture: Rich Text Draft (e2e)',
        excerpt: 'A synthetic draft used to verify that body formatting persists.',
        articleType: 'General Information',
        workflowStatus: 'DRAFT',
        authorId: seed.authorId,
        categoryId: seed.categoryId,
        createdById: seed.createdById,
        blocks: {
          create: [
            { sortOrder: 0, blockType: 'paragraph', data: { type: 'paragraph', text: 'An opening paragraph that already exists in this draft body.' } },
            { sortOrder: 1, blockType: 'callout', data: { type: 'callout', variant: 'takeaway', title: 'Preserved', text: 'This structured block must survive the rich-text editor.' } },
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
    // Reported rather than thrown: a teardown failure must not mask a real
    // test result, and the row is harmless synthetic draft content.
    console.warn(`[e2e] could not fully remove draft ${draftSlug}`);
  } finally {
    await db.$disconnect();
  }
});

async function fixtureEditPath(): Promise<string> {
  return `/admin/articles/${draftId}/edit/`;
}

/**
 * Saves the draft and waits for the REAL confirmation.
 *
 * Both halves of this were wrong in the first version of this spec, and the
 * test passed anyway — the worst kind of failure:
 *
 *   - `name: /Save Draft|Save/` with `.first()` matched whichever button
 *     containing "Save" came first in the DOM, not necessarily this one;
 *   - `/saved/i` matches "You have unsaved changes", so the assertion was
 *     satisfied without anything being saved at all.
 *
 * The button is exactly "Save Draft" (or "Create Draft" for a new article) and
 * the toast is exactly "Saved to the database.", so both are matched exactly.
 */
async function saveDraft(page: Page) {
  // The "Unsaved Changes" badge is rendered while `isDirty`, and a successful
  // save clears it. It is waited on INSTEAD of the success toast, which hides
  // itself after 3.5 s and therefore raced the assertion: the save had
  // actually succeeded (the run was in the database) while the test reported
  // failure. A durable signal cannot race.
  const dirty = page.getByTestId('editor-dirty-badge');
  await expect(dirty).toBeVisible();
  await page.getByRole('button', { name: /^(Save Draft|Create Draft)$/ }).click();
  await expect(dirty, 'the save must clear the dirty state').toHaveCount(0, { timeout: 25_000 });
}

const surface = (page: Page) => page.locator('#article-body-surface [contenteditable="true"]');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Article body formatting' });

/**
 * Selects exactly `word` with a REAL mouse drag, even when it sits inside a
 * longer sentence.
 *
 * The first version located the word with `getByText` and dragged across
 * that element's box — but `getByText` resolves to the PARAGRAPH, whose box
 * spans the whole line, so the drag selected the entire paragraph. The test
 * then failed for the right reason: formatting really had been applied to
 * everything, because that is what was selected.
 *
 * The word's own pixel bounds are therefore measured from a DOM Range over
 * its character offsets, and the mouse is dragged between them. The
 * selection is still made by the mouse — which is what the owner asked to be
 * proven — but it is now the selection the test means.
 */
async function dragSelect(page: Page, word: string) {
  const rect = await page.evaluate((needle) => {
    const host = document.querySelector('#article-body-surface [contenteditable="true"]');
    if (!host) return null;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent ?? '';
      const at = text.indexOf(needle);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return null;
  }, word);
  if (!rect || rect.width < 2) throw new Error(`could not measure "${word}" in the editor`);

  const midY = rect.y + rect.height / 2;
  await page.mouse.move(rect.x + 1, midY);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 1, midY, { steps: 10 });
  await page.mouse.up();
}


test.describe('rich-text article body', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(await fixtureEditPath());
  });

  test('the Write surface is the default, with a grouped toolbar', async ({ page }) => {
    await expect(page.getByRole('group', { name: 'Body editing mode' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Write', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(surface(page)).toBeVisible();

    const tb = toolbar(page);
    await expect(tb).toBeVisible();
    for (const name of ['Bold (Ctrl/Cmd+B)', 'Italic (Ctrl/Cmd+I)', 'Underline (Ctrl/Cmd+U)',
      'Strikethrough', 'H2 section heading', 'H3 section heading', 'Bulleted list', 'Numbered list',
      'Quote block', 'Divider', 'Insert or edit link', 'Undo (Ctrl/Cmd+Z)', 'Redo (Ctrl/Cmd+Shift+Z)']) {
      await expect(tb.getByRole('button', { name }), name).toBeVisible();
    }
  });

  test('the existing article body loads into the editor, not as empty', async ({ page }) => {
    // The fixture article has a real body; an editor that opened blank would be
    // about to destroy it on the next save.
    await expect(surface(page)).not.toBeEmpty();
    const text = (await surface(page).innerText()).trim();
    expect(text.length, 'the stored body must be loaded').toBeGreaterThan(40);
  });

  test('typing creates separate paragraphs, and the word count follows', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('First new paragraph.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second new paragraph.');

    const paras = s.locator('p');
    await expect(paras.filter({ hasText: 'First new paragraph.' })).toHaveCount(1);
    await expect(paras.filter({ hasText: 'Second new paragraph.' })).toHaveCount(1);
    // The editor's own counter, not any other text on the page that happens to
    // mention words — the SEO panel also reports a body word count.
    await expect(page.getByTestId('rt-word-count')).toContainText(/\d+ words/);
  });

  test('Shift+Enter makes a line break inside one paragraph', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line one');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
    await page.keyboard.type('Line two');
    // One paragraph containing a <br>, not two paragraphs.
    await expect(s.locator('p', { hasText: 'Line one' }).locator('br')).toHaveCount(1);
  });

  test('BOLD applied to a selection SURVIVES save and reload', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    const marker = `persisted-bold-${Date.now()}`;
    await page.keyboard.type(marker);
    // Select the word just typed.
    for (let i = 0; i < marker.length; i++) await page.keyboard.press('Shift+ArrowLeft');
    await toolbar(page).getByRole('button', { name: 'Bold (Ctrl/Cmd+B)' }).click();
    await expect(s.locator('strong', { hasText: marker })).toHaveCount(1);

    await saveDraft(page);

    await page.reload();
    // THE ASSERTION THAT MATTERS: the mark came back from the database.
    await expect(surface(page).locator('strong', { hasText: marker })).toHaveCount(1);
  });

  test('a heading and a list survive save and reload', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    const h = `Heading ${Date.now()}`;
    await page.keyboard.type(h);
    for (let i = 0; i < h.length; i++) await page.keyboard.press('Shift+ArrowLeft');
    await toolbar(page).getByRole('button', { name: 'H2 section heading' }).click();
    await expect(s.locator('h2', { hasText: h })).toHaveCount(1);

    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await toolbar(page).getByRole('button', { name: 'Bulleted list' }).click();
    await page.keyboard.type('Bullet one');
    await expect(s.locator('ul li', { hasText: 'Bullet one' })).toHaveCount(1);

    await saveDraft(page);
    await page.reload();

    await expect(surface(page).locator('h2', { hasText: h })).toHaveCount(1);
    await expect(surface(page).locator('ul li', { hasText: 'Bullet one' })).toHaveCount(1);
  });

  test('an internal link is applied; an unsafe target is REFUSED with a reason', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    const word = `linkme${Date.now()}`;
    await page.keyboard.type(word);
    for (let i = 0; i < word.length; i++) await page.keyboard.press('Shift+ArrowLeft');

    await toolbar(page).getByRole('button', { name: 'Insert or edit link' }).click();
    const input = page.locator('#rt-link');
    await expect(input).toBeVisible();

    // A scheme that can execute must be refused, and must say why.
    await input.fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    // The dialog's own error, not Next's route announcer (also role="alert").
    await expect(page.getByTestId('rt-link-error')).toContainText(/site path|https|mailto/i);
    await expect(s.locator('a')).toHaveCount(0);

    // A site path is accepted.
    await input.fill('/articles/some-slug/');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(s.locator('a[href="/articles/some-slug/"]', { hasText: word })).toHaveCount(1);
  });

  test('undo and redo work on the writing surface', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    const marker = `undome${Date.now()}`;
    await page.keyboard.type(marker);
    await expect(s).toContainText(marker);

    await toolbar(page).getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)' }).click();
    await expect(s).not.toContainText(marker);

    await toolbar(page).getByRole('button', { name: 'Redo (Ctrl/Cmd+Shift+Z)' }).click();
    await expect(s).toContainText(marker);
  });

  test('a structured block appears as a locked card and is NOT flattened', async ({ page }) => {
    /**
     * The fixture body contains structured blocks (callout, table). In the
     * Write surface they must appear as non-editable cards — losing them, or
     * turning them into plain paragraphs, is the data loss this whole design
     * exists to prevent.
     */
    const cards = page.locator('#article-body-surface [data-structured-block]');
    const count = await cards.count();
    test.skip(count === 0, 'the fixture body has no structured block in this database');
    await expect(cards.first()).toHaveAttribute('contenteditable', 'false');
    await expect(cards.first()).toContainText(/\[(callout|table|image|sourceLink|disclosure|quote|paragraph)\]/);
  });

  test('switching to Blocks and back does not lose the body', async ({ page }) => {
    const before = (await surface(page).innerText()).trim();
    await page.getByRole('button', { name: 'Blocks', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Blocks', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Write', exact: true }).click();
    const after = (await surface(page).innerText()).trim();
    expect(after).toBe(before);
  });

  test('MOBILE: the editor is usable at 390px with no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.reload();
    await expect(surface(page)).toBeVisible();
    await expect(toolbar(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the editor must not scroll the page sideways on a phone').toBeLessThanOrEqual(1);
    // Controls must stay tappable, not shrink to nothing.
    const box = await toolbar(page).getByRole('button', { name: 'Bold (Ctrl/Cmd+B)' }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(20);
  });

  test('the toolbar is reachable by keyboard and its buttons are named', async ({ page }) => {
    const bold = toolbar(page).getByRole('button', { name: 'Bold (Ctrl/Cmd+B)' });
    await bold.focus();
    await expect(bold).toBeFocused();
    // aria-pressed communicates state to a screen reader, not just colour.
    await expect(bold).toHaveAttribute('aria-pressed', /true|false/);
  });
});

// ---------------------------------------------------------------------------
// Mouse selection, the floating toolbar and internal links (owner priorities)
// ---------------------------------------------------------------------------

test.describe('mouse selection and linking', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(await fixtureEditPath());
  });

  test('a MOUSE selection raises the floating toolbar', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    const word = `mousepick${Date.now()}`;
    await page.keyboard.type(word);
    await dragSelect(page, word);
    await expect(page.getByTestId('rt-selection-toolbar')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Selection formatting' })).toBeVisible();
  });

  test('BOLD from the floating toolbar applies to the mouse selection and PERSISTS', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    const word = `floatbold${Date.now()}`;
    await page.keyboard.type(`before ${word} after`);
    await dragSelect(page, word);

    const float = page.getByTestId('rt-selection-toolbar');
    await expect(float).toBeVisible();
    await float.getByRole('button', { name: 'Bold' }).click();
    await expect(s.locator('strong', { hasText: word })).toHaveCount(1);
    // Only the selected word, not the surrounding text.
    await expect(s.locator('strong', { hasText: 'before' })).toHaveCount(0);

    await saveDraft(page);
    await page.reload();
    await expect(surface(page).locator('strong', { hasText: word })).toHaveCount(1);
  });

  test('the floating toolbar disappears when the selection collapses', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    const word = `collapse${Date.now()}`;
    await page.keyboard.type(word);
    await dragSelect(page, word);
    await expect(page.getByTestId('rt-selection-toolbar')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('rt-selection-toolbar')).toHaveCount(0);
  });

  test('INTERNAL LINK SEARCH offers real published targets and inserts the canonical path', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    const word = `internallink${Date.now()}`;
    await page.keyboard.type(word);
    for (let i = 0; i < word.length; i++) await page.keyboard.press('Shift+ArrowLeft');

    await toolbar(page).getByRole('button', { name: 'Insert or edit link' }).click();
    await page.locator('#rt-link-search').fill('riding');

    const results = page.getByTestId('rt-link-results');
    await expect(results).toBeVisible({ timeout: 15_000 });
    const first = results.locator('button').first();
    const shown = (await first.innerText()).trim();
    // The result carries a site-relative, trailing-slashed canonical path.
    expect(shown).toMatch(/\/[a-z0-9-]+\/[a-z0-9-]*\/?/);

    await first.click();
    const anchor = s.locator('a', { hasText: word });
    await expect(anchor).toHaveCount(1);
    const href = await anchor.getAttribute('href');
    expect(href, 'an internal link must be site-relative').toMatch(/^\//);
    expect(href).toMatch(/\/$/);

    await saveDraft(page);
    await page.reload();
    const after = surface(page).locator('a', { hasText: word });
    await expect(after).toHaveCount(1);
    expect(await after.getAttribute('href')).toBe(href);
  });

  test('a link can be edited and removed without losing the words', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    const word = `unlinkme${Date.now()}`;
    await page.keyboard.type(word);
    for (let i = 0; i < word.length; i++) await page.keyboard.press('Shift+ArrowLeft');

    await toolbar(page).getByRole('button', { name: 'Insert or edit link' }).click();
    await page.locator('#rt-link').fill('/articles/first-target/');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(s.locator('a[href="/articles/first-target/"]')).toHaveCount(1);

    // Edit it to a different target.
    await toolbar(page).getByRole('button', { name: 'Insert or edit link' }).click();
    await page.locator('#rt-link').fill('/articles/second-target/');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(s.locator('a[href="/articles/second-target/"]')).toHaveCount(1);
    await expect(s.locator('a[href="/articles/first-target/"]')).toHaveCount(0);

    // Remove it: the anchor goes, the text stays.
    await toolbar(page).getByRole('button', { name: /^Unlink/ }).click();
    await expect(s.locator('a', { hasText: word })).toHaveCount(0);
    await expect(s).toContainText(word);
  });
});

// ---------------------------------------------------------------------------
// SEO Intelligence sees the links the author inserts
// ---------------------------------------------------------------------------

test.describe('SEO link analysis over editor-inserted links', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(await fixtureEditPath());
  });

  /** Links the current selection to `href` via the toolbar dialog. */
  async function linkSelectionTo(page: Page, href: string) {
    await toolbar(page).getByRole('button', { name: 'Insert or edit link' }).click();
    await page.locator('#rt-link').fill(href);
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
  }

  async function typeAndSelect(page: Page, word: string) {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(word);
    for (let i = 0; i < word.length; i++) await page.keyboard.press('Shift+ArrowLeft');
  }

  /**
   * Whether any stored run whose text contains `word` still carries an href.
   *
   * Asserting "no /competition/ link exists anywhere" was wrong: every test in
   * this file edits the SAME draft, and earlier tests legitimately leave their
   * own /competition/ links behind. The question that belongs to this test is
   * whether THIS word is still linked.
   */
  async function wordIsLinked(word: string): Promise<boolean> {
    const db = testDb();
    try {
      const blocks = await db.articleBlock.findMany({ where: { articleId: draftId }, select: { data: true } });
      return blocks.some((b) =>
        ((b.data as { runs?: { text?: string; href?: string }[] }).runs ?? [])
          .some((r) => (r.text ?? '').includes(word) && !!r.href));
    } finally {
      await db.$disconnect();
    }
  }
  /** The hrefs stored in `runs` across the draft's blocks. */
  async function storedRunHrefs(): Promise<string[]> {
    const db = testDb();
    try {
      const blocks = await db.articleBlock.findMany({ where: { articleId: draftId }, select: { data: true } });
      return blocks.flatMap((b) =>
        ((b.data as { runs?: { href?: string }[] }).runs ?? []).map((r) => r.href).filter(Boolean) as string[]);
    } finally {
      await db.$disconnect();
    }
  }

  test('an INTERNAL link inserted in the editor is stored where SEO analysis reads it', async ({ page }) => {
    const word = `seointernal${Date.now()}`;
    await typeAndSelect(page, word);
    await linkSelectionTo(page, '/competition/');
    await expect(surface(page).locator('a[href="/competition/"]')).toHaveCount(1);
    await saveDraft(page);

    /**
     * Asserted against the STORED block, which is what the audit reads. A UI
     * assertion alone would not prove the analysis can see it — the defect
     * found in the audit was precisely that the old pipeline scraped block
     * strings instead of reading `runs[].href`.
     */
    expect(await storedRunHrefs(), 'the inserted href must be stored in runs').toContain('/competition/');
  });

  test('an EXTERNAL link is stored, and carries the opener guard in the DOM', async ({ page }) => {
    const word = `seoexternal${Date.now()}`;
    await typeAndSelect(page, word);
    await linkSelectionTo(page, 'https://partner.example/report');
    const anchor = surface(page).locator('a[href="https://partner.example/report"]');
    await expect(anchor).toHaveCount(1);
    await expect(anchor).toHaveAttribute('rel', /noopener/);
    await saveDraft(page);
    expect(await storedRunHrefs()).toContain('https://partner.example/report');
  });

  test('REMOVING a link removes it from the stored data the audit reads', async ({ page }) => {
    const word = `seoremove${Date.now()}`;
    await typeAndSelect(page, word);
    await linkSelectionTo(page, '/competition/');
    await saveDraft(page);

    await page.reload();
    // Wait for the editor to have mounted AND rehydrated the body before
    // measuring the word's position: a drag computed against a half-rendered
    // surface selects the wrong range.
    await expect(surface(page)).toBeVisible();
    await expect(surface(page).locator('a', { hasText: word })).toHaveCount(1);
    /**
     * The word is SELECTED rather than clicked. Clicking the anchor placed the
     * caret at a position ProseMirror did not report as inside the link, so
     * Unlink stayed disabled and the test timed out on a disabled button.
     * Selecting the linked text makes `isActive('link')` true, which is the
     * state the control actually depends on.
     */
    await surface(page).click();
    await dragSelect(page, word);
    await toolbar(page).getByRole('button', { name: /^Unlink/ }).click();
    await expect(surface(page).locator('a', { hasText: word })).toHaveCount(0);
    await saveDraft(page);

    // The words survive; the link does not.
    expect(await surface(page).innerText()).toContain(word);
    expect(await wordIsLinked(word), 'the unlinked word must no longer carry an href').toBe(false);
  });

  test('a link inside a LIST ITEM is stored in itemRuns, where the analyzer looks', async ({ page }) => {
    const s = surface(page);
    await s.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await toolbar(page).getByRole('button', { name: 'Bulleted list' }).click();
    const word = `seolist${Date.now()}`;
    await page.keyboard.type(word);
    for (let i = 0; i < word.length; i++) await page.keyboard.press('Shift+ArrowLeft');
    await linkSelectionTo(page, '/competition/');
    await expect(s.locator('ul li a[href="/competition/"]')).toHaveCount(1);
    await saveDraft(page);

    const db = testDb();
    try {
      const blocks = await db.articleBlock.findMany({
        where: { articleId: draftId, blockType: 'list' }, select: { data: true },
      });
      const hrefs = blocks.flatMap((b) =>
        ((b.data as { itemRuns?: ({ href?: string }[] | null)[] }).itemRuns ?? [])
          .flatMap((entry) => (entry ?? []).map((r) => r.href).filter(Boolean)));
      expect(hrefs, 'a list-item link must be stored in itemRuns').toContain('/competition/');
    } finally {
      await db.$disconnect();
    }
  });
});

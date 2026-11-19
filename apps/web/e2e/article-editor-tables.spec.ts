import { test, expect, type Page } from '@playwright/test';
import { readState, testDb } from './support';
import { FIXTURE_SLUGS } from '../prisma/fixtures';

/**
 * Tables in the writing surface — browser verification.
 *
 * Vitest proves the conversion between a stored `table` block and a document
 * table is lossless. What only a browser can show is the thing authors
 * actually complained about: that a table can be TYPED INTO where it is seen,
 * that its structure can be changed from the toolbar, and that pasting a
 * document which contains a table no longer throws the rest of that document
 * away.
 *
 * Every test that claims something persists saves and reloads before asserting.
 * A cell that accepts typing but loses it on save is exactly the failure this
 * spec exists to catch.
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
    draftSlug = `e2e-table-draft-${Date.now()}`;
    const created = await db.article.create({
      data: {
        slug: draftSlug,
        title: 'Fixture: Table Draft (e2e)',
        excerpt: 'A synthetic draft used to verify that tables are editable in place.',
        articleType: 'General Information',
        workflowStatus: 'DRAFT',
        authorId: seed.authorId,
        categoryId: seed.categoryId,
        createdById: seed.createdById,
        blocks: {
          create: [
            { sortOrder: 0, blockType: 'paragraph', data: { type: 'paragraph', text: 'Body text before the table.' } },
            {
              sortOrder: 1,
              blockType: 'table',
              data: {
                type: 'table',
                caption: 'Round payouts',
                headers: ['Round', 'Payout'],
                rows: [['1', '30000'], ['2', '30000']],
              },
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
    console.warn(`[e2e] could not fully remove draft ${draftSlug}`);
  } finally {
    await db.$disconnect();
  }
});

/**
 * The body every test starts from.
 *
 * These tests change the table's SHAPE — a row added here, a column deleted
 * there — so sharing one draft between them made each one depend on the order
 * the others ran in. Rewriting the body before each test makes every
 * assertion about counts mean what it says.
 */
async function resetDraftBody() {
  const db = testDb();
  try {
    await db.articleBlock.deleteMany({ where: { articleId: draftId } });
    await db.articleBlock.createMany({
      data: [
        {
          articleId: draftId, sortOrder: 0, blockType: 'paragraph',
          data: { type: 'paragraph', text: 'Body text before the table.' },
        },
        {
          articleId: draftId, sortOrder: 1, blockType: 'table',
          data: {
            type: 'table',
            caption: 'Round payouts',
            headers: ['Round', 'Payout'],
            rows: [['1', '30000'], ['2', '30000']],
          },
        },
      ],
    });
  } finally {
    await db.$disconnect();
  }
}

test.beforeEach(async () => {
  await resetDraftBody();
});

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

const surface = (page: Page) => page.locator('#article-body-surface [contenteditable="true"]');
const tableBar = (page: Page) => page.getByTestId('rt-table-toolbar');

/**
 * ProseMirror renders a table WITHOUT a `<thead>`: the header row is the first
 * row of `<tbody>`, distinguished by holding `<th>` rather than `<td>`. The
 * first version of this spec assumed a thead, so `tbody tr` counted the header
 * row as data and `tbody tr >> td` resolved to nothing in the header row.
 * Selecting data rows by what they contain is both correct and self-describing.
 */
const dataRows = (page: Page) =>
  surface(page).locator('table tr').filter({ has: page.locator('td') });

async function openEditor(page: Page) {
  await page.goto(`/admin/articles/${draftId}/edit/`);
  await expect(surface(page)).toBeVisible();
}

async function saveDraft(page: Page) {
  const dirty = page.getByTestId('editor-dirty-badge');
  await expect(dirty).toBeVisible();
  await page.getByRole('button', { name: /^(Save Draft|Create Draft)$/ }).click();
  await expect(dirty, 'the save must clear the dirty state').toHaveCount(0, { timeout: 25_000 });
}

/** The stored body, read straight from the database rather than from the UI. */
async function storedBlocks(): Promise<Record<string, unknown>[]> {
  const db = testDb();
  try {
    const rows = await db.articleBlock.findMany({
      where: { articleId: draftId },
      orderBy: { sortOrder: 'asc' },
      select: { data: true },
    });
    return rows.map((r) => r.data as Record<string, unknown>);
  } finally {
    await db.$disconnect();
  }
}

type StoredTable = {
  headers: string[];
  rows: string[][];
  caption?: string;
  columnAlign?: string[];
  cellRuns?: unknown;
};

const storedTable = async (): Promise<StoredTable | undefined> =>
  (await storedBlocks()).find((b) => b.type === 'table') as StoredTable | undefined;

test.describe('a table is edited where it is seen', () => {
  test('the stored table is drawn as a real table, not a card', async ({ page }) => {
    await login(page);
    await openEditor(page);

    const table = surface(page).locator('table');
    await expect(table).toHaveCount(1);
    // The card path rendered a non-editable div; a real node renders real cells.
    await expect(table.locator('th')).toHaveCount(2);
    await expect(dataRows(page)).toHaveCount(2);
    await expect(surface(page).locator('[data-structured-block] table')).toHaveCount(0);
  });

  test('typing into a cell persists through a save and a reload', async ({ page }) => {
    await login(page);
    await openEditor(page);

    // Triple-click selects the paragraph inside the cell. `Control+a` would
    // select the WHOLE DOCUMENT — ProseMirror has no cell-scoped select-all —
    // and typing would then replace the entire body, table included.
    const firstPayout = dataRows(page).first().locator('td').nth(1);
    await firstPayout.click({ clickCount: 3 });
    await page.keyboard.type('$30,000');

    await saveDraft(page);

    const stored = await storedTable();
    expect(stored?.rows[0][1]).toBe('$30,000');

    await page.reload();
    await expect(dataRows(page).first().locator('td').nth(1)).toContainText('$30,000');
  });

  test('Tab moves to the next cell instead of leaving the table', async ({ page }) => {
    await login(page);
    await openEditor(page);

    await dataRows(page).first().locator('td').first().click();
    await page.keyboard.press('Tab');
    await page.keyboard.type('tabbed');
    await saveDraft(page);

    const stored = await storedTable();
    expect(stored?.rows[0][1]).toContain('tabbed');
  });

  test('bold applied inside a cell survives a save and a reload', async ({ page }) => {
    await login(page);
    await openEditor(page);

    const cell = dataRows(page).first().locator('td').first();
    await cell.click({ clickCount: 3 });
    await page.keyboard.type('Round one');
    await cell.click({ clickCount: 3 });
    await page.keyboard.press('Control+b');

    await saveDraft(page);

    const stored = await storedTable();
    expect(stored?.rows[0][0]).toBe('Round one');
    expect(JSON.stringify(stored?.cellRuns)).toContain('bold');

    await page.reload();
    await expect(dataRows(page).first().locator('td').first().locator('strong')).toHaveText('Round one');
  });
});

test.describe('the table toolbar', () => {
  test('appears only while the cursor is inside a table', async ({ page }) => {
    await login(page);
    await openEditor(page);

    await expect(tableBar(page)).toHaveCount(0);
    await surface(page).locator('td').first().click();
    await expect(tableBar(page)).toBeVisible();

    await surface(page).locator('p').first().click();
    await expect(tableBar(page)).toHaveCount(0);
  });

  test('adds a row, and the new row is stored', async ({ page }) => {
    await login(page);
    await openEditor(page);

    await dataRows(page).last().locator('td').first().click();
    await tableBar(page).getByRole('button', { name: 'Insert row below' }).click();
    await page.keyboard.type('3');

    await saveDraft(page);
    const stored = await storedTable();
    expect(stored?.rows).toHaveLength(3);
    expect(stored?.rows[2][0]).toBe('3');
  });

  test('deletes a column from every row at once', async ({ page }) => {
    await login(page);
    await openEditor(page);

    await dataRows(page).first().locator('td').nth(1).click();
    await tableBar(page).getByRole('button', { name: 'Delete this column' }).click();

    await saveDraft(page);
    const stored = await storedTable();
    expect(stored?.headers).toHaveLength(1);
    // The defect this guards: a header dropped without its cells leaves every
    // row one cell longer, and the renderer draws cells against headers - so
    // the table would show data under the wrong heading.
    for (const row of stored?.rows ?? []) expect(row).toHaveLength(1);
  });

  test('aligns the whole column, not just the cell', async ({ page }) => {
    await login(page);
    await openEditor(page);

    await dataRows(page).first().locator('td').nth(1).click();
    await tableBar(page).getByRole('button', { name: /Align right \(whole column\)/ }).click();

    await saveDraft(page);
    const stored = await storedTable();
    expect(stored?.columnAlign?.[1]).toBe('right');
  });

  test('edits the caption', async ({ page }) => {
    await login(page);
    await openEditor(page);

    await surface(page).locator('td').first().click();
    const caption = page.getByTestId('rt-table-caption');
    await expect(caption).toHaveValue('Round payouts');
    await caption.fill('Payouts by round, 2026');

    await saveDraft(page);
    expect((await storedTable())?.caption).toBe('Payouts by round, 2026');
  });
});

test.describe('pasting a document that contains a table', () => {
  /**
   * THE REGRESSION THIS LOCKS OUT.
   *
   * The editor used to intercept any paste containing a `<table>`, insert the
   * tables it found and report the paste as fully handled — so every heading,
   * paragraph and list around the table was discarded without a word. An
   * author pasting a section of a Word document saw a lone table appear where
   * their work should have been.
   */
  async function pasteHtml(page: Page, html: string) {
    await surface(page).click();
    await page.keyboard.press('Control+End');
    await page.evaluate((payload) => {
      const host = document.querySelector('#article-body-surface [contenteditable="true"]');
      if (!host) throw new Error('no writing surface');
      const data = new DataTransfer();
      data.setData('text/html', payload);
      host.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, html);
  }

  test('keeps the prose around the table', async ({ page }) => {
    await login(page);
    await openEditor(page);

    await pasteHtml(page, [
      '<h2>Scoring explained</h2>',
      '<p>A paragraph before the table that must not be lost.</p>',
      '<table><tbody>',
      '<tr><th>Judge</th><th>Score</th></tr>',
      '<tr><td>Judge A</td><td>44</td></tr>',
      '</tbody></table>',
      '<p>A paragraph after the table that must not be lost either.</p>',
    ].join(''));

    await saveDraft(page);
    const blocks = await storedBlocks();
    const text = JSON.stringify(blocks);

    expect(text).toContain('Scoring explained');
    expect(text).toContain('A paragraph before the table that must not be lost.');
    expect(text).toContain('A paragraph after the table that must not be lost either.');
    expect(blocks.filter((b) => b.type === 'table')).toHaveLength(2);
  });

  test('keeps header cells as headers and merged cells in the right columns', async ({ page }) => {
    await login(page);
    await openEditor(page);

    await pasteHtml(page, [
      '<table><tbody>',
      '<tr><th>Month</th><th colspan="2">Las Vegas</th></tr>',
      '<tr><td>December</td><td>Thomas &amp; Mack</td><td>10 rounds</td></tr>',
      '</tbody></table>',
    ].join(''));

    await saveDraft(page);
    const pasted = (await storedBlocks()).filter((b) => b.type === 'table').at(-1) as StoredTable;

    expect(pasted.headers[0]).toBe('Month');
    expect(pasted.headers[1]).toBe('Las Vegas');
    // Three columns, because the header spans two: the data must not shift left.
    expect(pasted.headers).toHaveLength(3);
    expect(pasted.rows[0]).toEqual(['December', 'Thomas & Mack', '10 rounds']);
  });
});

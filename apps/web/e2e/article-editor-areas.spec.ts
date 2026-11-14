import { test, expect, type Page } from '@playwright/test';
import { readState, testDb } from './support';
import { FIXTURE_SLUGS } from '../prisma/fixtures';

/**
 * The four editor areas — browser verification.
 *
 * WHAT COULD GO WRONG, AND IS CHECKED HERE. Grouping the editor into areas is a
 * presentation change over the same fields, so the risks are all about state:
 *
 *   - a field in a closed area losing what was typed into it (it would, if the
 *     areas conditionally rendered instead of hiding);
 *   - a save sending less than it used to, because a hidden input was dropped;
 *   - the "Go to field" button on a finding appearing to do nothing, because
 *     `scrollIntoView` on a hidden element is a no-op;
 *   - the areas being a row of styled buttons rather than a real tab set.
 *
 * Each of those has a test below. The counterpart unit tests cannot see any of
 * it: this is behaviour of a mounted React tree in a browser.
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
    draftSlug = `e2e-areas-draft-${Date.now()}`;
    const created = await db.article.create({
      data: {
        slug: draftSlug,
        title: 'Fixture: Editor Areas Draft (e2e)',
        excerpt: 'A synthetic draft used to verify the four editor areas.',
        articleType: 'General Information',
        workflowStatus: 'DRAFT',
        authorId: seed.authorId,
        categoryId: seed.categoryId,
        createdById: seed.createdById,
        blocks: {
          create: [{
            sortOrder: 0, blockType: 'paragraph',
            data: { type: 'paragraph', text: 'An opening paragraph that already exists in this draft body.' },
          }],
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

const editPath = () => `/admin/articles/${draftId}/edit/`;
const tab = (page: Page, key: string) => page.getByTestId(`editor-area-tab-${key}`);

async function saveDraft(page: Page) {
  const dirty = page.getByTestId('editor-dirty-badge');
  await expect(dirty).toBeVisible();
  await page.getByRole('button', { name: /^(Save Draft|Create Draft)$/ }).click();
  await expect(dirty, 'the save must clear the dirty state').toHaveCount(0, { timeout: 25_000 });
}

test.describe('the four editor areas', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(editPath());
  });

  test('are a real tab set, opening on Writing', async ({ page }) => {
    const list = page.getByRole('tablist', { name: 'Editor areas' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('tab')).toHaveCount(4);
    for (const name of ['Writing', 'Article Setup', 'SEO & Media', 'Review & Publish']) {
      await expect(list.getByRole('tab', { name: new RegExp(name) }), name).toBeVisible();
    }
    await expect(tab(page, 'writing')).toHaveAttribute('aria-selected', 'true');
    // One panel, labelled by the current tab.
    await expect(page.locator('#editor-workspace')).toHaveAttribute('role', 'tabpanel');
    await expect(page.locator('#editor-workspace'))
      .toHaveAttribute('aria-labelledby', 'editor-area-tab-writing');
  });

  test('show the right fields in each area, and hide the others', async ({ page }) => {
    // Writing: the headline and the body; not the SEO fields.
    await expect(page.locator('#field-01-headline')).toBeVisible();
    await expect(page.locator('#field-04-body')).toBeVisible();
    await expect(page.locator('#field-05-seotitle')).toBeHidden();

    await tab(page, 'seo').click();
    await expect(page.locator('#field-05-seotitle')).toBeVisible();
    await expect(page.locator('#field-08-imagealt')).toBeVisible();
    await expect(page.locator('#field-01-headline')).toBeHidden();

    await tab(page, 'setup').click();
    await expect(page.locator('#editor-relationships')).toBeVisible();
    await expect(page.locator('#field-05-seotitle')).toBeHidden();

    await tab(page, 'review').click();
    await expect(page.locator('#editor-workflow-state')).toBeVisible();
    await expect(page.locator('#editor-slug')).toBeVisible();
  });

  test('the arrow keys move between areas, as a tab set should', async ({ page }) => {
    await tab(page, 'writing').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'setup')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(tab(page, 'writing')).toHaveAttribute('aria-selected', 'true');
    // And it wraps, rather than dead-ending at the first tab.
    await page.keyboard.press('ArrowLeft');
    await expect(tab(page, 'review')).toHaveAttribute('aria-selected', 'true');
  });

  test('a value typed in one area SURVIVES switching away and back', async ({ page }) => {
    /*
      THE TEST THIS LAYOUT EXISTS TO PASS.

      If the areas conditionally rendered instead of hiding, React would discard
      the state of the fields in the area being left — so an author who wrote a
      headline, checked the SEO area and came back would find it gone. Nothing
      is saved in between, so this measures the React tree, not the database.
    */
    const marker = `headline-${Date.now()}`;
    await page.locator('#field-01-headline').fill(marker);

    await tab(page, 'seo').click();
    const meta = `A meta description written in another area ${Date.now()}.`;
    await page.locator('#field-06-metadesc').fill(meta);

    await tab(page, 'review').click();
    await tab(page, 'writing').click();
    await expect(page.locator('#field-01-headline')).toHaveValue(marker);

    await tab(page, 'seo').click();
    await expect(page.locator('#field-06-metadesc')).toHaveValue(meta);
  });

  test('a SAVE sends the fields from every area, not only the open one', async ({ page }) => {
    const marker = `Areas Save ${Date.now()}`;
    const meta = `Meta written in the SEO area ${Date.now()}.`;

    await page.locator('#field-01-headline').fill(marker);
    await tab(page, 'seo').click();
    await page.locator('#field-06-metadesc').fill(meta);

    // Saved from the SEO area, with the headline field hidden.
    await saveDraft(page);

    const db = testDb();
    try {
      const row = await db.article.findUniqueOrThrow({
        where: { id: draftId },
        select: { title: true, seo: { select: { metaDescription: true } } },
      });
      expect(row.title, 'a field edited in a closed area must still be saved').toBe(marker);
      expect(row.seo?.metaDescription).toBe(meta);
    } finally {
      await db.$disconnect();
    }
  });

  test('"Go to field" OPENS the area the field lives in', async ({ page }) => {
    /*
      THE CROSS-AREA JUMP.

      `scrollIntoView` on a hidden element does nothing at all, so a jump into a
      closed area would look broken while reporting success. This sets up the
      case deliberately: the headline is emptied, which raises a blocker whose
      field lives in WRITING, and the finding is then acted on from the SEO &
      Media area, where the SEO Assistant is.
    */
    await page.locator('#field-01-headline').fill('');
    await tab(page, 'seo').click();
    await expect(tab(page, 'seo')).toHaveAttribute('aria-selected', 'true');

    /*
      The Assistant groups its findings in `<details>` and each row hides its
      own detail until opened, so the button is reached by opening both. The
      groups are opened through the DOM rather than by clicking each summary:
      which groups start open depends on what is currently failing, and the
      subject of this test is the jump, not the Assistant's disclosure state.
    */
    const assistant = page.getByTestId('seo-assistant');
    await assistant.evaluate((el) => {
      el.querySelectorAll('details').forEach((d) => { (d as HTMLDetailsElement).open = true; });
    });

    const headlineRow = assistant.locator('li', { hasText: /Headline/i }).first();
    await expect(headlineRow, 'emptying the headline must raise a finding').toBeVisible();
    await headlineRow.getByRole('button', { expanded: false }).click();
    await headlineRow.getByRole('button', { name: 'Go to field →' }).click();

    // The area the field belongs to is now the current one...
    await expect(tab(page, 'writing')).toHaveAttribute('aria-selected', 'true');
    // ...the field is genuinely on screen...
    await expect(page.locator('#field-01-headline')).toBeVisible();
    // ...and the caret is in it, so the author can just type the fix.
    await expect(page.locator('#field-01-headline')).toBeFocused({ timeout: 5_000 });
  });

  test('an area badge counts only publication blockers', async ({ page }) => {
    // Emptying a required field must raise the count on the area that owns it.
    await tab(page, 'seo').click();
    await page.locator('#field-08-imagealt').fill('');
    await expect(tab(page, 'seo')).toContainText(/\d/);
  });

  test('MOBILE: the areas are usable at 390px with no sideways page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('tablist', { name: 'Editor areas' })).toBeVisible();
    await tab(page, 'review').click();
    await expect(page.locator('#editor-workflow-state')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

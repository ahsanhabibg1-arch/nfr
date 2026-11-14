import { test, expect, type Page } from '@playwright/test';
import { readState, testDb } from './support';
import { FIXTURE_SLUGS } from '../prisma/fixtures';

/**
 * The article FAQ — browser verification, from the panel to the published page.
 *
 * SPLIT IN TWO, FOR A REASON. Saving a PUBLISHED article re-runs the
 * publication gates, which correctly refuse the seeded fixture — so a single
 * test that edited a published article through the editor would be measuring
 * the gate, not the FAQ. Instead:
 *
 *   - the PANEL is exercised on a draft, where an author's path is the real
 *     one: type below the body, save, reload, and find the questions still
 *     there;
 *   - the PUBLIC PAGE and its structured data are checked on a published
 *     article whose question set is seeded directly, because what is under test
 *     there is the renderer and the markup agreeing — not how the rows arrived.
 */

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

/** Every FAQPage node in the page's JSON-LD. */
async function faqNodes(page: Page): Promise<Record<string, unknown>[]> {
  const blobs = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blobs
    .map((b) => { try { return JSON.parse(b); } catch { return null; } })
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v): v is Record<string, unknown> => Boolean(v) && v['@type'] === 'FAQPage');
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
    draftSlug = `e2e-faq-draft-${Date.now()}`;
    const created = await db.article.create({
      data: {
        slug: draftSlug,
        title: 'Fixture: FAQ Draft (e2e)',
        excerpt: 'A synthetic draft used to verify the article FAQ panel.',
        articleType: 'General Information',
        workflowStatus: 'DRAFT',
        authorId: seed.authorId,
        categoryId: seed.categoryId,
        createdById: seed.createdById,
        blocks: {
          create: [{
            sortOrder: 0, blockType: 'paragraph',
            data: { type: 'paragraph', text: 'The article body, written before the questions.' },
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
    await db.articleDraftSnapshot.deleteMany({ where: { articleId: draftId } });
    await db.article.delete({ where: { id: draftId } });
  } catch {
    console.warn(`[e2e] could not fully remove draft ${draftSlug}`);
  } finally {
    await db.$disconnect();
  }
});

test.describe('the FAQ panel below the body', () => {
  test('adds questions, reports what is publishable, and PERSISTS them', async ({ page }) => {
    const token = Date.now();
    const question = `When does entry close for ${token}?`;
    const answer = 'Thirty days before the first performance.';

    await login(page);
    await page.goto(`/admin/articles/${draftId}/edit/`);

    // It sits in the Writing area, under the body — where the work ends.
    const panel = page.getByTestId('article-faq-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Article FAQ');

    await panel.getByTestId('article-faq-add').click();
    await panel.getByRole('textbox', { name: 'Question 1' }).fill(question);

    // Before the answer exists the panel says so, and counts it as unpublished.
    await expect(panel.getByTestId('article-faq-incomplete')).toBeVisible();
    await expect(panel.getByTestId('article-faq-count')).toContainText('0 published');

    await panel.getByRole('textbox', { name: 'Answer 1' }).fill(answer);
    await expect(panel.getByTestId('article-faq-count')).toContainText('1 published');

    const dirty = page.getByTestId('editor-dirty-badge');
    await expect(dirty).toBeVisible();
    await page.getByRole('button', { name: /^(Save Draft|Create Draft)$/ }).click();
    const toast = page.locator('div.fixed.bottom-6.right-6');
    await expect(toast).toBeVisible({ timeout: 20_000 });
    const said = (await toast.innerText()).trim();
    expect(said, `the save was refused: ${said}`).toContain('Saved to the database.');

    // It is stored as part of the BODY, which is what keeps the page, the
    // revisions and the structured data reading the same rows.
    const db = testDb();
    try {
      const faqBlock = await db.articleBlock.findFirst({
        where: { articleId: draftId, blockType: 'faq' }, select: { data: true },
      });
      expect(faqBlock, 'the FAQ must be stored as a body block').toBeTruthy();
      const items = (faqBlock!.data as { items: { question: string; answer: string }[] }).items;
      expect(items[0]).toMatchObject({ question, answer });
    } finally {
      await db.$disconnect();
    }

    await page.reload();
    await expect(page.getByTestId('article-faq-panel').getByRole('textbox', { name: 'Question 1' }))
      .toHaveValue(question);
  });

  test('removing the last question removes the set entirely', async ({ page }) => {
    await login(page);
    await page.goto(`/admin/articles/${draftId}/edit/`);
    const panel = page.getByTestId('article-faq-panel');

    // The previous test left one question behind.
    await expect(panel.getByRole('textbox', { name: 'Question 1' })).toBeVisible();
    await panel.getByRole('button', { name: 'Remove question 1' }).click();

    // An empty question heading with nothing under it is not worth publishing.
    await expect(panel.getByRole('textbox', { name: 'Question 1' })).toHaveCount(0);
    await expect(panel.getByTestId('article-faq-count')).toContainText('0 published');
  });
});

test.describe('the published article and its structured data', () => {
  let publishedSlug = '';
  let publishedId = '';
  const question = `Seeded question ${Date.now()}?`;
  const answer = 'Seeded answer, shown on the page and described in the markup.';

  test.beforeAll(async () => {
    const db = testDb();
    try {
      const art = await db.article.findFirstOrThrow({
        where: { slug: FIXTURE_SLUGS.publishedArticle },
        select: { id: true, slug: true, blocks: { select: { sortOrder: true } } },
      });
      publishedId = art.id;
      publishedSlug = art.slug;
      const nextOrder = Math.max(0, ...art.blocks.map((b) => b.sortOrder)) + 1;
      await db.articleBlock.create({
        data: {
          articleId: publishedId, sortOrder: nextOrder, blockType: 'faq',
          data: {
            type: 'faq',
            title: 'Reader questions',
            items: [
              { question, answer },
              // Deliberately incomplete: it must reach NEITHER the page nor
              // the markup, which is the property under test.
              { question: 'An unanswered question?', answer: '' },
            ],
          } as never,
        },
      });
    } finally {
      await db.$disconnect();
    }
  });

  test.afterAll(async () => {
    if (!publishedId) return;
    const db = testDb();
    try {
      await db.articleBlock.deleteMany({ where: { articleId: publishedId, blockType: 'faq' } });
    } finally {
      await db.$disconnect();
    }
  });

  test('shows the questions and emits a matching FAQPage', async ({ page }) => {
    await page.goto(`/articles/${publishedSlug}/`);

    await expect(page.locator('dt', { hasText: question })).toBeVisible();
    await expect(page.locator('dd', { hasText: answer })).toBeVisible();

    const [faqLd] = await faqNodes(page);
    expect(faqLd, 'an article with questions must emit FAQPage').toBeTruthy();
    const described = faqLd.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(described.map((q) => q.name)).toContain(question);
    expect(described.find((q) => q.name === question)?.acceptedAnswer.text).toBe(answer);
  });

  test('never describes a question the page does not show', async ({ page }) => {
    await page.goto(`/articles/${publishedSlug}/`);
    const pageText = await page.locator('body').innerText();
    const [faqLd] = await faqNodes(page);
    const described = (faqLd.mainEntity as { name: string }[]).map((q) => q.name);

    for (const name of described) {
      expect(pageText, `the markup describes a question the page does not show: ${name}`).toContain(name);
    }
    // And the incomplete one is in neither.
    expect(described).not.toContain('An unanswered question?');
    expect(pageText).not.toContain('An unanswered question?');
  });

  test('an article with no questions emits no FAQPage at all', async ({ page }) => {
    const db = testDb();
    let otherSlug = '';
    try {
      const other = await db.article.findFirst({
        where: { workflowStatus: 'PUBLISHED', id: { not: publishedId }, blocks: { none: { blockType: 'faq' } } },
        select: { slug: true },
      });
      otherSlug = other?.slug ?? '';
    } finally {
      await db.$disconnect();
    }
    test.skip(!otherSlug, 'no published article without a question set in this database');

    await page.goto(`/articles/${otherSlug}/`);
    // An empty FAQPage node is invalid markup, not a harmless one.
    expect(await faqNodes(page)).toHaveLength(0);
  });
});

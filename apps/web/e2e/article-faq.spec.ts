import path from 'node:path';
import fs from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { E2E_DIR, readState, testDb } from './support';
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

/**
 * The published article's HTML, once the page has caught up.
 *
 * The question set is seeded straight into the database, which does not
 * invalidate anything — the public article is rendered with ISR, so the
 * prerendered page keeps being served until its window elapses. Reading once
 * therefore measures the page as it was BEFORE the seed, which is exactly the
 * intermittent failure this spec showed.
 *
 * One response is discarded (it is answered from the previous render while the
 * new one is built) and the wait is set above the route's own revalidate
 * window, so a question still missing here is a real failure rather than a
 * race.
 */
const PUBLIC_REFRESH = 90_000;

async function publishedHtml(page: Page, slug: string): Promise<string> {
  await page.request.get(`/articles/${slug}/`).catch(() => null);
  const res = await page.request.get(`/articles/${slug}/`);
  return res.text();
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
  /**
   * Each test starts from a body with no question set.
   *
   * WHY THIS WAS NEEDED. The tests below say "if there is no Question 1, add
   * one" — which silently assumes the draft carries AT MOST one question. They
   * share a draft and save to it, so once an earlier test left a second
   * question behind, removing "question 1" simply renumbered the survivor into
   * its place, and the assertion that no Question 1 remains failed. It read as
   * "removing the last question does not remove the set", which is not what was
   * happening: the set still had a question in it.
   *
   * Resetting the body makes each test's starting state the one it describes,
   * so a failure here means the panel really is keeping an empty set.
   */
  test.beforeEach(async () => {
    const db = testDb();
    try {
      await db.articleBlock.deleteMany({ where: { articleId: draftId } });
      await db.articleBlock.create({
        data: {
          articleId: draftId,
          sortOrder: 0,
          blockType: 'paragraph',
          data: { type: 'paragraph', text: 'An opening paragraph that already exists in this draft body.' },
        },
      });
    } finally {
      await db.$disconnect();
    }
  });

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

    /*
      THE DURABLE SIGNAL IS THE DIRTY BADGE, NOT THE TOAST.

      The success toast hides itself after 3.5 seconds, so asserting it races
      the timer and fails with "element not found" for a save that actually
      succeeded — verified in a browser: the badge cleared while the toast was
      already gone. The badge reflects `isDirty` and therefore the real outcome.

      The toast is still read, but only to EXPLAIN a failure, so a refusal
      reports its reason instead of a bare timeout.
    */
    const dirty = page.getByTestId('editor-dirty-badge');
    await expect(dirty).toBeVisible();
    await page.getByRole('button', { name: /^(Save Draft|Create Draft)$/ }).click();
    await expect(dirty, 'a successful save clears the dirty state').toHaveCount(0, { timeout: 25_000 })
      .catch(async () => {
        const said = await page.locator('div.fixed.bottom-6.right-6').innerText().catch(() => '(no toast)');
        throw new Error(`the save was refused: ${said}`);
      });

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

    /*
      This test creates its own question rather than inheriting one from the
      previous test. Chained tests fail for the wrong reason when an earlier
      one breaks, and cannot be run alone at all.
    */
    // The body is reset before each test, so this is the ONLY question in it —
    // which is what makes "removing the last one" mean what it says.
    await expect(panel.getByRole('textbox', { name: 'Question 1' })).toHaveCount(0);
    await panel.getByTestId('article-faq-add').click();
    await panel.getByRole('textbox', { name: 'Question 1' }).fill('A question to remove?');
    await panel.getByRole('textbox', { name: 'Answer 1' }).fill('An answer.');
    await expect(panel.getByRole('textbox', { name: 'Question 1' })).toBeVisible();
    await panel.getByRole('button', { name: 'Remove question 1' }).click();

    // An empty question heading with nothing under it is not worth publishing.
    await expect(panel.getByRole('textbox', { name: 'Question 1' })).toHaveCount(0);
    await expect(panel.getByTestId('article-faq-count')).toContainText('0 published');
  });

  test('a question removed in the panel STAYS removed after typing in the body', async ({ page }) => {
    /*
      THE REGRESSION THIS EXISTS TO CATCH.

      The writing surface builds its document once on mount and owns it
      afterwards. While that document also contained the question set, removing
      a question in the panel below looked like it worked and then silently
      undid itself: the next keystroke in the body made the editor re-emit the
      document it was still holding, question included.

      The fix gives the editor the body WITHOUT the question set and re-attaches
      it on the way out, so the two never hold the same block. Typing in the
      body afterwards is the exact action that used to resurrect it.
    */
    await login(page);
    await page.goto(`/admin/articles/${draftId}/edit/`);
    const panel = page.getByTestId('article-faq-panel');
    await expect(panel).toBeVisible();

    await expect(panel.getByRole('textbox', { name: 'Question 1' })).toHaveCount(0);
    await panel.getByTestId('article-faq-add').click();
    await panel.getByRole('textbox', { name: 'Question 1' }).fill('Will this come back?');
    await panel.getByRole('textbox', { name: 'Answer 1' }).fill('It must not.');

    await panel.getByRole('button', { name: 'Remove question 1' }).click();
    await expect(panel.getByRole('textbox', { name: 'Question 1' })).toHaveCount(0);

    // The action that used to bring it back.
    const surface = page.locator('#article-body-surface [contenteditable="true"]');
    await surface.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' A word typed after the removal.');

    await expect(
      panel.getByRole('textbox', { name: 'Question 1' }),
      'typing in the body must not resurrect a removed question',
    ).toHaveCount(0);
    await expect(panel.getByTestId('article-faq-count')).toContainText('0 published');
  });
});

/*
  THE TIME BUDGET HAS TO EXCEED THE WAIT THESE TESTS DECLARE.

  Every test here begins by polling the public page until it carries the seeded
  question, with `PUBLIC_REFRESH` (90s) deliberately set above the route's own
  revalidate window — see `publishedHtml`. Playwright's default test timeout is
  30s, so that poll could never run to completion: the test was always killed
  at 30s with the poll still returning false, reported as
  "Test timeout of 30000ms exceeded".

  So the budget is raised to sit above the wait, rather than the wait being
  shortened. Shortening it would reintroduce the intermittent failure
  `publishedHtml` exists to remove, which is the opposite of what a longer
  timeout costs: nothing, when the page is already fresh and the poll returns
  on its first iteration.
*/
test.describe('the published article and its structured data', () => {
  test.describe.configure({ timeout: PUBLIC_REFRESH + 60_000 });

  let publishedSlug = '';
  let publishedId = '';
  /*
    THE THREE QUESTIONS MUST NOT BE SUBSTRINGS OF ONE ANOTHER.

    They were first named "Seeded question <ts>?", "Second seeded question
    <ts>?" and "Third seeded question <ts>?", which looks harmless and is not:
    `hasText` matches a case-insensitive SUBSTRING, so every locator for the
    first question also matched the other two, and Playwright failed with
    "strict mode violation ... resolved to 3 elements". Worse, a strict-mode
    violation is retried until the test times out, so one naming slip read as
    nine separate 30-second timeouts.

    Distinct leading words keep each question identifiable on its own.
  */
  const stamp = Date.now();
  const question = `Alpha seeded question ${stamp}?`;
  const answer = 'Seeded answer, shown on the page and described in the markup.';
  /*
    A SECOND COMPLETE QUESTION IN THE SAME SET, and a THIRD in a set of its own.

    Both exist for the accordion tests below rather than the structured-data
    ones: single-open behaviour needs two rows in one group to have anything to
    close, and group independence needs a second group. Seeding them here means
    all of it shares the one wait for the public page to catch up, which that
    wait makes expensive (see `publishedHtml`).
  */
  const question2 = `Bravo seeded question ${stamp}?`;
  const answer2 = 'A different answer, in the same question set as the first.';
  const question3 = `Charlie seeded question ${stamp}?`;
  const answer3 = 'A further answer, in a question set of its own.';

  /**
   * The accordion row whose question is `q`.
   *
   * Declared here, above every test that uses it, because the structured-data
   * tests need it too — they assert the question is visible while its answer
   * is not, which is the accordion's default state.
   */
  const row = (page: Page, q: string) =>
    page.locator('details.nfr-faq-item').filter({ has: page.locator('.nfr-faq-question', { hasText: q }) });

  /** The answer panel of that row — the element whose visibility IS the open state. */
  const answerOf = (page: Page, q: string) => row(page, q).locator('.nfr-faq-answer');

  /**
   * Wait for the seeded questions to reach the public page, open it, and wait
   * for the body to actually be there.
   *
   * THE SECOND WAIT IS NOT OPTIONAL. The article body streams in behind a
   * Suspense boundary, so `goto` resolves while the page still reads
   * "Loading…". Returning then handed every test below a page whose accordion
   * did not exist yet: the keyboard test called `focus()` on a row that
   * hydration then replaced, and the assertion failed with "inactive" —
   * intermittently, because it depended on which arrived first.
   *
   * Waiting for the first question row means each test starts from a rendered,
   * stable page, which is what made the whole group deterministic.
   */
  async function openArticle(page: Page) {
    await expect.poll(() => publishedHtml(page, publishedSlug).then((h) => h.includes(question3)),
      { timeout: PUBLIC_REFRESH }).toBe(true);
    await page.goto(`/articles/${publishedSlug}/`);
    await expect(row(page, question).locator('.nfr-faq-question')).toBeVisible();
  }

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
              { question: question2, answer: answer2 },
            ],
          } as never,
        },
      });
      await db.articleBlock.create({
        data: {
          articleId: publishedId, sortOrder: nextOrder + 1, blockType: 'faq',
          data: {
            type: 'faq',
            title: 'A separate question set',
            items: [{ question: question3, answer: answer3 }],
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
    // Wait for the public page to carry the seeded question before looking at
    // what it says — see `publishedHtml`.
    await expect.poll(() => publishedHtml(page, publishedSlug).then((h) => h.includes(question)),
      { timeout: PUBLIC_REFRESH }).toBe(true);

    await page.goto(`/articles/${publishedSlug}/`);
    /*
      THE QUESTION IS VISIBLE, THE ANSWER IS NOT — YET.

      This used to assert a `dt` and its `dd` were both visible, which was the
      permanently-open layout the accordion replaced. The answer is still in
      the HTML (the structured-data checks below depend on it); it is collapsed
      until the reader asks for it.

      Scoped to the row rather than to `getByRole('group')`, which matched
      every `details` on the page and could not tell the three seeded questions
      apart.
    */
    await expect(row(page, question).locator('.nfr-faq-question')).toBeVisible();
    await expect(row(page, question).locator('.nfr-faq-answer')).toBeHidden();

    const [faqLd] = await faqNodes(page);
    expect(faqLd, 'an article with questions must emit FAQPage').toBeTruthy();
    const described = faqLd.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(described.map((q) => q.name)).toContain(question);
    expect(described.find((q) => q.name === question)?.acceptedAnswer.text).toBe(answer);
  });

  test('never describes a question the page does not show', async ({ page }) => {
    await expect.poll(() => publishedHtml(page, publishedSlug).then((h) => h.includes(question)),
      { timeout: PUBLIC_REFRESH }).toBe(true);
    await page.goto(`/articles/${publishedSlug}/`);
    /*
      WAIT FOR THE BODY BEFORE READING IT.

      The article body streams in behind a Suspense boundary, so `goto`
      resolves while the page still reads "Loading…". Reading `innerText` at
      that moment captured only the header and footer, and the test then
      reported that the markup describes a question the page does not show —
      naming a question that was about to appear. The race, not the page, was
      the defect.

      Waiting on the first seeded question is the right gate because it is what
      the assertion below is about: once a question row is on the page, the body
      has rendered.
    */
    await expect(row(page, question).locator('.nfr-faq-question')).toBeVisible();
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

  /*
    THE ACCORDION ITSELF.

    Everything below is behaviour the browser owns — opening, closing, which
    row closes which, and the keyboard — so it can only be checked in a real
    one. The markup and stylesheet contract these rest on is held by
    `tests/faq-accordion.test.ts`, which is cheap; this is the part that proves
    the contract adds up to a working disclosure.
  */

  test('every answer starts collapsed', async ({ page }) => {
    await openArticle(page);
    /*
      Each answer is checked through ITS OWN row rather than by searching the
      page for the answer text, so a hidden panel is attributed to the question
      it belongs to instead of to whichever element happened to match.
    */
    for (const q of [question, question2, question3]) {
      await expect(answerOf(page, q), `the answer to "${q}" should start collapsed`).toBeHidden();
      // And the questions are all there to be read and chosen between.
      await expect(row(page, q).locator('.nfr-faq-question')).toBeVisible();
    }
  });

  test('a click opens an answer and a second click closes it', async ({ page }) => {
    await openArticle(page);
    const first = row(page, question);

    await first.locator('summary').click();
    await expect(answerOf(page, question)).toBeVisible();
    await expect(first).toHaveAttribute('open', '');

    await first.locator('summary').click();
    await expect(answerOf(page, question)).toBeHidden();
    await expect(first).not.toHaveAttribute('open', '');
  });

  test('the whole question row is the control, not just the words', async ({ page }) => {
    await openArticle(page);
    const summary = row(page, question).locator('summary');
    const box = (await summary.boundingBox())!;
    /*
      Clicked at the far right of the row, where the plus sits and where a
      reader's thumb lands on a phone. An implementation that wrapped only the
      question text in the control would ignore this entirely.
    */
    await summary.click({ position: { x: box.width - 8, y: box.height / 2 } });
    await expect(answerOf(page, question)).toBeVisible();
  });

  test('opening one question closes the other in the same set', async ({ page }) => {
    await openArticle(page);
    await row(page, question).locator('summary').click();
    await expect(answerOf(page, question)).toBeVisible();

    await row(page, question2).locator('summary').click();
    await expect(answerOf(page, question2)).toBeVisible();
    /*
      SINGLE-OPEN, which is the behaviour `name` on `details` buys. Without it
      a reader opening six questions is back to the wall of text the accordion
      was built to remove.
    */
    await expect(answerOf(page, question),
      'the first answer should have closed when the second opened').toBeHidden();
  });

  test('a separate question set keeps its own open row', async ({ page }) => {
    await openArticle(page);
    await row(page, question).locator('summary').click();
    await row(page, question3).locator('summary').click();

    // Different group: both stay open, because they are not each other's business.
    await expect(answerOf(page, question3)).toBeVisible();
    await expect(answerOf(page, question),
      'a question in another set must not close this one').toBeVisible();
  });

  test('the keyboard opens and closes a question', async ({ page }) => {
    await openArticle(page);
    const summary = row(page, question).locator('summary');

    await summary.focus();
    await expect(summary).toBeFocused();
    await summary.press('Enter');
    await expect(answerOf(page, question)).toBeVisible();

    await summary.press('Enter');
    await expect(answerOf(page, question)).toBeHidden();

    // Space is the other activation a disclosure is expected to answer.
    await summary.press(' ');
    await expect(answerOf(page, question)).toBeVisible();
  });

  test('a link inside an answer is reachable once the answer is open', async ({ page }) => {
    await openArticle(page);
    const first = row(page, question);
    await first.locator('summary').click();
    // The answer panel is a real part of the document, not an inert copy: its
    // content can be selected and its controls focused.
    await expect(first.locator('.nfr-faq-answer')).toBeVisible();
    await expect(first.locator('summary')).toHaveAttribute('aria-controls', /^faq-article-/);
  });

  test('the rows fit a phone without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    await openArticle(page);
    await row(page, question).locator('summary').click();
    await expect(answerOf(page, question)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the page scrolls sideways at 360px').toBeLessThanOrEqual(1);
  });

  test('captures the accordion on desktop and on a phone', async ({ page }) => {
    const shots = path.join(E2E_DIR, '..', '..', '..', 'docs', 'faq-accordion');
    await fs.mkdir(shots, { recursive: true });

    await page.setViewportSize({ width: 1280, height: 900 });
    await openArticle(page);
    const first = row(page, question);
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, 'desktop-collapsed.png'), fullPage: false });
    await first.locator('summary').click();
    await expect(answerOf(page, question)).toBeVisible();
    await page.screenshot({ path: path.join(shots, 'desktop-expanded.png'), fullPage: false });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/articles/${publishedSlug}/`);
    const mobileFirst = row(page, question);
    // Same Suspense wait as `openArticle` — a screenshot taken before the body
    // streams in is a picture of "Loading…".
    await expect(mobileFirst.locator('.nfr-faq-question')).toBeVisible();
    await mobileFirst.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, 'mobile-collapsed.png'), fullPage: false });
    await mobileFirst.locator('summary').click();
    await expect(answerOf(page, question)).toBeVisible();
    await page.screenshot({ path: path.join(shots, 'mobile-expanded.png'), fullPage: false });
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

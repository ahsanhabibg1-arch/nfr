import fs from 'node:fs';
import { STATE_FILE, readState, testDb } from './support';

/** Removes everything the suite created (isolated test database only) and the credential file. */
export default async function globalTeardown() {
  if (!fs.existsSync(STATE_FILE)) return;
  const s = readState();
  const db = testDb();
  try {
    await db.articleRedirect.deleteMany({ where: { sourcePath: s.redirectSource } });
    await db.article.deleteMany({ where: { id: s.scheduledArticleId } });
    await db.session.deleteMany({ where: { userId: s.adminUserId } });
    await db.user.deleteMany({ where: { id: s.adminUserId } });

    /**
     * ADDED IN STAGE 07. Several Builder specs click Save Draft, which creates a
     * `PageLayout` row — and nothing removed it, so the suite was not
     * self-cleaning. That mattered more than it looks: the Stage 06 test "the
     * canvas reloads after a successful Save Draft" relied on a page having no
     * stored layout in order to start dirty, so the row it left behind made the
     * test fail on every subsequent run. Stage 07 hit that, cleared the row by
     * hand, and made the test idempotent as well as adding this teardown.
     *
     * Safe to delete wholesale: `global-setup` refuses to run against anything
     * but the isolated test database, and Stage 04's inventory found zero
     * `PageLayout` rows there, so nothing in this table is fixture data another
     * suite depends on. Revisions are removed with their parent layouts.
     */
    await db.pageLayoutRevision.deleteMany({});
    await db.pageLayout.deleteMany({});
  } finally {
    await db.$disconnect();
    fs.rmSync(STATE_FILE, { force: true });
  }
}

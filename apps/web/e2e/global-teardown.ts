import fs from 'node:fs';
import { STATE_FILE, readState, testDb } from './support';

/** Removes everything global-setup created (isolated test database only) and the credential file. */
export default async function globalTeardown() {
  if (!fs.existsSync(STATE_FILE)) return;
  const s = readState();
  const db = testDb();
  try {
    await db.articleRedirect.deleteMany({ where: { sourcePath: s.redirectSource } });
    await db.article.deleteMany({ where: { id: s.scheduledArticleId } });
    await db.session.deleteMany({ where: { userId: s.adminUserId } });
    await db.user.deleteMany({ where: { id: s.adminUserId } });
  } finally {
    await db.$disconnect();
    fs.rmSync(STATE_FILE, { force: true });
  }
}

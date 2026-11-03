import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { syncRolesAndPermissions } from '../lib/auth/roleSync';
import { FIXTURE_SLUGS } from '../prisma/fixtures';
import { STATE_FILE, testDb, type E2EState } from './support';

/**
 * Creates ephemeral, test-only rows in the ISOLATED test database (guarded by testDb()):
 *  - a super_admin with a random password (never committed; stored only in e2e/.auth/),
 *  - a legacy SCHEDULED article (to check the "Manual publish required" label),
 *  - an ACTIVE redirect from a renamed slug to the published fixture article.
 * Requires the seeded `fixture-` records (prisma/fixtures.ts).
 */
export default async function globalSetup() {
  const db = testDb();
  try {
    const fixture = await db.article.findFirst({ where: { slug: FIXTURE_SLUGS.publishedArticle, workflowStatus: 'PUBLISHED' }, select: { authorId: true, categoryId: true } });
    if (!fixture) throw new Error(`Seeded fixture "${FIXTURE_SLUGS.publishedArticle}" not found — run \`npx prisma db seed\` against the isolated test database first.`);

    await syncRolesAndPermissions(db);
    const runId = crypto.randomBytes(4).toString('hex');
    const adminPassword = crypto.randomBytes(18).toString('base64url');
    const role = await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    const admin = await db.user.create({
      data: { email: `e2e-admin-${runId}@example.com`, name: 'E2E Admin (test only)', status: 'ACTIVE', passwordHash: await bcrypt.hash(adminPassword, 12) },
    });
    await db.userRole.create({ data: { userId: admin.id, roleId: role.id } });

    const scheduled = await db.article.create({
      data: {
        slug: `e2e-scheduled-${runId}`, title: 'Fixture: Legacy Scheduled Article (e2e)', excerpt: 'Synthetic e2e fixture.',
        articleType: 'General Information', workflowStatus: 'SCHEDULED', scheduledAt: new Date(Date.now() + 86_400_000),
        authorId: fixture.authorId, categoryId: fixture.categoryId, createdById: admin.id,
      },
    });

    const redirectSource = `/articles/e2e-renamed-${runId}/`;
    const redirectTarget = `/articles/${FIXTURE_SLUGS.publishedArticle}/`;
    await db.articleRedirect.create({ data: { sourcePath: redirectSource, targetPath: redirectTarget, statusCode: 308 } });

    const state: E2EState = {
      runId, adminEmail: admin.email, adminPassword, adminUserId: admin.id,
      scheduledArticleId: scheduled.id, scheduledArticleSlug: scheduled.slug, redirectSource, redirectTarget,
    };
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } finally {
    await db.$disconnect();
  }
}

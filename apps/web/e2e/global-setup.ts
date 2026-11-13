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
/**
 * Undoes the slug renames the slug-redirect spec performs, so the suite is
 * RE-RUNNABLE.
 *
 * THE DEFECT THIS FIXES. `rodeo-slug-redirects.spec.ts` renames a real seeded
 * event to `<slug>-renamed-<4 chars>` and leaves it renamed; nothing restored
 * it. The suffixes therefore accumulated across runs — one event reached
 * `calgary-stampede-renamed-akrp-renamed-eeod-renamed-uutj-renamed-78jr` — and
 * once the canonical slug had moved, `public.spec.ts` started getting HTTP 308
 * where it asserts 200 for `/rodeo-events/calgary-stampede/2026/`. Two specs
 * failed for a reason neither of them contained, and a clean run depended on
 * nobody having run the suite before.
 *
 * The suffix the spec appends is a fixed shape, so stripping it is exact rather
 * than a guess. Redirect rows created by those renames are left alone: they are
 * real history, and the specs that assert on redirects create their own.
 */
async function restoreRenamedRodeoSlugs(db: ReturnType<typeof testDb>): Promise<void> {
  const RENAMED = /(-renamed-[a-z0-9]{4})+$/;
  const events = await db.rodeoEvent.findMany({ select: { id: true, slug: true } });
  for (const e of events) {
    if (!RENAMED.test(e.slug)) continue;
    const canonical = e.slug.replace(RENAMED, '');
    // Skip if something already occupies the canonical slug: colliding would
    // fail the setup for every spec, which is worse than one stale slug.
    const taken = await db.rodeoEvent.findFirst({ where: { slug: canonical }, select: { id: true } });
    if (taken) continue;
    await db.rodeoEvent.update({ where: { id: e.id }, data: { slug: canonical } });
  }
}

/**
 * Clears the durable rate limiter in the ISOLATED test database.
 *
 * THE DEFECT THIS FIXES. `admin.spec.ts` and `account-menu.spec.ts` each
 * register a reader through the real public sign-up flow. Registration is rate
 * limited per IP (5 per window) and the limiter is durable — it lives in
 * `RateLimitHit`, which nothing reset between runs. Every run therefore spent
 * two of five, and after a few runs the counter for `register:::1` stood at 13
 * with the window still open. Sign-up then failed CLOSED and silently, which is
 * correct product behaviour (it must not reveal whether an account exists), so
 * both specs simply timed out waiting for a redirect, with no error on the page
 * and nothing in the server log. The suite could be run about twice an hour.
 *
 * Clearing it is safe and correct here: these rows are ephemeral
 * infrastructure state in a disposable database, not fixture data, and
 * `testDb()` refuses anything that is not the isolated test database. The
 * limiter's own behaviour is covered by `tests/batch21-ratelimit.test.ts` and
 * `tests/batch22-auth.test.ts`, which inject their own storage rather than
 * relying on accumulated rows — so nothing is weakened by starting each browser
 * run from a clean window.
 */
async function clearRateLimiterState(db: ReturnType<typeof testDb>): Promise<void> {
  await db.rateLimitHit.deleteMany({});
}

export default async function globalSetup() {
  const db = testDb();
  try {
    const fixture = await db.article.findFirst({ where: { slug: FIXTURE_SLUGS.publishedArticle, workflowStatus: 'PUBLISHED' }, select: { authorId: true, categoryId: true } });
    if (!fixture) throw new Error(`Seeded fixture "${FIXTURE_SLUGS.publishedArticle}" not found — run \`npx prisma db seed\` against the isolated test database first.`);

    await syncRolesAndPermissions(db);
    await restoreRenamedRodeoSlugs(db);
    await clearRateLimiterState(db);
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

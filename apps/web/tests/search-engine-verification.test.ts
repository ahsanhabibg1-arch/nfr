import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';

/**
 * Search engine verification: the safety boundary first.
 *
 * WHAT MAKES THIS DANGEROUS, AND THEREFORE WHAT IS TESTED HARDEST. A
 * verification record puts an administrator-supplied `name` and `content`
 * straight into the public document head. Two things must be impossible:
 *
 *   - a meta tag that CONTROLS crawling. `<meta name="robots" content="noindex">`
 *     saved here would remove the entire site from every search engine, from a
 *     screen whose whole purpose is to get it listed.
 *   - a value carrying markup or quotes, which would break out of the tag.
 *
 * Everything else — the states, the checks, the audit trail — matters because
 * an administrator has to be able to trust what the screen tells them. A check
 * that said "verified" without looking would be worse than no check.
 */

const dbUrl = process.env.DATABASE_URL ?? '';
const suite = dbUrl ? describe : describe.skip;

suite('search engine verification', () => {
  let prisma: PrismaClient;
  let svc: typeof import('../lib/cms/searchEngineService');
  let admin: Actor;
  let reader: Actor;
  const madeUsers: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    svc = await import('../lib/cms/searchEngineService');
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    const u = await prisma.user.create({
      data: { email: `se-${Math.random().toString(36).slice(2, 8)}@example.com`, name: 'SE Admin', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    madeUsers.push(u.id);
    admin = { id: u.id, roles: ['super_admin'] };
    reader = { id: u.id, roles: ['reader'] };
  });

  afterAll(async () => {
    await prisma.systemSetting.deleteMany({
      where: { key: { in: [svc.VERIFICATION_KEY, svc.DNS_KEY, svc.TRACKING_KEY] } },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: madeUsers } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: madeUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: madeUsers } } });
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // The safety boundary
  // -------------------------------------------------------------------------

  describe('what may become a meta tag', () => {
    it('REFUSES a tag that controls crawling, however it is spelled', () => {
      // The catastrophic case: one saved record could deindex the whole site.
      for (const name of ['robots', 'ROBOTS', 'Robots', 'googlebot', 'bingbot', 'refresh']) {
        expect(() => svc.resolveMetaName('custom', name), name).toThrow(/cannot be set here|verification tags only/i);
      }
    });

    it('refuses a name that is not shaped like a verification tag', () => {
      for (const bad of ['', '   ', 'has spaces', '<script>', 'a'.repeat(80), 'UPPER-CASE!', '-leading']) {
        expect(() => svc.resolveMetaName('custom', bad), JSON.stringify(bad)).toThrow();
      }
    });

    it('uses the provider\'s own documented name, ignoring anything passed with it', () => {
      // An allowlisted provider's meta name is not negotiable from the client.
      expect(svc.resolveMetaName('google')).toBe('google-site-verification');
      expect(svc.resolveMetaName('bing')).toBe('msvalidate.01');
      expect(svc.resolveMetaName('google', 'robots')).toBe('google-site-verification');
    });

    it('allows a genuine custom verification name', () => {
      expect(svc.resolveMetaName('custom', 'example-site-verification')).toBe('example-site-verification');
      expect(svc.resolveMetaName('custom', 'p:domain_verify')).toBe('p:domain_verify');
    });
  });

  describe('what may become a token', () => {
    it('REFUSES a value that could break out of the attribute', async () => {
      for (const bad of [
        '"><script>alert(1)</script>',
        "' onload='alert(1)",
        'has spaces',
        'tok<en>',
        'short',
        'x'.repeat(250),
      ]) {
        await expect(
          svc.saveVerificationRecord(admin, { provider: 'google', value: bad, enabled: true }),
          JSON.stringify(bad),
        ).rejects.toMatchObject({ code: 'validation' });
      }
    });

    it('accepts the token shapes the providers actually issue', async () => {
      const r = await svc.saveVerificationRecord(admin, {
        provider: 'google', value: 'AbC123_-=.:/+xyz', enabled: true,
      });
      expect(r.metaName).toBe('google-site-verification');
      await svc.deleteVerificationRecord(admin, r.id);
    });
  });

  // -------------------------------------------------------------------------
  // Access control
  // -------------------------------------------------------------------------

  it('refuses every read and write without system.config', async () => {
    await expect(svc.getSearchEngineConfig(reader)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.saveVerificationRecord(reader, { provider: 'google', value: 'abc12345', enabled: true }))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.deleteVerificationRecord(reader, 'anything')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.updateTracking(reader, svc.DEFAULT_TRACKING)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.getIndexingHealth(reader)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.listVerificationAudit(reader)).rejects.toMatchObject({ code: 'forbidden' });
  });

  // -------------------------------------------------------------------------
  // The record lifecycle an administrator actually performs
  // -------------------------------------------------------------------------

  it('adds, serves, replaces and removes a record', async () => {
    const first = await svc.saveVerificationRecord(admin, {
      provider: 'google', value: 'first-token-00000001', enabled: true, note: 'initial',
    });
    expect(await svc.getPublicVerificationTags())
      .toEqual([{ name: 'google-site-verification', content: 'first-token-00000001' }]);

    // Rotating the token replaces it; the OLD one must stop being served.
    const rotated = await svc.saveVerificationRecord(admin, {
      id: first.id, provider: 'google', value: 'second-token-00000002', enabled: true,
    });
    const served = await svc.getPublicVerificationTags();
    expect(served).toEqual([{ name: 'google-site-verification', content: 'second-token-00000002' }]);
    expect(JSON.stringify(served)).not.toContain('first-token');
    // A changed value invalidates the previous check result.
    expect(rotated.lastCheck).toBeUndefined();

    // Disabling stops it being served without losing the record.
    await svc.saveVerificationRecord(admin, {
      id: first.id, provider: 'google', value: 'second-token-00000002', enabled: false,
    });
    expect(await svc.getPublicVerificationTags()).toEqual([]);

    await svc.deleteVerificationRecord(admin, first.id);
    expect(await svc.getPublicVerificationTags()).toEqual([]);
  });

  it('refuses a second ACTIVE record for the same tag', async () => {
    const a = await svc.saveVerificationRecord(admin, { provider: 'bing', value: 'bing-token-0000001', enabled: true });
    await expect(
      svc.saveVerificationRecord(admin, { provider: 'bing', value: 'bing-token-0000002', enabled: true }),
    ).rejects.toMatchObject({ code: 'validation' });

    // But a disabled one alongside it is fine — that is how a rotation is staged.
    const b = await svc.saveVerificationRecord(admin, { provider: 'bing', value: 'bing-token-0000002', enabled: false });
    expect((await svc.getPublicVerificationTags()).filter((t) => t.name === 'msvalidate.01')).toHaveLength(1);

    await svc.deleteVerificationRecord(admin, a.id);
    await svc.deleteVerificationRecord(admin, b.id);
  });

  it('serves several DIFFERENT providers at once', async () => {
    const g = await svc.saveVerificationRecord(admin, { provider: 'google', value: 'g-token-00000001', enabled: true });
    const b = await svc.saveVerificationRecord(admin, { provider: 'bing', value: 'b-token-00000001', enabled: true });
    const p = await svc.saveVerificationRecord(admin, { provider: 'pinterest', value: 'p-token-00000001', enabled: true });
    const names = (await svc.getPublicVerificationTags()).map((t) => t.name).sort();
    expect(names).toEqual(['google-site-verification', 'msvalidate.01', 'p:domain_verify']);
    for (const r of [g, b, p]) await svc.deleteVerificationRecord(admin, r.id);
  });

  it('records every change against the administrator who made it', async () => {
    const r = await svc.saveVerificationRecord(admin, { provider: 'yandex', value: 'y-token-00000001', enabled: true });
    await svc.deleteVerificationRecord(admin, r.id);
    const rows = await svc.listVerificationAudit(admin);
    const actions = rows.map((x) => x.action);
    expect(actions).toContain('search.verification.create');
    expect(actions).toContain('search.verification.delete');
    // The detail names the tag, not the token — the log stays readable.
    expect(rows.find((x) => x.action === 'search.verification.delete')?.detail).toBe('yandex-verification');
  });

  // -------------------------------------------------------------------------
  // Rendering is checked again at the boundary
  // -------------------------------------------------------------------------

  it('drops a dangerous row that somehow reached the database', async () => {
    /*
      Storage is validated, but a renderer that trusts its input is one bad
      import or one direct database edit away from putting an arbitrary tag in
      the head. This writes such a row DIRECTLY, bypassing the service, and
      asserts the public reader refuses it.
    */
    await prisma.systemSetting.upsert({
      where: { key: svc.VERIFICATION_KEY },
      create: {
        key: svc.VERIFICATION_KEY,
        value: {
          records: [
            { id: 'x1', provider: 'custom', metaName: 'robots', value: 'noindex', enabled: true, createdAt: 'x', updatedAt: 'x' },
            { id: 'x2', provider: 'custom', metaName: 'evil', value: '"><script>', enabled: true, createdAt: 'x', updatedAt: 'x' },
            { id: 'x3', provider: 'google', metaName: 'google-site-verification', value: 'legit-token-0001', enabled: true, createdAt: 'x', updatedAt: 'x' },
          ],
        } as never,
      },
      update: {
        value: {
          records: [
            { id: 'x1', provider: 'custom', metaName: 'robots', value: 'noindex', enabled: true, createdAt: 'x', updatedAt: 'x' },
            { id: 'x2', provider: 'custom', metaName: 'evil', value: '"><script>', enabled: true, createdAt: 'x', updatedAt: 'x' },
            { id: 'x3', provider: 'google', metaName: 'google-site-verification', value: 'legit-token-0001', enabled: true, createdAt: 'x', updatedAt: 'x' },
          ],
        } as never,
      },
    });

    const tags = await svc.getPublicVerificationTags();
    expect(tags.map((t) => t.name)).not.toContain('robots');
    expect(JSON.stringify(tags)).not.toContain('<script');
    expect(tags).toContainEqual({ name: 'google-site-verification', content: 'legit-token-0001' });

    await prisma.systemSetting.delete({ where: { key: svc.VERIFICATION_KEY } });
  });

  // -------------------------------------------------------------------------
  // Detection helpers
  // -------------------------------------------------------------------------

  describe('detecting a tag in a real page', () => {
    it('finds it whatever the attribute order or quoting', () => {
      const cases = [
        '<meta name="google-site-verification" content="tok123"/>',
        "<meta content='tok123' name='google-site-verification'>",
        '<html><head><meta charset="utf-8"><meta  name = "google-site-verification"  content = "tok123" ></head></html>',
      ];
      for (const html of cases) {
        expect(svc.findMetaInHtml(html, 'google-site-verification', 'tok123'), html).toBe(true);
      }
    });

    it('does NOT report a match on a different tag or a different value', () => {
      const html = '<meta name="google-site-verification" content="tok123">';
      expect(svc.findMetaInHtml(html, 'google-site-verification', 'other')).toBe(false);
      expect(svc.findMetaInHtml(html, 'msvalidate.01', 'tok123')).toBe(false);
      // The token appearing in body text is not the tag being served.
      expect(svc.findMetaInHtml('<p>tok123</p>', 'google-site-verification', 'tok123')).toBe(false);
    });
  });

  describe('reading public DNS answers', () => {
    it('joins the chunks a resolver splits a long TXT value into', () => {
      // A long TXT value arrives as several quoted strings that a client is
      // expected to concatenate; a naive read would miss a valid record.
      const body = JSON.stringify({
        Answer: [{ type: 16, data: '"google-site-verification=" "abcdef123456"' }],
      });
      expect(svc.parseDnsTxtAnswers(body)).toEqual(['google-site-verification=abcdef123456']);
    });

    it('ignores answers that are not TXT, and malformed bodies', () => {
      expect(svc.parseDnsTxtAnswers(JSON.stringify({ Answer: [{ type: 1, data: '1.2.3.4' }] }))).toEqual([]);
      expect(svc.parseDnsTxtAnswers('not json')).toEqual([]);
      expect(svc.parseDnsTxtAnswers('{}')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Tracking
  // -------------------------------------------------------------------------

  describe('tracking identifiers', () => {
    it('refuses an id that is not the provider\'s shape', async () => {
      await expect(svc.updateTracking(admin, { ...svc.DEFAULT_TRACKING, ga4MeasurementId: 'UA-12345-1' }))
        .rejects.toThrow();
      await expect(svc.updateTracking(admin, { ...svc.DEFAULT_TRACKING, gtmContainerId: 'not-a-container' }))
        .rejects.toThrow();
      await expect(svc.updateTracking(admin, { ...svc.DEFAULT_TRACKING, ga4MeasurementId: '"><script>' }))
        .rejects.toThrow();
    });

    it('loads NOTHING until an id is both present and switched on', async () => {
      await svc.updateTracking(admin, { ...svc.DEFAULT_TRACKING, ga4MeasurementId: 'G-ABCD123456', ga4Enabled: false });
      expect(await svc.getPublicTracking()).toEqual({ ga4: undefined, gtm: undefined });

      await svc.updateTracking(admin, { ...svc.DEFAULT_TRACKING, ga4MeasurementId: 'G-ABCD123456', ga4Enabled: true });
      expect((await svc.getPublicTracking()).ga4).toBe('G-ABCD123456');
    });

    it('cannot be switched on with no id, so the screen never claims more than is true', async () => {
      const saved = await svc.updateTracking(admin, { ...svc.DEFAULT_TRACKING, ga4MeasurementId: '', ga4Enabled: true });
      expect(saved.ga4Enabled).toBe(false);
      expect((await svc.getPublicTracking()).ga4).toBeUndefined();
    });
  });

  it('reports Cloudflare honestly rather than offering automation it does not have', () => {
    const status = svc.cloudflareStatus();
    expect(typeof status.configured).toBe('boolean');
    expect(status.detail.length).toBeGreaterThan(20);
    if (!status.configured) expect(status.detail).toMatch(/manual|copy/i);
  });
});

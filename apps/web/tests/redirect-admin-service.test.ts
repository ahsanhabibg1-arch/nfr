import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type * as Service from '../lib/cms/redirectAdminService';

let prisma: PrismaClient;
let svc: typeof Service;
let available = false;
if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    await (await import('../lib/auth/roleSync')).syncRolesAndPermissions(prisma);
    svc = await import('../lib/cms/redirectAdminService');
    available = (await prisma.category.count()) > 0;
  } catch { available = false; }
}

const suite = available ? describe : describe.skip;
const tag = `ra-${Math.random().toString(36).slice(2, 8)}`;
const source = (name: string) => `/articles/${tag}-${name}/`;

suite('redirect admin service', () => {
  let actor: { id: string; roles: ['super_admin'] };
  let destination: string;

  beforeAll(async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    const user = await prisma.user.create({ data: { email: `${tag}@example.com`, name: 'Redirect Admin', status: 'ACTIVE', roles: { create: { roleId: role.id } } } });
    actor = { id: user.id, roles: ['super_admin'] };
    const category = await prisma.category.findFirstOrThrow({ select: { slug: true } });
    destination = `/categories/${category.slug}/`;
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.articleRedirect.deleteMany({ where: { OR: [{ sourcePath: { contains: tag } }, { note: { contains: tag } }] } });
    await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
    await prisma.user.delete({ where: { id: actor.id } });
  });

  it('enforces view permission in the service', async () => {
    await expect(svc.listRedirects({ id: actor.id, roles: ['reader'] })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('creates a normalized manual redirect with attribution and audit', async () => {
    const row = await svc.createRedirect(actor, { sourcePath: source('create').slice(0, -1), targetPath: destination, statusCode: 301, status: 'ACTIVE', note: tag });
    expect(row).toMatchObject({ sourcePath: source('create'), targetPath: destination, statusCode: 301, origin: 'MANUAL', createdById: actor.id });
    expect(await prisma.auditLog.count({ where: { entityId: row.id, action: 'redirect.create' } })).toBe(1);
  });

  it('rejects external, reserved, unsupported, dangling and canonical-shadow rules', async () => {
    await expect(svc.createRedirect(actor, { sourcePath: source('external'), targetPath: 'https://evil.test/', statusCode: 301 })).rejects.toMatchObject({ code: 'invalid_target' });
    await expect(svc.createRedirect(actor, { sourcePath: '/admin/x/', targetPath: destination, statusCode: 301 })).rejects.toMatchObject({ code: 'invalid_source' });
    await expect(svc.createRedirect(actor, { sourcePath: source('code'), targetPath: destination, statusCode: 306 })).rejects.toMatchObject({ code: 'bad_status' });
    await expect(svc.createRedirect(actor, { sourcePath: source('gone'), targetPath: '/articles/definitely-not-live/', statusCode: 301 })).rejects.toMatchObject({ code: 'target_not_live' });
    await expect(svc.createRedirect(actor, { sourcePath: destination, targetPath: destination, statusCode: 301 })).rejects.toMatchObject({ code: 'invalid_target' });
  });

  it('lists, searches and filters with pagination and accurate summary', async () => {
    const result = await svc.listRedirects(actor, { q: `${tag}-create`, status: 'ACTIVE', origin: 'MANUAL', statusCode: 301, pageSize: 1 });
    expect(result.rows).toHaveLength(1);
    expect(result.summary.manual).toBeGreaterThanOrEqual(1);
    expect(result.pageSize).toBe(1);
  });

  it('accepts live public landing-page destinations', async () => {
    await expect(svc.validateRedirect(actor, {
      sourcePath: source('section'),
      targetPath: '/competition/',
      statusCode: 301,
    })).resolves.toMatchObject({ targetPath: '/competition/' });
  });

  it('edits without changing provenance and revalidates activation', async () => {
    const created = await svc.createRedirect(actor, { sourcePath: source('edit'), targetPath: destination, statusCode: 302, status: 'DISABLED' });
    const updated = await svc.updateRedirect(actor, created.id, { sourcePath: source('edited'), targetPath: destination, statusCode: 307, status: 'DISABLED', note: tag });
    expect(updated).toMatchObject({ sourcePath: source('edited'), statusCode: 307, origin: 'MANUAL' });
    expect((await svc.setRedirectStatus(actor, created.id, 'ACTIVE')).status).toBe('ACTIVE');
    expect((await svc.setRedirectStatus(actor, created.id, 'DISABLED')).status).toBe('DISABLED');
  });

  it('requires deactivation before deletion and preserves the audit trail', async () => {
    const row = await svc.createRedirect(actor, { sourcePath: source('delete'), targetPath: destination, statusCode: 308 });
    await expect(svc.deleteRedirect(actor, row.id)).rejects.toMatchObject({ code: 'active_delete' });
    await svc.setRedirectStatus(actor, row.id, 'DISABLED');
    await svc.deleteRedirect(actor, row.id);
    expect(await prisma.articleRedirect.findUnique({ where: { id: row.id } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: row.id, action: 'redirect.delete' } })).toBe(1);
  });

  it('serializes activation against guarded deletion using the committed row state', async () => {
    const row = await svc.createRedirect(actor, { sourcePath: source('delete-race'), targetPath: destination, statusCode: 308, status: 'DISABLED' });
    const [activation, deletion] = await Promise.allSettled([
      svc.setRedirectStatus(actor, row.id, 'ACTIVE'),
      svc.deleteRedirect(actor, row.id),
    ]);

    expect([activation.status, deletion.status].filter((status) => status === 'fulfilled')).toHaveLength(1);
    const current = await prisma.articleRedirect.findUnique({ where: { id: row.id } });
    if (activation.status === 'fulfilled') expect(current?.status).toBe('ACTIVE');
    else expect(current).toBeNull();

    const bulkRow = await svc.createRedirect(actor, { sourcePath: source('bulk-delete-race'), targetPath: destination, statusCode: 308, status: 'DISABLED' });
    const [bulkActivation, bulkDeletion] = await Promise.allSettled([
      svc.setRedirectStatus(actor, bulkRow.id, 'ACTIVE'),
      svc.bulkDelete(actor, [bulkRow.id]),
    ]);
    expect([bulkActivation.status, bulkDeletion.status].filter((status) => status === 'fulfilled')).toHaveLength(1);
    const currentBulk = await prisma.articleRedirect.findUnique({ where: { id: bulkRow.id } });
    if (bulkActivation.status === 'fulfilled') expect(currentBulk?.status).toBe('ACTIVE');
    else expect(currentBulk).toBeNull();
  });

  it('applies bounded bulk actions atomically', async () => {
    const rows = await Promise.all(['bulk-a', 'bulk-b'].map((name) => svc.createRedirect(actor, { sourcePath: source(name), targetPath: destination, statusCode: 301, status: 'DISABLED' })));
    expect((await svc.bulkSetStatus(actor, rows.map((r) => r.id), 'ACTIVE')).count).toBe(2);
    await svc.bulkSetStatus(actor, rows.map((r) => r.id), 'DISABLED');
    expect((await svc.bulkDelete(actor, rows.map((r) => r.id))).count).toBe(2);
  });

  it('exports safe CSV and offers a bounded sample', async () => {
    await svc.createRedirect(actor, { sourcePath: source('csv-export'), targetPath: destination, statusCode: 301, status: 'DISABLED', note: '=SUM(1,1)' });
    const csv = await svc.exportRedirects(actor, { q: `${tag}-csv-export` });
    expect(csv).toContain('sourcePath');
    expect(csv).toContain("'=SUM(1,1)");
    expect(svc.SAMPLE_REDIRECT_CSV).toContain('statusCode');
  });

  it('dry-runs without writes, detects duplicate file rows and imports only with a current token', async () => {
    const src = source('csv-import');
    const text = `sourcePath,targetPath,statusCode,status,note\r\n${src},${destination},302,DISABLED,${tag}\r\n`;
    const before = await prisma.articleRedirect.count({ where: { sourcePath: src } });
    const dry = await svc.dryRunCsvImport(actor, text);
    expect(dry).toMatchObject({ valid: 1, invalid: 0 });
    expect(await prisma.articleRedirect.count({ where: { sourcePath: src } })).toBe(before);
    expect((await svc.confirmCsvImport(actor, text, dry.token)).count).toBe(1);
    const duplicate = await svc.dryRunCsvImport(actor, text + `${src},${destination},302,DISABLED,x\r\n`);
    expect(duplicate.invalid).toBeGreaterThan(0);
  });

  it('reports disabled history and malformed legacy rows without mutating them', async () => {
    const row = await prisma.articleRedirect.create({ data: { sourcePath: source('diag'), targetPath: 'https://evil.test/', statusCode: 399, status: 'DISABLED', note: tag } });
    const diagnostics = await svc.getDiagnostics(actor);
    expect(diagnostics.rows.some((x) => x.redirectId === row.id && x.code === 'invalid_target')).toBe(true);
    expect(await prisma.articleRedirect.findUnique({ where: { id: row.id } })).toBeTruthy();
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type * as Write from '../lib/redirects/write';

let prisma: PrismaClient;
let write: typeof Write;
let available = false;
if (process.env.DATABASE_URL) {
  try { prisma = (await import('../lib/db')).prisma as PrismaClient; await prisma.$queryRaw`SELECT 1`; write = await import('../lib/redirects/write'); available = true; } catch { available = false; }
}
const suite = available ? describe : describe.skip;
const tag = `race-${Math.random().toString(36).slice(2, 8)}`;
const p = (x: string) => `/articles/${tag}-${x}/`;

suite('redirect graph concurrent mutation safety', () => {
  afterAll(async () => { await prisma.articleRedirect.deleteMany({ where: { sourcePath: { contains: tag } } }); });

  it('serializes two writers targeting the same source without duplicates', async () => {
    await Promise.all([
      prisma.$transaction((tx) => write.writeMoveRedirect(tx, p('same'), p('one'))),
      prisma.$transaction((tx) => write.writeMoveRedirect(tx, p('same'), p('two'))),
    ]);
    expect(await prisma.articleRedirect.count({ where: { sourcePath: p('same') } })).toBe(1);
  });

  it('prevents concurrent inverse moves from leaving an active cycle', async () => {
    await Promise.all([
      prisma.$transaction((tx) => write.writeMoveRedirect(tx, p('a'), p('b'))),
      prisma.$transaction((tx) => write.writeMoveRedirect(tx, p('b'), p('a'))),
    ]);
    const rows = await prisma.articleRedirect.findMany({ where: { sourcePath: { in: [p('a'), p('b')] }, status: 'ACTIVE' } });
    const graph = new Map(rows.map((r) => [r.sourcePath, r.targetPath]));
    expect(!(graph.get(p('a')) === p('b') && graph.get(p('b')) === p('a'))).toBe(true);
  });

  it('serializes canonical reclaim against an automatic write', async () => {
    await prisma.$transaction((tx) => write.writeMoveRedirect(tx, p('old'), p('claimed')));
    await Promise.all([
      prisma.$transaction(async (tx) => { await write.lockRedirectGraph(tx); await write.claimCanonicalPath(tx, p('old')); }),
      prisma.$transaction((tx) => write.writeMoveRedirect(tx, p('other'), p('old'))),
    ]);
    expect(await prisma.articleRedirect.count({ where: { sourcePath: p('old'), status: 'ACTIVE' } })).toBe(0);
  });

  it('releases the lock and rolls back the row after a failed entity transaction', async () => {
    await expect(prisma.$transaction(async (tx) => { await write.writeMoveRedirect(tx, p('rollback'), p('dest')); throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(await prisma.articleRedirect.findUnique({ where: { sourcePath: p('rollback') } })).toBeNull();
    await expect(prisma.$transaction((tx) => write.writeMoveRedirect(tx, p('after'), p('dest')))).resolves.toMatchObject({ written: true });
  });
});

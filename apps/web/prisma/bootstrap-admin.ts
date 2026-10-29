/**
 * Secure one-time Super Admin bootstrap (Batch 03 §4).
 *
 *   npm run bootstrap:admin
 *
 * - No hardcoded credentials, no public registration, no automatic account.
 * - Reads email / name / password from a TTY prompt (password echo muted) or,
 *   for automation, from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_NAME /
 *   BOOTSTRAP_ADMIN_PASSWORD. The password is never printed or logged.
 * - Refuses to run if a Super Admin already exists (no duplicate).
 * - Syncs the role/permission tables, then creates an ACTIVE Super Admin.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { syncRolesAndPermissions } from '../lib/auth/roleSync';

// Load .env (this is a plain tsx script, not run through the Prisma CLI).
if (!process.env.DATABASE_URL) {
  try {
    const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env — DATABASE_URL must be provided in the environment */
  }
}

const db = new PrismaClient();

function ask(query: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Mute echo for hidden (password) input.
  const rlAny = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  let muted = false;
  const original = rlAny._writeToOutput.bind(rlAny);
  rlAny._writeToOutput = (s: string) => {
    if (muted && hidden) return; // write nothing while typing the secret
    original(s);
  };
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = true;
  });
}

async function main() {
  const existing = await db.user.findFirst({
    where: { roles: { some: { role: { key: 'super_admin' } } } },
    select: { email: true },
  });
  if (existing) {
    console.error(`A Super Admin already exists (${existing.email}). Refusing to create another.`);
    console.error('To add more staff, use the authenticated Team module (a future batch) or manage roles directly.');
    process.exit(1);
  }

  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || (await ask('Super Admin email: '))).toLowerCase();
  const name = process.env.BOOTSTRAP_ADMIN_NAME || (await ask('Super Admin full name: '));
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || (await ask('Super Admin password (min 12 chars, hidden): ', true));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Invalid email address.');
    process.exit(1);
  }
  if (!name) {
    console.error('Name is required.');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  await syncRolesAndPermissions(db);
  const superRole = await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
  const passwordHash = await bcrypt.hash(password, 12);

  await db.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: { name, passwordHash, status: 'ACTIVE' },
      create: { email, name, passwordHash, status: 'ACTIVE' },
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: superRole.id } },
      update: {},
      create: { userId: user.id, roleId: superRole.id },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, action: 'bootstrap.super_admin.create', entityType: 'user', entityId: user.id, detail: 'Initial Super Admin created via bootstrap CLI' },
    });
  });

  console.log(`\n✅ Super Admin created: ${email} (role: Super Admin). You can now log in at /admin/login/.`);
}

main()
  .then(async () => { await db.$disconnect(); })
  .catch(async (e) => {
    console.error('Bootstrap failed:', e instanceof Error ? e.message : e);
    await db.$disconnect();
    process.exit(1);
  });

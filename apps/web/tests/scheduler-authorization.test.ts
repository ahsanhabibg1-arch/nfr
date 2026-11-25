import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { schedulerAuthorization, startScheduler, stopScheduler } from '../lib/cms/scheduledPublishRunner';

/**
 * Batch 02 Task A — the publishing WRITER must be authorized, not merely reached.
 *
 * `startScheduler` installs a 60s timer that calls `executeScheduledPublish`,
 * which writes to whichever database the process points at. It used to start
 * unconditionally, so a local `next dev` aimed at the managed database could
 * publish to production. These cases pin the two-signal gate that closes that,
 * and in particular the case the obvious implementation gets wrong: a
 * production BUILD verified on a laptop (`NODE_ENV=production`) must stay
 * read-only.
 *
 * Pure environment logic — nothing here connects to a database or starts a
 * real timer against one.
 */

const KEYS = ['APP_ENV', 'NODE_ENV', 'SCHEDULED_PUBLISHING'] as const;
/** `process.env` is typed read-only for NODE_ENV in this project's tsconfig. */
const envStore = process.env as unknown as Record<string, string | undefined>;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) saved[k] = envStore[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete envStore[k];
    else envStore[k] = saved[k];
  }
  stopScheduler();
  vi.restoreAllMocks();
});

function env(o: Record<string, string | undefined>): Record<string, string | undefined> {
  return o;
}

describe('Batch 02 — scheduled publishing authorization', () => {
  it('is DISABLED in local development', () => {
    const r = schedulerAuthorization(env({ APP_ENV: 'development', NODE_ENV: 'development' }));
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/not a production deployment/);
  });

  it('is DISABLED under APP_ENV=test, even with the authorization flag set', () => {
    const r = schedulerAuthorization(env({ APP_ENV: 'test', SCHEDULED_PUBLISHING: 'on' }));
    expect(r.enabled).toBe(false);
  });

  it('is DISABLED for staging and preview labels by default', () => {
    for (const label of ['staging', 'preview']) {
      expect(schedulerAuthorization(env({ APP_ENV: label })).enabled).toBe(false);
    }
  });

  it('FAILS CLOSED when the environment is ambiguous (no APP_ENV at all)', () => {
    const r = schedulerAuthorization(env({ NODE_ENV: 'production', SCHEDULED_PUBLISHING: 'on' }));
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/APP_ENV is not set/);
  });

  it('NODE_ENV=production alone never authorizes the writer — this is local production-mode verification', () => {
    expect(schedulerAuthorization(env({ NODE_ENV: 'production' })).enabled).toBe(false);
    // Labelled production but unauthorized: a production BUILD run on a laptop.
    const labelled = schedulerAuthorization(env({ APP_ENV: 'production', NODE_ENV: 'production' }));
    expect(labelled.enabled).toBe(false);
    expect(labelled.reason).toMatch(/SCHEDULED_PUBLISHING/);
  });

  it('is ENABLED only for a labelled production deployment that is explicitly authorized', () => {
    const r = schedulerAuthorization(env({
      APP_ENV: 'production', NODE_ENV: 'production', SCHEDULED_PUBLISHING: 'on',
    }));
    expect(r.enabled).toBe(true);
  });

  it('accepts only "on" — not "1", "true" or "yes"', () => {
    for (const v of ['1', 'true', 'yes', 'ON ']) {
      const r = schedulerAuthorization(env({ APP_ENV: 'production', SCHEDULED_PUBLISHING: v }));
      // "ON " differs only by case and padding, which the gate normalises.
      expect(r.enabled).toBe(v.trim().toLowerCase() === 'on');
    }
  });

  it('startScheduler installs NO timer when unauthorized', () => {
    delete process.env.SCHEDULED_PUBLISHING;
    envStore.APP_ENV = 'development';
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    startScheduler();
    expect(setInterval).not.toHaveBeenCalled();
  });
});

/**
 * The Blueprint's declared value, fed to the REAL gate.
 *
 * Asserting the literal string "off" would only restate the file. What matters
 * is the consequence: whatever `render.yaml` declares for this service must
 * leave the writer disabled, so the Blueprint and the gate cannot drift apart.
 * This mirrors how `tests/deploy-config.test.ts` checks STAGING_NOINDEX.
 */
describe('Batch 02 — the Render Blueprint does not authorize the writer on this service', () => {
  const RENDER_YAML = readFileSync(resolve(__dirname, '../../..', 'render.yaml'), 'utf8');

  /** Narrow line reader for the `- key:` / `value:` pairs this file uses. */
  function declared(key: string): string | undefined {
    const lines = RENDER_YAML.split('\n').map((l) => l.replace(/^\s*#.*$/, '').trimEnd());
    let inKey = false;
    for (const line of lines) {
      const k = line.trim();
      if (k.startsWith('- key:')) {
        inKey = k.slice('- key:'.length).trim() === key;
        continue;
      }
      if (inKey && k.startsWith('value:')) {
        return k.slice('value:'.length).trim().replace(/^["']|["']$/g, '');
      }
    }
    return undefined;
  }

  it('declares SCHEDULED_PUBLISHING explicitly, so a Blueprint sync restores the safe value', () => {
    expect(declared('SCHEDULED_PUBLISHING')).toBeDefined();
  });

  it('and the declared value leaves the writer disabled on this service', () => {
    const r = schedulerAuthorization({
      APP_ENV: declared('APP_ENV'),
      SCHEDULED_PUBLISHING: declared('SCHEDULED_PUBLISHING'),
    });
    expect(r.enabled).toBe(false);
  });
});

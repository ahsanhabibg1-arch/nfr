import { describe, it, expect } from 'vitest';
import { isOwnDevProcess } from '../scripts/dev-server.mjs';

/**
 * Batch 02 Task F3 — the dev-server helper must never kill anything but THIS
 * app's Next server.
 *
 * The helper exists because a stopped `npm run dev` can leave
 * `next/dist/server/lib/start-server.js` orphaned on port 3000, after which Next
 * refuses to start. The tempting implementation — "kill whatever holds port
 * 3000" — would happily terminate another project's server or an unrelated
 * service. These cases pin the narrower rule the helper actually uses: the
 * command line must name BOTH this application's directory AND a Next server
 * entry point.
 */

const APP = 'D:/Projects/nfrguide/apps/web';

/**
 * Build a Windows-style path from a POSIX one. The separator is written by code
 * point rather than as a literal, so no layer of escaping between this file and
 * the runtime can turn it into something else.
 */
const SEP = String.fromCharCode(92);
const w = (posix: string): string => posix.split('/').join(SEP);
const WIN = w(APP);

describe('Task F3 — isOwnDevProcess', () => {
  it('matches this app\'s next dev wrapper', () => {
    const wrapper = `"node" "${WIN}${SEP}${w("node_modules/next/dist/bin/next")}" dev`;
    expect(isOwnDevProcess(wrapper, APP)).toBe(true);
  });

  it('matches the orphan that actually holds the port', () => {
    const orphan = `"node.exe" "${WIN}${SEP}${w("node_modules/next/dist/server/lib/start-server.js")}"`;
    expect(isOwnDevProcess(orphan, APP)).toBe(true);
  });

  it('is separator and case insensitive, so Windows spellings all match', () => {
    expect(isOwnDevProcess(`node ${APP}/node_modules/next/dist/bin/next dev`, APP)).toBe(true);
    const shouty = `node ${WIN.toUpperCase()}${SEP}${w("NODE_MODULES/NEXT/DIST/BIN/NEXT")} dev`;
    expect(isOwnDevProcess(shouty, APP)).toBe(true);
  });

  it('REFUSES another checkout\'s Next server, even the identical entry point', () => {
    expect(isOwnDevProcess('node D:/Other/app/node_modules/next/dist/bin/next dev', APP)).toBe(false);
    expect(isOwnDevProcess('node C:/work/site/node_modules/next/dist/server/lib/start-server.js', APP)).toBe(false);
  });

  it('REFUSES unrelated processes that merely run inside this directory', () => {
    for (const cmd of [
      `node ${APP}/node_modules/vitest/vitest.mjs run`,
      `node ${APP}/scripts/route-smoke.mts`,
      `node ${APP}/node_modules/prisma/build/index.js studio`,
      `code ${APP}`,
    ]) {
      expect(isOwnDevProcess(cmd, APP)).toBe(false);
    }
  });

  it('REFUSES anything that only looks like node, and empty input', () => {
    expect(isOwnDevProcess('node', APP)).toBe(false);
    expect(isOwnDevProcess('', APP)).toBe(false);
    expect(isOwnDevProcess(undefined as unknown as string, APP)).toBe(false);
    expect(isOwnDevProcess(null as unknown as string, APP)).toBe(false);
  });

  it('never decides from a port number — a port is not in its input at all', () => {
    // The whole safety property: identity comes from the command line, so a
    // process that merely holds port 3000 cannot be selected.
    expect(isOwnDevProcess('node some-other-server.js --port 3000', APP)).toBe(false);
  });
});

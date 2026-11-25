#!/usr/bin/env node
/**
 * Batch 02 Task F3 — a safe stop/status/restart for THIS app's dev server.
 *
 * THE PROBLEM. `npm run dev` spawns `next dev`, which spawns
 * `next/dist/server/lib/start-server.js`. On Windows, killing the npm wrapper
 * (an IDE's stop button, a terminal closing, a tool ending the task) does not
 * always reap that grandchild, so it keeps holding port 3000. Next 16 then
 * refuses the next start with "Another next dev server is already running" and
 * exits 1 — which reads like a broken project rather than a stray process.
 * Reproduced three times out of three while verifying Batch 01.
 *
 * WHY NOT "kill whatever holds the port". That is the dangerous shortcut this
 * script exists to avoid: the listener on 3000 might be another project, or a
 * service that merely happens to use the port. Nothing is killed here unless its
 * command line names BOTH this application's directory AND a Next server entry
 * point. A process that does not match is reported, never terminated.
 *
 * Usage (from apps/web):
 *   node scripts/dev-server.mjs status     # show matches; change nothing
 *   node scripts/dev-server.mjs stop       # terminate only this app's dev processes
 *   node scripts/dev-server.mjs restart    # stop, then exec `next dev`
 */
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Next server entry points. `next dev` is the wrapper; `start-server.js` is the
 * grandchild that actually holds the port and is the one that gets orphaned.
 */
const ENTRY_MARKERS = [
  'next/dist/bin/next',
  'next/dist/server/lib/start-server.js',
];

/** Compare paths case-insensitively and separator-insensitively (Windows). */
/** Windows path separator, written by code point so no escaping can mangle it. */
const WIN_SEP = String.fromCharCode(92);
const normalize = (s) => String(s || '').split(WIN_SEP).join('/').toLowerCase();

/**
 * Does this command line belong to THIS app's Next server?
 *
 * Both conditions are required, and that is the whole safety property: a Next
 * process from another checkout fails the directory test, and an unrelated
 * process in this directory (an editor, a test runner, a database client) fails
 * the entry-point test. Exported so `tests/dev-server-helper.test.ts` can pin it.
 */
export function isOwnDevProcess(commandLine, appDir = APP_DIR) {
  const cmd = normalize(commandLine);
  if (!cmd) return false;
  if (!cmd.includes(normalize(appDir))) return false;
  return ENTRY_MARKERS.some((m) => cmd.includes(normalize(m)));
}

/** Every running process as { pid, commandLine }. Windows uses PowerShell/CIM. */
function listProcesses() {
  if (process.platform === 'win32') {
    const out = execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const parsed = JSON.parse(out || 'null');
    const rows = parsed == null ? [] : Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((r) => ({ pid: r.ProcessId, commandLine: r.CommandLine }));
  }
  const out = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  return out.split('\n').map((line) => {
    const m = line.match(/^\s*(\d+)\s+(.*)$/);
    return m ? { pid: Number(m[1]), commandLine: m[2] } : null;
  }).filter(Boolean);
}

function matches() {
  return listProcesses().filter((p) => isOwnDevProcess(p.commandLine));
}

function stop() {
  const found = matches();
  if (found.length === 0) {
    console.log('No dev server process for this app is running.');
    return 0;
  }
  for (const { pid, commandLine } of found) {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
      else process.kill(pid, 'SIGTERM');
      console.log(`stopped pid ${pid}`);
    } catch (err) {
      console.error(`could NOT stop pid ${pid}: ${err.message}`);
      console.error(`  command line: ${commandLine}`);
      return 1;
    }
  }
  return 0;
}

const command = process.argv[2] || 'status';

if (command === 'status') {
  const found = matches();
  console.log(found.length === 0
    ? 'No dev server process for this app is running.'
    : found.map((p) => `pid ${p.pid}\n  ${p.commandLine}`).join('\n'));
} else if (command === 'stop') {
  process.exit(stop());
} else if (command === 'restart') {
  const code = stop();
  if (code !== 0) process.exit(code);
  spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev'], { cwd: APP_DIR, stdio: 'inherit' })
    .on('exit', (c) => process.exit(c ?? 0));
} else {
  console.error(`Unknown command "${command}". Use: status | stop | restart`);
  process.exit(2);
}

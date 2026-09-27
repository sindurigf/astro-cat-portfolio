import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Ports derived from the checkout path, so parallel worktrees never reach each
 * other's servers and one checkout gets the same pair every run.
 * `TEST_PORT` and `TEST_WORKER_PORT` override a port something else holds.
 * They do not make two suites safe in one checkout: both builds share dist/.
 */

const PORT_MIN = 1024;
const PORT_MAX = 65_535;

/*
 * 20000 to 29999 in pairs: above common dev ports (3000, 4321, 5173, 8080,
 * 8787), below Linux's default ephemeral range of 32768 to 60999.
 */
const BAND_START = 20_000;
const BAND_PAIRS = 5_000;

const CHECKOUT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// One hash for a pair, not two hashes, so the two suites can never collide.
const basePortFor = (root: string): number =>
  BAND_START +
  (createHash('sha256').update(root).digest().readUInt16BE(0) % BAND_PAIRS) * 2;

const portFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) {
    throw new Error(
      `${name}=${raw} is not a port. Use a whole number from ${PORT_MIN} to ${PORT_MAX}.`,
    );
  }
  return port;
};

const BASE_PORT = basePortFor(CHECKOUT_ROOT);

export const TEST_PORT = portFromEnv('TEST_PORT', BASE_PORT);
export const TEST_WORKER_PORT = portFromEnv('TEST_WORKER_PORT', BASE_PORT + 1);

const PROBE_FREE = 0;
const PROBE_IN_USE = 2;

/*
 * Child process for a synchronous answer. Binds rather than connects: a holder
 * that accepts and never answers hangs Playwright's own `webServer` probe.
 */
const probe = (port: number): number => {
  const source =
    "const s = require('node:net').createServer();" +
    `s.once('error', (e) => process.exit(e.code === 'EADDRINUSE' || e.code === 'EACCES' ? ${PROBE_IN_USE} : 3));` +
    `s.once('listening', () => s.close(() => process.exit(${PROBE_FREE})));` +
    `s.listen(${port}, '127.0.0.1');`;

  const result = spawnSync(process.execPath, ['-e', source], {
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return result.status ?? 3;
};

/**
 * Call at config load, before Playwright starts `webServer`. Skipped in worker
 * processes, which reload the config while our own server holds the port.
 */
export const assertPortFree = (port: number, name: string): void => {
  if (process.env.TEST_WORKER_INDEX !== undefined) return;

  const status = probe(port);
  if (status === PROBE_FREE) return;

  if (status !== PROBE_IN_USE) {
    throw new Error(
      `Could not tell whether port ${port} is free: the check exited ${status}.`,
    );
  }

  throw new Error(
    `Port ${port} (derived from ${CHECKOUT_ROOT}) is in use; stop that process or run with ${name}=<free port>.`,
  );
};

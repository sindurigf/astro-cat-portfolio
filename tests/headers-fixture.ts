import { existsSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from './test';
import { DIST_DIR } from './routes';
import { parseHeadersFile, startServer, type Rule } from './policy-server';

/**
 * public/_headers served over dist/ by tests/policy-server.ts (the static server
 * sends none); scripts/check-live.sh checks Cloudflare. Cloudflare comma-joins a
 * header that two matching rules set, which corrupts it.
 */

export const HEADERS_FILE = join(DIST_DIR, '_headers');

/** What a hashed asset receives: its caching, and no `no-transform`. */
export const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface PolicyServer {
  readonly rules: Rule[];
  readonly origin: string;
}

/** Parses the built _headers and serves dist/ with it for the calling describe block. */
export const usePolicyServer = (): (() => PolicyServer) => {
  let current: PolicyServer | undefined;
  let close: (() => Promise<void>) | undefined;

  test.beforeAll(async () => {
    if (!existsSync(HEADERS_FILE)) {
      throw new Error(
        `${HEADERS_FILE} is missing; the build should copy public/_headers.`,
      );
    }
    const rules = parseHeadersFile(readFileSync(HEADERS_FILE, 'utf8'));
    const server = await startServer(rules);
    const { port } = server.address() as AddressInfo;
    current = { rules, origin: `http://127.0.0.1:${port}` };
    close = () => new Promise<void>((done) => server.close(() => done()));
  });

  test.afterAll(async () => {
    await close?.();
  });

  return () => {
    if (!current) throw new Error('the policy server is not running yet.');
    return current;
  };
};

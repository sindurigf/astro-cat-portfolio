/*
 * A static server for `dist/` that sends the headers `public/_headers` declares.
 * The main suite runs without them; scripts/preview-static.mjs says why.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join } from 'node:path';
import type { Page } from '@playwright/test';
import { DIST_DIR } from './routes';
import { MIME as SHARED_MIME } from '../scripts/mime-types.mjs';

export type Rule = {
  pattern: string;
  headers: Map<string, string>;
  detached: Set<string>;
};

const DETACH = /^\s+!\s*([^\s:]+)\s*$/;

/**
 * The subset of Cloudflare's `_headers` grammar this file uses. Throws on a
 * line it cannot place rather than silently dropping a header.
 */
export const parseHeadersFile = (source: string): Rule[] => {
  const rules: Rule[] = [];

  for (const raw of source.split('\n')) {
    const line = raw.split('#')[0]?.trimEnd() ?? '';
    if (line.trim() === '') continue;

    if (!/^\s/.test(line)) {
      rules.push({
        pattern: line.trim(),
        headers: new Map(),
        detached: new Set(),
      });
      continue;
    }

    const rule = rules.at(-1);
    if (!rule) {
      throw new Error(`_headers has a header line before any pattern: ${raw}`);
    }

    const detach = DETACH.exec(line);
    if (detach) {
      rule.detached.add(detach[1]!.toLowerCase());
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) {
      throw new Error(
        `_headers line is neither a pattern nor a header: ${raw}`,
      );
    }

    rule.headers.set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }

  return rules;
};

/** Literal prefixes and `*`, which crosses `/`. A placeholder (`/blog/:slug`) throws. */
const matches = (pattern: string, pathname: string): boolean => {
  if (pattern.includes(':')) {
    throw new Error(
      `_headers pattern "${pattern}" uses a placeholder, which this matcher does not implement.`,
    );
  }

  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');

  return new RegExp(`^${escaped}$`).test(pathname);
};

/**
 * Every matching rule applies in file order; a name set twice is comma-joined,
 * as Cloudflare does. Detach before set matches `attachCustomHeaders` in
 * node_modules/miniflare/dist/src/workers/assets/assets.worker.js.
 */
export const headersFor = (
  rules: Rule[],
  pathname: string,
): Map<string, string> => {
  const out = new Map<string, string>();

  for (const rule of rules) {
    if (!matches(rule.pattern, pathname)) continue;

    for (const name of rule.detached) out.delete(name);

    for (const [name, value] of rule.headers) {
      const existing = out.get(name);
      out.set(name, existing === undefined ? value : `${existing}, ${value}`);
    }
  }

  return out;
};

/**
 * Drops `upgrade-insecure-requests`: WebKit upgrades loopback too, so over http
 * it loads no assets. headers-rules.spec.ts asserts `_headers` still declares it.
 */
export const asServed = (name: string, value: string): string =>
  name === 'content-security-policy'
    ? value.replace(/;\s*upgrade-insecure-requests\b/, '')
    : value;

/*
 * Under `nosniff`, an unknown type falls back to octet-stream and the browser
 * refuses it. `every file type the build emits has a type here` enforces this.
 */
export const MIME: Record<string, string> = SHARED_MIME;

/** Resolves like the Worker's asset layer: file, `.html`, `/index.html`, then 404.html. */
export const startServer = async (rules: Rule[]): Promise<Server> => {
  const resolve = (pathname: string): string | null => {
    const direct = join(DIST_DIR, pathname);
    if (existsSync(direct) && statSync(direct).isFile()) return direct;

    /* `/404` resolves to `404.html`, as Workers does; tests/routes.ts lists `/404`. */
    const asHtml = `${direct}.html`;
    if (existsSync(asHtml) && statSync(asHtml).isFile()) return asHtml;

    const indexed = join(direct, 'index.html');
    return existsSync(indexed) ? indexed : null;
  };

  const server = createServer((req, res) => {
    const raw = new URL(req.url ?? '/', 'http://localhost').pathname;
    let pathname: string;
    try {
      pathname = decodeURIComponent(raw);
    } catch {
      /* A malformed escape would otherwise throw in the handler and stop the server. */
      res.writeHead(400);
      res.end();
      return;
    }

    const resolved = resolve(pathname);
    const file = resolved ?? join(DIST_DIR, '404.html');
    const status = resolved === null ? 404 : 200;

    /* Type before rules, as the asset worker does: the speculation rules file overrides its type. */
    res.setHeader(
      'content-type',
      MIME[extname(file)] ?? 'application/octet-stream',
    );
    for (const [name, value] of headersFor(rules, pathname)) {
      res.setHeader(name, asServed(name, value));
    }
    res.writeHead(status);
    res.end(readFileSync(file));
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return server;
};

/** Listens for `securitypolicyviolation` before any page script, rather than scraping console text. */
export const collectViolations = async (page: Page): Promise<string[]> => {
  const violations: string[] = [];

  await page.exposeFunction('__reportViolation', (detail: string) => {
    violations.push(detail);
  });

  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const e = event as SecurityPolicyViolationEvent;
      (
        window as unknown as {
          __reportViolation: (detail: string) => void;
        }
      ).__reportViolation(
        `${e.violatedDirective} blocked ${e.blockedURI || '(inline)'} on ${e.documentURI}`,
      );
    });
  });

  return violations;
};

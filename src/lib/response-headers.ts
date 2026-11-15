/*
 * Cloudflare applies public/_headers to static assets only, so src/worker.ts
 * adds them to every Worker response, parsed at build time. tests/contact.spec.ts
 * checks them on the Worker's own responses.
 */
import headersFile from '../../public/_headers?raw';
import { BUILD_ENV } from './build-env';
import { GLOBAL_RULE, parseGlobalRule } from './headers-rule';
import { noindexHeaders } from './noindex-headers';

const GLOBAL_HEADERS: Readonly<Record<string, string>> = parseGlobalRule(
  BUILD_ENV.noindex ? noindexHeaders(headersFile) : headersFile,
);

/* An empty map would silently ship on-demand pages with no CSP. */
if (Object.keys(GLOBAL_HEADERS).length === 0) {
  throw new Error(
    `No headers parsed from public/_headers for the "${GLOBAL_RULE}" rule. ` +
      'The file was reformatted; update parseGlobalRule to match.',
  );
}

/** Leaves headers already set alone. */
export const applyGlobalHeaders = (headers: Headers): Headers => {
  for (const [name, value] of Object.entries(GLOBAL_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return headers;
};

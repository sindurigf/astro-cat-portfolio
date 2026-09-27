/*
 * Cloudflare applies public/_headers to static assets only, so src/worker.ts
 * adds them to every Worker response, parsed at build time. tests/contact.spec.ts
 * checks them on the Worker's own responses.
 */
import headersFile from '../../public/_headers?raw';

const GLOBAL_RULE = '/*';

const parseGlobalRule = (source: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  let inRule = false;

  for (const line of source.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    /* A rule line starts at column zero; its headers are indented. */
    if (!/^\s/.test(line)) {
      inRule = trimmed === GLOBAL_RULE;
      continue;
    }

    if (!inRule) continue;

    const separator = trimmed.indexOf(':');
    if (separator === -1) continue;

    headers[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim();
  }

  return headers;
};

const GLOBAL_HEADERS: Readonly<Record<string, string>> =
  parseGlobalRule(headersFile);

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

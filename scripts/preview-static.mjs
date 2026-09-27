/*
 * Header-free, unlike `astro preview`, whose `upgrade-insecure-requests` WebKit
 * applies on loopback, so it loads nothing over http. tests/headers.spec.ts
 * covers the headers with its own server.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { MIME as TYPES } from './mime-types.mjs';

const ROOT = 'dist/client';
const DEFAULT_PORT = 4321;
const PORT_MIN = 1;
const PORT_MAX = 65_535;
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
if (!Number.isInteger(PORT) || PORT < PORT_MIN || PORT > PORT_MAX) {
  throw new Error(
    `PORT=${process.env.PORT} is not a port. Use a whole number from ${PORT_MIN} to ${PORT_MAX}.`,
  );
}

/* Missing is a 404; any other stat error (permissions, loops) is a real fault. */
const ABSENT = new Set(['ENOENT', 'ENOTDIR', 'ENAMETOOLONG']);

const fileAt = async (path) => {
  try {
    return (await stat(path)).isFile() ? path : null;
  } catch (error) {
    if (ABSENT.has(error.code)) return null;
    throw error;
  }
};

const HTML = TYPES['.html'];

const resolve = async (path, search) => {
  const direct = await fileAt(join(ROOT, path));
  if (direct)
    return { status: 200, type: TYPES[extname(direct)] ?? '', file: direct };

  /* `/404` serves 404.html with 200 so the error page is scanned as a route. */
  const asHtml = await fileAt(join(ROOT, `${path}.html`));
  if (asHtml) return { status: 200, type: HTML, file: asHtml };

  /* As Workers does. */
  const index = await fileAt(join(ROOT, path, 'index.html'));
  if (index && !path.endsWith('/')) {
    return { status: 307, location: `${path}/${search}` };
  }
  if (index) return { status: 200, type: HTML, file: index };

  /* `not_found_handling: "404-page"` in wrangler.jsonc. */
  return {
    status: 404,
    type: HTML,
    file: await fileAt(join(ROOT, '404.html')),
  };
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  /* A malformed escape is the request's fault; unhandled, it stops the server. */
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  /* Keeps a crafted path inside the build directory. */
  const path = normalize(decoded).replace(/^(\.\.[/\\])+/, '');

  const answer = await resolve(path, url.search);
  if (answer.location) {
    res.writeHead(answer.status, { location: answer.location });
    res.end();
    return;
  }
  res.writeHead(answer.status, { 'content-type': answer.type });
  res.end(answer.file ? await readFile(answer.file) : 'Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`static preview on http://127.0.0.1:${PORT} (${ROOT})`);
});

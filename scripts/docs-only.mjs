/*
 * Reads changed paths on stdin, one per line, and prints `true` when every one
 * is documentation no built page or spec reads, else `false`. CI skips the
 * Playwright shards on `true`.
 */

import { readFileSync } from 'node:fs';

/* Rendered into a page or read by a spec: a change here needs the browsers. */
export const COUPLED_DOCS = new Set([
  'ACCESSIBILITY.md',
  'ARCHITECTURE.md',
  'SECURITY.md',
  'docs/DEPLOYMENT.md',
  'docs/STYLEGUIDE.md',
]);

const DOC_PATTERNS = [/^[^/]+\.md$/, /^docs\/.+\.md$/, /^\.github\/[^/]+\.md$/];

export const isDocsOnly = (paths) =>
  paths.length > 0 &&
  paths.every(
    (path) =>
      !COUPLED_DOCS.has(path) &&
      DOC_PATTERNS.some((pattern) => pattern.test(path)),
  );

if (import.meta.url === `file://${process.argv[1]}`) {
  const paths = readFileSync(0, 'utf8').split('\n').filter(Boolean);
  console.log(isDocsOnly(paths));
}

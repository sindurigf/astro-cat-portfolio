#!/usr/bin/env node
/*
 * Lists every fork marker in tracked files as file:line, with the count, and
 * fails on a TODO comment in any other form in code and config (AGENTS.md
 * "Comments"). Markdown and a post's body may say TODO.
 *
 *   node scripts/check-fork.mjs [--strict]   (--strict fails while a marker remains)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* Built from pieces so this file does not match itself. */
const WORD = ['TO', 'DO'].join('');
const MARKER = `${WORD}(fork):`;

const COMMENT_OPENERS = ['//', '/*', '#', '<!--'];
const ESCAPED_OPENERS = COMMENT_OPENERS.map((opener) =>
  opener.replace(/[*/]/g, '\\$&'),
).join('|');

/* A comment opener at the start of a line or after a space, so a URL's `//` and a `#fragment` do not match. */
const TODO_COMMENT = new RegExp(
  `(?:^|\\s)(?:${ESCAPED_OPENERS})\\s*${WORD}\\b(.*)`,
);
const FORK_MARKER = new RegExp(
  `(?:^|\\s)(?:${ESCAPED_OPENERS}) ${WORD}\\(fork\\): \\S`,
);

const BINARY = /\.(?:png|jpe?g|webp|ico|pdf|woff2?|webm|mp4|gif|avif)$/i;
const SKIPPED = new Set(['package-lock.json']);
const MARKDOWN = /\.mdx?$/;
const CONTENT_DIR = 'src/content/';

/* A post's body is the writer's: a code sample or a heading there may say TODO. */
const frontmatter = (text) => /^---\n[\s\S]*?\n---\n/.exec(text)?.[0] ?? '';

/**
 * The TODO comments of one file. Content files are read in their frontmatter
 * only; Markdown counts markers and holds no other form to account.
 */
export const todoCommentsIn = (file, text) => {
  const scanned = file.startsWith(CONTENT_DIR) ? frontmatter(text) : text;
  const proseOnly = MARKDOWN.test(file);
  return scanned.split('\n').flatMap((line, index) => {
    if (!TODO_COMMENT.test(line)) return [];
    const malformed = !FORK_MARKER.test(line);
    if (malformed && proseOnly) return [];
    return [{ file, line: index + 1, text: line.trim(), malformed }];
  });
};

const trackedTextFiles = () =>
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((file) => file && !BINARY.test(file) && !SKIPPED.has(file));

/** Every TODO comment in tracked text files: fork markers, and anything else as `malformed`. */
export const todoComments = () =>
  trackedTextFiles().flatMap((file) =>
    todoCommentsIn(file, readFileSync(file, 'utf8')),
  );

const main = () => {
  const strict = process.argv.includes('--strict');
  const found = todoComments();
  const markers = found.filter((comment) => !comment.malformed);
  const malformed = found.filter((comment) => comment.malformed);

  for (const { file, line, text } of markers) {
    console.log(`${file}:${line}: ${text}`);
  }
  console.log(
    `Fork markers: ${markers.length} left in ${new Set(markers.map((marker) => marker.file)).size} file(s).`,
  );

  for (const { file, line, text } of malformed) {
    console.error(
      `${file}:${line}: write it as "${MARKER} what to change", or remove it: ${text}`,
    );
  }
  if (malformed.length > 0) process.exit(1);
  if (strict && markers.length > 0) {
    console.error('--strict: resolve each marker and delete its comment.');
    process.exit(1);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

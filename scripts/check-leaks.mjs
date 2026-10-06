#!/usr/bin/env node
/*
 * Fails on anything left from the project this template was extracted from:
 * its owner's names, art names, addresses and service ids, in tracked file
 * names and contents. Lists every hit as file:line. PDFs are scanned raw and
 * with every FlateDecode stream inflated, and fail on an /Author or dc:creator.
 *
 *   node scripts/check-leaks.mjs [--pdf <file>]   (one PDF, tracked or not)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/* Built from pieces so this file does not match itself. */
const join = (...parts) => parts.join('');

const CASE_INSENSITIVE = new RegExp(
  [
    join('sin', 'duri'),
    join('guntu', 'palli'),
    join('joh', 'ann'),
    join('dru', 'pal'),
    join('lep', 'us'),
    join('bun', 'ny'),
    join('\\b', 'ha', 're'),
    join('lol', '@'),
    join('7d40', 'feed'),
    /* The old D1 database id and Umami website id. */
    join('c664ffd5', '-976d-4b32-b17f-', 'efa254825d54'),
    join('5d1a79cf', '-b9cc-409e-a43e-', 'df37d881e314'),
  ].join('|'),
  'i',
);

/* camelCase, as in `fieldHa` + `re`. */
const CASE_SENSITIVE = new RegExp(join('Ha', 're'));

const EXEMPT_FILES = new Set(['LICENSE', 'LICENSE-photos']);

/* The one credits line to the original project, matched exactly. */
const EXEMPT_LINE = join(
  "const ORIGIN = { text: 'Based on ",
  'sin',
  'duri-lol by Sin',
  'duri Guntu',
  "palli, MIT license.', href: 'https://github.com/sin",
  'durigf/sin',
  "duri-lol' } as const;",
);
const EXEMPT_LINE_FILE = 'src/pages/credits.astro';

const leaks = (text) =>
  CASE_INSENSITIVE.test(text) || CASE_SENSITIVE.test(text);

const STREAM = /(?<!end)stream\r?\n/g;
const END_STREAM = 'endstream';
const inflatedStreams = (raw, path, hits) => {
  const streams = [];
  for (const match of raw.matchAll(STREAM)) {
    const start = match.index + match[0].length;
    const end = raw.indexOf(END_STREAM, start);
    if (end === -1) continue;
    /* The stream's own object: from its `obj` keyword to `stream`. */
    const dictionary = raw.slice(
      raw.lastIndexOf(' obj', match.index),
      match.index,
    );
    if (!/\/FlateDecode/.test(dictionary)) continue;
    try {
      streams.push(
        inflateSync(Buffer.from(raw.slice(start, end), 'latin1'), {
          finishFlush: 2,
        }).toString('latin1'),
      );
    } catch (error) {
      hits.push(
        `${path}: a FlateDecode stream does not inflate (${error.message})`,
      );
    }
  }
  return streams;
};

/* Non-empty literal or hex string. */
const AUTHOR = /\/Author\s*(?:\((?!\))|<(?!>))/;
const CREATOR =
  /<dc:creator\b[^>]*>(?:(?!<\/dc:creator>)[\s\S])*?<rdf:li[^>]*>\s*[^<\s]/;

const pdfHits = (path, bytes) => {
  const hits = [];
  const raw = bytes.toString('latin1');
  const texts = [
    ['raw', raw],
    ...inflatedStreams(raw, path, hits).map((text, i) => [
      `stream ${i + 1}`,
      text,
    ]),
  ];
  for (const [where, text] of texts) {
    if (leaks(text))
      hits.push(
        `${path} (${where}): ${text.match(CASE_INSENSITIVE)?.[0] ?? text.match(CASE_SENSITIVE)?.[0]}`,
      );
    if (AUTHOR.test(text)) hits.push(`${path} (${where}): a non-empty /Author`);
    if (CREATOR.test(text))
      hits.push(`${path} (${where}): a non-empty dc:creator`);
  }
  return hits;
};

const pdfArg = process.argv.indexOf('--pdf');
if (pdfArg !== -1) {
  const path = process.argv[pdfArg + 1];
  if (!path) {
    console.error('Usage: node scripts/check-leaks.mjs --pdf <file>');
    process.exit(2);
  }
  const hits = pdfHits(path, readFileSync(path));
  if (hits.length > 0) {
    console.error(`Leaks: ${hits.length} hit(s).\n  ${hits.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`Leaks: none in ${path}.`);
  process.exit(0);
}

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const hits = [];
for (const path of tracked) {
  if (EXEMPT_FILES.has(path)) continue;
  if (leaks(path)) hits.push(`${path}: file name`);

  let bytes;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  if (path.toLowerCase().endsWith('.pdf')) {
    hits.push(...pdfHits(path, bytes));
    continue;
  }
  if (bytes.includes(0)) continue;

  bytes
    .toString('utf8')
    .split('\n')
    .forEach((line, index) => {
      if (path === EXEMPT_LINE_FILE && line === EXEMPT_LINE) return;
      if (leaks(line)) hits.push(`${path}:${index + 1}: ${line.trim()}`);
    });
}

if (hits.length > 0) {
  console.error(`Leaks: ${hits.length} hit(s).\n  ${hits.join('\n  ')}`);
  process.exit(1);
}

console.log(`Leaks: none in ${tracked.length} tracked files.`);

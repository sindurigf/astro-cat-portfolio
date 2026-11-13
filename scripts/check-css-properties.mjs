/*
 * Fails on a CSS declaration whose property name css-tree does not know, such
 * as `text-decoration-thinness`: the browser drops it without a warning.
 * Custom properties and vendor-prefixed properties are skipped; a descriptor
 * is checked against its at-rule.
 */

import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import postcss from 'postcss';
import { lexer } from 'css-tree';
import { CSS_PROPERTY_EXCEPTIONS as EXCEPTIONS } from './check-allow-lists.mjs';
import { filesUnder } from './files-under.mjs';

const ROOT =
  process.env.CHECK_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

const CUSTOM_PROPERTY = /^--/;
const VENDOR_PREFIXED = /^-[a-z]+-/;

/* Tailwind directives and nesting wrappers hold declarations of the parent. */
const TRANSPARENT_AT_RULES = new Set([
  'media',
  'supports',
  'layer',
  'container',
  'scope',
  'starting-style',
  'utility',
  'variant',
  'custom-variant',
  'theme',
  'apply',
  'reference',
  'keyframes',
]);

/* `@page` takes ordinary properties such as `margin` beside its own `size`. */
const PROPERTY_AT_RULES = new Set(['page']);

const enclosingAtRule = (declaration) => {
  for (let node = declaration.parent; node; node = node.parent) {
    if (node.type !== 'atrule') continue;
    if (!TRANSPARENT_AT_RULES.has(node.name.toLowerCase())) return node;
  }
  return null;
};

const isKnown = (declaration) => {
  const property = declaration.prop.toLowerCase();
  if (CUSTOM_PROPERTY.test(property) || VENDOR_PREFIXED.test(property)) {
    return true;
  }
  const atRule = enclosingAtRule(declaration);
  if (atRule) {
    const name = atRule.name.toLowerCase();
    if (PROPERTY_AT_RULES.has(name) && lexer.getProperty(property)) return true;
    return Boolean(lexer.getAtrule(name)?.descriptors?.[property]);
  }
  return Boolean(lexer.getProperty(property));
};

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/g;

const cssSources = (file, source) =>
  file.endsWith('.css')
    ? [{ css: source, offset: 0 }]
    : [...source.matchAll(STYLE_BLOCK)].map((match) => ({
        css: match[1],
        offset:
          source.slice(0, match.index + match[0].indexOf(match[1])).split('\n')
            .length - 1,
      }));

const used = new Set();

const unknownIn = (file, source) =>
  cssSources(file, source).flatMap(({ css, offset }) => {
    const root = postcss.parse(css, { from: file });
    const found = [];
    root.walkDecls((declaration) => {
      if (isKnown(declaration)) return;
      const relativeFile = relative(ROOT, file);
      const key = `${relativeFile}:${declaration.prop.toLowerCase()}`;
      if (EXCEPTIONS.has(key)) {
        used.add(key);
        return;
      }
      found.push(
        `${relativeFile}:${declaration.source.start.line + offset}: unknown property \`${declaration.prop}\``,
      );
    });
    return found;
  });

const files = filesUnder(SRC, ['.css', '.astro']);
const problems = [];
for (const file of files) {
  problems.push(...unknownIn(file, await readFile(file, 'utf8')));
}

for (const key of EXCEPTIONS.keys()) {
  if (!used.has(key))
    problems.push(`stale CSS_PROPERTY_EXCEPTIONS entry \`${key}\``);
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(
    `\n${problems.length} problem(s). Fix the property name, or list it in CSS_PROPERTY_EXCEPTIONS with its reason.`,
  );
  process.exit(1);
}
console.log(`check:css ok, ${files.length} files`);

/*
 * Fails on text drawn as an image (SC 1.4.5, 1.4.9): <text> or <tspan> in an
 * SVG under src/assets, public or the build, inline or as a file, and canvas
 * fillText or strokeText in src. Raster images are not read; review covers them.
 */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { assertBuildCurrent } from './build-fingerprint.mjs';
import { filesUnder } from './files-under.mjs';

const ROOT =
  process.env.CHECK_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist/client');
const SVG_ROOTS = ['src/assets', 'public'].map((dir) => join(ROOT, dir));
const SOURCE_EXTENSIONS = ['.ts', '.js', '.mjs', '.astro'];

const SVG_TEXT = /<(?:text|tspan)\b/;
const INLINE_SVG = /<svg\b[\s\S]*?<\/svg>/g;
const CANVAS_TEXT = /\.(?:fillText|strokeText)\s*\(/;

await assertBuildCurrent('Images of text', DIST);

const failures = [];
const report = (file, problem) =>
  failures.push(`${relative(ROOT, file)}: ${problem}`);

const svgFiles = [...SVG_ROOTS, DIST].flatMap((dir) =>
  filesUnder(dir, ['.svg']),
);
for (const file of svgFiles) {
  if (SVG_TEXT.test(readFileSync(file, 'utf8')))
    report(file, 'SVG <text> or <tspan>');
}

for (const file of filesUnder(DIST, ['.html'])) {
  const inline = readFileSync(file, 'utf8').match(INLINE_SVG) ?? [];
  if (inline.some((svg) => SVG_TEXT.test(svg))) {
    report(file, 'inline SVG <text> or <tspan>');
  }
}

const sources = filesUnder(join(ROOT, 'src'), SOURCE_EXTENSIONS);
for (const file of sources) {
  if (CANVAS_TEXT.test(readFileSync(file, 'utf8'))) {
    report(file, 'canvas fillText or strokeText');
  }
}

if (failures.length > 0) {
  console.error(
    `Text drawn as an image (SC 1.4.5):\n  ${failures.join('\n  ')}\n` +
      'Set the words as HTML text and position it with CSS instead.',
  );
  process.exit(1);
}

console.log(
  `Images of text: ${svgFiles.length} SVG files and ${sources.length} sources draw no text.`,
);

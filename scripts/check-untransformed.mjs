/*
 * Fails if a built file is byte-identical to a source image. Reading any
 * property of an imported image emits its original, which no page links to.
 */
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { assertBuildCurrent } from './build-fingerprint.mjs';
import { filesUnder } from './files-under.mjs';
import { SERVED_AS_IS } from './check-allow-lists.mjs';

const ROOT =
  process.env.CHECK_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist/client');
const ASSETS = join(ROOT, 'src/assets');
const TALKS = join(ROOT, 'src/content/talks');

const digest = async (file) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');

const run = async () => {
  await assertBuildCurrent('Untransformed', DIST);

  const built = filesUnder(DIST);

  const sources = new Map();
  for (const file of [...filesUnder(ASSETS), ...filesUnder(TALKS)]) {
    sources.set(await digest(file), file);
  }
  if (built.length === 0 || sources.size === 0) {
    console.error(
      'Untransformed: no built file or no source image to compare.',
    );
    process.exit(1);
  }

  const shipped = [];
  for (const file of built) {
    const source = sources.get(await digest(file));
    if (source !== undefined) shipped.push({ source, file });
  }

  const shippedNames = new Set(
    shipped.map(({ source }) => relative(ASSETS, source)),
  );
  const unexpected = shipped.filter(
    ({ source }) => !SERVED_AS_IS.has(relative(ASSETS, source)),
  );
  const stale = [...SERVED_AS_IS.keys()].filter(
    (name) => !shippedNames.has(name),
  );

  for (const name of stale) {
    console.error(
      `Untransformed: SERVED_AS_IS entry "${name}" no longer matches, as the ` +
        'build does not ship it byte for byte; remove it from SERVED_AS_IS in scripts/check-allow-lists.mjs.',
    );
  }

  if (unexpected.length > 0) {
    console.error(
      `Untransformed: the build ships ${unexpected.length} source image(s) ` +
        'byte for byte:',
    );
    for (const { source, file } of unexpected) {
      console.error(`  ${relative(ROOT, source)} as ${relative(DIST, file)}`);
    }
    console.error(
      'Nothing links to them, so no page test can see them. The usual cause ' +
        'is reading a property of an imported image directly, such as ' +
        '`image.width`: that marks the original as used. Take the size from ' +
        '`getImage({ src })` instead, as src/components/PhotoTile.astro does. ' +
        'If a file is meant to ship as it is, add it to SERVED_AS_IS in ' +
        'scripts/check-allow-lists.mjs with what reads it.',
    );
    process.exit(1);
  }
  if (stale.length > 0) process.exit(1);

  const kept = [...SERVED_AS_IS.keys()].join(', ');
  console.log(
    `Untransformed: no source image is shipped as it is, apart from ${kept}.`,
  );
};

await run();

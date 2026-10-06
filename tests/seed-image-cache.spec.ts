import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './test';
import {
  CACHE,
  SETTLED_MS,
  imageToolchain,
  seedImageCache,
} from '../scripts/seed-image-cache.mjs';
import { NODE } from './tags';

const SHARP = '0.35.4';
const LIBVIPS = '1.3.3';
const LIBVIPS_PACKAGE = '@img/sharp-libvips-linux-x64';

const writePackage = (root: string, name: string, version: string) => {
  const dir = join(root, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }));
};

const checkout = (
  base: string,
  name: string,
  sharp: string,
  libvips: string,
  cached: string[] = [],
) => {
  const root = join(base, name);
  writePackage(root, 'sharp', sharp);
  writePackage(root, LIBVIPS_PACKAGE, libvips);
  const cache = join(root, CACHE);
  mkdirSync(cache, { recursive: true });
  const settled = (Date.now() - 2 * SETTLED_MS) / 1000;
  for (const file of cached) {
    writeFileSync(join(cache, file), file);
    utimesSync(join(cache, file), settled, settled);
  }
  return root;
};

test.describe('seed-image-cache', () => {
  let base: string;
  test.beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'seed-image-cache-'));
  });
  test.afterEach(() => rmSync(base, { recursive: true, force: true }));

  test('the toolchain names sharp and each prebuilt libvips', NODE, () => {
    const root = checkout(base, 'target', SHARP, LIBVIPS);
    expect(imageToolchain(root)).toBe(
      `sharp@${SHARP} ${LIBVIPS_PACKAGE}@${LIBVIPS}`,
    );
  });

  test(
    'copies from a matching toolchain and skips a different sharp or libvips',
    NODE,
    () => {
      const target = checkout(base, 'target', SHARP, LIBVIPS);
      const same = checkout(base, 'same', SHARP, LIBVIPS, ['a_1.webp']);
      const otherSharp = checkout(base, 'sharp', '0.35.5', LIBVIPS, [
        'b_2.webp',
      ]);
      const otherLibvips = checkout(base, 'libvips', SHARP, '1.3.4', [
        'c_3.webp',
      ]);

      const copied = seedImageCache(target, () => [
        otherSharp,
        otherLibvips,
        same,
      ]);

      expect([...copied]).toEqual(['a_1.webp']);
    },
  );
});

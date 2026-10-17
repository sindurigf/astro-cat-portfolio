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
  lockfileHash,
  matchesExtension,
  seedImageCache,
} from '../scripts/seed-image-cache.mjs';
import { NODE } from './tags';

const SHARP = '0.35.4';
const LIBVIPS = '1.3.3';
const LIBVIPS_PACKAGE = '@img/sharp-libvips-linux-x64';
const LOCKFILE = '{"lockfileVersion":3}';

const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1,
]);
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);
const WEBP = Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1');
const AVIF = Buffer.from('\x00\x00\x00\x1cftypavif\x00\x00', 'latin1');
const BYTES: Record<string, Buffer> = {
  '.webp': WEBP,
  '.avif': AVIF,
  '.jpg': JPEG,
  '.png': PNG,
};
const bytesFor = (file: string) => BYTES[file.slice(file.lastIndexOf('.'))];

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
  cached: (string | [string, Buffer])[] = [],
  lockfile = LOCKFILE,
) => {
  const root = join(base, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'package-lock.json'), lockfile);
  writePackage(root, 'sharp', sharp);
  writePackage(root, LIBVIPS_PACKAGE, libvips);
  const cache = join(root, CACHE);
  mkdirSync(cache, { recursive: true });
  const settled = (Date.now() - 2 * SETTLED_MS) / 1000;
  for (const entry of cached) {
    const [file, bytes] =
      typeof entry === 'string' ? [entry, bytesFor(entry)] : entry;
    writeFileSync(join(cache, file), bytes);
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

  test('reads each format by its signature, not its name', NODE, () => {
    const root = checkout(base, 'formats', SHARP, LIBVIPS, [
      'a.webp',
      'b.avif',
      'c.jpg',
      'd.png',
      ['e.avif', JPEG],
      ['f.webp', PNG],
      ['g.svg', WEBP],
    ]);
    const cache = join(root, CACHE);
    const matches = [
      'a.webp',
      'b.avif',
      'c.jpg',
      'd.png',
      'e.avif',
      'f.webp',
      'g.svg',
    ].filter((file) => matchesExtension(join(cache, file)));
    expect(matches).toEqual(['a.webp', 'b.avif', 'c.jpg', 'd.png']);
  });

  test(
    'skips a source with another lockfile and entries not in their named format',
    NODE,
    () => {
      const target = checkout(base, 'target', SHARP, LIBVIPS);
      const otherLock = checkout(
        base,
        'lock',
        SHARP,
        LIBVIPS,
        ['a_1.webp'],
        '{"lockfileVersion":2}',
      );
      const mixed = checkout(base, 'mixed', SHARP, LIBVIPS, [
        'b_2.webp',
        ['c_3.avif', JPEG],
      ]);

      const copied = seedImageCache(target, () => [otherLock, mixed]);

      expect(lockfileHash(otherLock)).not.toBe(lockfileHash(target));
      expect([...copied]).toEqual(['b_2.webp']);
    },
  );
});

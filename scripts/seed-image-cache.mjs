/*
 * Fills an empty image cache from this repository's other worktrees. Astro
 * names each entry by a hash of its source and options, not of its output, so
 * only same-lockfile, same-sharp sources and entries in their named format are copied.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
} from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/* Astro's default `cacheDir` plus `assets/`; the CI workflow caches the same path. */
export const CACHE = join('node_modules', '.astro', 'assets');
/* Astro writes entries in place, so a newer one may be mid-write in another build. */
export const SETTLED_MS = 60_000;
const WORKTREE_LINE = 'worktree ';
const LIBVIPS_PREFIX = 'sharp-libvips-';
const LOCKFILE = 'package-lock.json';

/* Each format's signature as [byte offset, ASCII or bytes]; an unlisted extension is never copied. */
const SIGNATURES = {
  '.avif': [
    [4, 'ftyp'],
    [8, 'avi'],
  ],
  '.webp': [
    [0, 'RIFF'],
    [8, 'WEBP'],
  ],
  '.jpg': [[0, [0xff, 0xd8, 0xff]]],
  '.jpeg': [[0, [0xff, 0xd8, 0xff]]],
  '.png': [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
};
const SIGNATURE_BYTES = 12;

const otherWorktrees = (root) => {
  try {
    return execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\n')
      .filter((line) => line.startsWith(WORKTREE_LINE))
      .map((line) => resolve(line.slice(WORKTREE_LINE.length)))
      .filter((path) => path !== root);
  } catch (error) {
    console.log(
      `Image cache not seeded: git found no worktrees. ${error.message}`,
    );
    return [];
  }
};

const entries = (dir) => {
  try {
    return readdirSync(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const packageVersion = (root, name) => {
  try {
    const path = join(root, 'node_modules', name, 'package.json');
    return JSON.parse(readFileSync(path, 'utf8')).version;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
};

/** The installed sharp and prebuilt libvips versions, read from disk; `undefined` without sharp. */
export const imageToolchain = (root) => {
  const sharp = packageVersion(root, 'sharp');
  if (sharp === undefined) return undefined;
  const libvips = entries(join(root, 'node_modules', '@img'))
    .filter((name) => name.startsWith(LIBVIPS_PREFIX))
    .sort()
    .map((name) => `@img/${name}@${packageVersion(root, `@img/${name}`)}`);
  return [`sharp@${sharp}`, ...libvips].join(' ');
};

/** The lockfile's SHA-256, the dependency half of the CI cache key; `undefined` without one. */
export const lockfileHash = (root) => {
  try {
    return createHash('sha256')
      .update(readFileSync(join(root, LOCKFILE)))
      .digest('hex');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
};

const readHead = (path) => {
  const head = Buffer.alloc(SIGNATURE_BYTES);
  const fd = openSync(path, 'r');
  try {
    return head.subarray(0, readSync(fd, head, 0, SIGNATURE_BYTES, 0));
  } finally {
    closeSync(fd);
  }
};

/** True when the file starts with its extension's signature, so a source copied under a target's name is refused. */
export const matchesExtension = (path) => {
  const signature = SIGNATURES[extname(path).toLowerCase()];
  if (!signature) return false;
  const head = readHead(path);
  return signature.every(([offset, expected]) => {
    const bytes = Buffer.from(expected);
    return head.subarray(offset, offset + bytes.length).equals(bytes);
  });
};

const isSettledFile = (path, now) => {
  const stat = lstatSync(path);
  return stat.isFile() && now - stat.mtimeMs > SETTLED_MS;
};

/** Copies settled entries from sources with the same toolchain; returns the names copied. */
export const seedImageCache = (root, listSources, now = Date.now()) => {
  const copied = new Set();
  const target = join(root, CACHE);
  if (entries(target).length > 0) return copied;

  const toolchain = imageToolchain(root);
  const lockfile = lockfileHash(root);
  for (const worktree of listSources()) {
    const source = join(worktree, CACHE);
    const names = entries(source);
    if (names.length === 0) continue;
    const sourceToolchain = imageToolchain(worktree);
    if (toolchain === undefined || sourceToolchain !== toolchain) {
      console.log(
        `Image cache not seeded from ${worktree}: it has ${sourceToolchain ?? 'no sharp'}, this checkout ${toolchain ?? 'no sharp'}.`,
      );
      continue;
    }
    if (lockfile === undefined || lockfileHash(worktree) !== lockfile) {
      console.log(
        `Image cache not seeded from ${worktree}: its ${LOCKFILE} differs from this checkout's.`,
      );
      continue;
    }
    const refused = [];
    for (const name of names) {
      const path = join(source, name);
      if (copied.has(name) || !isSettledFile(path, now)) continue;
      if (!matchesExtension(path)) {
        refused.push(name);
        continue;
      }
      if (copied.size === 0) mkdirSync(target, { recursive: true });
      copyFileSync(path, join(target, name));
      copied.add(name);
    }
    if (refused.length > 0)
      console.log(
        `Image cache: skipped ${refused.length} ${refused.length === 1 ? 'entry' : 'entries'} from ${worktree} not in its named format, such as ${refused[0]}.`,
      );
  }
  return copied;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const copied = seedImageCache(ROOT, () => otherWorktrees(ROOT));
  if (copied.size > 0) {
    console.log(
      `Seeded ${copied.size} cached image files from other worktrees.`,
    );
  }
}

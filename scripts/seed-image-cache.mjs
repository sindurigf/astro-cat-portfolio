/*
 * Fills an empty image cache from this repository's other worktrees. Safe to
 * share: Astro names each entry by a hash of its source's content and options.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/* Astro's default `cacheDir` plus `assets/`; the CI workflow caches the same path. */
export const CACHE = join('node_modules', '.astro', 'assets');
/* Astro writes entries in place, so a newer one may be mid-write in another build. */
export const SETTLED_MS = 60_000;
const WORKTREE_LINE = 'worktree ';
const LIBVIPS_PREFIX = 'sharp-libvips-';

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
    for (const name of names) {
      if (copied.has(name) || !isSettledFile(join(source, name), now)) continue;
      if (copied.size === 0) mkdirSync(target, { recursive: true });
      copyFileSync(join(source, name), join(target, name));
      copied.add(name);
    }
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

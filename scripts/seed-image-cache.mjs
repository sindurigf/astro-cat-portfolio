/*
 * Fills an empty image cache from this repository's other worktrees. Safe to
 * share: Astro names each entry by a hash of its source's content and options.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/* Astro's default `cacheDir` plus `assets/`; the CI workflow caches the same path. */
const CACHE = join('node_modules', '.astro', 'assets');
/* Astro writes entries in place, so a newer one may be mid-write in another build. */
const SETTLED_MS = 60_000;
const WORKTREE_LINE = 'worktree ';

const otherWorktrees = () => {
  try {
    return execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\n')
      .filter((line) => line.startsWith(WORKTREE_LINE))
      .map((line) => resolve(line.slice(WORKTREE_LINE.length)))
      .filter((path) => path !== ROOT);
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

const isSettledFile = (path, now) => {
  const stat = lstatSync(path);
  return stat.isFile() && now - stat.mtimeMs > SETTLED_MS;
};

const seed = () => {
  const target = join(ROOT, CACHE);
  if (entries(target).length > 0) return;

  const now = Date.now();
  const copied = new Set();
  for (const worktree of otherWorktrees()) {
    const source = join(worktree, CACHE);
    for (const name of entries(source)) {
      if (copied.has(name) || !isSettledFile(join(source, name), now)) continue;
      if (copied.size === 0) mkdirSync(target, { recursive: true });
      copyFileSync(join(source, name), join(target, name));
      copied.add(name);
    }
  }
  if (copied.size > 0) {
    console.log(
      `Seeded ${copied.size} cached image files from other worktrees.`,
    );
  }
};

seed();

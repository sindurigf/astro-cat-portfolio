import { globSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Sorted files under `dir` ending in one of `extensions`, or every file.
 * Skips node_modules, including a stale one under src/content/talks/, and,
 * like any fs glob, names that start with a dot.
 */
export const filesUnder = (dir, extensions = ['']) =>
  globSync(
    extensions.map((ext) => `**/*${ext}`),
    { cwd: dir, exclude: ['**/node_modules/**'], withFileTypes: true },
  )
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();

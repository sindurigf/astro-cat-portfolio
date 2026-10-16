import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { NODE } from './tags';

/**
 * ARIA attribute reflection (`element.ariaLabel`, `ariaPressed`, …) is Firefox 119;
 * the floor in ARCHITECTURE.md > Browser support is Firefox 114, where assigning
 * one sets a plain property and no attribute. No browser under test is that old.
 */
const SOURCE_DIRS = ['src'];
const SOURCE_FILE = /\.(ts|astro|vue)$/;
const REFLECTED = /\.aria[A-Z]\w*/g;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_FILE.test(entry.name) ? [path] : [];
  });

test(
  'no script reads or writes ARIA through a reflected property',
  NODE,
  () => {
    const files = SOURCE_DIRS.flatMap(sourceFiles);
    expect(files.length, 'no source files were read').toBeGreaterThan(0);
    const uses = files.flatMap((path) =>
      (readFileSync(path, 'utf8').match(REFLECTED) ?? []).map(
        (use) => `${path}: ${use}`,
      ),
    );
    expect(
      uses,
      'a reflected ARIA property does nothing in Firefox 114 to 118, inside the supported floor; use getAttribute and setAttribute.',
    ).toEqual([]);
  },
);

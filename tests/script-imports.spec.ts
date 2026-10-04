import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { expect, test } from './test';
import { NODE } from './tags';

/**
 * Every `node scripts/*.mjs` in package.json runs in plain Node, which strips
 * types but resolves no extensionless import. Playwright's own loader would hide that.
 */

const SCRIPTS_DIR = 'scripts';
const NODE_SCRIPT = /\bnode (scripts\/[\w.-]+\.mjs)\b/g;
const LOCAL_SCRIPT_IMPORT = /from '(\.\/[\w.-]+\.mjs)'/g;
const SOURCE_IMPORT = /from '(\.\.\/src\/[^']+\.ts)'/g;

const packageScripts = (): string[] => {
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  return [
    ...new Set(
      Object.values(scripts).flatMap((command) =>
        [...command.matchAll(NODE_SCRIPT)].map(([, path]) => path!),
      ),
    ),
  ];
};

/** The script and every script it imports, so a source import one hop away counts. */
const withLocalImports = (
  entry: string,
  seen = new Set<string>(),
): Set<string> => {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const [, specifier] of readFileSync(entry, 'utf8').matchAll(
    LOCAL_SCRIPT_IMPORT,
  )) {
    withLocalImports(join(dirname(entry), specifier!), seen);
  }
  return seen;
};

const sourceImports = (files: Iterable<string>): string[] => [
  ...new Set(
    [...files].flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(SOURCE_IMPORT)].map(
        ([, specifier]) =>
          relative(SCRIPTS_DIR, join(dirname(file), specifier!)),
      ),
    ),
  ),
];

test(
  'every source module a package script imports loads in plain Node',
  NODE,
  () => {
    const scripts = packageScripts();
    expect(scripts.length, 'package.json runs no node scripts').toBeGreaterThan(
      0,
    );

    const modules = sourceImports(
      scripts.flatMap((script) => [...withLocalImports(script)]),
    );
    expect(
      modules.length,
      'no package script imports a source module',
    ).toBeGreaterThan(0);

    for (const module of modules) {
      const { status, stderr } = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `await import(${JSON.stringify(`./${module}`)});`,
        ],
        { cwd: SCRIPTS_DIR, encoding: 'utf8' },
      );
      expect(status, `${module} does not load in Node:\n${stderr}`).toBe(0);
    }
  },
);

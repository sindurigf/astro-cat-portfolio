/*
 * Writes /licenses.txt from what the build ships; bundling strips MIT notices.
 * Reads chunks, client/prerender assets, CSS `/*!` banners, the island script,
 * public/vendor/ via src/licenses/. Vite's `build.license` emits nothing under Astro 7.
 */
import {
  existsSync,
  globSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VENDOR_DIR = join(ROOT, 'public', 'vendor');
const VENDOR_LICENCES = join(ROOT, 'src', 'licenses');
const OUTPUT = 'licenses.txt';
const SHIPPED_ASSET_ENVIRONMENTS = new Set(['client', 'prerender']);
const LICENCE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;
/* Apache-2.0 §4(d) asks for NOTICE to travel with the code as well. */
const NOTICE_FILE = /^notice(\.(md|txt))?$/i;
const CSS_BANNER = /\/\*!\s*(@?[\w./-]+)\s+v\d[^|]*\|/g;
const ISLAND = '<astro-island';

const PACKAGE_DIR = /^(.*node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)/;

export const packageDirOf = (id) => PACKAGE_DIR.exec(id)?.[1];

/** Null without a licence file; a package.json `license` is not the text. */
export const licenceText = (dir) => {
  const files = readdirSync(dir);
  const licence = files.find((name) => LICENCE_FILE.test(name));
  if (licence === undefined) return null;
  const notice = files.find((name) => NOTICE_FILE.test(name));
  return [licence, notice]
    .filter(Boolean)
    .map((name) => readFileSync(join(dir, name), 'utf8').trim())
    .join('\n\n');
};

const describePackage = (dir) => {
  const { name, version, license } = JSON.parse(
    readFileSync(join(dir, 'package.json'), 'utf8'),
  );
  return { heading: `${name} ${version} (${license})`, text: licenceText(dir) };
};

const packagesInPages = (clientDir) => {
  const files = globSync(['**/*.css', '**/*.html'], { cwd: clientDir }).map(
    (path) => join(clientDir, path),
  );
  const dirs = new Set();
  for (const css of files.filter((file) => file.endsWith('.css'))) {
    for (const [, name] of readFileSync(css, 'utf8').matchAll(CSS_BANNER)) {
      dirs.add(join(ROOT, 'node_modules', name));
    }
  }
  const hasIsland = files
    .filter((file) => file.endsWith('.html'))
    .some((page) => readFileSync(page, 'utf8').includes(ISLAND));
  if (hasIsland) dirs.add(join(ROOT, 'node_modules', 'astro'));
  return dirs;
};

const vendored = () =>
  existsSync(VENDOR_DIR)
    ? readdirSync(VENDOR_DIR).map((file) => {
        const source = join(VENDOR_LICENCES, `${file}.txt`);
        return {
          heading: `/vendor/${file}`,
          text: existsSync(source) ? readFileSync(source, 'utf8').trim() : null,
          missing: relative(ROOT, source),
        };
      })
    : [];

const render = (entries) =>
  [
    'Licences for the third-party code and font this site sends to your browser.',
    'Generated when the site is built, from what the build contains.',
    ...entries.map(({ heading, text }) => `${heading}\n\n${text}`),
  ].join('\n\n\n') + '\n';

export const licenses = () => {
  const shippedDirs = new Set();

  const collect = {
    name: 'shipped-licences',
    generateBundle(_, bundle) {
      const environment = this.environment?.name;
      for (const output of Object.values(bundle)) {
        const ids =
          output.type === 'chunk'
            ? environment === 'client'
              ? output.moduleIds
              : []
            : SHIPPED_ASSET_ENVIRONMENTS.has(environment)
              ? (output.originalFileNames ?? [])
              : [];
        for (const id of ids) {
          const path = id.replace(/^\0/, '');
          const dir = packageDirOf(isAbsolute(path) ? path : join(ROOT, path));
          if (dir !== undefined) shippedDirs.add(dir);
        }
      }
    },
  };

  return {
    name: 'licenses',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({ vite: { plugins: [collect] } });
      },
      'astro:build:done': ({ dir, logger }) => {
        const clientDir = fileURLToPath(dir);
        for (const found of packagesInPages(clientDir)) shippedDirs.add(found);

        const packages = [...shippedDirs]
          .map((packageDir) => ({
            ...describePackage(packageDir),
            missing: relative(ROOT, packageDir),
          }))
          .sort((a, b) => a.heading.localeCompare(b.heading));
        const entries = [...packages, ...vendored()];

        const missing = entries.filter(({ text }) => text === null);
        if (missing.length > 0) {
          throw new Error(
            `No licence text for what ships to the browser: ${missing
              .map(({ missing: where }) => where)
              .join(', ')}. A package needs a LICENSE file; a file in ` +
              'public/vendor/ needs its licence in src/licenses/<file>.txt.',
          );
        }

        const target = join(clientDir, OUTPUT);
        writeFileSync(target, render(entries));
        logger.info(`${OUTPUT}: ${entries.length} entries.`);
      },
    },
  };
};

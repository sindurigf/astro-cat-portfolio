import { readFileSync } from 'node:fs';

/*
 * Hex literals for `theme-color` and the manifest, which cannot take `var()`.
 * Shared by astro.config.mjs and tests/source.ts so both read the same parse.
 */

/** Relative to the project root. */
export const GLOBAL_CSS = 'src/styles/global.css';

const HEX = '#[0-9a-fA-F]{3,8}';

/* Line-anchored: `--brand--color-text` and `var(--color-text)` never match. */
const definition = (name: string): RegExp =>
  new RegExp(`^\\s*${name.replace(/[-]/g, '\\-')}:\\s*(${HEX})\\s*;`, 'gm');

/** Throws unless defined once: CSS takes the last match, a regex the first. */
export const cssColorToken = (name: string, file = GLOBAL_CSS): string => {
  const found = [...readFileSync(file, 'utf8').matchAll(definition(name))];

  if (found.length === 0) {
    throw new Error(
      `${file} defines no ${name}. The token was renamed or reformatted: ` +
        'src/lib/css-token.ts reads it for the theme-color meta tag and the ' +
        'web app manifest, neither of which can take a var().',
    );
  }

  if (found.length > 1) {
    throw new Error(
      `${file} defines ${name} ${found.length} times. A browser takes the ` +
        'last and this would take the first, so the meta tag and the page ' +
        'would disagree with nothing to show for it. Keep one definition.',
    );
  }

  return found[0][1];
};

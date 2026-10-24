/*
 * Fails if the script-src or style-src hashes in public/_headers differ from
 * the inline blocks the build emits: a framework bump that changes its inline
 * script otherwise ships pages whose islands never hydrate. `--write` puts the
 * right hashes in.
 *
 *   npm run build && npm run check:csp [-- --write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { assertBuildCurrent } from './build-fingerprint.mjs';
import { hashesFor, inlineBlocks } from './csp-hashes.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HEADERS = join(ROOT, 'public/_headers');
const HASH = /'sha256-[A-Za-z0-9+/=]+'/g;

await assertBuildCurrent('CSP');
const { scripts, styles } = inlineBlocks(join(ROOT, 'dist/client'));
const wanted = {
  'script-src': hashesFor(scripts),
  'style-src': hashesFor(styles),
};

let source = readFileSync(HEADERS, 'utf8');
const stale = [];
for (const [name, expected] of Object.entries(wanted)) {
  const directive = new RegExp(
    `(${name} [^;]*?)((?: 'sha256-[^']+')*)(;)`,
    'g',
  );
  source = source.replace(directive, (whole, head, hashes, end) => {
    const listed = (hashes.match(HASH) ?? []).sort();
    if (listed.join(' ') === expected.join(' ')) return whole;
    stale.push(`${name}: ${expected.join(' ')}`);
    return `${head.trimEnd()} ${expected.join(' ')}${end}`;
  });
}

if (stale.length === 0) {
  console.log(
    `CSP: public/_headers hashes the ${scripts.size} inline script(s) and ${styles.size} inline style(s) the build emits.`,
  );
} else if (process.argv.includes('--write')) {
  writeFileSync(HEADERS, source);
  console.log(`CSP: updated public/_headers:\n  ${stale.join('\n  ')}`);
} else {
  console.error(
    `CSP: public/_headers does not hash the inline blocks the build emits. Run npm run check:csp -- --write, or use:\n  ${stale.join('\n  ')}`,
  );
  process.exit(1);
}

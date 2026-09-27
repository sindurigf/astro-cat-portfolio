/*
 * Actions must be SHA-pinned and the veraPDF and WebKit images digest-pinned
 * (a tag can move), MCP servers exact-versioned (`@latest` runs whatever npm serves).
 */

import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const MCP_CONFIG = join(ROOT, '.mcp.json');

/* `uses: owner/repo[/path]@<sha> # vX[.Y[.Z]]`, the shape Dependabot keeps. */
const PINNED_ACTION =
  /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}\s+#\s*v\d+(?:\.\d+){0,2}\s*$/;
const PINNED_IMAGE = /^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}(?:\s+#.*)?$/;
const USES = /^\s*(?:-\s*)?uses:\s*(.+?)\s*$/;

/* `name@1.2.3` or `@scope/name@1.2.3`: no range, no tag, no `latest`. */
const EXACT_PACKAGE = /^(?:@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+$/;

const failures = [];

const workflowFiles = (await readdir(WORKFLOWS)).filter((name) =>
  /\.ya?ml$/.test(name),
);

for (const name of workflowFiles) {
  const lines = (await readFile(join(WORKFLOWS, name), 'utf8')).split('\n');
  lines.forEach((line, index) => {
    const match = line.match(USES);
    if (!match) return;
    const value = match[1];
    if (value.startsWith('./')) return;
    if (PINNED_ACTION.test(value) || PINNED_IMAGE.test(value)) return;
    failures.push(
      `.github/workflows/${name}:${index + 1}  uses: ${value}\n` +
        '    expected owner/repo@<40-character SHA> # vX.Y.Z',
    );
  });
}

/* A tag can be repointed; the digest is what makes veraPDF's answer repeatable. */
const PDF_CHECK = join(ROOT, 'scripts', 'check-pdf.mjs');
const PDF_IMAGE = /^const IMAGE =\s*'([^']+)';$/m;
const DIGEST_PINNED = /@sha256:[0-9a-f]{64}$/;
const pdfImage = (await readFile(PDF_CHECK, 'utf8')).match(PDF_IMAGE)?.[1];
if (!pdfImage || !DIGEST_PINNED.test(pdfImage)) {
  failures.push(
    `scripts/check-pdf.mjs  IMAGE: ${pdfImage ?? '(not found)'}\n` +
      '    expected name:tag@sha256:<64 hex>',
  );
}

const WEBKIT_RUN = join(ROOT, 'scripts', 'test-webkit.sh');
const WEBKIT_IMAGE = /^IMAGE='([^']+)'$/m;
const webkitImage = (await readFile(WEBKIT_RUN, 'utf8')).match(
  WEBKIT_IMAGE,
)?.[1];
if (!webkitImage || !DIGEST_PINNED.test(webkitImage)) {
  failures.push(
    `scripts/test-webkit.sh  IMAGE: ${webkitImage ?? '(not found)'}\n` +
      '    expected name:tag@sha256:<64 hex>',
  );
}

const mcp = JSON.parse(await readFile(MCP_CONFIG, 'utf8'));
for (const [server, config] of Object.entries(mcp.mcpServers ?? {})) {
  if (config.command !== 'npx') {
    failures.push(
      `.mcp.json  ${server}: launched by "${config.command}", which this ` +
        'check does not know how to read. Extend scripts/check-pins.mjs ' +
        'rather than leaving it unchecked.',
    );
    continue;
  }
  /* npx takes its flags first; the first other argument is the package. */
  const spec = (config.args ?? []).find((arg) => !arg.startsWith('-'));
  if (spec && EXACT_PACKAGE.test(spec)) continue;
  failures.push(
    `.mcp.json  ${server}: "${spec ?? '(no package)'}"\n` +
      '    expected an exact version, name@X.Y.Z, never @latest or a range',
  );
}

if (failures.length > 0) {
  console.error(`Found ${failures.length} unpinned dependency reference(s):\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  `Pins: every action in ${workflowFiles.length} workflow file(s) names a SHA, the veraPDF and WebKit images a digest, and every MCP server an exact version.`,
);

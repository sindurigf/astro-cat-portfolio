import { expect, test } from './test';
import { fixture, runCheck, type Files } from './check-fixture';
import { NODE } from './tags';

const SCRIPT = 'scripts/check-pins.mjs';
const WORKFLOW = '.github/workflows/ci.yml';
const MCP = '.mcp.json';

const SHA = 'a'.repeat(40);
const DIGEST = `sha256:${'b'.repeat(64)}`;

const workflow = (action: string): string =>
  [
    'jobs:',
    '  build:',
    '    steps:',
    `      - uses: ${action}`,
    '      - uses: ./.github/actions/local',
    '',
  ].join('\n');

const mcp = (spec: string): string =>
  JSON.stringify({
    mcpServers: { devtools: { command: 'npx', args: ['-y', spec] } },
  });

const tree = ({
  action = `actions/checkout@${SHA} # v4.2.2`,
  server = 'chrome-devtools-mcp@1.2.3',
} = {}): Files => ({
  [WORKFLOW]: workflow(action),
  [MCP]: mcp(server),
  'scripts/check-pdf.mjs': `const IMAGE = 'verapdf/cli:v1@${DIGEST}';\n`,
  'scripts/test-webkit.sh': `IMAGE='mcr.microsoft.com/playwright:v1@${DIGEST}'\n`,
});

test.describe('check:pins', NODE, () => {
  test('passes SHA-pinned actions, digest-pinned images and exact MCP versions', () => {
    const { status, output } = runCheck(SCRIPT, fixture(tree()));
    expect(status, output).toBe(0);
  });

  test('fails an action pinned to a tag and names the workflow line', () => {
    const action = 'actions/checkout@v4';
    const line =
      workflow(action)
        .split('\n')
        .findIndex((text) => text.includes(action)) + 1;
    const { status, output } = runCheck(SCRIPT, fixture(tree({ action })));
    expect(status, output).not.toBe(0);
    expect(output).toContain(`${WORKFLOW}:${line}`);
  });

  test('fails an MCP server on a version range and names .mcp.json', () => {
    const root = fixture(tree({ server: 'chrome-devtools-mcp@^1.2.3' }));
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain(`${MCP}  devtools`);
  });
});

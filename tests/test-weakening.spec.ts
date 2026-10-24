import { expect, test } from './test';
import { NODE } from './tags';
import {
  fileFindings,
  main,
  ownerApproval,
} from '../scripts/check-test-weakening.mjs';

/* Trigger text is assembled here so this file never holds a literal the guard flags in tests/. */
const call = (...parts: string[]): string => `${parts.join('.')}(`;
const SKIP = call('test', 'skip');
const FIXME = call('test', 'describe', 'fixme');
const FAIL = call('test', 'fail');
const BUDGET = ['PAGE', 'BUDGET'].join('_');
const MAP = ['ROUTE', 'BUDGETS'].join('_');
const OWNER = 'site-owner';
const MARKER = 'Approved test change: the old check measured decoration.';

const SPEC = 'tests/example.spec.ts';
const SCRIPT = 'scripts/check-example.mjs';

const spec = (...lines: string[]): string =>
  [`import { expect, test } from './test';`, ...lines].join('\n');

const rules = (change: {
  path: string;
  oldPath?: string;
  oldText: string;
  newText: string;
}): string[] => fileFindings(change).map(({ rule }) => rule);

const BASE = spec(
  `test('one', () => {`,
  `  expect(1).toBe(1);`,
  `  expect(2).toBe(2);`,
  `});`,
);

const scalar = (value: string): string => `const ${BUDGET} = ${value};`;
const map = (value: string): string =>
  `const ${MAP}: Record<string, number> = {\n  '/': ${value},\n  '/about': 5_000,\n};`;

const rejected = (...bullets: string[]): string =>
  ['## Rejected findings', '', ...bullets, '', '## Next'].join('\n');

test.describe('test-weakening guard', NODE, () => {
  for (const [name, line] of [
    ['a skipped test', `${SKIP}'two', () => {});`],
    ['a fixme describe', `${FIXME}'two', () => {});`],
    ['an expected failure', `${FAIL}'two', () => {});`],
  ] as const)
    test(`flags ${name}`, () => {
      expect(
        rules({ path: SPEC, oldText: BASE, newText: `${BASE}\n${line}` }),
      ).toEqual([expect.stringContaining('skips or inverts a test')]);
    });

  for (const [name, line] of [
    ['disabled axe rules', `  .${['disable', 'Rules'].join('')}(['region'])`],
    ['an excluded node', `  ${call('builder', 'exclude')}'.hero')`],
    [
      'a rule turned off',
      `  rules: { region: { enabled: ${String(false)} } },`,
    ],
    ['filtered violations', `  ${call('violations', 'filter')}(v) => v.id)`],
  ] as const)
    test(`flags ${name}`, () => {
      expect(
        rules({ path: SPEC, oldText: BASE, newText: `${BASE}\n${line}` }),
      ).toEqual([expect.stringContaining('excludes axe rules or nodes')]);
    });

  test('flags a tag dropped from an axe list', () => {
    const list = (...tags: string[]): string =>
      `export const AXE_TAGS = [${tags.map((tag) => `'${tag}'`).join(', ')}];`;
    expect(
      rules({
        path: 'tests/wcag.ts',
        oldText: list('wcag2a', 'wcag2aa'),
        newText: list('wcag2a'),
      }),
    ).toEqual(["drops 'wcag2aa' from AXE_TAGS"]);
  });

  test('flags the net count of removed expect calls, and a deleted spec', () => {
    const fewer = BASE.replace(`  expect(2).toBe(2);\n`, '');
    expect(rules({ path: SPEC, oldText: BASE, newText: fewer })).toEqual([
      '1 fewer expect call (line in base)',
    ]);
    expect(rules({ path: SPEC, oldText: BASE, newText: '' })).toEqual([
      '2 fewer expect calls (line in base)',
    ]);
  });

  test('flags expect calls commented out or moved out of a running spec', () => {
    const commented = BASE.replace('  expect(2)', '  // expect(2)');
    expect(rules({ path: SPEC, oldText: BASE, newText: commented })).toEqual([
      '1 fewer expect call (line in base)',
    ]);
    expect(
      rules({
        path: 'tests/example.spec.ts.off',
        oldPath: SPEC,
        oldText: BASE,
        newText: BASE,
      }),
    ).toEqual(['2 fewer expect calls (line in base)']);
  });

  test('flags a widened skip whose first line is unchanged', () => {
    const skip = (condition: string): string =>
      `${BASE}\n${SKIP}\n  ${condition},\n  'webkit bug',\n);`;
    expect(
      rules({
        path: SPEC,
        oldText: skip(`browserName === 'webkit'`),
        newText: skip('true'),
      }),
    ).toEqual([expect.stringContaining('skips or inverts a test')]);
  });

  test('flags a raised, a removed and a no longer numeric budget or tolerance', () => {
    expect(
      rules({ path: SCRIPT, oldText: scalar('100'), newText: scalar('101') }),
    ).toEqual([`raises ${BUDGET} from 100 to 101`]);
    expect(
      rules({ path: SPEC, oldText: map('98_000'), newText: map('99_000') }),
    ).toEqual([`raises ${MAP}[/] from 98000 to 99000`]);
    expect(
      rules({
        path: SPEC,
        oldText: map('98_000 // vue'),
        newText: map('99_000 // vue'),
      }),
    ).toEqual([`raises ${MAP}[/] from 98000 to 99000`]);
    expect(
      rules({ path: SCRIPT, oldText: scalar('100'), newText: '' }),
    ).toEqual([`removes limit ${BUDGET}`]);
    expect(
      rules({
        path: SCRIPT,
        oldText: scalar('100'),
        newText: scalar('Number(process.env.LIMIT)'),
      }),
    ).toEqual([`limit ${BUDGET} is no longer a plain number`]);
    const tolerance = (value: string): string =>
      `const ${['EDGE', 'TOLERANCE'].join('_')} = ${value};`;
    expect(
      rules({
        path: SPEC,
        oldText: tolerance('0.01'),
        newText: tolerance('1'),
      }),
    ).toEqual([expect.stringContaining('raises EDGE_TOLERANCE')]);
  });

  test('flags any change to a WCAG threshold', () => {
    const threshold = (value: string): string =>
      `export const ${['AA', 'TEXT'].join('_')} = ${value};`;
    expect(
      rules({
        path: 'tests/contrast.ts',
        oldText: threshold('4.5'),
        newText: threshold('3'),
      }),
    ).toEqual(['changes WCAG threshold AA_TEXT from 4.5 to 3']);
  });

  test('flags a new rejected finding, a reused title and a removed heading', () => {
    const known = '- **Use tabs:** no.';
    const md = 'ARCHITECTURE.md';
    expect(
      rules({
        path: md,
        oldText: rejected(known),
        newText: rejected(known, '- **Drop the axe\n  scan:** too slow.'),
      }),
    ).toEqual(['adds a rejected finding: Drop the axe scan:']);
    expect(
      rules({
        path: md,
        oldText: rejected(known),
        newText: rejected(known, '- **Use tabs:** drop axe.'),
      }),
    ).toEqual(['adds a rejected finding: Use tabs:']);
    expect(
      rules({
        path: md,
        oldText: rejected(known),
        newText: rejected(known).replace('findings', 'Findings'),
      }),
    ).toEqual(['removes the "Rejected findings" heading']);
  });

  test('flags an edit to the guard, any CI workflow and the runner config', () => {
    expect(
      rules({
        path: 'scripts/check-test-weakening.mjs',
        oldText: 'a',
        newText: 'b',
      }),
    ).toEqual(['changes the test-weakening guard']);
    expect(
      rules({
        path: '.github/workflows/spoof.yml',
        oldText: '',
        newText: 'name: Test weakening',
      }),
    ).toEqual(['changes a CI workflow']);
    expect(
      rules({ path: 'playwright.config.ts', oldText: 'a', newText: 'b' }),
    ).toEqual(['changes which tests run']);
  });

  test('passes a new test, an added expect, a lowered budget, a stronger matcher and a moved line', () => {
    const more = `${BASE}\ntest('two', () => {\n  expect(3).toBe(3);\n});`;
    expect(rules({ path: SPEC, oldText: BASE, newText: more })).toEqual([]);
    expect(
      rules({ path: SCRIPT, oldText: scalar('100'), newText: scalar('90') }),
    ).toEqual([]);
    expect(
      rules({ path: SPEC, oldText: map('98_000'), newText: map('97_000') }),
    ).toEqual([]);
    const loose = `  expect(list).toEqual([expect.${'stringContaining'}('a')]);`;
    expect(
      rules({
        path: SPEC,
        oldText: `${BASE}\n${loose}`,
        newText: `${BASE}\n  expect(list).toEqual(['abc']);`,
      }),
    ).toEqual([]);
    const skipped = `${SKIP}cond, 'no feature');`;
    expect(
      rules({
        path: SPEC,
        oldText: `${BASE}\n${skipped}`,
        newText: `${skipped}\n${BASE}`,
      }),
    ).toEqual([]);
    expect(
      rules({ path: 'src/pages/index.astro', oldText: BASE, newText: '' }),
    ).toEqual([]);
  });

  test('passes a renamed spec that keeps its expect calls', () => {
    expect(
      rules({
        path: 'tests/renamed.spec.ts',
        oldPath: SPEC,
        oldText: BASE,
        newText: BASE,
      }),
    ).toEqual([]);
  });

  test("accepts the marker only in the owner's approving review of the tested commit, outside code", () => {
    const HEAD = 'abc123';
    const review = (
      login: string,
      body: string,
      { commitId = HEAD, state = 'APPROVED' } = {},
    ) => ({ login, body, commitId, state });
    const approve = (...reviews: ReturnType<typeof review>[]) =>
      ownerApproval(reviews, OWNER, HEAD);

    expect(approve(review('coordinator-bot', MARKER))).toBeNull();
    expect(approve(review(OWNER, MARKER, { commitId: 'older1' }))).toBeNull();
    expect(approve(review(OWNER, MARKER, { state: 'COMMENTED' }))).toBeNull();
    expect(approve(review(OWNER, MARKER, { state: 'DISMISSED' }))).toBeNull();
    expect(approve(review(OWNER, 'Looks fine.'))).toBeNull();
    expect(approve(review(OWNER, 'Approved test change:'))).toBeNull();
    expect(approve(review(OWNER, 'Approved test change: <reason>'))).toBeNull();
    expect(approve(review(OWNER, `  ${MARKER}`))).toBeNull();
    expect(approve(review(OWNER, `\`\`\`\n${MARKER}\n\`\`\``))).toBeNull();
    expect(
      approve(
        review('coordinator-bot', MARKER),
        review('Site-Owner', `Reviewed.\r\n${MARKER}`),
      ),
    ).toBe('the old check measured decoration.');
  });
});

test.describe('test-weakening guard in CI', NODE, () => {
  const HEAD = 'a'.repeat(40);
  const BASE_SHA = 'b'.repeat(40);
  const EVENT = '/event.json';
  const CI_ENV = {
    GITHUB_EVENT_PATH: EVENT,
    GITHUB_REPOSITORY: 'owner/site',
    GITHUB_REPOSITORY_OWNER: OWNER,
    GITHUB_TOKEN: 'token',
  };
  const pullRequest = {
    pull_request: { number: 7, head: { sha: HEAD }, base: { sha: BASE_SHA } },
  };
  const weakened = BASE.replace(`  expect(2).toBe(2);\n`, '');

  /** A fake git holding one spec that loses an expect between the merge base and the head. */
  const fakeGit =
    ({ mergeBase = 'm'.repeat(40) } = {}) =>
    (...args: string[]): string => {
      if (args[0] === 'merge-base') {
        if (!mergeBase) throw new Error('fatal: no merge base');
        return `${mergeBase}\n`;
      }
      if (args[0] === 'diff') return `M\0${SPEC}\0`;
      if (args[0] === 'show')
        return args[1]?.startsWith(HEAD) ? weakened : BASE;
      throw new Error(`unexpected git ${args.join(' ')}`);
    };

  const run = async (
    overrides: {
      env?: Record<string, string>;
      event?: object;
      reviews?: object[] | 'error';
      git?: (...args: string[]) => string;
    } = {},
  ) => {
    const lines: string[] = [];
    const reviews = overrides.reviews ?? [];
    const code: number = await main({
      env: overrides.env ?? CI_ENV,
      git: overrides.git ?? fakeGit(),
      readFile: () => JSON.stringify(overrides.event ?? pullRequest),
      fetchImpl: async () =>
        reviews === 'error'
          ? new Response('', { status: 502 })
          : Response.json(reviews),
      log: (line: string) => lines.push(line),
    });
    return { code, output: lines.join('\n') };
  };

  test("fails a finding without approval and passes it with the owner's approving review", async () => {
    const unapproved = await run();
    expect(unapproved.code).toBe(1);
    expect(unapproved.output).toContain(`${SPEC}:`);
    const approved = await run({
      reviews: [
        {
          user: { login: OWNER },
          state: 'APPROVED',
          commit_id: HEAD,
          body: MARKER,
        },
      ],
    });
    expect(approved).toEqual(expect.objectContaining({ code: 0 }));
  });

  test('ignores APPROVED_TEST_CHANGE in CI', async () => {
    expect(
      (await run({ env: { ...CI_ENV, APPROVED_TEST_CHANGE: '1' } })).code,
    ).toBe(1);
  });

  test('fails a run that is not for a pull request', async () => {
    expect((await run({ event: { ref: 'refs/heads/main' } })).code).toBe(1);
  });

  test('throws on a missing variable, a failed API call or no merge base', async () => {
    const { GITHUB_TOKEN: _token, ...noToken } = CI_ENV;
    await expect(run({ env: noToken })).rejects.toThrow(
      'GITHUB_TOKEN is not set.',
    );
    await expect(run({ reviews: 'error' })).rejects.toThrow('answered 502');
    await expect(run({ git: fakeGit({ mergeBase: '' }) })).rejects.toThrow(
      'no merge base',
    );
    await expect(
      run({
        event: {
          pull_request: {
            number: 7,
            head: { sha: 'HEAD' },
            base: { sha: BASE_SHA },
          },
        },
      }),
    ).rejects.toThrow('pull_request.head.sha is not a commit SHA.');
  });
});

import { expect, test } from './test';
import { NODE } from './tags';
import {
  changeFindings,
  main,
  ownerApproval,
} from '../scripts/check-test-weakening.mjs';

/* Trigger text is assembled here so this file never holds a literal the guard flags in tests/. */
const call = (...parts: string[]): string => `${parts.join('.')}(`;
const E = 'expect';
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
  [`import { ${E}, test } from './test';`, ...lines].join('\n');

type Change = {
  path: string;
  oldPath?: string;
  oldText: string;
  newText: string;
};

const rules = (...changes: Change[]): string[] =>
  changeFindings(changes).map(({ rule }: { rule: string }) => rule);

const BASE = spec(
  `test('one', () => {`,
  `  ${E}(1).toBe(1);`,
  `  ${E}(2).toBe(2);`,
  `});`,
);
const withLine = (line: string): string => `${BASE}\n${line}`;
const inSpec = (newText: string, oldText = BASE): string[] =>
  rules({ path: SPEC, oldText, newText });

const scalar = (value: string): string => `const ${BUDGET} = ${value};`;
const map = (value: string, extra = ''): string =>
  `const ${MAP}: Record<string, number> = {\n  '/': ${value},\n  '/about': 5_000,${extra}\n};`;

const rejected = (...bullets: string[]): string =>
  ['## Rejected findings', '', ...bullets, '', '## Next'].join('\n');

test.describe('test-weakening guard', NODE, () => {
  for (const [name, line] of [
    ['a skipped test', `${SKIP}'two', () => {});`],
    ['a fixme describe', `${FIXME}'two', () => {});`],
    ['an expected failure', `${FAIL}'two', () => {});`],
    ['a skip through test info', `  ${call('testInfo', 'skip')});`],
    ['a computed test call', `${'test'}[mode]('two', () => {});`],
  ] as const)
    test(`flags ${name}`, () => {
      expect(inSpec(withLine(line))).toEqual([
        expect.stringContaining('skips or inverts a test'),
      ]);
    });

  test('flags describe.configure', () => {
    expect(
      inSpec(
        withLine(`${call('test', 'describe', 'configure')}{ retries: 3 });`),
      ),
    ).toEqual([expect.stringContaining('configures how tests run')]);
  });

  for (const [name, line] of [
    ['disabled axe rules', `  .${['disable', 'Rules'].join('')}(['region'])`],
    ['an excluded node', `  ${call('builder', 'exclude')}'.hero')`],
    ['a rule list', `  ${call('builder', 'withRules')}['region'])`],
    ['a run-only option', `  .options({ ${'run'}Only: ['wcag2a'] })`],
    [
      'a rule turned off',
      `  rules: { region: { enabled: ${String(false)} } },`,
    ],
    ['filtered violations', `  ${call('violations', 'filter')}(v) => v.id)`],
  ] as const)
    test(`flags ${name}`, () => {
      expect(inSpec(withLine(line))).toEqual([
        expect.stringContaining('narrows axe'),
      ]);
    });

  test('flags a scan with a narrowed tag list, not a default scan', () => {
    const scan = (args: string): string => `  await ${'timedScan'}(${args});`;
    expect(inSpec(withLine(scan(`page, 'home', ['wcag2a']`)))).toEqual([
      expect.stringContaining('narrows axe tags or rules'),
    ]);
    expect(inSpec(withLine(scan(`page, 'home'`)))).toEqual([]);
  });

  test('flags a tag dropped from an axe list and any change to the axe helper', () => {
    const list = (...tags: string[]): string =>
      `export const AXE_TAGS = [${tags.map((tag) => `'${tag}'`).join(', ')}];`;
    expect(
      rules({
        path: 'tests/wcag.ts',
        oldText: list('wcag2a', 'wcag2aa'),
        newText: list('wcag2a'),
      }),
    ).toEqual(["drops 'wcag2aa' from AXE_TAGS"]);
    expect(rules({ path: 'tests/axe.ts', oldText: 'a', newText: 'b' })).toEqual(
      ['changes the axe helper'],
    );
  });

  test('flags fewer expect calls, commented out, deleted or renamed out of a running spec', () => {
    const fewer = BASE.replace(`  ${E}(2).toBe(2);\n`, '');
    expect(inSpec(fewer)).toEqual(['1 fewer expect call (line in base)']);
    expect(inSpec(BASE.replace(`  ${E}(2)`, `  // ${E}(2)`))).toEqual([
      '1 fewer expect call (line in base)',
    ]);
    expect(inSpec('')).toEqual(['2 fewer expect calls (line in base)']);
    expect(
      rules({
        path: 'tests/example.spec.ts.off',
        oldPath: SPEC,
        oldText: BASE,
        newText: BASE,
      }),
    ).toEqual(['2 fewer expect calls (line in base)']);
  });

  test('flags hollow assertions: no matcher, inside try, an early return, a negation', () => {
    expect(inSpec(withLine(`  ${E}(3);`))).toEqual([
      '1 expect with no matcher',
    ]);
    expect(
      inSpec(withLine(`  try {\n    ${E}(3).toBe(3);\n  } catch {}`)),
    ).toEqual(['puts an expect inside try']);
    expect(
      inSpec(BASE.replace(`() => {\n`, `() => {\n  ${'return'};\n`)),
    ).toEqual(['returns before a test body runs']);
    expect(inSpec(BASE.replace(`(2).toBe(2)`, `(2).not.toBe(2)`))).toEqual([
      'negates an assertion',
    ]);
  });

  test('flags a changed number in an assertion and a changed test constant', () => {
    expect(inSpec(BASE.replace(`(2).toBe(2)`, `(2).toBe(1)`))).toEqual([
      'changes a number in an assertion',
    ]);
    const constant = (value: string): string =>
      `const ${['MIN', 'RING', 'PX'].join('_')} = ${value};`;
    expect(
      rules({
        path: 'tests/focus.spec.ts',
        oldText: constant('2'),
        newText: constant('1'),
      }),
    ).toEqual(['changes MIN_RING_PX from 2 to 1']);
  });

  test('flags a widened skip whose first line is unchanged', () => {
    const skip = (condition: string): string =>
      withLine(`${SKIP}\n  ${condition},\n  'webkit bug',\n);`);
    expect(inSpec(skip('true'), skip(`browserName === 'webkit'`))).toEqual([
      expect.stringContaining('skips or inverts a test'),
    ]);
  });

  test('flags a raised, a removed and a no longer numeric budget or tolerance', () => {
    expect(
      rules({ path: SCRIPT, oldText: scalar('100'), newText: scalar('101') }),
    ).toEqual([`raises ${BUDGET} from 100 to 101`]);
    expect(inSpec(map('98_000'), map('97_000'))).toEqual([
      `raises ${MAP}[/] from 97000 to 98000`,
    ]);
    expect(inSpec(map('99_000 // vue'), map('98_000 // vue'))).toEqual([
      `raises ${MAP}[/] from 98000 to 99000`,
    ]);
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
    expect(inSpec(tolerance('1'), tolerance('0.01'))).toEqual([
      expect.stringContaining('raises EDGE_TOLERANCE'),
    ]);
  });

  test('flags a new budget key above its fallback and a budget scaled where it is used', () => {
    const fallback = `${scalar('15_500')}\nconst budget = ${MAP}[route] ?? ${BUDGET};`;
    expect(
      inSpec(
        `${fallback}\n${map('98_000', "\n  '/new': 20_000,")}`,
        `${fallback}\n${map('98_000')}`,
      ),
    ).toEqual([`adds ${MAP}[/new] above its fallback ${BUDGET}`]);
    expect(
      inSpec(
        `${fallback}\n${map('98_000', "\n  '/new': 9_000,")}`,
        `${fallback}\n${map('98_000')}`,
      ),
    ).toEqual([]);
    const use = (factor: string): string =>
      `const ok = bytes < ${BUDGET}${factor};`;
    expect(inSpec(use(' * 2'), use(''))).toEqual([
      expect.stringContaining('scales a limit where it is used'),
    ]);
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

  test('flags an edit to the guard, any CI workflow and every file that picks the tests', () => {
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
    for (const path of [
      'playwright.config.ts',
      'playwright.worker.config.ts',
      'tests/tags.ts',
      'tests/ports.ts',
      'scripts/shard-tests.mjs',
    ])
      expect(rules({ path, oldText: 'a', newText: 'b' }), path).toEqual([
        'changes which tests run',
      ]);
  });

  test('passes a new test, an added expect, a lowered budget, a stronger matcher and a moved line', () => {
    expect(
      inSpec(withLine(`test('two', () => {\n  ${E}(3).toBe(3);\n});`)),
    ).toEqual([]);
    expect(
      rules({ path: SCRIPT, oldText: scalar('100'), newText: scalar('90') }),
    ).toEqual([]);
    expect(inSpec(map('97_000'), map('98_000'))).toEqual([]);
    expect(
      inSpec(
        withLine(`  ${E}(list).toEqual(['abc']);`),
        withLine(`  ${E}(list).toEqual([${E}.${'stringContaining'}('a')]);`),
      ),
    ).toEqual([]);
    const skipped = `${SKIP}cond, 'no feature');`;
    expect(inSpec(`${skipped}\n${BASE}`, `${BASE}\n${skipped}`)).toEqual([]);
    expect(
      rules({ path: 'src/pages/index.astro', oldText: BASE, newText: '' }),
    ).toEqual([]);
    expect(
      rules({
        path: 'tests/renamed.spec.ts',
        oldPath: SPEC,
        oldText: BASE,
        newText: BASE,
      }),
    ).toEqual([]);
  });

  test('passes expect calls moved into a helper the spec imports', () => {
    const helper = `export const ones = () => {\n  ${E}(1).toBe(1);\n  ${E}(2).toBe(2);\n};`;
    expect(
      rules(
        {
          path: SPEC,
          oldText: BASE,
          newText: spec(`import { ones } from './ones';`, `test('one', ones);`),
        },
        { path: 'tests/ones.ts', oldText: '', newText: helper },
      ),
    ).toEqual([]);
  });

  test('passes a test constant moved to a helper with its value, and flags one moved with a new value', () => {
    const name = ['MIN', 'RING', 'PX'].join('_');
    const constant = (value: string): string =>
      `export const ${name} = ${value};`;
    const user = spec(`import { ${name} } from './wcag';`);
    const moved = (value: string) =>
      rules(
        { path: SPEC, oldText: constant('2'), newText: user },
        { path: 'tests/wcag.ts', oldText: '', newText: constant(value) },
      );
    expect(moved('2')).toEqual([]);
    expect(moved('1')).toEqual([`removes ${name} (2)`]);
  });

  test('passes edits inside a test that never runs and fail calls that are not Playwright', () => {
    const skippedTest = (body: string): string =>
      spec(`${SKIP}'parked', () => {`, body, `});`);
    expect(inSpec(skippedTest(''), skippedTest(`  ${E}(1).toBe(1);`))).toEqual(
      [],
    );
    expect(inSpec(withLine(`  ${call('photos', 'fail')});`))).toEqual([]);
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

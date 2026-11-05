import { readFileSync, readdirSync } from 'node:fs';
import { load } from 'js-yaml';
import { expect, test } from './test';
import { NODE } from './tags';

/* Security: pull_request_target runs with secrets, so it must never check out the pull request. */
test(
  'every pull_request_target checkout has no ref or the default branch ref',
  NODE,
  () => {
    const dir = '.github/workflows';
    type Step = { uses?: string; with?: { ref?: string; repository?: string } };
    type Workflow = { on?: unknown; jobs?: Record<string, { steps?: Step[] }> };
    const targets = readdirSync(dir)
      .filter((name) => name.endsWith('.yml'))
      .map((name) => ({
        name,
        workflow: load(readFileSync(`${dir}/${name}`, 'utf8')) as Workflow,
      }))
      .filter(({ workflow }) =>
        JSON.stringify(workflow.on ?? {}).includes('pull_request_target'),
      );
    expect(
      targets.length,
      'no pull_request_target workflow found',
    ).toBeGreaterThan(0);
    for (const { name, workflow } of targets) {
      for (const step of Object.values(workflow.jobs ?? {}).flatMap(
        (job) => job.steps ?? [],
      )) {
        if (!step.uses?.startsWith('actions/checkout@')) continue;
        // No ref checks out the base branch: trusted code, never the pull request head.
        expect(
          [undefined, '${{ github.event.repository.default_branch }}'],
          `${name} checks out ${step.with?.ref}, not the default branch`,
        ).toContain(step.with?.ref);
        expect(
          step.with?.repository,
          `${name} checks out another repository`,
        ).toBeUndefined();
      }
    }
  },
);

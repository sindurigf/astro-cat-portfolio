import type { FullResult, Reporter, TestCase } from '@playwright/test/reporter';

/**
 * Fails the run when any test ends skipped: a test that cannot run in an
 * engine carries an engine tag (tests/tags.ts). A class: Playwright calls `new`.
 */
export default class NoSkips implements Reporter {
  private readonly tests: TestCase[] = [];

  onTestEnd(test: TestCase): void {
    if (!this.tests.includes(test)) this.tests.push(test);
  }

  /* `outcome()` reads every retry, so a sibling skipped after a failed hook that later passes is not counted. */
  async onEnd(
    result: FullResult,
  ): Promise<{ status: FullResult['status'] } | undefined> {
    const skipped = this.tests
      .filter((test) => test.outcome() === 'skipped')
      .map((test) => test.titlePath().filter(Boolean).join(' › '));
    if (skipped.length === 0) return undefined;
    console.error(
      `${skipped.length} skipped; tag the test for its engines instead:\n  ${skipped.join('\n  ')}`,
    );
    return { status: result.status === 'passed' ? 'failed' : result.status };
  }
}

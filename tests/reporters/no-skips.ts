import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

/**
 * Fails the run when any test reports `skipped`: a test that cannot run in an
 * engine carries an engine tag (tests/tags.ts). A class: Playwright calls `new`.
 */
export default class NoSkips implements Reporter {
  private readonly skipped: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'skipped')
      this.skipped.push(test.titlePath().filter(Boolean).join(' › '));
  }

  async onEnd(
    result: FullResult,
  ): Promise<{ status: FullResult['status'] } | undefined> {
    if (this.skipped.length === 0) return undefined;
    console.error(
      `${this.skipped.length} skipped; tag the test for its engines instead:\n  ${this.skipped.join('\n  ')}`,
    );
    return { status: result.status === 'passed' ? 'failed' : result.status };
  }
}

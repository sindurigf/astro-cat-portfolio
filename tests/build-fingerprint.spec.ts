import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { builtFixture, fixture, runCheck } from './check-fixture';
import { NODE } from './tags';

/* Any check that calls assertBuildCurrent shows how it refuses a stale build. */
const SCRIPT = 'scripts/check-images-of-text.mjs';
const BUILT = { 'dist/client/index.html': '<html></html>' };

test.describe('assertBuildCurrent (build correctness)', NODE, () => {
  test('accepts a build whose fingerprint matches its files', () => {
    const { status, output } = runCheck(SCRIPT, builtFixture(BUILT));
    expect(status, output).toBe(0);
  });

  test('refuses a missing dist/client and says to build', () => {
    const { status, output } = runCheck(
      SCRIPT,
      fixture({ '.gitignore': 'dist/\n' }),
    );
    expect(status, output).toBe(1);
    expect(output).toContain('npm run build');
  });

  test('refuses a build with no fingerprint', () => {
    const { status, output } = runCheck(SCRIPT, fixture(BUILT));
    expect(status, output).toBe(1);
    expect(output).toContain('no build fingerprint');
  });

  test('refuses a build when a tracked file changes after the build', () => {
    const root = builtFixture({ ...BUILT, 'src/a.ts': 'one' });
    writeFileSync(join(root, 'src/a.ts'), 'two');
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).toBe(1);
    expect(output).toContain('built from other files');
  });

  test('refuses a build when a new untracked file appears after the build', () => {
    const root = builtFixture(BUILT);
    writeFileSync(join(root, 'src-new.ts'), 'new');
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).toBe(1);
    expect(output).toContain('built from other files');
  });
});

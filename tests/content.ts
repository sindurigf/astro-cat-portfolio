import { expect } from './test';

/** Sample content a test needs: a fork without it adds some or deletes the test. */
export const requireContent = (present: unknown, missing: string): void => {
  expect(
    Boolean(present),
    `${missing}: add it, or delete this test with it`,
  ).toBe(true);
};

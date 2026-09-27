import { expect, test } from './test';
import { PLATFORM_FACTS } from '../src/lib/platform-facts';
import { DAY_MS } from '../src/lib/time';
import { NODE } from './tags';

/**
 * Each fact in src/lib/platform-facts.ts is a third-party dashboard setting that
 * can change with no commit here. When this fires, open `check` and confirm the
 * value; never widen the interval or move the date without looking.
 */

/** Six months, matching Umami's retention, the longest window /privacy promises. */
const RECHECK_AFTER_DAYS = 180;

/** Fails this many days before the deadline, so a recheck never blocks a merge unannounced. */
const RECHECK_WARNING_DAYS = 30;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

test.describe('platform facts are rechecked', NODE, () => {
  for (const [name, fact] of Object.entries(PLATFORM_FACTS)) {
    test(`${name} is rechecked ${RECHECK_WARNING_DAYS} days before its ${RECHECK_AFTER_DAYS}-day deadline`, () => {
      expect(
        ISO_DATE.test(fact.checkedOn) &&
          !Number.isNaN(Date.parse(fact.checkedOn)),
        `${name}: checkedOn "${fact.checkedOn}" is not a YYYY-MM-DD date.`,
      ).toBe(true);

      const age = Math.floor(
        (Date.now() - Date.parse(fact.checkedOn)) / DAY_MS,
      );
      const due = RECHECK_AFTER_DAYS - age;

      expect(
        age,
        `${name}: checkedOn ${fact.checkedOn} is in the future; record the day the check was made.`,
      ).toBeGreaterThanOrEqual(0);

      expect(
        due,
        due < 0
          ? `${name} is OVERDUE (checked ${fact.checkedOn}): confirm "${fact.claim}" at ${fact.check} and update src/lib/platform-facts.ts.`
          : `${name} is due for a recheck in ${due} days: confirm "${fact.claim}" at ${fact.check} and move checkedOn forward.`,
      ).toBeGreaterThan(RECHECK_WARNING_DAYS);
    });
  }
});

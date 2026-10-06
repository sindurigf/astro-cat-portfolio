import { expect, test } from './test';
import { formatPostDate } from '../src/lib/post-date';
import { isoDate } from '../src/lib/time';
import { NODE } from './tags';

/** Frontmatter dates are midnight UTC, the previous day west of Greenwich; builds run at or east of UTC, so this sets TZ. */

const ZONES = ['America/Los_Angeles', 'UTC', 'Pacific/Kiritimati'];
const POSTED = new Date('2026-09-13');

test.describe('a post date', NODE, () => {
  test('reads as the same day in every time zone', () => {
    const original = process.env.TZ;
    const seen: string[] = [];

    try {
      for (const zone of ZONES) {
        process.env.TZ = zone;
        seen.push(`${zone}: ${formatPostDate(POSTED)} / ${isoDate(POSTED)}`);
      }
    } finally {
      /* Assigning undefined would set the string "undefined" for later tests. */
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }

    expect(
      seen,
      'the text date and the ISO date disagree in some time zone.',
    ).toEqual(ZONES.map((zone) => `${zone}: 13 September 2026 / 2026-09-13`));
  });

  test('reads day, month name, four-digit year in that order', () => {
    const DAY_MONTH_YEAR = /^\d{1,2} [A-Z][a-z]+ \d{4}$/;
    const wrong = ['2026-01-05', '2026-10-06', '2027-12-31']
      .map((iso) => formatPostDate(new Date(iso)))
      .filter((text) => !DAY_MONTH_YEAR.test(text));

    expect(wrong, 'a date is not "day month year".').toEqual([]);
  });
});

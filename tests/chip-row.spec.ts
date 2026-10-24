import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { AA_TEXT, NON_TEXT, PAGE_HELPERS } from './contrast';

/*
 * The blog's filter row: joined chips, the current one gold with a marker.
 * The marker is a non-text cue for "current" (SC 1.4.11) and the labels are
 * text (SC 1.4.3), in both modes.
 */
const ROUTE = '/blog';
const ROW = 'main ul.chip-row';

interface Chip {
  label: string;
  current: boolean;
  labelRatio: number;
  markerRatio: number | null;
}

const readChips = (page: Page): Promise<Chip[]> =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const row = document.querySelector(${JSON.stringify(ROW)});
    if (!row) throw new Error('the blog has no chip row');
    return [...row.querySelectorAll('a.chip')].map((chip) => {
      const style = getComputedStyle(chip);
      const fill = parse(style.backgroundColor);
      const marker = chip.querySelector('[aria-hidden="true"]');
      const markerFill = marker && parse(getComputedStyle(marker).backgroundColor);
      return {
        label: chip.textContent.trim(),
        current: chip.hasAttribute('aria-current'),
        labelRatio: ratio(parse(style.color), fill),
        markerRatio: markerFill ? ratio(markerFill, fill) : null,
      };
    });
  })()`) as Promise<Chip[]>;

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`filter chips, ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('the current chip carries a marker of at least 3:1 and every label reads', async ({
      page,
    }) => {
      await gotoSettled(page, ROUTE);
      const chips = await readChips(page);
      const current = chips.filter((chip) => chip.current);
      expect(current, 'exactly one chip is current').toHaveLength(1);
      expect(
        current[0]?.markerRatio,
        `the current chip's marker should reach ${NON_TEXT}:1 against its fill`,
      ).toBeGreaterThanOrEqual(NON_TEXT);
      for (const chip of chips) {
        expect(
          chip.labelRatio,
          `"${chip.label}" should reach ${AA_TEXT}:1 against its fill`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  });
}

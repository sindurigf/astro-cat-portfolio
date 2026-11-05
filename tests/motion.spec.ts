import { expect, test, type Page } from './test';
import { gotoSettled, sweepTimeout } from './settle';
import { ROUTES } from './routes';

/**
 * Moving means a duration above 1ms (the reduce block sets 0.01ms), an infinite
 * iteration count, which `!important` can leave at any duration, or smooth scrolling.
 */
const movingElements = (page: Page) =>
  page.evaluate(() => {
    /* Longest duration in a comma-separated list, in milliseconds. */
    const longest = (value: string) =>
      Math.max(
        0,
        ...value.split(',').map((part) => {
          const seconds = parseFloat(part);
          if (Number.isNaN(seconds)) return 0;
          return part.includes('ms') ? seconds : seconds * 1000;
        }),
      );

    const out: string[] = [];
    for (const element of document.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        const smooth = style.scrollBehavior === 'smooth';
        const animated = style.animationName !== 'none';
        const animation = animated ? longest(style.animationDuration) : 0;
        const transition =
          style.transitionProperty === 'none'
            ? 0
            : longest(style.transitionDuration);
        const endless =
          animated && style.animationIterationCount === 'infinite';

        if (animation <= 1 && transition <= 1 && !endless && !smooth) continue;
        out.push(
          `<${element.tagName.toLowerCase()} class="${String(
            (element as HTMLElement).className,
          ).slice(0, 48)}">${pseudo ?? ''} animation=${style.animationName} ` +
            `${style.animationDuration}/${style.animationIterationCount} ` +
            `transition=${style.transitionProperty} ${style.transitionDuration}` +
            (smooth ? ' scroll-behavior=smooth' : ''),
        );
      }
    }
    return out;
  });

test('nothing anywhere still moves under reduced motion', async ({ page }) => {
  test.setTimeout(sweepTimeout(ROUTES.length));
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const moving: string[] = [];
  for (const route of ROUTES) {
    await gotoSettled(page, route);

    expect(
      await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
      `the preference was not emulated on ${route}, so this proves nothing`,
    ).toBe(true);

    const found = await movingElements(page);

    moving.push(...found.map((entry) => `${route}  ${entry}`));
  }

  expect(
    moving,
    `element(s) still moving under prefers-reduced-motion: reduce:\n` +
      moving.map((entry) => `  ${entry}`).join('\n'),
  ).toEqual([]);
});

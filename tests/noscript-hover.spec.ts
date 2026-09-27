import { expect, test, type Page } from './test';
import { AA_TEXT, PAGE_HELPERS } from './contrast';
import { PHONE_VIEWPORT } from './wcag';

const LINK = '.noscript-nav a:not([aria-current])';

const linkState = (page: Page) =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const el = document.querySelector('${LINK}');
    const s = getComputedStyle(el);
    const ground = effectiveBackground(el);
    const ink = parse(s.color);
    return {
      look: [s.color, s.backgroundColor, s.textDecorationLine, s.outlineStyle, s.borderColor].join(' | '),
      ratio: ground && ink ? ratio(ink, ground) : 0,
    };
  })()`) as Promise<{ look: string; ratio: number }>;

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: PHONE_VIEWPORT });

  test('a hovered nav link changes and keeps its text contrast', async ({
    page,
  }) => {
    await page.goto('/about');
    const link = page.locator(LINK).first();
    await expect(link, 'the no-JS nav did not render').toBeVisible();
    const rest = await linkState(page);
    await link.hover();
    const hovered = await linkState(page);
    expect(hovered.look, 'hover looks the same as rest').not.toBe(rest.look);
    expect(
      hovered.ratio,
      'the hovered label against its ground',
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

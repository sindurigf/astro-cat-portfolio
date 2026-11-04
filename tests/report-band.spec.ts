import { expect, test } from './test';
import { builtHtml, SAMPLED_ROUTES } from './routes';
import { REPORT_LINK } from '../src/lib/nav';
import { ACCESSIBILITY_PATH, REPORT_BARRIER_ID } from '../src/lib/paths';
import {
  PERCENT,
  TEXT_SCALE_PROPERTY,
  TEXT_SCALE_STEPS,
} from '../src/lib/text-scale';
import { NARROW_WIDTH } from './wcag';
import { NODE } from './tags';
import { gotoSettled } from './settle';

/* The band above the header: one report link, the same place on every page (SC 3.2.6). */

const MAIN_CONTENT_HREF = '#main-content';

/** A phone held upright at the narrowest width measured. */
const NARROW_HEIGHT = 640;

/** Every link, button and tabindex stop before <header>, in source order. */
const stopsBeforeHeader = (html: string): string[] => {
  const body = html.slice(html.indexOf('<body'), html.indexOf('<header'));
  return [
    ...body.matchAll(/<(a|button|input|select|textarea)\b[^>]*>|tabindex="0"/g),
  ].map((match) => /href="([^"]*)"/.exec(match[0])?.[1] ?? match[0]);
};

test.describe('the report band', () => {
  test(
    'every built page has the skip link, then the report link, before the header',
    NODE,
    () => {
      const pages = builtHtml();
      expect(pages.size, 'no built pages were found').toBeGreaterThan(0);
      for (const [route, html] of pages) {
        expect(
          stopsBeforeHeader(html),
          `${route}: the skip link and the report link must be the only stops before the header, in that order (SC 2.4.1, 3.2.6).`,
        ).toEqual([MAIN_CONTENT_HREF, REPORT_LINK.href]);
        expect(
          html,
          `${route}: the report link text is not "${REPORT_LINK.label}".`,
        ).toContain(`>${REPORT_LINK.label}</a>`);
      }
    },
  );

  test('the report link leads to the Report a Barrier heading', NODE, () => {
    const route = ACCESSIBILITY_PATH.replace(/\/$/, '');
    const html = builtHtml().get(route);
    expect(html, `${route} was not built`).toBeDefined();
    expect(
      html,
      `${route} has no h2 with id "${REPORT_BARRIER_ID}" reading "Report a Barrier".`,
    ).toMatch(
      new RegExp(
        `<h2[^>]*\\bid="${REPORT_BARRIER_ID}"[^>]*>Report a Barrier</h2>`,
      ),
    );
  });

  for (const route of SAMPLED_ROUTES) {
    test(`${route}: the second Tab reaches the report link`, async ({
      page,
    }) => {
      await gotoSettled(page, route);
      await page.locator('body').press('Tab');
      await page.keyboard.press('Tab');
      await expect(
        page
          .getByRole('complementary', { name: 'Accessibility help' })
          .getByRole('link', {
            name: REPORT_LINK.label,
            exact: true,
          }),
        'the second Tab should reach the report link, right after the skip link.',
      ).toBeFocused();
    });
  }

  test('without JavaScript the report link shows and opens the report section', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    const link = page.getByRole('link', {
      name: REPORT_LINK.label,
      exact: true,
    });
    await expect(
      link,
      'the report link is hidden without JavaScript.',
    ).toBeVisible();
    await link.click();
    const heading = page.getByRole('heading', {
      name: 'Report a Barrier',
      level: 2,
    });
    await expect(
      heading,
      'following the report link without JavaScript does not show the Report a Barrier heading.',
    ).toBeInViewport();
    const [top, headerBottom] = await Promise.all([
      heading.evaluate((el) => el.getBoundingClientRect().top),
      page
        .locator('header.site-header')
        .evaluate((el) => el.getBoundingClientRect().bottom),
    ]);
    expect(
      top,
      'the Report a Barrier heading lands under the sticky header (SC 2.4.11).',
    ).toBeGreaterThanOrEqual(headerBottom);
    await context.close();
  });

  test('the report link changes on hover in more than color alone (SC 1.4.1)', async ({
    page,
  }) => {
    await gotoSettled(page, '/');
    const link = page
      .getByRole('complementary', { name: 'Accessibility help' })
      .getByRole('link', { name: REPORT_LINK.label });
    const look = () =>
      link.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          color: style.color,
          underline: style.textDecorationThickness,
        };
      });
    const rest = await look();
    await link.hover();
    const hover = await look();
    expect(
      hover.color,
      'the report link keeps its rest color on hover.',
    ).not.toBe(rest.color);
    expect(
      hover.underline,
      'the report link underline keeps its rest thickness on hover.',
    ).not.toBe(rest.underline);
  });

  /* The band grows when the link wraps; its padding keeps the whole ring inside it, clear of the header. */
  for (const step of TEXT_SCALE_STEPS) {
    test(`at ${NARROW_WIDTH}px and text ${step}% the focused link's ring stays inside the band (SC 2.4.7, 2.4.11)`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: NARROW_WIDTH,
        height: NARROW_HEIGHT,
      });
      await gotoSettled(page, '/');
      await page.evaluate(
        ([property, scale]) =>
          document.documentElement.style.setProperty(property, String(scale)),
        [TEXT_SCALE_PROPERTY, step / PERCENT] as const,
      );
      const band = page.getByRole('complementary', {
        name: 'Accessibility help',
      });
      const link = band.getByRole('link', { name: REPORT_LINK.label });
      await link.focus();
      const { ring, box, outline } = await link.evaluate((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const reach =
          parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const area = el.closest('aside')!.getBoundingClientRect();
        return {
          ring: { top: rect.top - reach, bottom: rect.bottom + reach },
          box: { top: area.top, bottom: area.bottom },
          outline: style.outlineStyle,
        };
      });
      expect(outline, `at ${step}% the focused link shows no ring.`).not.toBe(
        'none',
      );
      expect(
        ring.top,
        `at ${step}% the ring runs above the band.`,
      ).toBeGreaterThanOrEqual(box.top);
      expect(
        ring.bottom,
        `at ${step}% the ring runs below the band, under the header.`,
      ).toBeLessThanOrEqual(box.bottom);
    });
  }
});

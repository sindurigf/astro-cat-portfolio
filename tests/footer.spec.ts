import { expect, test } from './test';
import {
  EMAIL_LINK_NAME,
  SOCIAL_PROFILES,
  profileLinkName,
} from '../src/lib/profiles';
import { MOTTO, SITE_NAME } from '../src/lib/site';
import { NON_TEXT, PAGE_HELPERS } from './contrast';
import { gotoSettled } from './settle';

/**
 * The footer: the motto with the profiles as sticker tiles under it, the
 * pages and the policies, and a copyright line with the gold mascot in its tuft.
 * A rule engine sees none of the geometry, so what covers what is measured.
 */

const ROUTE = '/about';
const WIDTHS = [390, 820, 1440] as const;
const PHONE_WIDTH = 390;

const EXPECTED_PROFILES = [
  ...SOCIAL_PROFILES.map((profile) => ({
    name: profileLinkName(profile.label),
    href: profile.href as string,
  })),
  { name: EMAIL_LINK_NAME, href: 'mailto:' },
];

test.describe('the footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: PHONE_WIDTH, height: 900 });
    await gotoSettled(page, ROUTE);
  });

  test('every profile is a named link to the right place', async ({ page }) => {
    const links = page
      .getByRole('navigation', { name: 'Social' })
      .getByRole('link');
    await expect(links).toHaveCount(EXPECTED_PROFILES.length);

    for (const [index, profile] of EXPECTED_PROFILES.entries()) {
      const link = links.nth(index);
      // The name comes from the visually hidden label alone.
      await expect(link).toHaveAccessibleName(profile.name);
      const href = (await link.getAttribute('href')) ?? '';
      expect(
        profile.href === 'mailto:'
          ? href.startsWith('mailto:')
          : href === profile.href,
        `${profile.name} links to ${href}`,
      ).toBe(true);
    }

    await expect(
      page.locator('.footer-sticker svg:not([aria-hidden="true"])'),
    ).toHaveCount(0);
  });

  test('every sticker icon stands out from its tile', async ({ page }) => {
    const icons = (await page.evaluate(`(() => {
      ${PAGE_HELPERS}
      return [...document.querySelectorAll('.footer-sticker svg')].map((svg) => {
        const tile = compositeBackground(svg.closest('.footer-sticker'));
        const ink = parse(getComputedStyle(svg).fill);
        return {
          name: svg.closest('a').textContent.trim(),
          ratio: tile && ink ? ratio(over(ink, tile), tile) : null,
        };
      });
    })()`)) as { name: string; ratio: number | null }[];

    expect(icons.length, 'no sticker icons were found').toBe(
      EXPECTED_PROFILES.length,
    );
    for (const icon of icons) {
      expect(icon.ratio, `${icon.name} icon is unmeasurable`).not.toBeNull();
      expect(
        icon.ratio!,
        `${icon.name} icon against its tile (SC 1.4.11)`,
      ).toBeGreaterThanOrEqual(NON_TEXT);
    }
  });

  test('The motto is Latin text, not a heading', async ({ page }) => {
    const name = page.locator('footer .footer-name');
    await expect(name).toHaveText(MOTTO.text);
    await expect(name).toHaveAttribute('lang', MOTTO.lang);
    await expect(page.locator('footer').getByRole('heading')).toHaveCount(0);
  });

  test('the copyright line names the year and the site', async ({ page }) => {
    await expect(page.locator('.footer-copyright')).toHaveText(
      new RegExp(`^© \\d{4} ${RegExp.escape(SITE_NAME)}$`),
    );
  });

  // Reading order: on a phone the footer stacks in source order.
  test('the phone stack follows source order', async ({ page }) => {
    const tops = await page.evaluate(() =>
      [
        '.footer-name',
        '.footer-pages',
        '.footer-policies',
        '.footer-stickers',
        '.footer-copyright',
        '.footer-ai',
        '.footer-tuft',
      ].map(
        (selector) =>
          (document.querySelector(selector) as Element).getBoundingClientRect()
            .top,
      ),
    );
    expect(tops, 'the phone stack is out of order').toEqual(
      [...tops].sort((a, b) => a - b),
    );
  });
});

for (const width of WIDTHS) {
  test.describe(`the footer at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoSettled(page, ROUTE);
    });

    test('nothing covers a footer link', async ({ page }) => {
      const covered = await page.evaluate(() => {
        const out: string[] = [];
        for (const link of document.querySelectorAll('footer a')) {
          link.scrollIntoView({ block: 'center' });
          const box = link.getBoundingClientRect();
          const hit = document.elementFromPoint(
            box.left + box.width / 2,
            box.top + box.height / 2,
          );
          if (!hit || !link.contains(hit)) {
            out.push(
              `${link.textContent?.trim()} is under ` +
                `${hit ? hit.outerHTML.slice(0, 80) : 'nothing'}`,
            );
          }
        }
        return out;
      });
      expect(covered, 'footer links with something drawn over them').toEqual(
        [],
      );
    });

    test('the tuft is decoration and sits clear of the text', async ({
      page,
    }) => {
      const m = await page.evaluate(() => {
        const tuft = document.querySelector('.footer-tuft') as SVGElement;
        const box = tuft.getBoundingClientRect();
        const overlapping = [
          ...document.querySelectorAll('footer a, .footer-copyright'),
        ]
          .filter((el) => {
            const other = el.getBoundingClientRect();
            return !(
              other.right <= box.left ||
              other.left >= box.right ||
              other.bottom <= box.top ||
              other.top >= box.bottom
            );
          })
          .map((el) => el.textContent?.trim() || el.outerHTML.slice(0, 60));
        return {
          hidden: tuft.getAttribute('aria-hidden'),
          focusable: tuft.querySelectorAll('[tabindex], a').length,
          overlapping,
        };
      });

      expect(m.hidden, '.footer-tuft must be aria-hidden').toBe('true');
      expect(m.focusable, 'something focusable inside the tuft').toBe(0);
      expect(m.overlapping, 'text the tuft is drawn over').toEqual([]);
    });
  });
}

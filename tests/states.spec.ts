import { expect, test, type Locator, type Page } from './test';
import { gotoSettled } from './settle';
import { CONTACT_FORM_ON } from '../src/lib/contact';
import { AAA_TEXT, NON_TEXT, PAGE_HELPERS } from './contrast';
import { hoveredTextBelowAaa } from './hover-contrast';
import { DESKTOP_VIEWPORT, PHONE_VIEWPORT } from './wcag';
import {
  CATEGORY_ROUTES,
  NO_PUBLISHED_POST,
  PUBLISHED_POST_ROUTES,
  BRAND_SAMPLED_ROUTES,
} from './routes';

type Look = { paint: string; text: number | null };

/** Color, fill and shadow of the control and its hover surface, and its text against the composited ground. */
const look = async (
  page: Page,
  control: Locator,
  surface: Locator = control,
): Promise<Look> => {
  await control.evaluate((el) =>
    el.setAttribute('data-state-probe', 'control'),
  );
  await surface.evaluate((el) => el.setAttribute('data-state-surface', ''));
  const found = (await page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const el = document.querySelector('[data-state-probe]');
    const box = document.querySelector('[data-state-surface]');
    const paint = (node) => {
      const s = getComputedStyle(node);
      return [s.color, s.backgroundColor, s.boxShadow].join(' | ');
    };
    const ground = compositeBackground(el);
    const color = parse(getComputedStyle(el).color);
    return {
      paint: paint(el) + ' || ' + paint(box),
      text: ground && color ? ratio(over(color, ground), ground) : null,
    };
  })()`)) as Look;
  await page.evaluate(() => {
    document
      .querySelectorAll('[data-state-probe], [data-state-surface]')
      .forEach((el) => {
        el.removeAttribute('data-state-probe');
        el.removeAttribute('data-state-surface');
      });
  });
  return found;
};

const expectHoverReadsAndDiffers = async (
  page: Page,
  control: Locator,
  surface: Locator = control,
) => {
  await page.mouse.move(0, 0);
  const rest = await look(page, control, surface);
  await surface.hover();
  const hovered = await look(page, control, surface);
  expect(
    hovered.paint,
    'hover drew nothing: rest and hover paint alike',
  ).not.toBe(rest.paint);
  expect(
    hovered.text,
    'the hovered text has no resolvable ground',
  ).not.toBeNull();
  expect(hovered.text!, 'the hovered text contrast').toBeGreaterThanOrEqual(
    AAA_TEXT,
  );
};

const HOVERED_ON_MAIN = {
  'a linked card': async (page: Page) => {
    test.skip(
      PUBLISHED_POST_ROUTES.length < 2,
      'fewer than two published posts, so /blog has no card beside the feature',
    );
    await gotoSettled(page, '/blog/');
    // Every block's links are walked in tests/blocks.spec.ts.
    const card = page
      .locator('article.card:has(.card-link):not(.card-solid)')
      .first();
    await expect(card).toHaveCount(1);
    await expectHoverReadsAndDiffers(page, card.locator('.card-link'), card);
  },
  // The home page's one primary action sits on gold, as `.btn-gold-primary`.
  'a primary button': async (page: Page) => {
    await gotoSettled(page, CONTACT_FORM_ON ? '/contact' : '/404');
    const button = page.locator('main .btn-primary').first();
    await expect(button).toHaveCount(1);
    await expectHoverReadsAndDiffers(page, button);
  },
};

for (const scheme of ['dark', 'light'] as const) {
  test.describe(`hover is drawn and readable, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const [name, run] of Object.entries(HOVERED_ON_MAIN)) {
      test(name, async ({ page }) => run(page));
    }
  });
}

/* The header and footer stay dark in light mode, so this also covers them there; light <main> is in tests/light-mode.spec.ts. */
test.describe('dark mode reaches AAA contrast under the pointer (SC 1.4.6)', () => {
  test.use({ colorScheme: 'dark' });

  for (const route of BRAND_SAMPLED_ROUTES) {
    test(`${route}: hovered text is at least 7:1, large text included`, async ({
      page,
    }) => {
      await gotoSettled(page, route);
      expect(
        await hoveredTextBelowAaa(page, 'header, main, footer'),
        `${route}: hovered text below AAA in dark mode`,
      ).toEqual([]);
    });
  }
});

/** What marks a link without color: its underline, outline and edge. */
const shapeOf = (link: Locator): Promise<string> =>
  link.evaluate((el) => {
    const s = getComputedStyle(el);
    return [
      s.textDecorationLine,
      s.outlineStyle,
      s.borderBottomStyle,
      s.fontWeight,
    ].join(' ');
  });

const FOOTER_CURRENT = [
  ['/privacy', 'About this site'],
  ['/about', 'Site'],
] as const;

for (const scheme of ['dark', 'light'] as const) {
  test.describe(`the footer's current page, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const [route, name] of FOOTER_CURRENT) {
      test(`${route} is marked in "${name}" by more than color, and hover and focus do not copy the mark (SC 1.4.1)`, async ({
        page,
      }) => {
        await page.setViewportSize(DESKTOP_VIEWPORT);
        await gotoSettled(page, route);
        const nav = page
          .getByRole('contentinfo')
          .getByRole('navigation', { name, exact: true });
        const current = nav.locator('a[aria-current="page"]');
        await expect(current, `no current link in "${name}"`).toHaveCount(1);
        const rest = nav.locator('a:not([aria-current])').first();
        const currentShape = await shapeOf(current);
        const restShape = await shapeOf(rest);
        expect(
          currentShape,
          'the current link has the shape of any other',
        ).not.toBe(restShape);

        await rest.hover();
        expect(
          await shapeOf(rest),
          'a hovered link takes the current mark',
        ).not.toBe(currentShape);

        await current.focus();
        await page.keyboard.press('Tab');
        const focused = nav.locator('a:focus');
        await expect(
          focused,
          'Tab left the navigation or landed on the current link',
        ).not.toHaveAttribute('aria-current');
        const focusedShape = await shapeOf(focused);
        expect(focusedShape, 'focus draws nothing').not.toBe(restShape);
        expect(
          focusedShape,
          'a focused link looks like the current one',
        ).not.toBe(currentShape);
      });
    }
  });
}

for (const scheme of ['dark', 'light'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test('hover is drawn and readable on a mobile menu link', async ({
      page,
    }) => {
      await page.setViewportSize(PHONE_VIEWPORT);
      await gotoSettled(page, '/');
      await page.getByRole('button', { name: 'Menu' }).click();
      const link = page
        .getByRole('dialog', { name: 'Menu' })
        .getByRole('link', { name: 'Blog' });
      await expectHoverReadsAndDiffers(page, link);
    });

    // SC 1.4.11: the current item is told apart by its fill or its edge.
    test('the current page stands apart from its siblings and reads', async ({
      page,
    }) => {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await gotoSettled(page, '/about/');
      const found = (await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        const nav = document.querySelector('header nav[aria-label="Primary"]');
        const current = nav.querySelector('a[aria-current="page"]');
        const sibling = nav.querySelector('a:not([aria-current])');
        if (!current || !sibling) return null;
        const ground = compositeBackground(nav);
        const fill = (el) => over(parse(getComputedStyle(el).backgroundColor), ground);
        const own = fill(current);
        const style = getComputedStyle(current);
        const edge = parseFloat(style.borderTopWidth) > 0
          ? ratio(over(parse(style.borderTopColor), ground), ground)
          : 1;
        return {
          fromSibling: ratio(own, fill(sibling)),
          boundary: Math.max(ratio(own, ground), edge),
          text: ratio(over(parse(style.color), own), own),
        };
      })()`)) as {
        fromSibling: number;
        boundary: number;
        text: number;
      } | null;
      expect(
        found,
        'no current item and non-current sibling in the nav',
      ).not.toBeNull();
      expect(
        found!.fromSibling,
        'the current item is filled like its siblings',
      ).toBeGreaterThan(1);
      expect(
        found!.boundary,
        'neither the current fill nor its edge reaches 3:1 on the header',
      ).toBeGreaterThanOrEqual(NON_TEXT);
      expect(
        found!.text,
        'the current label on its fill',
      ).toBeGreaterThanOrEqual(AAA_TEXT);
    });
  });
}

/**
 * SC 1.4.11 measures a ring against what it touches: a chip's ring (offset plus
 * width) must not meet a neighbor's box plus its hard shadow.
 */
test('a focused chip ring stays clear of the chips beside it', async ({
  page,
}) => {
  test.skip(CATEGORY_ROUTES.length === 0, NO_PUBLISHED_POST);
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await gotoSettled(page, `${CATEGORY_ROUTES[0]}/`);
  const { count, overlaps } = await page.evaluate(() => {
    const chips = [...document.querySelectorAll<HTMLElement>('main a.chip')];
    const reach = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      /* One entry per shadow layer; an inset layer casts nothing outward. */
      const offsets = s.boxShadow
        .split(/,(?![^(]*\))/)
        .filter((layer) => !layer.includes('inset'))
        .map((layer) => layer.match(/(-?\d+)px (-?\d+)px 0px 0px/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => [Number(m[1]), Number(m[2])]);
      const [dx, dy] = offsets.at(-1) ?? [0, 0];
      return {
        l: r.left,
        t: r.top,
        r: r.right + Math.max(0, dx),
        b: r.bottom + Math.max(0, dy),
      };
    };
    const out: string[] = [];
    for (const chip of chips) {
      chip.focus();
      const s = getComputedStyle(chip);
      const ring = parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth);
      const r = chip.getBoundingClientRect();
      const box = {
        l: r.left - ring,
        t: r.top - ring,
        r: r.right + ring,
        b: r.bottom + ring,
      };
      for (const other of chips) {
        if (other === chip) continue;
        const o = reach(other);
        const hit = box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t;
        if (hit)
          out.push(
            `${chip.textContent?.trim()} touches ${other.textContent?.trim()}`,
          );
      }
    }
    return { count: chips.length, overlaps: out };
  });
  expect(
    count,
    'fewer than two chips, so nothing was compared',
  ).toBeGreaterThan(1);
  expect(overlaps).toEqual([]);
});

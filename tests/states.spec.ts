import { expect, test, type Locator, type Page } from './test';
import { gotoSettled } from './settle';
import { CONTACT_FORM_ON } from '../src/lib/contact';
import { AA_TEXT, NON_TEXT, PAGE_HELPERS } from './contrast';
import { DESKTOP_VIEWPORT, PHONE_VIEWPORT } from './wcag';
import {
  CATEGORY_ROUTES,
  NO_PUBLISHED_POST,
  PUBLISHED_POST_ROUTES,
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
    AA_TEXT,
  );
};

const HOVERED_ON_MAIN = {
  'a linked card': async (page: Page) => {
    test.skip(
      PUBLISHED_POST_ROUTES.length < 2,
      'fewer than two published posts, so /blog has no card beside the feature',
    );
    await gotoSettled(page, '/blog/');
    // A solid block's hover is measured in tests/solid-block.spec.ts.
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

// The dialog stays dark in light mode, so one scheme covers it.
test('hover is drawn and readable on a mobile menu link', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoSettled(page, '/');
  await page.getByRole('button', { name: 'Menu' }).click();
  const link = page
    .getByRole('dialog', { name: 'Menu' })
    .getByRole('link', { name: 'Blog' });
  await expectHoverReadsAndDiffers(page, link);
});

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
    return {
      fromSibling: ratio(own, fill(sibling)),
      fillOnGround: ratio(own, ground),
      text: ratio(over(parse(getComputedStyle(current).color), own), own),
    };
  })()`)) as {
    fromSibling: number;
    fillOnGround: number;
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
    found!.fillOnGround,
    'the current fill against the header',
  ).toBeGreaterThanOrEqual(NON_TEXT);
  expect(found!.text, 'the current label on its fill').toBeGreaterThanOrEqual(
    AA_TEXT,
  );
});

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

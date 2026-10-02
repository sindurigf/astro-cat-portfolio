import { expect, test } from './test';
import { gotoSettled } from './settle';
import { DESKTOP_VIEWPORT, NARROW_WIDTH } from './wcag';

/** PhotoViewer.astro and src/scripts/photo-viewer.ts. */

const ROUTE = '/about';
const STRIP = '#people-photos';
const ARROWS = '[data-strip-scroll]';

/** Sub-pixel layout rounding, in CSS px. */
const ROUNDING_PX = 1;

test.describe('the photo viewer', () => {
  test('a photo opens the viewer on itself, and the arrows move through its group', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const links = page.locator(`${STRIP} a[data-photo]`);
    const first = links.first();
    const alt = (await first.locator('img').getAttribute('alt')) ?? '';
    const total = await page.locator('a[data-photo="people"]').count();

    await first.click();
    const viewer = page.locator('#photo-viewer');
    await expect(viewer).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${ROUTE}/?$`));
    await expect(viewer.locator('[data-viewer-caption]')).toHaveText(alt);

    const count = viewer.locator('[data-viewer-count]');
    const before = await count.textContent();
    expect(before).toMatch(new RegExp(` of ${total}$`));

    await page.keyboard.press('ArrowRight');
    await expect(count).not.toHaveText(before ?? '');
    await viewer.getByRole('button', { name: 'Previous' }).click();
    await expect(count).toHaveText(before ?? '');
  });

  test('Escape closes it and focus returns to the photo that opened it', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const first = page.locator(`${STRIP} a[data-photo]`).first();
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#photo-viewer')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#photo-viewer')).toBeHidden();
    await expect(first).toBeFocused();
  });

  test('its Close button closes it and focus returns to the photo that opened it', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const first = page.locator(`${STRIP} a[data-photo]`).first();
    await first.click();
    const viewer = page.locator('#photo-viewer');
    await expect(viewer).toBeVisible();

    await viewer.getByRole('button', { name: 'Close' }).click();
    await expect(viewer, 'Close left the viewer open').toBeHidden();
    await expect(first).toBeFocused();
  });

  // SC 2.4.3: after stepping, the reader is at the photo shown, not the opener.
  test('closing after a step returns focus to the photo on screen', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const links = page.locator(`${STRIP} a[data-photo]`);
    await links.first().focus();
    await page.keyboard.press('Enter');
    const viewer = page.locator('#photo-viewer');
    const caption = viewer.locator('[data-viewer-caption]');
    const firstCaption = await caption.textContent();
    await page.keyboard.press('ArrowRight');
    await expect(caption).not.toHaveText(firstCaption ?? '');

    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    await expect(links.nth(1)).toBeFocused();
  });

  // SC 4.1.3: stepping announces the caption, not only "4 of 12".
  test('the caption is a polite live region', async ({ page }) => {
    await gotoSettled(page, ROUTE);
    await page.locator(`${STRIP} a[data-photo]`).first().click();
    await expect(
      page.locator('#photo-viewer [data-viewer-caption]'),
    ).toHaveAttribute('aria-live', 'polite');
  });

  test('every photo link points at an image, so it opens without JavaScript', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const hrefs = await page
      .locator('a[data-photo]')
      .evaluateAll((links) =>
        links.map((link) => (link as HTMLAnchorElement).pathname),
      );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, `${href} is not an image file`).toMatch(
        /\.(webp|jpe?g|png|avif)$/,
      );
    }
  });
});

test.describe('the photo strip', () => {
  test('its arrow buttons show with JavaScript and scroll it', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const strip = page.locator(STRIP);
    const right = page.getByRole('button', { name: 'Scroll photos right' });
    await expect(right).toBeVisible();

    const start = await strip.evaluate((el) => el.scrollLeft);
    await right.click();
    await expect
      .poll(() => strip.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(start);
  });

  test('under reduced motion an arrow moves the strip at once, not smoothly', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoSettled(page, ROUTE);
    const moved = await page
      .getByRole('button', { name: 'Scroll photos right' })
      .evaluate((button) => {
        const strip = document.getElementById(
          button.getAttribute('aria-controls') ?? '',
        )!;
        const start = strip.scrollLeft;
        (button as HTMLButtonElement).click();
        return strip.scrollLeft - start;
      });
    expect(moved, 'the strip animates under reduced motion').toBeGreaterThan(0);
  });

  test('an arrow that cannot scroll further says it is unavailable', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const strip = page.locator(STRIP);
    const left = page.getByRole('button', { name: 'Scroll photos left' });
    const right = page.getByRole('button', { name: 'Scroll photos right' });
    await expect(left).toHaveAttribute('aria-disabled', 'true');
    await expect(right).toHaveAttribute('aria-disabled', 'false');

    await strip.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect(right).toHaveAttribute('aria-disabled', 'true');
    await expect(left).toHaveAttribute('aria-disabled', 'false');
  });

  // SC 2.4.7: at 1280px several photos take keyboard focus part outside the strip.
  test('a photo reached by Tab shows its whole focus ring', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoSettled(page, ROUTE);
    const strip = page.locator(STRIP);
    const links = strip.locator('a[data-photo]');
    const total = await links.count();
    await links.first().focus();

    const clipped: string[] = [];
    for (let i = 0; i < total; i += 1) {
      if (i > 0) await page.keyboard.press('Tab');
      await expect(links.nth(i)).toBeFocused();
      await page.waitForFunction(() => {
        const s = document.querySelector('.photo-strip')!;
        const at = s.scrollLeft;
        return new Promise((done) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => done(s.scrollLeft === at)),
          ),
        );
      });
      const overshoot = await links.nth(i).evaluate((link) => {
        const style = getComputedStyle(link);
        const ring =
          parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const box = link.getBoundingClientRect();
        const view = link.closest('.photo-strip')!.getBoundingClientRect();
        return Math.max(
          view.left - (box.left - ring),
          box.right + ring - view.right,
        );
      });
      if (overshoot > ROUNDING_PX)
        clipped.push(`photo ${i + 1}: ${overshoot}px`);
    }
    expect(clipped, 'focus rings cut off by the strip edge').toEqual([]);
  });

  // SC 2.1.1 and 2.4.11: no tab stop that scrolls nothing.
  // One photo always fits: `.strip-photo` caps it to the strip.
  test('a strip that fits on load shows no arrows and keeps them out of the tab order', async ({
    page,
  }) => {
    await page.route(`**${ROUTE}`, async (route) => {
      const html = await (await route.fetch()).text();
      const open = html.indexOf('<ul id="people-photos"');
      const close = html.indexOf('</ul>', open);
      const [head, first] = html.slice(open, close).split('<li>');
      await route.fulfill({
        contentType: 'text/html',
        body: `${html.slice(0, open)}${head}<li>${first}${html.slice(close)}`,
      });
    });
    await gotoSettled(page, ROUTE);

    const strip = page.locator(STRIP);
    await expect(strip.locator('li'), 'the route kept one photo').toHaveCount(
      1,
    );
    await expect(page.locator(ARROWS)).toHaveCount(2);
    for (const arrow of await page.locator(ARROWS).all()) {
      await expect(arrow, 'an arrow shows on a strip that fits').toBeHidden();
    }

    await strip.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(
      page.locator(`${ARROWS}:focus`),
      'Shift+Tab reached a hidden arrow',
    ).toHaveCount(0);
  });

  test('arrows hide when a resize makes the strip fit, and focus on one moves to the strip', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoSettled(page, ROUTE);
    const strip = page.locator(STRIP);
    const right = page.getByRole('button', { name: 'Scroll photos right' });
    await expect(right).toBeVisible();
    await right.focus();

    await strip.evaluate((el) => {
      while (el.children.length > 1) el.lastElementChild!.remove();
    });
    await page.setViewportSize({ ...DESKTOP_VIEWPORT, width: NARROW_WIDTH });
    for (const arrow of await page.locator(ARROWS).all()) {
      await expect(arrow, 'an arrow stays on a strip that fits').toBeHidden();
    }
    await expect(strip, 'focus on a hidden arrow is lost').toBeFocused();
  });

  test('without JavaScript the arrow buttons stay hidden', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(ROUTE);
      // Present first, so a renamed button cannot make "hidden" pass on nothing.
      const arrow = page.getByRole('button', {
        name: 'Scroll photos right',
        includeHidden: true,
      });
      await expect(arrow).toHaveCount(1);
      await expect(arrow).toBeHidden();
    } finally {
      await context.close();
    }
  });
});

/** What is announced must match what is painted. Only the photo request is held, via `page.route`. */
test.describe('the photo viewer while a photo loads', () => {
  const PHOTO = '**/_astro/*.webp';
  /* A full-size photo can take over 5s in Firefox under load, past the default timeout. */
  const ARRIVAL_MS = 15_000;

  /* Waits for the opening photo to be painted: a key pressed while it decodes makes the viewer drop it. */
  const openFirst = async (page: import('@playwright/test').Page) => {
    await gotoSettled(page, ROUTE);
    const viewer = page.locator('#photo-viewer');
    await page.locator(`${STRIP} a[data-photo]`).first().click();
    await expect(viewer).toBeVisible();
    await page.waitForFunction(() => {
      const image =
        document.querySelector<HTMLImageElement>('#photo-viewer img');
      return !!image && image.complete && image.naturalWidth > 0;
    });
    await expect(viewer.locator('[data-viewer-count]')).not.toHaveText(
      /loading|^$/i,
    );
    return viewer;
  };

  /* The next photo's request is held on a promise, so its arrival is under the test's control. */
  test('the count never names a photo that is not on screen yet', async ({
    page,
  }) => {
    const viewer = await openFirst(page);
    const count = viewer.locator('[data-viewer-count]');
    const caption = viewer.locator('[data-viewer-caption]');
    const shownSrc = () =>
      page.evaluate(
        () =>
          document.querySelector<HTMLImageElement>('#photo-viewer img')?.src ??
          '',
      );

    const before = {
      count: await count.textContent(),
      caption: await caption.textContent(),
      src: await shownSrc(),
    };

    const next = await page.evaluate(() => {
      const group = [
        ...document.querySelectorAll<HTMLAnchorElement>(
          'a[data-photo="people"]',
        ),
      ];
      const opener = document.querySelector<HTMLAnchorElement>(
        '#people-photos a[data-photo]',
      );
      const at = (group.indexOf(opener!) + 1) % group.length;
      return {
        href: group[at].href,
        position: `${at + 1} of ${group.length}`,
      };
    });

    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = () => {};
    const arrived = new Promise<void>((resolve) => {
      requested = resolve;
    });
    await page.route(next.href, async (route) => {
      requested();
      await held;
      await route.continue();
    });

    /* Records every text the live region is given: an overwritten one is still announced. */
    await page.evaluate(() => {
      const region = document.querySelector('[data-viewer-count]')!;
      const heard: string[] = [];
      (window as unknown as { heard: string[] }).heard = heard;
      new MutationObserver(() => heard.push(region.textContent ?? '')).observe(
        region,
        { childList: true, characterData: true, subtree: true },
      );
    });
    const heard = () =>
      page.evaluate(() => (window as unknown as { heard: string[] }).heard);

    try {
      await page.keyboard.press('ArrowRight');
      await arrived;

      /* "Loading" also proves the hold outlasted LOADING_DELAY_MS. */
      await expect(count).toHaveText(/loading/i);
      expect(
        await heard(),
        'the count announced the next position before its photo was on screen.',
      ).not.toContain(next.position);
      expect(
        await shownSrc(),
        'the image switched before the next photo had arrived',
      ).toBe(before.src);
      expect(
        await caption.textContent(),
        'the caption moved to the next description before its photo arrived',
      ).toBe(before.caption);
    } finally {
      release();
    }

    // Released, everything moves together: the photo, its position, its words.
    await expect(count).toHaveText(next.position, { timeout: ARRIVAL_MS });
    expect(await shownSrc()).toBe(next.href);
    expect(await caption.textContent()).not.toBe(before.caption);
    expect(before.count).not.toBe(next.position);
  });

  test('a slow photo says it is loading rather than going quiet', async ({
    page,
  }) => {
    const viewer = await openFirst(page);
    const caption = viewer.locator('[data-viewer-caption]');
    const count = viewer.locator('[data-viewer-count]');
    const opening = await caption.textContent();
    expect(opening, 'the opening photo has no caption to keep').toBeTruthy();

    /* Held, not delayed by a timer: a timer lets the polls pass once the photo arrives. */
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(PHOTO, async (route) => {
      await held;
      await route.continue();
    });

    try {
      await page.keyboard.press('ArrowRight');

      await expect(count).toHaveText(/loading/i);
      await expect(viewer.locator('[data-viewer-figure]')).toHaveAttribute(
        'data-state',
        'loading',
      );

      /* The previous photo and its caption stay up together while the next one loads. */
      await expect(viewer.locator('img').first()).toBeVisible();
      expect(
        await caption.textContent(),
        "the opening photo's caption went while the next photo was held",
      ).toBe(opening);
    } finally {
      release();
    }

    // And it stops saying so once the photo is there.
    await expect(count).not.toHaveText(/loading/i, { timeout: ARRIVAL_MS });
  });

  /* Read from the accessibility tree: a duplicate announcement is invisible in the markup. */
  test('the description reaches the accessibility tree once', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const opener = page.locator(`${STRIP} a[data-photo]`).first();
    const alt = (await opener.locator('img').getAttribute('alt')) ?? '';
    expect(
      alt.length,
      'the opening photo has no alt to duplicate',
    ).toBeGreaterThan(0);

    await opener.click();
    const viewer = page.locator('#photo-viewer');
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('[data-viewer-caption]')).toHaveText(alt);

    const tree = await viewer.ariaSnapshot();

    expect(
      tree.split(alt).length - 1,
      "the photo's description is in the dialog's accessibility tree more than once.",
    ).toBe(1);
    await expect(
      viewer.getByRole('img', { name: alt }),
      'the viewer image repeats the description the caption already shows.',
    ).toHaveCount(0);
  });

  test('a photo that never arrives says so, and keeps its description', async ({
    page,
  }) => {
    const viewer = await openFirst(page);

    /* From the group the script walks: the strip is in a different order. */
    const alt = await page.evaluate(() => {
      const group = [
        ...document.querySelectorAll<HTMLAnchorElement>(
          'a[data-photo="people"]',
        ),
      ];
      const opener = document.querySelector<HTMLAnchorElement>(
        '#people-photos a[data-photo]',
      );
      const next = group[(group.indexOf(opener!) + 1) % group.length];
      return next.querySelector('img')?.alt ?? '';
    });

    await page.route(PHOTO, (route) => route.abort());
    await page.keyboard.press('ArrowRight');

    await expect(viewer.locator('[data-viewer-figure]')).toHaveAttribute(
      'data-state',
      'failed',
    );
    await expect(viewer.locator('[data-viewer-count]')).toHaveText(
      /could not be loaded/i,
    );
    // The description survives the failure: the words still say what is missing.
    await expect(viewer.locator('[data-viewer-caption]')).toHaveText(alt ?? '');
  });
});

/* On desktop the box is shorter than most portraits; `max-h-full` needs the figure's one-track grid. */
const VIEWER_SIZES = [DESKTOP_VIEWPORT, { width: 1440, height: 900 }] as const;

/** How far the drawn shape may drift from the file's, in ratio. */
const SHAPE_TOLERANCE = 0.01;

for (const viewport of VIEWER_SIZES) {
  test(`every photo fits the viewer whole at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await gotoSettled(page, ROUTE);
    const links = page.locator('a[data-photo]');
    const total = await links.count();
    expect(total, 'no photos to open on /about').toBeGreaterThan(0);

    const problems: string[] = [];
    for (let i = 0; i < total; i += 1) {
      const link = links.nth(i);
      const href = (await link.getAttribute('href')) ?? '';
      await link.scrollIntoViewIfNeeded();
      await link.click();
      const viewer = page.locator('#photo-viewer');
      await expect(viewer).toBeVisible();
      await page.waitForFunction((want) => {
        const img = document.querySelector<HTMLImageElement>(
          '.photo-viewer-figure img',
        );
        return (
          !!img &&
          img.complete &&
          img.naturalWidth > 0 &&
          img.src.endsWith(want)
        );
      }, href);

      const found = await page.evaluate((rounding) => {
        const img = document.querySelector<HTMLImageElement>(
          '.photo-viewer-figure img',
        )!;
        const box = document
          .querySelector('.photo-viewer-figure')!
          .getBoundingClientRect();
        const r = img.getBoundingClientRect();
        return {
          fits:
            r.width <= box.width + rounding &&
            r.height <= box.height + rounding,
          drawn: r.width / r.height,
          file: img.naturalWidth / img.naturalHeight,
          size: `${Math.round(r.width)}x${Math.round(r.height)} in ${Math.round(box.width)}x${Math.round(box.height)}`,
        };
      }, ROUNDING_PX);
      if (!found.fits) problems.push(`${href}: drawn ${found.size}`);
      if (Math.abs(found.drawn / found.file - 1) > SHAPE_TOLERANCE) {
        problems.push(`${href}: drawn at a different shape from the file`);
      }
      await page.keyboard.press('Escape');
      await expect(viewer).toBeHidden();
    }
    expect(problems, 'photos the viewer crops').toEqual([]);
  });
}

import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES } from './routes';
import { GLOBAL_CSS, cssColorToken } from './source';
import { REFLOW_VIEWPORT } from './wcag';
import { tabWalk } from './tab-walk';

/**
 * `forced-colors: active` drops box-shadow, so a control bounded only by `shadow-hard-*`
 * loses its edges. `test.use({ forcedColors })` is a no-op on @playwright/test 1.62.1: use `emulateMedia`.
 */
interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Read from the stylesheet so the guard tracks `--color-text` as it is now. */
const authoredText = (): Rgb => {
  const hex = cssColorToken('--color-text');
  expect(hex, '--color-text should be a six-digit hex').toMatch(
    /^#[0-9a-f]{6}$/,
  );
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
};

/** `rgb(229, 226, 225)` or `rgba(...)`, as numbers. */
const parseRgb = (value: string): Rgb | null => {
  const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(value);
  return match
    ? {
        r: Math.round(Number(match[1])),
        g: Math.round(Number(match[2])),
        b: Math.round(Number(match[3])),
      }
    : null;
};

/* Far above /'s stop count; reaching it fails the walk as a focus trap. */
const MAX_FOCUS_STOPS = 200;
/* / has the header, the hero's controls and the footer; well under its count. */
const MIN_FOCUS_STOPS = 10;

/** Controls that carry no user-agent affordance of their own in this mode. */
const NON_LINK_CONTROLS =
  'button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]):not(a)';

const emulateForcedColours = async (
  page: Page,
): Promise<{ matches: boolean; body: string }> => {
  await page.emulateMedia({ forcedColors: 'active' });

  return page.evaluate(() => ({
    matches: matchMedia('(forced-colors: active)').matches,
    body: getComputedStyle(document.body).color,
  }));
};

/** Checks the query matches and body text left `--color-text`: an engine can match yet paint the author palette. */
const forceColours = async (page: Page, route: string): Promise<void> => {
  const state = await emulateForcedColours(page);

  expect(
    state.matches,
    `forced-colors is not active on ${route}; use emulateMedia, not test.use({ forcedColors }).`,
  ).toBe(true);

  const painted = parseRgb(state.body);
  expect(
    painted,
    `${route}: could not parse the body colour ${JSON.stringify(state.body)}.`,
  ).not.toBeNull();

  expect(
    painted,
    `${route} matches forced-colors but <body> still computes --color-text from ${GLOBAL_CSS} (${state.body}).`,
  ).not.toEqual(authoredText());
};

type Unbounded = { tag: string; text: string; display: string };

interface BoundaryWalk {
  unbounded: Unbounded[];
  /** Painted controls the walk judged, so an empty selector match fails. */
  walked: number;
}

const withoutABoundary = (page: Page): Promise<BoundaryWalk> =>
  page.evaluate((selector) => {
    /* Zero alpha only: opaque rgb(0, 0, 0) is CanvasText, a real border. */
    const transparent = (colour: string) =>
      colour === 'transparent' || /^rgba\(.*,\s*0\)$/.test(colour);

    const out: Unbounded[] = [];
    let walked = 0;
    for (const element of document.querySelectorAll(selector)) {
      const style = getComputedStyle(element);

      /* Not rendered, here or by an ancestor (the honeypot); opacity 0 still counts. */
      if (element.getClientRects().length === 0) continue;
      walked += 1;

      const sides = ['Top', 'Right', 'Bottom', 'Left'] as const;

      const hasBorder = sides.some((side) => {
        const width = parseFloat(
          style.getPropertyValue(`border-${side.toLowerCase()}-width`),
        );
        const colour = style.getPropertyValue(
          `border-${side.toLowerCase()}-color`,
        );
        return width > 0 && !transparent(colour);
      });
      const hasFill = !transparent(style.backgroundColor);

      /* box-shadow paints nothing in this mode, so it is not a boundary. */
      if (hasBorder || hasFill) continue;

      out.push({
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? '').trim().slice(0, 40),
        display: style.display,
      });
    }
    return { unbounded: out, walked };
  }, NON_LINK_CONTROLS) as Promise<BoundaryWalk>;

const listUnbounded = (unbounded: Unbounded[]): string =>
  unbounded
    .map((c) => `  <${c.tag} display:${c.display}> ${JSON.stringify(c.text)}`)
    .join('\n');

const optedOutElements = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((element) => {
        const value = getComputedStyle(element).forcedColorAdjust;
        return Boolean(value) && value !== 'auto';
      })
      .map(
        (element) =>
          `<${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}">`,
      )
      .slice(0, 10),
  );

const contentLinkColours = (page: Page) =>
  page.evaluate(() => {
    /* Not a selector list: 'main a[href], a[href]' resolves in document order. */
    const link = document.querySelector('main a[href]');
    return {
      body: getComputedStyle(document.body).color,
      link: link ? getComputedStyle(link).color : null,
      /* innerText: minified contact cards have no whitespace between parts. */
      text: link
        ? ((link as HTMLElement).innerText || link.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 60)
        : null,
    };
  });

/** Pins which engines force colours, so the webkit skip below cannot hide a regression elsewhere. */
test('every engine that can force colours still does, and webkit still cannot', async ({
  page,
  browserName,
}) => {
  await gotoSettled(page, '/');
  const state = await emulateForcedColours(page);

  expect(
    state.matches,
    `${browserName} does not match (forced-colors: active), so the emulation is not reaching the page.`,
  ).toBe(true);

  const painted = parseRgb(state.body);
  expect(
    painted,
    `${browserName}: could not read a colour out of ${JSON.stringify(state.body)}.`,
  ).not.toBeNull();

  if (browserName === 'webkit') {
    expect(
      painted,
      `webkit now forces colours (<body> computes ${state.body}); delete the webkit skip below.`,
    ).toEqual(authoredText());
    return;
  }

  expect(
    painted,
    `${browserName} stopped forcing colours: <body> computes --color-text from ${GLOBAL_CSS} (${state.body}).`,
  ).not.toEqual(authoredText());
});

test.describe('forced colours', () => {
  // WebKit matches (forced-colors: active) yet paints `--color-text`. Skipped by
  // engine name, not capability, so a chromium or firefox regression still fails.
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'webkit reports forced-colors as active but paints the author palette; see the note above',
  );

  for (const route of SAMPLED_ROUTES) {
    test(`${route} holds up in forced colours`, async ({ page }) => {
      await gotoSettled(page, route);
      await forceColours(page, route);

      const optedOut = await optedOutElements(page);
      expect(
        optedOut,
        `${route} has element(s) with forced-color-adjust other than auto.`,
      ).toEqual([]);

      const { unbounded, walked } = await withoutABoundary(page);
      expect(
        walked,
        `${route} has no painted non-link control to judge.`,
      ).toBeGreaterThan(0);
      expect(
        unbounded,
        `${route} has non-link control(s) with no border or opaque fill in forced colours:\n` +
          listUnbounded(unbounded),
      ).toEqual([]);

      const colours = await contentLinkColours(page);

      expect(
        colours.link,
        `${route} has no link inside <main> to measure.`,
      ).not.toBeNull();

      expect(
        colours.link,
        `${route} paints link ${JSON.stringify(colours.text)} the same colour as body text (${colours.body}).`,
      ).not.toBe(colours.body);
    });
  }

  // Every stop: box-shadow paints nothing here, so a shadow ring disappears.
  test('the focus indicator survives forced colours', async ({ page }) => {
    await gotoSettled(page, '/');
    await forceColours(page, '/');

    await page.keyboard.press('Tab');
    const stops = await tabWalk(
      page,
      () =>
        page.evaluate(() => {
          const element = document.activeElement!;
          const style = getComputedStyle(element);
          return {
            name: `${element.tagName.toLowerCase()} ${(element.textContent ?? '').trim().slice(0, 40)}`,
            width: parseFloat(style.outlineWidth),
            style: style.outlineStyle,
          };
        }),
      { max: MAX_FOCUS_STOPS },
    );

    expect(
      stops.length,
      'the walk reached almost nothing on /.',
    ).toBeGreaterThan(MIN_FOCUS_STOPS);
    expect(
      stops
        .filter((stop) => !(stop.width > 0 && stop.style !== 'none'))
        .map((stop) => stop.name),
      'focus stop(s) with no outline in forced colours (SC 2.4.7).',
    ).toEqual([]);
  });

  test('the mobile menu holds up in forced colours at 320px', async ({
    page,
  }) => {
    await page.setViewportSize(REFLOW_VIEWPORT);
    await gotoSettled(page, '/');
    await forceColours(page, '/ (menu open)');

    const trigger = page.getByRole('button', { name: /menu/i });
    await trigger.click();
    await expect(
      page.getByRole('dialog'),
      'the panel must be open, or this is the closed-state check again',
    ).toBeVisible();

    const { unbounded, walked } = await withoutABoundary(page);
    expect(
      walked,
      'the open mobile menu has no painted non-link control to judge.',
    ).toBeGreaterThan(0);
    expect(
      unbounded,
      `the open mobile menu has non-link control(s) with no boundary in ` +
        `forced colours:\n` +
        listUnbounded(unbounded),
    ).toEqual([]);
  });
});

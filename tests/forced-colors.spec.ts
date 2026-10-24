import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES } from './routes';
import { GLOBAL_CSS, cssColorToken } from './source';
import { DESKTOP_VIEWPORT, REFLOW_VIEWPORT } from './wcag';
import { PAGE_HELPERS } from './contrast';
import { tabWalk } from './tab-walk';

/**
 * `forced-colors: active` drops box-shadow, so a control bounded only by `shadow-hard-*`
 * loses its edges.
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

const emulateForcedColors = async (
  page: Page,
): Promise<{ matches: boolean; body: string }> => {
  await page.emulateMedia({ forcedColors: 'active' });

  return page.evaluate(() => ({
    matches: matchMedia('(forced-colors: active)').matches,
    body: getComputedStyle(document.body).color,
  }));
};

/** Checks the query matches and body text left `--color-text`: an engine can match yet paint the author palette. */
const forceColors = async (page: Page, route: string): Promise<void> => {
  const state = await emulateForcedColors(page);

  expect(state.matches, `forced-colors is not active on ${route}.`).toBe(true);

  const painted = parseRgb(state.body);
  expect(
    painted,
    `${route}: could not parse the body color ${JSON.stringify(state.body)}.`,
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
    const transparent = (color: string) =>
      color === 'transparent' || /^rgba\(.*,\s*0\)$/.test(color);

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
        const color = style.getPropertyValue(
          `border-${side.toLowerCase()}-color`,
        );
        return width > 0 && !transparent(color);
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

/*
 * Only a named /brand color swatch keeps its colors: the color is its content
 * (https://blogs.windows.com/msedgedev/2020/09/17/styling-for-windows-high-contrast-with-new-standards-for-forced-colors/).
 */
const KEEPS_ITS_COLORS = '.role-token > .role-swatch';

const optedOutElements = (page: Page): Promise<string[]> =>
  page.evaluate(
    (keeps) =>
      [...document.querySelectorAll('*')]
        .filter((element) => {
          if (element.matches(keeps)) return false;
          const value = getComputedStyle(element).forcedColorAdjust;
          return Boolean(value) && value !== 'auto';
        })
        .map(
          (element) =>
            `<${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}">`,
        )
        .slice(0, 10),
    KEEPS_ITS_COLORS,
  );

const contentLinkColors = (page: Page) =>
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

/** Pins which engines force colors, so the webkit skip below cannot hide a regression elsewhere. */
test('every engine that can force colors still does, and webkit still cannot', async ({
  page,
  browserName,
}) => {
  await gotoSettled(page, '/');
  const state = await emulateForcedColors(page);

  expect(
    state.matches,
    `${browserName} does not match (forced-colors: active), so the emulation is not reaching the page.`,
  ).toBe(true);

  const painted = parseRgb(state.body);
  expect(
    painted,
    `${browserName}: could not read a color out of ${JSON.stringify(state.body)}.`,
  ).not.toBeNull();

  if (browserName === 'webkit') {
    expect(
      painted,
      `webkit now forces colors (<body> computes ${state.body}); delete the webkit skip below.`,
    ).toEqual(authoredText());
    return;
  }

  expect(
    painted,
    `${browserName} stopped forcing colors: <body> computes --color-text from ${GLOBAL_CSS} (${state.body}).`,
  ).not.toEqual(authoredText());
});

/**
 * What still paints in forced colors and could say "current": the ground the
 * link ends up on, its border and its underline. Shadows are dropped there.
 */
const paintedMark = (page: Page, selector: string): Promise<string> =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const link = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((candidate) => candidate.getClientRects().length > 0);
    if (!link) throw new Error('no visible link matches ' + ${JSON.stringify(selector)});
    const style = getComputedStyle(link);
    const ground = effectiveBackground(link);
    return [
      ground ? JSON.stringify(ground) : 'unresolved ground',
      style.borderTopStyle, style.borderTopWidth, style.borderTopColor,
      style.textDecorationLine, style.textDecorationThickness,
    ].join(' ');
  })()`) as Promise<string>;

/* Each pair is one control as the current page and as any other. */
const CURRENT_MARKS = [
  {
    name: 'the header nav',
    viewport: DESKTOP_VIEWPORT,
    current: ['/about', 'header nav[aria-label="Primary"] a[aria-current]'],
    rest: ['/about', 'header nav[aria-label="Primary"] a:not([aria-current])'],
  },
  {
    name: 'the header call to action',
    viewport: DESKTOP_VIEWPORT,
    current: ['/contact', 'header .nav-cta[aria-current]'],
    rest: ['/about', 'header .nav-cta:not([aria-current])'],
  },
  {
    name: 'the mobile menu',
    viewport: REFLOW_VIEWPORT,
    menu: true,
    current: ['/about', 'dialog nav li a[aria-current]'],
    rest: ['/about', 'dialog nav li a:not([aria-current])'],
  },
  {
    name: 'the blog filter',
    viewport: DESKTOP_VIEWPORT,
    current: ['/blog', 'a.chip[aria-current]'],
    rest: ['/blog', 'a.chip:not([aria-current])'],
  },
] as const;

test.describe('forced colors', () => {
  // WebKit matches (forced-colors: active) yet paints `--color-text`: it ships the
  // media query only (https://bugs.webkit.org/show_bug.cgi?id=225281). Skipped by
  // engine name, not capability, so a chromium or firefox regression still fails.
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'webkit reports forced-colors as active but paints the author palette; see the note above',
  );

  for (const route of SAMPLED_ROUTES) {
    test(`${route} holds up in forced colors`, async ({ page }) => {
      await gotoSettled(page, route);
      await forceColors(page, route);

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
        `${route} has non-link control(s) with no border or opaque fill in forced colors:\n` +
          listUnbounded(unbounded),
      ).toEqual([]);

      const colors = await contentLinkColors(page);

      expect(
        colors.link,
        `${route} has no link inside <main> to measure.`,
      ).not.toBeNull();

      expect(
        colors.link,
        `${route} paints link ${JSON.stringify(colors.text)} the same color as body text (${colors.body}).`,
      ).not.toBe(colors.body);
    });
  }

  // A filter survives forced colors, so the logo's pink offset would paint in the system palette.
  test('the logo casts no offset in forced colors, at rest or hovered', async ({
    page,
  }) => {
    await gotoSettled(page, '/blog/');
    await forceColors(page, '/blog/');
    const tile = page.locator('header .logo-tile');
    const settled = () =>
      tile.evaluate((el) =>
        Promise.all(el.getAnimations().map((a) => a.finished)).then(() => true),
      );
    // Forcing colors after load starts the filter's own transition.
    await settled();
    expect(await tile.evaluate((el) => getComputedStyle(el).filter)).toBe(
      'none',
    );
    await page.locator('header .logo-link').hover();
    await settled();
    expect(
      await tile.evaluate((el) => getComputedStyle(el).filter),
      'the hovered logo paints its offset in forced colors',
    ).toBe('none');
  });

  test('/brand color swatches keep their colors in forced colors, edged in CanvasText, each named beside it (SC 1.4.1, 1.4.11)', async ({
    page,
  }) => {
    await gotoSettled(page, '/brand');
    const paints = () =>
      page.locator(KEEPS_ITS_COLORS).evaluateAll((swatches) =>
        swatches.map((swatch) => {
          const style = getComputedStyle(swatch);
          /* A fill swatch has no text, so its inherited color is not part of it. */
          return swatch instanceof HTMLElement &&
            swatch.dataset.paint === 'glyph'
            ? [style.color, style.backgroundColor]
            : [style.backgroundColor];
        }),
      );
    const authored = await paints();
    expect(authored.length, '/brand shows no color swatch').toBeGreaterThan(0);
    await forceColors(page, '/brand');
    expect(
      await paints(),
      'a /brand swatch lost its color in forced colors',
    ).toEqual(authored);
    const edges = await page
      .locator(KEEPS_ITS_COLORS)
      .evaluateAll((swatches) => {
        const probe = document.createElement('span');
        probe.style.color = 'CanvasText';
        document.body.append(probe);
        const canvasText = getComputedStyle(probe).color;
        probe.remove();
        return swatches.map((swatch) => {
          const row = swatch.closest('.role-token');
          const name = row?.querySelector('code')?.textContent?.trim() ?? '';
          const named = row?.querySelector('code')?.checkVisibility() ?? false;
          return {
            edge: getComputedStyle(swatch).borderTopColor === canvasText,
            named: name !== '' && named,
            token: name || swatch.className,
          };
        });
      });
    expect(
      edges.filter((s) => !s.edge).map((s) => s.token),
      'a /brand swatch has no CanvasText edge in forced colors',
    ).toEqual([]);
    expect(
      edges.filter((s) => !s.named).map((s) => s.token),
      'a /brand swatch has no visible token name beside it',
    ).toEqual([]);
  });

  // Every stop: box-shadow paints nothing here, so a shadow ring disappears.
  test('the focus indicator survives forced colors', async ({ page }) => {
    await gotoSettled(page, '/');
    await forceColors(page, '/');

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
      'focus stop(s) with no outline in forced colors (SC 2.4.7).',
    ).toEqual([]);
  });

  test('the menu button bars differ from the button face in forced colors', async ({
    page,
  }) => {
    await page.setViewportSize(REFLOW_VIEWPORT);
    await gotoSettled(page, '/');
    await forceColors(page, '/ (menu closed)');

    const { face, bars } = await page.evaluate(() => {
      const trigger = document.querySelector('[data-menu-trigger]')!;
      return {
        face: getComputedStyle(trigger).backgroundColor,
        bars: [...trigger.querySelectorAll('span > span')].map(
          (bar) => getComputedStyle(bar).backgroundColor,
        ),
      };
    });
    expect(
      bars.length,
      'the menu button has no bars to judge.',
    ).toBeGreaterThan(0);
    expect(
      bars.filter((bar) => bar === face),
      'bar(s) painted the button face color, so the icon vanishes (SC 1.4.11).',
    ).toEqual([]);
  });

  test('the mobile menu holds up in forced colors at 320px', async ({
    page,
  }) => {
    await page.setViewportSize(REFLOW_VIEWPORT);
    await gotoSettled(page, '/');
    await forceColors(page, '/ (menu open)');

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
        `forced colors:\n` +
        listUnbounded(unbounded),
    ).toEqual([]);
  });

  for (const { name, viewport, current, rest, ...options } of CURRENT_MARKS) {
    test(`${name} marks the current page with more than a dropped fill or shadow`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const markOf = async ([route, selector]: readonly [string, string]) => {
        await gotoSettled(page, route);
        await forceColors(page, route);
        if ('menu' in options) {
          await page.getByRole('button', { name: /menu/i }).click();
          await expect(page.getByRole('dialog')).toBeVisible();
        }
        return paintedMark(page, selector);
      };

      expect(
        await markOf(current),
        `${name}: the current link paints like any other in forced colors.`,
      ).not.toBe(await markOf(rest));
    });
  }
});

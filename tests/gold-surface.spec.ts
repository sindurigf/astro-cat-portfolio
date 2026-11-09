import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { AAA_TEXT, NON_TEXT, PAGE_HELPERS } from './contrast';
import { goldRoutesFromBuild, ROUTES } from './routes';
import { cssColorToken } from './source';
import { NARROW_WIDTH, PHONE_VIEWPORT } from './wcag';

/*
 * Text and controls on the slab are measured in the rendered page, where a
 * utility may override the slab's remap. The token ratios are in the generated
 * table (scripts/contrast-table.mjs, tests/contrast-table.spec.ts).
 */
const GOLD = cssColorToken('--color-block-gold');

/** A control whose opaque fill, or its only boundary, its border, matches the ground behind it. */
type InvisibleControl = { selector: string; detail: string; label: string };

const invisibleControlMessage = (found: InvisibleControl[]) =>
  `controls on .surface-gold with no edge (fill equal to the ground, or border ` +
  `under ${NON_TEXT}:1, SC 1.4.11; "undecidable" was not measured):\n` +
  found.map((e) => `  ${e.selector}: ${e.detail}: "${e.label}"`).join('\n');

/** The route whose real gold button the in-situ ring check focuses. */
const GOLD_ROUTE = '/contact';

/** Every element under `root` whose own text sits directly on a gold background. */
const TEXT_ON_GOLD_IN = `
  // Closed <details> content can be shown, so it is measured open.
  for (const details of document.querySelectorAll('details:not([open])')) details.open = true;
  // A boxless element has no ground; the resolver would read <body> at its 0,0 rect.
  const groundOf = (element) =>
    element.getClientRects().length === 0 ? null : effectiveBackground(element);
  const textOnGoldIn = (root) => {
    const out = [];
    for (const element of root.querySelectorAll('*')) {
      if (!hasOwnText(element)) continue;
      const background = groundOf(element);
      if (!isGold(background)) continue;
      const color = parse(getComputedStyle(element).color);
      // An unreadable color syntax is reported as 0:1, never skipped.
      out.push({
        skipLink: element.closest('.skip-link') !== null,
        inMenu: element.closest('#mobile-menu-panel') !== null,
        selector: describe(element),
        color: getComputedStyle(element).color,
        ratio: color ? Number(ratio(color, background).toFixed(2)) : 0,
        text: (element.textContent ?? '').trim().slice(0, 40),
      });
    }
    return out;
  };
`;

type TextOnGold = {
  skipLink: boolean;
  inMenu: boolean;
  selector: string;
  color: string;
  ratio: number;
  text: string;
};

/** Every element whose own text sits directly on a gold background. */
const textOnGold = (page: Page) =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    ${TEXT_ON_GOLD_IN}
    return textOnGoldIn(document);
  })()`) as Promise<TextOnGold[]>;

type GoldWalk = {
  section: boolean;
  controls: number;
  textInside: number;
  invisible: InvisibleControl[];
};

/**
 * `.btn-primary` on the slab is a 1.00:1 fill whose label still passes at 16.32, so no text
 * rule (nor AccessLint at AAA) sees it. Walks every slab section on the route.
 */
const walkGoldSections = (page: Page) =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    ${TEXT_ON_GOLD_IN}
    const sections = [...document.querySelectorAll('.surface-gold')];
    if (sections.length === 0) {
      return { section: false, controls: 0, textInside: 0, invisible: [] };
    }
    return {
      section: true,
      textInside: sections.flatMap((node) => textOnGoldIn(node)).length,
      controls: sections.reduce(
        (total, node) =>
          total + node.querySelectorAll('a, button, [role="button"]').length,
        0,
      ),
      invisible: sections.flatMap((node) => invisibleControls(node)),
    };
  })()`) as Promise<GoldWalk>;

/*
 * Every gold section has controls and text for the walks to measure, so a page
 * that loses its section or a resolver that stops matching fails here.
 */
const expectGoldSectionWalked = (route: string, walked: GoldWalk) => {
  if (!goldRoutesFromBuild().includes(route)) return;
  expect(
    walked.section,
    `${route} renders .surface-gold in its build but not in the page`,
  ).toBe(true);
  expect(
    walked.controls,
    `${route} has no control on gold for the edge check to walk`,
  ).toBeGreaterThan(0);
  expect(
    walked.textInside,
    `no text on a gold ground inside ${route}'s .surface-gold sections.`,
  ).toBeGreaterThan(0);
};

/** Each filled control on gold, focused, with its inset ring on its fill. */
const GOLD_ROUTE_READOUT = `(() => {
  ${PAGE_HELPERS}
  return [...document.querySelectorAll('.surface-gold a, .surface-gold button')]
    .filter((el) => parse(getComputedStyle(el).backgroundColor)?.a === 1)
    .map((el) => {
      const fill = parse(getComputedStyle(el).backgroundColor);
      el.focus();
      const tookFocus = document.activeElement === el;
      const inner = shadowLayers(getComputedStyle(el).boxShadow).find((l) => l.inset) ?? null;
      el.blur();
      return {
        selector: describe(el),
        focused: tookFocus,
        innerRingOnFill:
          inner === null || inner.color === null
            ? null
            : ratio(over(inner.color, fill), fill),
      };
    });
})()`;

type FilledGoldControl = {
  selector: string;
  focused: boolean;
  innerRingOnFill: number | null;
};

/** The menu comes from `Header.astro`, the same on every route. */
const MENU_ROUTE = '/blog/';

const expectNoneBelowAAA = (found: TextOnGold[]) => {
  const failing = found.filter((entry) => entry.ratio < AAA_TEXT);
  expect(
    failing,
    `text sitting on ${GOLD} below ${AAA_TEXT}:1 (SC 1.4.6). A dark-surface ` +
      `token has been used on a gold ground; the inverted set is ` +
      `gold-text / gold-muted / gold-border, applied by .surface-gold:\n` +
      failing
        .map(
          (e) =>
            `  ${e.selector}\n    color ${e.color} at ${e.ratio}:1, "${e.text}"`,
        )
        .join('\n'),
  ).toEqual([]);
};

test.describe('the gold surface exception', () => {
  for (const route of ROUTES) {
    test(`no text on a gold background is unreadable on ${route}`, async ({
      page,
    }) => {
      await gotoSettled(page, route);

      const found = await textOnGold(page);

      expect(
        found.some((entry) => entry.skipLink),
        `.skip-link is not measured as text on gold on ${route}, so the background resolver stopped matching.`,
      ).toBe(true);

      const walked = await walkGoldSections(page);

      expectGoldSectionWalked(route, walked);

      expect(
        walked.invisible,
        invisibleControlMessage(walked.invisible),
      ).toEqual([]);

      expectNoneBelowAAA(found);
    });
  }

  test('no text on a gold background is unreadable in the open mobile menu', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await gotoSettled(page, MENU_ROUTE);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();

    const found = await textOnGold(page);

    expect(
      found.some((entry) => entry.inMenu),
      'no menu text measured; the dialog ground is the page, which is the slab color in dark mode.',
    ).toBe(true);
    expectNoneBelowAAA(found);
  });

  test(`the ${GOLD_ROUTE} gold button keeps its inner ring at 305px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: NARROW_WIDTH, height: 900 });
    await gotoSettled(page, GOLD_ROUTE);

    const controls = (await page.evaluate(
      GOLD_ROUTE_READOUT,
    )) as FilledGoldControl[];
    expect(
      controls.length,
      `${GOLD_ROUTE} has no filled control on gold to measure`,
    ).toBeGreaterThan(0);

    for (const control of controls) {
      expect(control.focused, `${control.selector} did not take focus`).toBe(
        true,
      );
      expect(
        control.innerRingOnFill,
        `${control.selector} inner focus ring against its own fill (SC 1.4.11)`,
      ).toBeGreaterThanOrEqual(NON_TEXT);
    }
  });
});

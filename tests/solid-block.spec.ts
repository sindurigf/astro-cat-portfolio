import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { gotoSettled } from './settle';
import { AA_TEXT, NON_TEXT, PAGE_HELPERS } from './contrast';
import {
  builtPages,
  DIST_DIR,
  HOME_FEATURES_POST,
  PUBLISHED_POST_ROUTES,
  ROUTES,
} from './routes';
import { NODE } from './tags';

/**
 * `.card-solid` is a third surface: against `#E5E2E1` every foreground token but
 * `background` (14.42) fails, cyan at 1.29. axe measures labels, not rings, and
 * cyan looks visible on it because it differs in hue, not luminance.
 */

/**
 * Routes with a solid block, and its link count. Both are asserted: a walk that
 * finds no blocks would otherwise pass silently.
 */
const SOLID_ROUTES: Record<string, number> = {
  /* The current role. A card of facts, with nothing focusable in it. */
  '/career': 0,
  /* The featured post, whose title is a `.card-link`. */
  ...(PUBLISHED_POST_ROUTES.length > 0 && { '/blog': 1 }),
  /* The first featured post, the same card as on /blog. */
  ...(HOME_FEATURES_POST && { '/': 1 }),
  /* The design-system examples: text only. */
  '/brand': 0,
};

/** Routes whose built HTML carries a `.card-solid`, read from `dist/`. */
const solidRoutesFromBuild = (): string[] =>
  builtPages()
    .filter((page) =>
      /class="[^"]*\bcard-solid\b/.test(readFileSync(page.file, 'utf8')),
    )
    .map((page) => page.route)
    .sort();

test('the solid-block census matches the build', NODE, () => {
  expect(
    solidRoutesFromBuild(),
    'a .card-solid was added or removed without updating SOLID_ROUTES, so it ' +
      'would go unmeasured here',
  ).toEqual(Object.keys(SOLID_ROUTES).sort());
});

/*
 * Browsers report false values for `:visited`, so no test can read its ratio.
 * A visited link keeps its rest colour; this asserts no rule changes that.
 */
test('no :visited rule exists anywhere in the built CSS', NODE, () => {
  const pages = builtPages().map((page) => readFileSync(page.file, 'utf8'));
  const linked = new Set(
    pages.flatMap((html) =>
      [...html.matchAll(/href="([^"]+\.css)"/g)].map((match) => match[1]!),
    ),
  );
  // An unreadable sheet throws; inline <style> counts, since Astro inlines small CSS.
  const sources = [
    ...[...linked].map((href) => ({
      source: href,
      css: readFileSync(`${DIST_DIR}${href}`, 'utf8'),
    })),
    ...pages.flatMap((html, index) =>
      [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => ({
        source: `inline style in page ${index}`,
        css: match[1]!,
      })),
    ),
  ];
  expect(linked.size, 'no stylesheet is linked from the build').toBeGreaterThan(
    0,
  );

  const offenders = sources
    .filter(({ css }) => /:visited/.test(css))
    .map(({ source }) => source);
  expect(
    offenders,
    'a :visited rule exists; its ratio cannot be measured, so the site does not style it.',
  ).toEqual([]);
});

for (const route of ROUTES) {
  if (!(route in SOLID_ROUTES)) continue;

  test(`${route} has text of at least ${AA_TEXT}:1 in its solid block (SC 1.4.3)`, async ({
    page,
  }) => {
    await gotoSettled(page, route);

    const found = (await page.evaluate(`(() => {
      ${PAGE_HELPERS}
      const block = document.querySelector('.card-solid');
      if (!block) return { blocks: 0 };
      /*
       * Each element against what is actually behind it: the badge paints its own
       * dark fill, and measuring it against the block fails a pairing no one sees.
       */
      const groundOf = (el) => {
        for (let node = el; node; node = node.parentElement) {
          const c = parse(getComputedStyle(node).backgroundColor);
          if (c && c.a === 1) return c;
        }
        return parse(getComputedStyle(document.body).backgroundColor);
      };
      const problems = [];
      for (const el of block.querySelectorAll('*')) {
        const text = [...el.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
        );
        if (!text) continue;
        const cs = getComputedStyle(el);
        const ground = groundOf(el);
        const fg = over(parse(cs.color), ground);
        const r = ratio(fg, ground);
        if (r < ${AA_TEXT}) {
          problems.push(el.tagName.toLowerCase() + ' "' +
            (el.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 24) +
            '" at ' + r.toFixed(2));
        }
      }
      return { blocks: 1, problems };
    })()`)) as { blocks: number; problems?: string[] };

    expect(found.blocks, `${route} has no .card-solid to measure`).toBe(1);
    expect(
      found.problems ?? [],
      `${route} has text in its solid block under ${AA_TEXT}:1`,
    ).toEqual([]);
  });

  test(`${route} walks every link in its solid block through hover and focus`, async ({
    page,
  }) => {
    await gotoSettled(page, route);

    const links = page.locator('.card-solid a');
    await expect(
      links,
      `${route} is listed with ${SOLID_ROUTES[route]} links in its solid block`,
    ).toHaveCount(SOLID_ROUTES[route]);

    const count = await links.count();
    for (let i = 0; i < count; i += 1) {
      const link = links.nth(i);

      const read = (index: number) =>
        page.evaluate(`(() => {
          ${PAGE_HELPERS}
          const el = document.querySelectorAll('.card-solid a')[${index}];
          const block = el.closest('.card-solid');
          const cs = getComputedStyle(el);
          const ground = effectiveBackground(block);
          const width = parseFloat(cs.outlineWidth) || 0;
          const offset = parseFloat(cs.outlineOffset) || 0;
          const a = el.getBoundingClientRect();
          const b = block.getBoundingClientRect();
          const reach = width + offset;
          return {
            text: ratio(over(parse(cs.color), ground), ground),
            ring: ratio(over(parse(cs.outlineColor), ground), ground),
            offset,
            reach,
            state: [cs.color, cs.textDecorationLine, getComputedStyle(block).boxShadow].join(' | '),
            outside:
              a.left - reach < b.left ||
              a.top - reach < b.top ||
              a.right + reach > b.right ||
              a.bottom + reach > b.bottom,
          };
        })()`) as Promise<{
          text: number;
          ring: number;
          offset: number;
          reach: number;
          state: string;
          outside: boolean;
        }>;

      const rest = await read(i);
      expect(rest.text, 'the link at rest').toBeGreaterThanOrEqual(AA_TEXT);

      await link.hover();
      const hovered = await read(i);
      expect(
        hovered.text,
        'the link on hover is under 4.5:1 against the block.',
      ).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        hovered.state,
        'hovering the link changes nothing (SC 1.4.1).',
      ).not.toBe(rest.state);

      await page.mouse.move(0, 0);
      await link.focus();
      const focused = await read(i);
      expect(
        focused.ring,
        'the focus ring is under 3:1 against the block.',
      ).toBeGreaterThanOrEqual(NON_TEXT);
      expect(focused.offset, 'the focus ring offset').toBeGreaterThan(0);
      expect(
        focused.outside,
        `the focus ring reaches ${focused.reach}px past the link and leaves the block, where it matches the page ground.`,
      ).toBe(false);
    }
  });
}

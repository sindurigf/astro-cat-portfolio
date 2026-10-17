import { expect, test, type Locator, type Page } from './test';
import { gotoSettled } from './settle';
import { PAGE_HELPERS } from './contrast';
import { contrastRows } from '../scripts/contrast-table.mjs';
import { REPOSITORY_URL, sourceUrl, templateUseUrl } from '../src/lib/site';
import { ENGINE_INVARIANT, NODE } from './tags';
import { builtHtml } from './routes';
import {
  BRAND_PATH,
  BRAND_ROUTES,
  BRAND_SECTIONS,
  brandHref,
} from '../src/lib/brand-sections';

/*
 * /brand states the design system's facts; these tests hold them to the CSS the
 * pages ship, so a token cannot change without the pages changing with it.
 */
const ALL_ROUTES = [
  BRAND_PATH,
  ...BRAND_SECTIONS.map((s) => brandHref(s.slug)),
];
const CONTRAST = brandHref('contrast');
const COLOR = brandHref('color');
const CONTROLS = brandHref('controls');
const FORMS = brandHref('forms');
const RATIO_DIGITS = 2;
const NARROW = 390;
const WIDE = 1280;
const HEIGHT = 900;
const THEMES = ['dark', 'light'] as const;

/* The live examples: the light half's inert copy repeats them for the eye only. */
const LIVE = ':not([inert] *)';

const pageInTheme = async (
  browser: import('@playwright/test').Browser,
  theme: (typeof THEMES)[number],
  route: string,
) => {
  const context = await browser.newContext();
  await context.addInitScript(
    (value) => localStorage.setItem('theme', value),
    theme,
  );
  const page = await context.newPage();
  await gotoSettled(page, route);
  return { context, page };
};

/** Each `--color-*` token resolved inside `half`, as `#rrggbb`. */
const resolveTokens = (half: Locator, tokens: string[]) =>
  half.evaluate((root, names) => {
    const probe = document.createElement('span');
    root.append(probe);
    const hex = Object.fromEntries(
      names.map((name) => {
        probe.style.color = '';
        probe.style.color = `var(--color-${name})`;
        const [r, g, b] = (
          getComputedStyle(probe).color.match(/\d+/g) ?? []
        ).map(Number);
        return [
          name,
          probe.style.color && r !== undefined
            ? `#${[r, g, b].map((v) => v!.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
            : null,
        ];
      }),
    );
    probe.remove();
    return hex;
  }, tokens);

const half = (page: Page, part: string, mode: 'dark' | 'light') =>
  page.locator(`[data-component="${part}"] .mode-${mode}`);

test.describe('/brand', () => {
  test(
    'the full contrast table lists every pairing the site measures, in order',
    ENGINE_INVARIANT,
    async ({ page }) => {
      await gotoSettled(page, CONTRAST);
      const pairs = await half(page, 'pairings', 'dark')
        .locator('details tbody tr th')
        .evaluateAll((cells) =>
          cells.map((cell) =>
            [...cell.querySelectorAll('code')]
              .map((c) => c.textContent)
              .join(' on '),
          ),
        );
      expect(
        pairs,
        'the page drops or reorders a pairing from scripts/contrast-table.mjs',
      ).toEqual(
        contrastRows().map(
          (row: { fg: string; bg: string }) => `${row.fg} on ${row.bg}`,
        ),
      );
    },
  );

  test('every contrast table has a caption and a row header per row (SC 1.3.1)', async ({
    page,
  }) => {
    await gotoSettled(page, CONTRAST);
    const tables = await page
      .locator('[data-component="pairings"] table')
      .evaluateAll((all) =>
        all.map((table) => ({
          caption: table.querySelector('caption')?.textContent?.trim() ?? '',
          rows: table.querySelectorAll('tbody tr').length,
          rowHeaders: table.querySelectorAll('tbody th[scope="row"]').length,
        })),
      );
    expect(tables.length, 'the page has no contrast table').toBeGreaterThan(0);
    for (const table of tables) {
      expect(table.caption, 'a contrast table has no caption').not.toBe('');
      expect(
        table.rowHeaders,
        `${table.caption} has a row with no header`,
      ).toBe(table.rows);
    }
  });

  for (const theme of THEMES) {
    test(`on a ${theme} page each half's stated ratios and samples match the colors it ships (SC 1.4.3, 1.4.11)`, async ({
      browser,
    }) => {
      const { context, page } = await pageInTheme(browser, theme, CONTRAST);
      for (const mode of THEMES) {
        const shown = half(page, 'pairings', mode);
        const rows = await shown.locator('tbody tr').evaluateAll((trs) =>
          trs.map((tr) => {
            const pair = tr.querySelector('th');
            const [, ratio] = tr.querySelectorAll('td');
            const [fg, bg] = [...pair!.querySelectorAll('code')].map(
              (c) => c.textContent!,
            );
            const sample = pair!.querySelector<HTMLElement>(
              '[aria-hidden="true"]',
            );
            const style = sample && getComputedStyle(sample);
            return {
              fg: fg!,
              bg: bg!,
              stated: /^\d+\.\d+/.exec(ratio!.textContent!.trim())?.[0] ?? '',
              sample: style && {
                fg:
                  tr.dataset.sample === 'text'
                    ? style.color
                    : style.borderTopColor,
                bg: style.backgroundColor,
              },
            };
          }),
        );
        expect(
          rows.length,
          `the ${mode} half lists no pairing`,
        ).toBeGreaterThan(0);
        const tokens = [...new Set(rows.flatMap((row) => [row.fg, row.bg]))];
        const hex = await resolveTokens(shown, tokens);
        const measured = (await page.evaluate(`(() => {
          ${PAGE_HELPERS}
          const rows = ${JSON.stringify(rows)};
          const hex = ${JSON.stringify(hex)};
          const rgb = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: 1 });
          const fixed = (value) => value.toFixed(${RATIO_DIGITS});
          return rows.map((row) => ({
            tokens: hex[row.fg] && hex[row.bg] ? fixed(ratio(rgb(hex[row.fg]), rgb(hex[row.bg]))) : 'unresolved',
            sample: row.sample ? fixed(ratio(parse(row.sample.fg), parse(row.sample.bg))) : null,
          }));
        })()`)) as { tokens: string; sample: string | null }[];
        const wrong = rows.flatMap((row, i) => {
          const { tokens: fromTokens, sample } = measured[i]!;
          const name = `${row.fg} on ${row.bg}`;
          return [
            ...(fromTokens === row.stated
              ? []
              : [
                  `${name}: states ${row.stated}, tokens measure ${fromTokens}`,
                ]),
            ...(sample === null || sample === row.stated
              ? []
              : [`${name}: states ${row.stated}, its sample paints ${sample}`]),
          ];
        });
        expect(
          wrong,
          `a ${mode} ratio differs from the colors its half ships`,
        ).toEqual([]);
        expect(
          rows.filter((row) => row.sample).length,
          `the ${mode} half shows no sample`,
        ).toBeGreaterThan(0);
      }
      await context.close();
    });
  }

  for (const theme of THEMES) {
    test(`on a ${theme} page each color swatch shows the hex its row states for its half`, async ({
      browser,
    }) => {
      const { context, page } = await pageInTheme(browser, theme, COLOR);
      for (const mode of THEMES) {
        const rows = await half(page, 'palette', mode)
          .locator('li')
          .evaluateAll((items, own) => {
            /* The last opaque color in the value: Tailwind lists empty ring and inset layers before a shadow. */
            const hex = (value: string) => {
              const opaque = [...value.matchAll(/rgba?\(([^)]+)\)/g)]
                .map((m) =>
                  m[1]!
                    .split(/[,\s/]+/)
                    .filter(Boolean)
                    .map(Number),
                )
                .filter((c) => c.length < 4 || c[3] !== 0);
              const [r, g, b] = opaque.at(-1) ?? [];
              return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
            };
            return items.map((item) => {
              const token = item.querySelector('code')!.textContent!;
              const facts = item.querySelectorAll('dd');
              const stated = facts[facts.length - 1]!.textContent!;
              const dark = /Dark (#[0-9A-F]{6})/.exec(stated)?.[1];
              const light = /light (#[0-9A-F]{6})/.exec(stated)?.[1] ?? dark;
              const chip = item.querySelector<HTMLElement>(
                '[aria-hidden="true"]',
              )!;
              const style = getComputedStyle(chip);
              const cls = chip.className;
              /* Each swatch paints its color where its job puts it: the utility named for the token. */
              const names = (prefix: string): boolean =>
                cls
                  .split(/\s+/)
                  .some((c) => c.startsWith(`${prefix}-${token}`));
              const painted = /\bborder-dashed\b/.test(cls)
                ? null
                : names('bg')
                  ? hex(style.backgroundColor)
                  : names('shadow-hard')
                    ? hex(style.boxShadow)
                    : names('border')
                      ? hex(style.borderTopColor)
                      : names('text')
                        ? hex(style.color)
                        : null;
              return { token, want: own === 'light' ? light : dark, painted };
            });
          }, mode);
        expect(rows.length, `the ${mode} half lists no color`).toBeGreaterThan(
          0,
        );
        const wrong = rows
          .filter((row) => row.painted !== null && row.painted !== row.want)
          .map(
            (row) => `${row.token}: states ${row.want}, paints ${row.painted}`,
          );
        expect(wrong, `a ${mode} swatch differs from its stated hex`).toEqual(
          [],
        );
      }
      await context.close();
    });
  }

  test(
    'every part has a name, its rule and a live example, and each section shows the parts it lists',
    ENGINE_INVARIANT,
    async ({ page }) => {
      for (const section of BRAND_SECTIONS) {
        await gotoSettled(page, brandHref(section.slug));
        const parts = await page
          .locator('[data-component]')
          .evaluateAll((items) =>
            items.map((item) => ({
              id: item.getAttribute('data-component'),
              name:
                item.querySelector(':scope > h2')?.textContent?.trim() ?? '',
              rule:
                item
                  .querySelector(':scope > div > p:last-of-type')
                  ?.textContent?.trim() ?? '',
              example:
                item.querySelector('.mode-dark[data-example] > div:last-child')
                  ?.children.length ?? 0,
            })),
          );
        expect(
          parts.map((part) => part.id),
          `${section.slug} shows other parts than src/lib/brand-sections.ts lists`,
        ).toEqual(section.parts.map((part) => part.id));
        const incomplete = parts
          .filter((part) => !part.name || !part.rule || part.example === 0)
          .map((part) => part.id);
        expect(incomplete, `a part on ${section.slug} lacks a piece`).toEqual(
          [],
        );
      }
    },
  );

  test('every old /brand anchor still lands on the overview, linked to its section', async ({
    page,
  }) => {
    await gotoSettled(page, BRAND_PATH);
    const missing: string[] = [];
    for (const section of BRAND_SECTIONS) {
      const row = page.locator(`[id="${section.anchor}"]`);
      if (
        (await row
          .getByRole('link', { name: section.title, exact: true })
          .getAttribute('href')) !== brandHref(section.slug)
      ) {
        missing.push(section.anchor);
      }
      for (const part of section.parts) {
        const href = await page
          .locator(`[id="${part.id}"]`)
          .getAttribute('href');
        if (href !== `${brandHref(section.slug)}#${part.id}`)
          missing.push(part.id);
      }
    }
    expect(missing, 'an old anchor no longer leads to its section').toEqual([]);
  });

  test(
    'the light half is a picture: no headings, ids, names or reachable controls',
    NODE,
    () => {
      const pages = builtHtml();
      const leaks: string[] = [];
      for (const route of [BRAND_PATH.slice(0, -1), ...BRAND_ROUTES]) {
        const html = pages.get(route);
        expect(html, `${route} is not in the build`).toBeDefined();
        for (const [copy] of html!.matchAll(
          /<div class="brand-stage-half mode-light" inert aria-hidden="true">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g,
        )) {
          const found = /<h[1-6]\b|\sid="|\sname="|\sfor="/.exec(copy);
          if (found) leaks.push(`${route}: ${found[0].trim()}`);
        }
      }
      expect(leaks, "a light half's copy repeats a heading or an id").toEqual(
        [],
      );
    },
  );

  for (const theme of THEMES) {
    test(`on a ${theme} page each half keeps its own ground`, async ({
      browser,
    }) => {
      const { context, page } = await pageInTheme(
        browser,
        theme,
        brandHref('grounds'),
      );
      const grounds = await page.evaluate(() => {
        const bg = (selector: string) =>
          getComputedStyle(document.querySelector(selector)!).backgroundColor;
        return {
          dark: bg('.brand-stage-half.mode-dark'),
          light: bg('.brand-stage-half.mode-light'),
          header: bg('header'),
        };
      });
      expect(grounds.dark, 'the dark half takes the light ground').not.toBe(
        grounds.light,
      );
      const { context: other, page: darkPage } = await pageInTheme(
        browser,
        'dark',
        brandHref('grounds'),
      );
      const darkGround = await darkPage.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
      expect(grounds.dark, 'the dark half is not the dark page ground').toBe(
        darkGround,
      );
      await other.close();
      await context.close();
    });
  }

  for (const width of [WIDE, NARROW] as const) {
    test(`the menu marks only its own page, ${width === NARROW ? 'closed' : 'open'} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      for (const route of ALL_ROUTES) {
        await gotoSettled(page, route);
        const menu = page.getByRole('navigation', { name: 'Brand sections' });
        await expect(menu, `${route} has no single menu`).toHaveCount(1);
        /* One list for each width; only one is rendered. */
        const current = menu.locator('a[aria-current="page"]');
        expect(
          await current.evaluateAll((all) =>
            all.map((a) => a.getAttribute('href')),
          ),
          `${route} marks another page current, or more than its own link`,
        ).toEqual([route, route]);
        await expect(
          current.locator('visible=true'),
          `${route} shows its current link at ${width}px`,
        ).toHaveCount(width === NARROW ? 0 : 1);
        if (width === NARROW) {
          expect(
            await menu
              .locator('details')
              .evaluate((d) => (d as HTMLDetailsElement).open),
            `${route} opens its menu at ${width}px`,
          ).toBe(false);
        }
      }
    });
  }

  test('ids and landmark names are unique on every page, with the examples on it', async ({
    page,
  }) => {
    for (const route of ALL_ROUTES) {
      await gotoSettled(page, route);
      const { ids, landmarks, mains, h1s } = await page.evaluate(() => {
        const repeated = (values: string[]) =>
          values.filter((value, i) => values.indexOf(value) !== i);
        return {
          ids: repeated(
            [...document.querySelectorAll('[id]')].map((el) => el.id),
          ),
          landmarks: repeated(
            [...document.querySelectorAll('nav, aside, form[aria-label]')]
              /* Unrendered or hidden landmarks are out of the tree. */
              .filter(
                (el) =>
                  el.checkVisibility() && !el.closest('[aria-hidden="true"]'),
              )
              .map(
                (el) =>
                  `${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() ?? ''}`,
              ),
          ),
          mains: document.querySelectorAll('main').length,
          h1s: document.querySelectorAll('h1').length,
        };
      });
      expect(ids, `${route} repeats an id`).toEqual([]);
      expect(landmarks, `two landmarks share a name on ${route}`).toEqual([]);
      expect(mains, `an example adds a main on ${route}`).toBe(1);
      expect(h1s, `an example adds an h1 on ${route}`).toBe(1);
    }
  });

  test('the example form sends nothing and stays on the page', async ({
    page,
  }) => {
    await gotoSettled(page, FORMS);
    const form = half(page, 'form', 'dark').locator('form');
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') requests.push(request.url());
    });
    await form.getByLabel(/^Name/).fill('A name');
    await form.getByRole('button', { name: 'Send Message' }).click();
    await form.getByLabel(/^Name/).press('Enter');
    await expect(page, 'the example form left the page').toHaveURL(
      new RegExp(`${FORMS}$`),
    );
    expect(requests, 'the example form sent a request').toEqual([]);
  });

  test('both theme switches change the one theme and always agree', async ({
    page,
  }) => {
    await gotoSettled(page, CONTROLS);
    const switches = page.locator(`.theme-switch${LIVE}`);
    await expect(switches).toHaveCount(2);
    const state = () =>
      switches.evaluateAll((all) => ({
        theme: document.documentElement.dataset.theme,
        pressed: all.map((b) => b.getAttribute('aria-pressed')),
      }));
    for (const which of [1, 0]) {
      const before = await state();
      await switches.nth(which).click();
      const after = await state();
      expect(after.theme, 'a switch did not change the theme').not.toBe(
        before.theme,
      );
      expect(new Set(after.pressed).size, 'the two switches disagree').toBe(1);
      expect(after.pressed[0]).toBe(String(after.theme === 'light'));
    }
  });

  test('each motion example changes only its own name', async ({ page }) => {
    await gotoSettled(page, CONTROLS);
    const toggles = page.locator(`button[data-example-toggle]${LIVE}`);
    expect(await toggles.count()).toBeGreaterThan(1);
    const names = () =>
      toggles.evaluateAll((all) => all.map((b) => b.textContent?.trim()));
    const before = await names();
    await toggles.first().click();
    const after = await names();
    expect(after[0], 'the toggle kept its name').not.toBe(before[0]);
    expect(after.slice(1), 'one toggle changed another').toEqual(
      before.slice(1),
    );
  });

  for (const width of [WIDE, NARROW] as const) {
    test(`no roundel covers a control at ${width}px, with every fold closed or open`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      for (const route of [BRAND_PATH, brandHref('heroes')]) {
        await gotoSettled(page, route);
        for (const open of [false, true]) {
          const covered = await page.evaluate((openAll) => {
            for (const details of document.querySelectorAll('main details')) {
              (details as HTMLDetailsElement).open = openAll;
            }
            const boxes = (selector: string) =>
              [...document.querySelectorAll<HTMLElement>(selector)]
                .filter((el) => el.checkVisibility() && !el.closest('[inert]'))
                .map((el) => ({ el, box: el.getBoundingClientRect() }));
            const roundels = boxes('main .hero-roundel');
            const controls = boxes(
              'main :is(summary, a[href], button, input, select, textarea, [tabindex])',
            );
            const overlap = (a: DOMRect, b: DOMRect) =>
              a.left < b.right &&
              b.left < a.right &&
              a.top < b.bottom &&
              b.top < a.bottom;
            return roundels.flatMap((roundel) =>
              controls
                .filter(({ box }) => overlap(roundel.box, box))
                .map(
                  ({ el }) =>
                    `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`,
                ),
            );
          }, open);
          expect(
            covered,
            `a roundel covers a control on ${route} with every fold ${open ? 'open' : 'closed'}`,
          ).toEqual([]);
        }
      }
    });
  }

  test('the calls to action point at the site repository, and the demo link waits for the demo', async ({
    page,
  }) => {
    await gotoSettled(page, BRAND_PATH);
    const source = sourceUrl(REPOSITORY_URL);
    const expected: [string, string | null][] = [
      ['Use This Design', source && templateUseUrl(source)],
      ['View the Source', source],
    ];
    for (const [name, href] of expected) {
      const hrefs = await page
        .getByRole('link', { name, exact: true })
        .evaluateAll((all) => all.map((a) => a.getAttribute('href')));
      if (href === null) {
        expect(
          hrefs,
          `"${name}" shows without a repository to point at`,
        ).toEqual([]);
        continue;
      }
      expect(hrefs.length, `no "${name}" link`).toBeGreaterThan(0);
      for (const actual of hrefs) {
        expect(actual, `"${name}" points elsewhere`).toBe(href);
      }
    }
    await expect(page.getByRole('link', { name: 'See the Demo' })).toHaveCount(
      0,
    );
  });
});

test(
  'templateUseUrl links a GitHub repository to its template page, and nothing else',
  NODE,
  () => {
    expect(templateUseUrl('https://github.com/owner/site')).toBe(
      'https://github.com/new?template_name=site&template_owner=owner',
    );
    expect(templateUseUrl('https://codeberg.org/owner/site')).toBeNull();
    expect(templateUseUrl('https://github.com/owner')).toBeNull();
  },
);

test(
  'sourceUrl hides a placeholder repository on an example domain (RFC 2606)',
  NODE,
  () => {
    for (const placeholder of [
      'https://github.example/owner/site',
      'https://example.com/owner/site',
      'https://git.example.org/owner/site',
      'https://example.net/owner/site',
    ]) {
      expect(sourceUrl(placeholder), placeholder).toBeNull();
    }
    expect(sourceUrl('https://github.com/owner/site')).toBe(
      'https://github.com/owner/site',
    );
    expect(sourceUrl('https://notexample.com/owner/site')).toBe(
      'https://notexample.com/owner/site',
    );
  },
);

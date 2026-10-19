import { expect, test, type Locator, type Page } from './test';
import { gotoSettled } from './settle';
import { PAGE_HELPERS } from './contrast';
import { contrastRows } from '../scripts/contrast-table.mjs';
import { REPOSITORY_URL, sourceUrl, templateUseUrl } from '../src/lib/site';
import { ENGINE_INVARIANT, NODE } from './tags';
import { builtHtml } from './routes';
import { readFileSync } from 'node:fs';
import { BRAND_PATH, BRAND_SECTIONS } from '../src/lib/brand-sections';
import { blockGroups } from '../src/lib/brand-blocks';

/*
 * /brand states the design system's facts; these tests hold them to the CSS the
 * pages ship, so a token cannot change without the pages changing with it.
 */
const RATIO_DIGITS = 2;
const NARROW = 390;
const WIDE = 1280;
const HEIGHT = 900;
/* Tall enough for the whole sections list under the header (brand.css). */
const TALL = 1100;
/* Far enough down that the sticky list has stuck. */
const SCROLLED = 3000;
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
      await gotoSettled(page, BRAND_PATH);
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
    await gotoSettled(page, BRAND_PATH);
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
      const { context, page } = await pageInTheme(browser, theme, BRAND_PATH);
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
    test(`on a ${theme} page each color block states the ratio of the colors it paints (SC 1.4.3, 1.4.6, 1.4.11)`, async ({
      browser,
    }) => {
      const { context, page } = await pageInTheme(browser, theme, BRAND_PATH);
      let measured = 0;
      for (const group of blockGroups) {
        for (const mode of THEMES) {
          const cells = await half(page, group.id, mode)
            .locator('td')
            .evaluateAll((tds) =>
              tds.map((td) => {
                const cell = td.querySelector<HTMLElement>('.block-cell')!;
                const sample = td.querySelector<HTMLElement>(
                  '.block-sample, .block-edge',
                )!;
                const text = sample.classList.contains('block-sample');
                const style = getComputedStyle(sample);
                return {
                  pair: td.getAttribute('data-pair') ?? '',
                  text,
                  stated: td.querySelector('.block-ratio')!.textContent!,
                  verdict: td.querySelector('.block-verdict')!.textContent!,
                  fg: text ? style.color : style.borderTopColor,
                  bg: getComputedStyle(cell).backgroundColor,
                };
              }),
            );
          expect(
            cells.length,
            `${group.id} ${mode} half draws no block`,
          ).toBeGreaterThan(0);
          const result = (await page.evaluate(`(() => {
            ${PAGE_HELPERS}
            return ${JSON.stringify(cells)}.map((c) => ratio(parse(c.fg), parse(c.bg)).toFixed(${RATIO_DIGITS}));
          })()`)) as string[];
          const wrong = cells.flatMap((cell, i) => {
            const need = cell.text ? 7 : 3;
            const label = `${group.id} ${mode} ${cell.pair}`;
            return [
              ...(cell.stated === `${result[i]}:1`
                ? []
                : [`${label}: states ${cell.stated}, paints ${result[i]}:1`]),
              ...(Number(result[i]) >= need
                ? []
                : [`${label}: paints ${result[i]}:1, under ${need}`]),
              ...(cell.verdict === (cell.text ? 'AAA' : '3:1 pass')
                ? []
                : [`${label}: says ${cell.verdict}`]),
            ];
          });
          expect(
            wrong,
            `a ${mode} block differs from the colors it paints`,
          ).toEqual([]);
          measured += cells.length;
        }
      }
      expect(measured, 'no color block was measured').toBeGreaterThan(0);
      await context.close();
    });
  }

  for (const theme of THEMES) {
    test(`on a ${theme} page each color row states the hex of its token, and each table is captioned in words`, async ({
      browser,
    }) => {
      const { context, page } = await pageInTheme(browser, theme, BRAND_PATH);
      const partName = (id: string) =>
        BRAND_SECTIONS.flatMap((s) => s.parts).find((p) => p.id === id)!.name;
      for (const group of blockGroups) {
        for (const mode of THEMES) {
          const shown = half(page, group.id, mode);
          await expect(
            shown.locator('caption'),
            `${group.id} ${mode} caption runs its words together`,
          ).toHaveText(
            `${partName(group.id)}, ${mode} mode: the ratio of each pair`,
          );
          const rows = await shown
            .locator('tbody th[scope="row"]')
            .evaluateAll((ths) =>
              ths.map((th) => ({
                token: th.getAttribute('data-token') ?? '',
                stated:
                  th.querySelector('.block-hex')?.textContent?.trim() ?? '',
              })),
            );
          expect(rows.length, `${group.id} ${mode} has no row`).toBeGreaterThan(
            0,
          );
          const hex = await resolveTokens(shown, [
            ...new Set(rows.map((row) => row.token)),
          ]);
          const wrong = rows
            .filter((row) => hex[row.token] !== row.stated.toUpperCase())
            .map(
              (row) =>
                `${group.id} ${mode} ${row.token}: states ${row.stated}, the half paints ${hex[row.token]}`,
            );
          expect(wrong, 'a stated hex differs from its token').toEqual([]);
        }
      }
      await context.close();
    });
  }

  test('each section heading is named for the section alone', async ({
    page,
  }) => {
    await gotoSettled(page, BRAND_PATH);
    for (const section of BRAND_SECTIONS) {
      await expect(
        page.locator(`section[id="${section.anchor}"] > header h2`),
        `${section.anchor}'s number and slashes reach assistive technology`,
      ).toHaveAccessibleName(section.heading ?? section.title);
    }
  });

  test('the menu stays in the flow unless the whole list fits under the header', async ({
    page,
  }) => {
    const menu = page.getByRole('navigation', { name: 'Brand sections' });
    for (const [height, sticky] of [
      [HEIGHT, false],
      [TALL, true],
    ] as const) {
      await page.setViewportSize({ width: WIDE, height });
      await gotoSettled(page, BRAND_PATH);
      const list = menu.locator('.hidden.lg\\:block');
      expect(
        await menu.evaluate((el) => getComputedStyle(el).position),
        `the menu is ${sticky ? 'not ' : ''}sticky at ${height}px tall`,
      ).toBe(sticky ? 'sticky' : 'static');
      expect(
        await menu.evaluate((el) => el.scrollHeight - el.clientHeight),
        `the menu scrolls inside itself at ${height}px tall`,
      ).toBeLessThanOrEqual(0);
      if (sticky) {
        await page.evaluate((y) => window.scrollTo(0, y), SCROLLED);
        const box = await list.boundingBox();
        expect(
          box!.y + box!.height,
          'the sticky list reaches below the viewport',
        ).toBeLessThanOrEqual(height);
      }
    }
  });

  test(
    'every part has a name, its rule and a live example, and each section shows the parts it lists',
    ENGINE_INVARIANT,
    async ({ page }) => {
      await gotoSettled(page, BRAND_PATH);
      for (const section of BRAND_SECTIONS) {
        const parts = await page
          .locator(`[id="${section.anchor}"] [data-component]`)
          .evaluateAll((items) =>
            items.map((item) => ({
              id: item.getAttribute('data-component'),
              name:
                item.querySelector(':scope > h3')?.textContent?.trim() ?? '',
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

  test('every section is one page with its anchor, heading and sections link', async ({
    page,
  }) => {
    await gotoSettled(page, BRAND_PATH);
    const missing: string[] = [];
    for (const section of BRAND_SECTIONS) {
      const heading = page.locator(
        `section[id="${section.anchor}"] > header h2`,
      );
      if ((await heading.count()) !== 1) missing.push(section.anchor);
      for (const part of section.parts) {
        if ((await page.locator(`[id="${part.id}"]`).count()) !== 1)
          missing.push(part.id);
      }
    }
    expect(missing, 'a section or part lacks its anchor').toEqual([]);
  });

  test(
    'every retired section route redirects to its anchor, and the menu marks the target',
    NODE,
    () => {
      const redirects = readFileSync('public/_redirects', 'utf8');
      const css = readFileSync('src/styles/components/brand.css', 'utf8');
      const lost: string[] = [];
      for (const section of BRAND_SECTIONS) {
        const target = `${BRAND_PATH}#${section.anchor}`;
        for (const path of [
          `/brand/${section.slug}`,
          `/brand/${section.slug}/`,
        ]) {
          if (!redirects.includes(`${path} ${target} 301`))
            lost.push(`${path} does not redirect to ${target}`);
        }
        if (
          !css.includes(
            `#${section.anchor}:target) [href='#${section.anchor}']`,
          )
        )
          lost.push(`brand.css does not mark #${section.anchor} as current`);
      }
      expect(lost, 'a retired link or a menu rule is missing').toEqual([]);
    },
  );

  test(
    'the light half is a picture: no headings, ids, names or reachable controls',
    NODE,
    () => {
      const pages = builtHtml();
      const leaks: string[] = [];
      const route = BRAND_PATH.slice(0, -1);
      const html = pages.get(route);
      expect(html, `${route} is not in the build`).toBeDefined();
      for (const [copy] of html!.matchAll(
        /<div class="brand-stage-half mode-light" inert aria-hidden="true">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g,
      )) {
        const found = /<h[1-6]\b|\sid="|\sname="|\sfor="/.exec(copy);
        if (found) leaks.push(`${route}: ${found[0].trim()}`);
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
      const { context, page } = await pageInTheme(browser, theme, BRAND_PATH);
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
        BRAND_PATH,
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
    test(`the menu lists every section once and links to it, ${width === NARROW ? 'closed' : 'open'} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      await gotoSettled(page, BRAND_PATH);
      const menu = page.getByRole('navigation', { name: 'Brand sections' });
      const anchors = BRAND_SECTIONS.map((s) => `#${s.anchor}`);
      await expect(menu, 'the page has no single menu').toHaveCount(1);
      const links = menu.locator('a.brand-menu-link');
      expect(
        await links.evaluateAll((all) =>
          all.map((a) => a.getAttribute('href')),
        ),
        'the menu lists other sections than src/lib/brand-sections.ts',
      ).toEqual([...anchors, ...anchors]);
      await expect(
        menu.locator('a[aria-current]'),
        'no link is current: the page cannot tell which section is read',
      ).toHaveCount(0);
      await expect(
        links.locator('visible=true'),
        `the menu shows another number of links at ${width}px`,
      ).toHaveCount(width === NARROW ? 0 : BRAND_SECTIONS.length);
      if (width === NARROW) {
        expect(
          await menu
            .locator('details')
            .evaluate((d) => (d as HTMLDetailsElement).open),
          `the menu starts open at ${width}px`,
        ).toBe(false);
      }
    });
  }

  test('the section you jumped to is the gold block in the menu', async ({
    page,
  }) => {
    await page.setViewportSize({ width: WIDE, height: HEIGHT });
    await gotoSettled(page, `${BRAND_PATH}#color`);
    const menu = page.getByRole('navigation', { name: 'Brand sections' });
    const fills = await menu
      .locator('a.brand-menu-link')
      .locator('visible=true')
      .evaluateAll((all) =>
        all.map((a) => [
          a.getAttribute('href'),
          getComputedStyle(a).backgroundColor,
        ]),
      );
    const painted = fills.filter(([, fill]) => fill !== 'rgba(0, 0, 0, 0)');
    expect(
      painted.map(([href]) => href),
      'only the targeted section is painted in the menu',
    ).toEqual(['#color']);
  });

  test('ids and landmark names are unique on every page, with the examples on it', async ({
    page,
  }) => {
    for (const route of [BRAND_PATH]) {
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
    await gotoSettled(page, BRAND_PATH);
    const form = half(page, 'form', 'dark').locator('form');
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') requests.push(request.url());
    });
    await form.getByLabel(/^Name/).fill('A name');
    await form.getByRole('button', { name: 'Send Message' }).click();
    await form.getByLabel(/^Name/).press('Enter');
    await expect(page, 'the example form left the page').toHaveURL(
      new RegExp(`${BRAND_PATH}$`),
    );
    expect(requests, 'the example form sent a request').toEqual([]);
  });

  test('both theme menus change the one theme and always agree', async ({
    page,
  }) => {
    await gotoSettled(page, BRAND_PATH);
    const switches = page.locator(`.theme-switch${LIVE}`);
    await expect(switches).toHaveCount(2);
    const menus = page.locator(`.theme-menu${LIVE}`);
    const state = () =>
      menus.evaluateAll((all) => ({
        theme: document.documentElement.dataset.theme,
        checked: all.map(
          (menu) =>
            menu.querySelector<HTMLInputElement>('input:checked')?.value,
        ),
      }));
    for (const [which, label, value] of [
      [1, 'Light', 'light'],
      [0, 'Dark', 'dark'],
      [1, 'System', 'system'],
    ] as const) {
      await switches.nth(which).click();
      await menus
        .nth(which)
        .getByRole('radio', { name: label, exact: true })
        .check();
      const after = await state();
      expect(after.checked, 'the two menus disagree').toEqual([value, value]);
      if (value !== 'system') expect(after.theme).toBe(value);
      await page.keyboard.press('Escape');
    }
  });

  test('each motion example changes only its own name', async ({ page }) => {
    await gotoSettled(page, BRAND_PATH);
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
      for (const route of [BRAND_PATH]) {
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

/* The examples sit in halves that clip; a ring cut by the clip is smaller than drawn (SC 2.4.13). */
const REFLOW_WIDTH = 320;
const ROUNDING_PX = 0.5;

test.describe('/brand examples at 320px', () => {
  test.use({ viewport: { width: REFLOW_WIDTH, height: HEIGHT } });

  test('every focused example keeps its whole ring inside every clipping ancestor', async ({
    page,
  }) => {
    const cut: string[] = [];
    let measured = 0;

    for (const route of [BRAND_PATH]) {
      await gotoSettled(page, route);
      const result = await page.evaluate((tolerance) => {
        const found: string[] = [];
        let rings = 0;
        const controls = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-example] :is(a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]))',
          ),
        ].filter((el) => el.checkVisibility());

        for (const el of controls) {
          el.focus({ focusVisible: true });
          if (document.activeElement !== el) continue;
          const style = getComputedStyle(el);
          if (style.outlineStyle === 'none') continue;
          rings += 1;
          const reach =
            parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
          const box = el.getBoundingClientRect();

          for (let node = el.parentElement; node; node = node.parentElement) {
            const s = getComputedStyle(node);
            // A scroller brings its focused child into view; only a clip cannot.
            if (!/clip|hidden/.test(`${s.overflowX} ${s.overflowY}`)) continue;
            const r = node.getBoundingClientRect();
            const over = Math.max(
              r.left + parseFloat(s.borderLeftWidth) - (box.left - reach),
              r.top + parseFloat(s.borderTopWidth) - (box.top - reach),
              box.right + reach - (r.right - parseFloat(s.borderRightWidth)),
              box.bottom + reach - (r.bottom - parseFloat(s.borderBottomWidth)),
            );
            if (over > tolerance) {
              found.push(
                `${el.tagName.toLowerCase()} "${el.textContent?.trim().slice(0, 30)}" cut ${over.toFixed(1)}px by .${node.className.split(' ')[0]}`,
              );
            }
          }
        }
        return { found, rings };
      }, ROUNDING_PX);

      measured += result.rings;
      cut.push(...result.found.map((line) => `${route}: ${line}`));
    }

    expect(measured, 'no /brand example drew a focus ring').toBeGreaterThan(0);
    expect(cut, `focus rings clipped at 320px:\n${cut.join('\n')}`).toEqual([]);
  });
});

import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { PAGE_HELPERS } from './contrast';
import { contrastRows } from '../scripts/contrast-table.mjs';
import { REPOSITORY_URL, sourceUrl, templateUseUrl } from '../src/lib/site';
import { ENGINE_INVARIANT, NODE } from './tags';

/*
 * /brand states the design system's facts; these tests hold them to the CSS the
 * page ships, so a token cannot change without the page changing with it.
 */
const ROUTE = '/brand/';
const RATIO_DIGITS = 2;

/** Each `--color-*` token resolved in <main>, where light mode swaps them, as `#rrggbb`. */
const resolveTokens = (page: Page, tokens: string[]) =>
  page.evaluate((names) => {
    const main = document.querySelector('main')!;
    const probe = document.createElement('span');
    main.append(probe);
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

test.describe('/brand', () => {
  test(
    'the full contrast table lists every pairing the site measures, in order',
    ENGINE_INVARIANT,
    async ({ page }) => {
      await gotoSettled(page, ROUTE);
      const pairs = await page
        .locator('#contrast .contrast-dark details tbody tr th')
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
    await gotoSettled(page, ROUTE);
    const tables = await page.locator('#contrast table').evaluateAll((all) =>
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

  for (const theme of ['dark', 'light'] as const) {
    test(`in ${theme} mode every stated ratio and sample matches the colors the page ships (SC 1.4.3, 1.4.11)`, async ({
      browser,
    }) => {
      const context = await browser.newContext();
      await context.addInitScript(
        (value) => localStorage.setItem('theme', value),
        theme,
      );
      const page = await context.newPage();
      await gotoSettled(page, ROUTE);
      const shown = page.locator(`#contrast .contrast-${theme}`);
      const other = page.locator(
        `#contrast .contrast-${theme === 'dark' ? 'light' : 'dark'}`,
      );
      await expect(shown, `${theme} mode hides its own pairings`).toBeVisible();
      await expect(
        other,
        `${theme} mode shows the other mode's pairings`,
      ).toBeHidden();

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
      expect(rows.length, `${theme} mode lists no pairing`).toBeGreaterThan(0);
      const tokens = [...new Set(rows.flatMap((row) => [row.fg, row.bg]))];
      const hex = await resolveTokens(page, tokens);
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
            : [`${name}: states ${row.stated}, tokens measure ${fromTokens}`]),
          ...(sample === null || sample === row.stated
            ? []
            : [`${name}: states ${row.stated}, its sample paints ${sample}`]),
        ];
      });
      expect(wrong, `a ${theme} ratio differs from the shipped colors`).toEqual(
        [],
      );
      expect(
        rows.filter((row) => row.sample).length,
        `${theme} mode shows no sample`,
      ).toBeGreaterThan(0);
      await context.close();
    });
  }

  for (const theme of ['dark', 'light'] as const) {
    test(`each color swatch shows the hex its row states in ${theme} mode`, async ({
      browser,
    }) => {
      const context = await browser.newContext();
      await context.addInitScript(
        (value) => localStorage.setItem('theme', value),
        theme,
      );
      const page = await context.newPage();
      await gotoSettled(page, ROUTE);
      const rows = await page
        .locator('#color li')
        .evaluateAll((items, mode) => {
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
            /* Each swatch paints its color where its job puts it. */
            const painted = /\bbg-/.test(cls)
              ? hex(style.backgroundColor)
              : /\bshadow-hard-/.test(cls)
                ? hex(style.boxShadow)
                : /\bborder-8\b/.test(cls)
                  ? hex(style.borderTopColor)
                  : /\btext-/.test(cls) && !/\bborder-dashed\b/.test(cls)
                    ? hex(style.color)
                    : null;
            return { token, want: mode === 'light' ? light : dark, painted };
          });
        }, theme);
      expect(rows.length, 'the color section lists no color').toBeGreaterThan(
        0,
      );
      const wrong = rows
        .filter((row) => row.painted !== null && row.painted !== row.want)
        .map(
          (row) => `${row.token}: states ${row.want}, paints ${row.painted}`,
        );
      expect(wrong, `a ${theme} swatch differs from its stated hex`).toEqual(
        [],
      );
      await context.close();
    });
  }

  test(
    'every component row has a name, what it is for, its rule and a live example',
    ENGINE_INVARIANT,
    async ({ page }) => {
      await gotoSettled(page, ROUTE);
      const rows = await page.locator('[data-component]').evaluateAll((items) =>
        items.map((item) => {
          const [use, rule] = [...item.querySelectorAll(':scope > p')].map(
            (p) => p.textContent?.trim() ?? '',
          );
          return {
            id: item.getAttribute('data-component'),
            name: item.querySelector(':scope > h3')?.textContent?.trim() ?? '',
            use: use ?? '',
            rule: rule ?? '',
            example:
              item.querySelector(':scope > [data-example]')?.children.length ??
              0,
          };
        }),
      );
      expect(rows.length, '/brand shows no component').toBeGreaterThan(0);
      const incomplete = rows
        .filter(
          (row) =>
            !row.name ||
            !row.use.startsWith('Use it for ') ||
            !row.rule ||
            row.example === 0,
        )
        .map((row) => row.id);
      expect(incomplete, 'a component row lacks a part').toEqual([]);
    },
  );

  test('ids and landmark names are unique, with the examples on the page', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const { ids, landmarks, mains, h1s } = await page.evaluate(() => {
      const repeated = (values: string[]) =>
        values.filter((value, i) => values.indexOf(value) !== i);
      return {
        ids: repeated(
          [...document.querySelectorAll('[id]')].map((el) => el.id),
        ),
        landmarks: repeated(
          [...document.querySelectorAll('nav, aside, form[aria-label]')]
            /* Unrendered landmarks, like the closed mobile menu's, are out of the tree. */
            .filter((el) => el.checkVisibility())
            .map(
              (el) =>
                `${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() ?? ''}`,
            ),
        ),
        mains: document.querySelectorAll('main').length,
        h1s: document.querySelectorAll('h1').length,
      };
    });
    expect(ids, 'an id is repeated').toEqual([]);
    expect(landmarks, 'two landmarks share a name').toEqual([]);
    expect(mains, 'an example adds a main').toBe(1);
    expect(h1s, 'an example adds an h1').toBe(1);
  });

  test('the example form sends nothing and stays on the page', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const form = page.locator('#form ~ [data-example] form');
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') requests.push(request.url());
    });
    await form.getByLabel(/^Name/).fill('A name');
    await form.getByRole('button', { name: 'Send Message' }).click();
    await form.getByLabel(/^Name/).press('Enter');
    await expect(page, 'the example form left the page').toHaveURL(
      new RegExp(`${ROUTE}$`),
    );
    expect(requests, 'the example form sent a request').toEqual([]);
  });

  test('both theme switches change the one theme and always agree', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const switches = page.locator('.theme-switch');
    await expect(switches).toHaveCount(2);
    const state = () =>
      page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        pressed: [...document.querySelectorAll('.theme-switch')].map((b) =>
          b.getAttribute('aria-pressed'),
        ),
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
    await gotoSettled(page, ROUTE);
    const toggles = page.locator('button[data-example-toggle]');
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

  for (const width of [1280, 390] as const) {
    test(`no roundel covers a control at ${width}px, with every States closed or open`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoSettled(page, ROUTE);
      for (const open of [false, true]) {
        const covered = await page.evaluate((openAll) => {
          for (const details of document.querySelectorAll('main details')) {
            (details as HTMLDetailsElement).open = openAll;
          }
          const boxes = (selector: string) =>
            [...document.querySelectorAll<HTMLElement>(selector)]
              .filter((el) => el.checkVisibility())
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
          `a roundel covers a control with every States ${open ? 'open' : 'closed'}`,
        ).toEqual([]);
      }
    });
  }

  test('the calls to action point at the site repository, and the demo link waits for the demo', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
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

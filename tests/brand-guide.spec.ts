import { expect, test } from './test';
import { readFileSync } from 'node:fs';
import { gotoSettled } from './settle';
import { PAGE_HELPERS } from './contrast';
import { BRAND_PATH, BRAND_SECTIONS } from '../src/lib/brand-sections';
import { PART_ACCESSIBILITY } from '../src/lib/brand-a11y';

/* WebKit applies upgrade-insecure-requests on loopback and then loads nothing over http. */
const UPGRADE_INSECURE = /;?\s*upgrade-insecure-requests/;

test.describe('/brand guide', () => {
  test('the page opens with how to use it, before the first section (SC 3.3.5)', async ({
    page,
  }) => {
    await gotoSettled(page, BRAND_PATH);
    const guide = page.locator('.brand-guide');
    await expect(guide.getByRole('listitem')).toHaveCount(3);
    const before = await page.evaluate(
      () =>
        document
          .querySelector('.brand-guide')!
          .compareDocumentPosition(document.querySelector('#grounds')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(before, 'the guide comes after the first section').toBeTruthy();
  });

  test('the hover and pressed samples look like the real states of the button (SC 1.4.1, 1.4.11)', async ({
    page,
  }) => {
    await gotoSettled(page, BRAND_PATH);
    const real = page.locator('#primary-button ~ div a.btn-primary').first();
    await real.scrollIntoViewIfNeeded();
    const look = (loc: typeof real) =>
      loc.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          background: s.backgroundColor,
          color: s.color,
          shadow: s.boxShadow,
          translate: s.translate,
        };
      });
    const rest = await look(real);
    const box = (await real.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const hovered = await look(real);
    await page.mouse.down();
    const pressed = await look(real);
    await page.mouse.up();
    const sample = (state: string) =>
      page
        .locator(
          `[data-component="primary-button"] .brand-stage-half.mode-dark .${state}`,
        )
        .first();
    const hoverSample = await look(sample('state-hover'));
    const pressSample = await look(sample('state-pressed'));
    expect(hovered.background, 'hover must change the fill').not.toBe(
      rest.background,
    );
    expect(hoverSample.background).toBe(hovered.background);
    expect(hoverSample.color).toBe(hovered.color);
    expect(pressSample.shadow).toBe(pressed.shadow);
    expect(pressSample.translate).toBe(pressed.translate);
  });

  test('each example shows its markup under it and the code never scrolls sideways at 320px (SC 1.4.10, 2.1.1)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await gotoSettled(page, BRAND_PATH);
    const blocks = await page
      .locator('li[data-component]')
      .evaluateAll((rows) =>
        rows.flatMap((row) => {
          const code = row.querySelector<HTMLElement>('pre.brand-code');
          if (!code) return [];
          const label = code.parentElement?.previousElementSibling;
          return [
            {
              part: row.getAttribute('data-component'),
              label: label?.textContent?.trim(),
              text: code.textContent ?? '',
              scrolls: code.scrollWidth > code.clientWidth,
              scoped: /data-astro/.test(code.textContent ?? ''),
            },
          ];
        }),
      );
    expect(blocks.length, 'no example shows its markup').toBeGreaterThan(0);
    const wrong = blocks.flatMap((b) => [
      ...(b.label === 'Markup'
        ? []
        : [`${b.part}: the code has no visible label`]),
      ...(b.text.includes('<') ? [] : [`${b.part}: the code shows no markup`]),
      ...(b.scrolls ? [`${b.part}: the code scrolls sideways`] : []),
      ...(b.scoped ? [`${b.part}: the code shows build attributes`] : []),
    ]);
    expect(wrong).toEqual([]);
  });

  test('every part that has an accessibility line shows it once, after its rule (SC 1.3.1)', async ({
    page,
  }) => {
    await gotoSettled(page, BRAND_PATH);
    const shown = await page.locator('li[data-component]').evaluateAll((rows) =>
      rows.flatMap((row) => {
        const line = [...row.querySelectorAll('p')].find(
          (p) =>
            p.firstElementChild?.matches('b') &&
            p.firstElementChild.textContent === 'Accessibility',
        );
        return line
          ? [
              [
                row.getAttribute('data-component'),
                line.textContent?.slice(13).trim(),
              ],
            ]
          : [];
      }),
    );
    expect(Object.fromEntries(shown)).toEqual(PART_ACCESSIBILITY);
  });

  test("each do and don't pair names both sides in words and hides its samples (SC 1.4.1)", async ({
    page,
  }) => {
    await gotoSettled(page, BRAND_PATH);
    const pairs = await page
      .locator('[data-example] .brand-pair')
      .evaluateAll((all) =>
        all.map((el) => ({
          label: el.querySelector('.label')?.textContent?.trim(),
          hidden: el
            .querySelector('.brand-pair-sample')
            ?.getAttribute('aria-hidden'),
          words:
            el.querySelector('p:last-child')?.textContent?.trim().length ?? 0,
        })),
      );
    expect(pairs.map((p) => p.label)).toEqual(['Do', "Don't", 'Do', "Don't"]);
    expect(pairs.every((p) => p.hidden === 'true' && p.words > 0)).toBe(true);
  });

  for (const width of [1280, 390] as const) {
    test(`at ${width}px the search finds sections by token, hex, rule and partial word, counts them and clears on Escape (SC 3.3.2, 4.1.3)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoSettled(page, BRAND_PATH);
      if (width === 390) await page.locator('#brand-menu summary').click();
      const box = page
        .locator('#brand-menu [data-menu-list]')
        .nth(width === 390 ? 0 : 1);
      const search = box.getByLabel('Search');
      await expect(search).toHaveAttribute('type', 'search');
      await expect(search).toHaveAttribute('placeholder', /token/i);
      const links = box.locator('a.brand-menu-link');
      const shown = () => links.locator('visible=true');
      await expect(shown()).toHaveCount(BRAND_SECTIONS.length);
      const status = box.getByRole('status');

      await search.fill('colo');
      await expect(shown()).not.toHaveCount(BRAND_SECTIONS.length);
      await expect(shown().first()).toBeVisible();
      await expect(status).toHaveText(/^\d+ matches?$/);

      await search.fill('#ffc000');
      expect(
        await shown().count(),
        'a hex value finds no section',
      ).toBeGreaterThan(0);
      await search.fill('cólór');
      await expect(shown().filter({ hasText: 'Color' })).toHaveCount(1);
      await search.fill('pause');
      await expect(shown().filter({ hasText: 'Motion' })).toHaveCount(1);
      await search.fill('zzzz');
      await expect(shown()).toHaveCount(0);
      await expect(status).toContainText('No matches. Try');
      await search.press('Escape');
      await expect(search).toHaveValue('');
      await expect(shown()).toHaveCount(BRAND_SECTIONS.length);
      await expect(status).toHaveText('');
    });
  }

  test('each code block has a Copy button that names what it copies, copies it and says so (SC 2.5.5, 4.1.3)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const copied: string[] = [];
      Object.defineProperty(window, '__copied', { value: copied });
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (text: string) => void copied.push(text) },
      });
    });
    await gotoSettled(page, BRAND_PATH);
    const code = page.locator('pre.brand-code').first();
    const button = page.getByRole('button', {
      name: 'Copy markup for Page Ground',
    });
    await expect(button).toHaveCount(1);
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(page.getByRole('status').last()).toHaveText('Copied');
    expect(
      await page.evaluate(
        () => (window as never as { __copied: string[] }).__copied,
      ),
    ).toEqual([await code.textContent()]);
    await expect(
      page.getByRole('button', { name: 'Copy markup for Page Ground' }),
      'the name changed after the press',
    ).toHaveCount(1);
  });

  test('a refused copy says so and leaves the code selected (SC 3.3.1, 4.1.3)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined });
    });
    await gotoSettled(page, BRAND_PATH);
    const code = page.locator('pre.brand-code').first();
    await page
      .getByRole('button', { name: 'Copy markup for Page Ground' })
      .click();
    await expect(page.getByRole('status').last()).toHaveText(
      'Copy failed. The code is selected: press Ctrl+C or Command+C.',
    );
    expect(await page.evaluate(() => getSelection()?.toString())).toBe(
      await code.textContent(),
    );
  });

  test('without a script no Copy button is drawn', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(BRAND_PATH);
    await expect(page.locator('pre.brand-code').first()).toBeVisible();
    await expect(page.locator('.copy-button')).toHaveCount(0);
    await context.close();
  });

  test('the Copy buttons are drawn under the CSP the site ships, which blocks HTML strings (Trusted Types)', async ({
    page,
  }) => {
    const csp = /Content-Security-Policy: (.+)/.exec(
      readFileSync('public/_headers', 'utf8'),
    )?.[1];
    expect(csp, 'public/_headers has no Content-Security-Policy').toBeTruthy();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) =>
        console.error(`csp: ${event.violatedDirective}`),
      );
    });
    page.on('console', (message) => {
      if (message.text().startsWith('csp:')) errors.push(message.text());
    });
    await page.route('**/brand/', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'content-security-policy': csp!.replace(UPGRADE_INSECURE, ''),
        },
      });
    });
    await gotoSettled(page, BRAND_PATH);
    await expect(page.locator('.copy-button').first()).toBeVisible();
    expect(errors, 'a script threw under the shipped CSP').toEqual([]);
  });

  test('the search placeholder is subtle text, readable at 7:1 like other subtle text (SC 1.4.6)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoSettled(page, BRAND_PATH);
    const colors = await page
      .locator('#brand-menu [data-menu-list]')
      .nth(1)
      .evaluate((box) => ({
        placeholder: getComputedStyle(
          box.querySelector('input')!,
          '::placeholder',
        ).color,
        opacity: getComputedStyle(box.querySelector('input')!, '::placeholder')
          .opacity,
        subtle: getComputedStyle(box.querySelector('[data-menu-status]')!)
          .color,
      }));
    expect(colors.placeholder).toBe(colors.subtle);
    expect(colors.opacity).toBe('1');
  });

  test('the current chip shows its marker against the chip in both halves (SC 1.4.11)', async ({
    page,
  }) => {
    await gotoSettled(page, BRAND_PATH);
    const ratios = (await page.evaluate(`(() => {
      ${PAGE_HELPERS}
      return [...document.querySelectorAll('[data-component="chips"] .brand-stage-half')].map((half) => {
        const chip = half.querySelector('a[aria-current]');
        const marker = chip.querySelector('span[aria-hidden]');
        return ratio(parse(getComputedStyle(marker).backgroundColor), parse(getComputedStyle(chip).backgroundColor));
      });
    })()`)) as number[];
    expect(ratios).toHaveLength(2);
    for (const value of ratios) expect(value).toBeGreaterThanOrEqual(3);
  });

  for (const width of [320, 1280] as const) {
    test(`at ${width}px the Copy button never covers code text, at rest or after a copy (SC 1.4.10, 1.4.12)`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: async () => undefined },
        });
      });
      await page.setViewportSize({ width, height: 900 });
      await gotoSettled(page, BRAND_PATH);
      const frames = page.locator('.brand-code-frame');
      const count = await frames.count();
      expect(count).toBeGreaterThan(0);
      const overlaps = async () =>
        page.evaluate(() =>
          [...document.querySelectorAll('.brand-code-frame')].flatMap(
            (frame) => {
              const button = frame
                .querySelector('.copy-button')!
                .getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(frame.querySelector('code')!);
              return [...range.getClientRects()]
                .filter(
                  (r) =>
                    r.width > 0 &&
                    r.left < button.right &&
                    r.right > button.left &&
                    r.top < button.bottom &&
                    r.bottom > button.top,
                )
                .map(() =>
                  frame.querySelector('pre')!.getAttribute('data-copy'),
                );
            },
          ),
        );
      expect(await overlaps(), 'code text runs under a Copy button').toEqual(
        [],
      );
      await page.addStyleTag({
        content:
          '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }',
      });
      expect(
        await overlaps(),
        'text spacing pushes code under a Copy button',
      ).toEqual([]);
      for (let i = 0; i < Math.min(count, 6); i += 1) {
        await frames.nth(i).locator('.copy-button').click();
      }
      expect(await overlaps(), 'the Copied label covers code text').toEqual([]);
      const short = await page.evaluate(() =>
        [...document.querySelectorAll('.brand-code-frame')].flatMap((frame) => {
          const pre = frame.querySelector('pre')!;
          const reach = parseFloat(getComputedStyle(pre, '::before').width);
          const pad = parseFloat(getComputedStyle(pre).paddingRight);
          const width = frame
            .querySelector('.copy-button')!
            .getBoundingClientRect().width;
          return width > reach - pad
            ? [
                `${pre.getAttribute('data-copy')}: button ${width}px, room ${reach - pad}px`,
              ]
            : [];
        }),
      );
      expect(
        short,
        'the corner float is narrower than the button with its label',
      ).toEqual([]);
    });
  }

  for (const theme of ['dark', 'light'] as const) {
    test(`on a ${theme} page the Copy icon is at least 3:1 against the code ground and its name does not change (SC 1.4.11)`, async ({
      page,
    }) => {
      await gotoSettled(page, BRAND_PATH);
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const ratioOf = (await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        const button = document.querySelector('.copy-button');
        const pre = button.closest('.brand-code-frame').querySelector('pre');
        return ratio(parse(getComputedStyle(button).color), parse(getComputedStyle(pre).backgroundColor));
      })()`)) as number;
      expect(ratioOf).toBeGreaterThanOrEqual(3);
      const button = page.locator('.copy-button').first();
      const before = await button.evaluate((el) => el.textContent);
      await button.focus();
      const ring = await button.evaluate((el) => {
        const s = getComputedStyle(el);
        const frame = el.closest('.brand-code-frame')!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const reach = parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth);
        return {
          offset: parseFloat(s.outlineOffset),
          inside:
            box.left - reach >= frame.left && box.top - reach >= frame.top,
        };
      });
      expect(
        ring.offset,
        'the ring should be drawn inside the button',
      ).toBeLessThan(0);
      expect(ring.inside).toBe(true);
      expect(before).toContain('Copy markup for');
    });
  }

  test('the Copy tip shows on hover and on focus, stays while the pointer is on it, and Escape hides it without moving focus (SC 1.4.13)', async ({
    page,
  }) => {
    await gotoSettled(page, BRAND_PATH);
    const wrap = page.locator('.copy-wrap').first();
    const tip = wrap.locator('.copy-tip');
    const button = wrap.getByRole('button');
    await button.scrollIntoViewIfNeeded();
    await expect(tip).toBeHidden();
    await button.hover();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('Copy');
    const box = (await tip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(tip, 'the tip vanished under the pointer').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await page.mouse.move(0, 0);
    await button.hover();
    await expect(tip, 'the tip did not return after leaving').toBeVisible();
    await page.mouse.move(0, 0);
    await button.focus();
    await expect(tip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    expect(
      await page.evaluate(() =>
        document.activeElement?.classList.contains('copy-button'),
      ),
      'Escape moved focus',
    ).toBe(true);
    const overlap = await page.evaluate(() => {
      const frame = document.querySelector('.copy-wrap')!.parentElement!;
      const range = document.createRange();
      range.selectNodeContents(frame.querySelector('code')!);
      const tipBox = frame.querySelector('.copy-tip')!.getBoundingClientRect();
      return [...range.getClientRects()].filter(
        (r) =>
          r.left < tipBox.right &&
          r.right > tipBox.left &&
          r.top < tipBox.bottom &&
          r.bottom > tipBox.top,
      ).length;
    });
    expect(overlap, 'the tip covers code text').toBe(0);
  });

  test('in forced colors the Copy button keeps a border and its icon takes the button color (SC 1.4.11)', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoSettled(page, BRAND_PATH);
    const look = await page
      .locator('.copy-button')
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        const path = getComputedStyle(el.querySelector('path')!);
        return {
          border: s.borderTopColor,
          width: s.borderTopWidth,
          ground: s.backgroundColor,
          fill: path.fill,
        };
      });
    expect(look.border).not.toBe('rgba(0, 0, 0, 0)');
    expect(look.width).not.toBe('0px');
    expect(look.fill, 'the icon is not drawn').not.toBe('none');
    expect(look.fill, 'the icon vanishes into the button').not.toBe(
      look.ground,
    );
  });

  for (const reduce of [true, false]) {
    test(`with reduced motion ${reduce ? 'on the Copy icon swaps instantly' : 'off nothing on the Copy button takes 200 ms or more'} (SC 2.3.3)`, async ({
      page,
    }) => {
      await page.emulateMedia({
        reducedMotion: reduce ? 'reduce' : 'no-preference',
      });
      await gotoSettled(page, BRAND_PATH);
      const longest = await page
        .locator('.copy-wrap')
        .first()
        .evaluate((el) =>
          Math.max(
            ...[el, ...el.querySelectorAll('*')].map((node) => {
              const s = getComputedStyle(node);
              return (
                Math.max(
                  parseFloat(s.transitionDuration),
                  parseFloat(s.animationDuration),
                ) * 1000
              );
            }),
          ),
        );
      expect(longest).toBeLessThan(reduce ? 1 : 200);
    });
  }

  test('a tap copies, shows the check and the word Copied, resets after two seconds and a second press announces again (SC 2.5.8, 4.1.3)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ hasTouch: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async () => undefined },
      });
      document.addEventListener('DOMContentLoaded', () => {
        const log: string[] = [];
        Object.defineProperty(window, '__announced', { value: log });
        new MutationObserver((records) => {
          for (const record of records) {
            const target = record.target as Element;
            if (!target.matches?.('body > [role="status"]')) continue;
            log.push(record.addedNodes[0]?.textContent ?? '');
          }
        }).observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      });
    });
    await gotoSettled(page, BRAND_PATH);
    const wrap = page.locator('.copy-wrap').first();
    const button = wrap.getByRole('button');
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    const shape = () => wrap.locator('path').getAttribute('d');
    const rest = await shape();
    await button.tap();
    await expect(wrap.getByText('Copied', { exact: true })).toBeVisible();
    expect(await shape(), 'the icon did not become a check').not.toBe(rest);
    await expect(wrap.getByText('Copied', { exact: true })).toBeHidden({
      timeout: 3500,
    });
    expect(await shape()).toBe(rest);
    await button.tap();
    await expect(wrap.getByText('Copied', { exact: true })).toBeVisible();
    const announced = await page.evaluate(
      () => (window as never as { __announced: string[] }).__announced,
    );
    expect(
      announced.join('|'),
      'the status did not clear between two copies',
    ).toContain('Copied||Copied');
    await context.close();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`on a ${theme} page the Copy tip text reads at 7:1 and its icon and ring at 3:1 (SC 1.4.6, 1.4.11)`, async ({
      page,
    }) => {
      await gotoSettled(page, BRAND_PATH);
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const button = page.locator('.copy-button').first();
      await button.scrollIntoViewIfNeeded();
      await button.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      const ratios = (await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        const button = document.querySelector('.copy-button');
        const tip = button.parentElement.querySelector('.copy-tip');
        tip.style.display = 'block';
        const b = getComputedStyle(button);
        const t = getComputedStyle(tip);
        return {
          tip: ratio(parse(t.color), parse(t.backgroundColor)),
          icon: ratio(parse(b.color), parse(b.backgroundColor)),
          ring: ratio(parse(b.outlineColor), parse(b.backgroundColor)),
          ringWidth: parseFloat(b.outlineWidth),
        };
      })()`)) as { tip: number; icon: number; ring: number; ringWidth: number };
      expect(ratios.tip).toBeGreaterThanOrEqual(7);
      expect(ratios.icon).toBeGreaterThanOrEqual(3);
      expect(ratios.ring).toBeGreaterThanOrEqual(3);
      expect(ratios.ringWidth).toBeGreaterThanOrEqual(4);
    });
  }

  test('loading /brand logs no console errors or warnings in any engine (code quality)', async ({
    page,
  }) => {
    const logged: string[] = [];
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type()))
        logged.push(message.text());
    });
    page.on('pageerror', (error) => logged.push(error.message));
    await gotoSettled(page, BRAND_PATH);
    expect(logged).toEqual([]);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`on a ${theme} page the Copy ring stays at 3:1 against the hover fill when hovered and keyboard-focused (SC 1.4.11)`, async ({
      page,
    }) => {
      await gotoSettled(page, BRAND_PATH);
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const button = page.locator('.copy-button').first();
      await button.scrollIntoViewIfNeeded();
      await page.keyboard.press('Tab');
      await button.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await button.hover();
      const measured = (await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        const b = getComputedStyle(document.querySelector('.copy-button:focus-visible'));
        return ratio(parse(b.outlineColor), parse(b.backgroundColor));
      })()`)) as number;
      expect(measured).toBeGreaterThanOrEqual(3);
    });
  }
});

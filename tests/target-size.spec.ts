import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES } from './routes';
import { FOCUSABLE_SELECTOR, MIN_TARGET, NARROW_WIDTH } from './wcag';

/**
 * SC 2.5.5 Target Size (Enhanced) on every interactive element on every route:
 * a MIN_TARGET square centred on each target hits only that target, so a hit
 * area may be wider than the drawn control but never shared with another.
 */

const VIEWPORTS = [
  { width: NARROW_WIDTH, height: 900, note: '400% zoom, classic scrollbar' },
  { width: 1280, height: 900, note: 'desktop' },
] as const;

interface UndersizedTarget {
  selector: string;
  name: string;
  /** Probe points in the square that land on something else. */
  missed: number;
  /** What the first missed point landed on. */
  hit: string;
}

const TARGET_DESCRIBE = `
    const describe = (el) => {
      const id = el.id ? '#' + el.id : '';
      const cls =
        typeof el.className === 'string' && el.className.trim() !== ''
          ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
          : '';
      return el.tagName.toLowerCase() + id + cls;
    };
`;

const TARGET_INLINE_IN_TEXT = `
    /*
     * SC 2.5.5 inline exception: inline, with text around it in the line.
     * Climbs inline ancestors: Markdown wraps prose links in \`strong\`.
     */
    const isInlineInText = (el) => {
      if (getComputedStyle(el).display !== 'inline') return false;

      for (let node = el; node !== null; node = node.parentElement) {
        const parent = node.parentElement;
        if (parent === null) return false;

        const around = [...parent.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => (n.textContent ?? '').trim())
          .join('');
        if (around !== '') return true;

        // Past the innermost block container there is no sentence to be in.
        if (getComputedStyle(parent).display !== 'inline') return false;
      }

      return false;
    };
`;

interface TargetWalk {
  undersized: UndersizedTarget[];
  /** Controls measured against the minimum, after the inline exemption. */
  judged: number;
}

/** `scope` limits the walk to an open dialog, where the page behind takes no pointer. */
const undersizedTargets = (page: Page, scope = 'body'): Promise<TargetWalk> =>
  page.evaluate(`(() => {
    ${TARGET_DESCRIBE}
    ${TARGET_INLINE_IN_TEXT}

    const min = ${MIN_TARGET};
    /* A 3 by 3 grid over the square, 1px in from its edges. */
    const reach = min / 2 - 1;
    const offsets = [-reach, 0, reach];
    const out = [];
    let judged = 0;

    for (const el of document.querySelector(${JSON.stringify(scope)}).querySelectorAll(${JSON.stringify(FOCUSABLE_SELECTOR)})) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (!el.checkVisibility()) continue;
      if (isInlineInText(el)) continue;
      judged += 1;

      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      /* A control that ignores the pointer, such as an About cat's band, is hit through its own live part. */
      const live =
        getComputedStyle(el).pointerEvents === 'none'
          ? [...el.querySelectorAll('*')].find(
              (node) =>
                getComputedStyle(node).pointerEvents !== 'none' &&
                node.getBoundingClientRect().width > 0,
            ) ?? el
          : el;
      /* The part a pointer can reach: clipped by every scrolling ancestor, such as a photo strip. */
      const liveBox = live.getBoundingClientRect();
      let [left, top, right, bottom] = [
        liveBox.left,
        liveBox.top,
        liveBox.right,
        liveBox.bottom,
      ];
      for (let node = live.parentElement; node; node = node.parentElement) {
        if (getComputedStyle(node).overflow === 'visible') continue;
        const clip = node.getBoundingClientRect();
        left = Math.max(left, clip.left);
        top = Math.max(top, clip.top);
        right = Math.min(right, clip.right);
        bottom = Math.min(bottom, clip.bottom);
      }
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      /* A tilted target, such as a tag chip, is measured in its own orientation. */
      const turn = parseFloat(getComputedStyle(el).rotate) || 0;
      const [cos, sin] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
      /* Off screen even when scrolled to, like the skip link before focus: no pointer reaches it. */
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) {
        judged -= 1;
        continue;
      }
      let missed = 0;
      let hit = '';
      for (const dx of offsets) {
        for (const dy of offsets) {
          const at = document.elementFromPoint(
            cx + dx * cos - dy * sin,
            cy + dx * sin + dy * cos,
          );
          if (at !== null && (at === el || el.contains(at))) continue;
          missed += 1;
          if (hit === '') hit = at === null ? 'nothing' : describe(at);
        }
      }
      if (missed === 0) continue;

      out.push({
        selector: describe(el),
        name: (el.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 40),
        missed,
        hit,
      });
    }

    return { undersized: out, judged };
  })()`) as Promise<TargetWalk>;

for (const { width, height, note } of VIEWPORTS) {
  test.describe(`SC 2.5.5 target size at ${width}px (${note})`, () => {
    test.use({ viewport: { width, height } });

    for (const route of SAMPLED_ROUTES) {
      test(`${route} has no undersized target`, async ({ page }) => {
        const response = await gotoSettled(page, route);
        expect(response?.status(), `${route} should serve a 200`).toBe(200);

        const { undersized, judged } = await undersizedTargets(page);

        // After the inline exemption; every route has non-inline header controls.
        expect(
          judged,
          `the target-size walk judged no control on ${route}.`,
        ).toBeGreaterThan(0);

        expect(
          undersized,
          `${route} has targets whose ${MIN_TARGET}x${MIN_TARGET} CSS px square is not all theirs at ${width}px:\n` +
            undersized
              .map(
                (t) =>
                  `  ${t.selector}, "${t.name}": ${t.missed}/9 points on ${t.hit}`,
              )
              .join('\n'),
        ).toEqual([]);
      });
    }
  });
}

const OPEN_STATES: readonly {
  name: string;
  route: string;
  /** The menu button only shows below 48rem. */
  narrowOnly: boolean;
  open: (page: Page) => Promise<void>;
}[] = [
  {
    name: 'the cat card',
    route: '/about',
    narrowOnly: false,
    /* The button takes no pointer, only the moving drawn cat does, so open it from the keyboard. */
    open: async (page) => {
      await page.locator('#cat-spot-minerva .cat-button').focus();
      await page.keyboard.press('Enter');
    },
  },
  {
    name: 'the photo viewer',
    route: '/about',
    narrowOnly: false,
    open: (page) =>
      page.locator('#people-photos a[data-photo]').first().click(),
  },
  {
    name: 'the mobile menu',
    route: '/',
    narrowOnly: true,
    open: (page) => page.getByRole('button', { name: /menu/i }).click(),
  },
];

for (const { width, height, note } of VIEWPORTS) {
  test.describe(`SC 2.5.5 target size in open dialogs at ${width}px (${note})`, () => {
    test.use({ viewport: { width, height } });

    for (const state of OPEN_STATES.filter(
      (s) => !s.narrowOnly || width === NARROW_WIDTH,
    )) {
      test(`${state.name} has no undersized target`, async ({ page }) => {
        await gotoSettled(page, state.route);
        await state.open(page);
        await expect(page.locator('dialog[open]')).toBeVisible();

        const { undersized, judged } = await undersizedTargets(
          page,
          'dialog[open]',
        );
        expect(judged, `${state.name} has no control to judge`).toBeGreaterThan(
          0,
        );
        expect(
          undersized,
          `${state.name} has targets whose ${MIN_TARGET}x${MIN_TARGET} CSS px square is not all theirs at ${width}px:\n` +
            undersized
              .map(
                (t) =>
                  `  ${t.selector}, "${t.name}": ${t.missed}/9 points on ${t.hit}`,
              )
              .join('\n'),
        ).toEqual([]);
      });
    }
  });
}

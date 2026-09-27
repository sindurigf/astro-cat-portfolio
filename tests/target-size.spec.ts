import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES } from './routes';
import { FOCUSABLE_SELECTOR, MIN_TARGET, NARROW_WIDTH } from './wcag';

/**
 * SC 2.5.8 Target Size (Minimum) on every interactive element on every route.
 * Implements the inline and not-rendered exceptions; the spacing exception is
 * deliberately not relied on, so an unrelated gap change cannot break 2.5.8.
 */

const VIEWPORTS = [
  { width: NARROW_WIDTH, height: 900, note: '400% zoom, classic scrollbar' },
  { width: 1280, height: 900, note: 'desktop' },
] as const;

interface UndersizedTarget {
  selector: string;
  name: string;
  width: number;
  height: number;
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
     * SC 2.5.8 inline exception: inline, with text around it in the line.
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

const undersizedTargets = (page: Page): Promise<TargetWalk> =>
  page.evaluate(`(() => {
    ${TARGET_DESCRIBE}
    ${TARGET_INLINE_IN_TEXT}

    const min = ${MIN_TARGET};
    const out = [];
    let judged = 0;

    for (const el of document.querySelectorAll(${JSON.stringify(FOCUSABLE_SELECTOR)})) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (isInlineInText(el)) continue;
      judged += 1;
      if (box.width >= min && box.height >= min) continue;

      out.push({
        selector: describe(el),
        name: (el.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 40),
        width: Number(box.width.toFixed(1)),
        height: Number(box.height.toFixed(1)),
      });
    }

    return { undersized: out, judged };
  })()`) as Promise<TargetWalk>;

for (const { width, height, note } of VIEWPORTS) {
  test.describe(`SC 2.5.8 target size at ${width}px (${note})`, () => {
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
          `${route} has targets under ${MIN_TARGET}x${MIN_TARGET} CSS px at ${width}px:\n` +
            undersized
              .map(
                (t) => `  ${t.selector}, ${t.width}x${t.height}, "${t.name}"`,
              )
              .join('\n'),
        ).toEqual([]);
      });
    }
  });
}

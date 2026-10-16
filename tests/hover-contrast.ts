import type { Page } from './test';
import { AAA_TEXT, PAGE_HELPERS } from './contrast';

/* Each kind of control behaves alike, so a few of each cover a route in reasonable time. */
const SAMPLES_PER_KIND = 3;
const CONTROLS = 'a[href], button, summary';

/** Marks up to a few visible elements of each tag and class matching `selector`; returns their sample ids. */
export const sampleControls = (
  page: Page,
  selector: string,
): Promise<string[]> =>
  page.evaluate(
    ({ selector, perKind }) => {
      const seen = new Map<string, number>();
      return [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((el) => el.checkVisibility())
        .flatMap((el, index) => {
          const kind = `${el.tagName} ${el.className}`;
          const count = seen.get(kind) ?? 0;
          seen.set(kind, count + 1);
          if (count >= perKind) return [];
          el.dataset.hoverSample = String(index);
          return [String(index)];
        });
    },
    { selector, perKind: SAMPLES_PER_KIND },
  );

export const sampled = (id: string): string => `[data-hover-sample="${id}"]`;

/**
 * SC 1.4.6 under the pointer: each sampled control in `scope` is hovered and
 * every text node in it measured at 7:1, large text included, as /accessibility claims.
 */
export const hoveredTextBelowAaa = async (
  page: Page,
  scope: string,
): Promise<string[]> => {
  const failures: string[] = [];
  for (const id of await sampleControls(
    page,
    `:is(${scope}) :is(${CONTROLS})`,
  )) {
    const control = page.locator(sampled(id));
    await control.scrollIntoViewIfNeeded();
    await control.hover({ force: true });
    const found = (await page.evaluate(`(() => {
      ${PAGE_HELPERS}
      const el = document.querySelector('[data-hover-sample="${id}"]');
      const out = [];
      for (const node of [el, ...el.querySelectorAll('*')]) {
        const text = [...node.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!text || !node.checkVisibility() || node.closest('.sr-only')) continue;
        const cs = getComputedStyle(node);
        const ground = effectiveBackground(node);
        const r = ratio(over(parse(cs.color), ground), ground);
        const need = ${AAA_TEXT};
        if (r < need) out.push(node.tagName.toLowerCase() + '.' + [...node.classList].slice(0, 3).join('.') + ' "' + node.textContent.trim().slice(0, 30) + '" ' + r.toFixed(2) + ' < ' + need);
      }
      return out;
    })()`)) as string[];
    failures.push(...found);
  }
  await page.mouse.move(0, 0);
  return failures;
};

import { expect, test } from './test';
import { gotoSettled } from './settle';
import { FOCUSABLE_SELECTOR } from './wcag';
import { SAMPLED_ROUTES } from './routes';

const SCHEMES = ['dark', 'light'] as const;

/* One failure in 80 CI runs with no local repro: keep the failing attempt's trace, not only the retry's. */
test.use({ trace: 'retain-on-first-failure' });

/** How far the hard box and drop shadows of a control, or of anything inside it, reach past its box, in px. */
const SHADOW_REACH = `
  const shadowsOf = (value) =>
    value
      .split(/,(?![^(]*\\))/)
      .filter((layer) => !layer.includes('inset'))
      .map((layer) => layer.match(/(-?\\d+(?:\\.\\d+)?)px (-?\\d+(?:\\.\\d+)?)px 0px/))
      .filter(Boolean)
      .map((m) => [Number(m[1]), Number(m[2])]);
  const shadowReach = (el) => {
    const box = el.getBoundingClientRect();
    let reach = 0;
    for (const node of [el, ...el.querySelectorAll('*')]) {
      const r = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const drops = [...style.filter.matchAll(/drop-shadow\\((?:[^()]|\\([^()]*\\))*\\)/g)].map((m) => m[0]);
      for (const [dx, dy] of [...shadowsOf(style.boxShadow), ...drops.flatMap(shadowsOf)]) {
        reach = Math.max(reach, r.right + dx - box.right, r.bottom + dy - box.bottom);
      }
    }
    return reach;
  };
`;

/* WebKit takes 130-250ms per pointer move, so each route's hovers run in stripes, one test each. */
const RING_CLEARANCE_STRIPES = 3;

/* A third of the 30 s test timeout: a stuck step fails with its control named, not as a bare timeout. */
const RING_STEP_LIMIT_MS = 10_000;

const withinStepLimit = async <T>(
  work: Promise<T>,
  what: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} took over ${RING_STEP_LIMIT_MS} ms.`)),
      RING_STEP_LIMIT_MS,
    );
  });
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
};

/* SC 1.4.11: cyan over a pink shadow is 2.29, so no ring outside its box may start inside the shadows of its own control. */
for (const colorScheme of SCHEMES) {
  test.describe(`ring clearance, ${colorScheme}`, () => {
    test.use({ colorScheme, viewport: { width: 1280, height: 900 } });

    for (const route of SAMPLED_ROUTES) {
      for (let stripe = 0; stripe < RING_CLEARANCE_STRIPES; stripe += 1) {
        test(`${route} clears every focused control's shadow${stripe === 0 ? ' at rest and' : ''} under the pointer, part ${stripe + 1} of ${RING_CLEARANCE_STRIPES}`, async ({
          page,
        }) => {
          await gotoSettled(page, route);
          /* Keyboard modality first, so a scripted focus() still matches :focus-visible. */
          await page.keyboard.press('Tab');
          /* Two round trips per control: one to read it and aim at the next, one pointer move. */
          const measure = new Function(
            'args',
            `${SHADOW_REACH}
          const controls = document.querySelectorAll(args.selector);
          const found = args.read.map((index) => {
            const el = controls[index];
            el.focus();
            const s = getComputedStyle(el);
            return {
              name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
              offset: parseFloat(s.outlineOffset) || 0,
              width: parseFloat(s.outlineWidth) || 0,
              shadow: shadowReach(el),
            };
          });
          const next = controls[args.aim];
          if (!next) return { found, at: null };
          next.scrollIntoView({ block: 'center', inline: 'center' });
          const r = next.getBoundingClientRect();
          return { found, at: { x: r.left + r.width / 2, y: r.top + r.height / 2 } };`,
          ) as (args: { selector: string; read: number[]; aim: number }) => {
            found: {
              name: string;
              offset: number;
              width: number;
              shadow: number;
            }[];
            at: { x: number; y: number } | null;
          };
          const visible = await page.evaluate(
            (selector) =>
              [...document.querySelectorAll(selector)].flatMap((el, index) =>
                el.checkVisibility({ visibilityProperty: true }) ? [index] : [],
              ),
            FOCUSABLE_SELECTOR,
          );
          const short: string[] = [];
          const report = (
            found: {
              name: string;
              offset: number;
              width: number;
              shadow: number;
            }[],
            hover: boolean,
          ) => {
            for (const { name, offset, width, shadow } of found) {
              // A ring drawn wholly inside its box, as on the header's bricks, never meets a shadow outside it.
              const inside = offset + width <= 0;
              if (!inside && shadow > 0 && offset < shadow)
                short.push(
                  `${name}${hover ? ' (hovered)' : ''}: ring offset ${offset}px, shadow reaches ${shadow.toFixed(1)}px past the box`,
                );
            }
          };
          const hovered = visible.filter(
            (_, i) => i % RING_CLEARANCE_STRIPES === stripe,
          );
          /* The resting read is one evaluate, so only the first stripe makes it. */
          let step = await page.evaluate(measure, {
            selector: FOCUSABLE_SELECTOR,
            read: stripe === 0 ? visible : [],
            aim: hovered[0] ?? -1,
          });
          report(step.found, false);
          for (const [k, index] of hovered.entries()) {
            if (!step.at) break;
            const where = `${route} part ${stripe + 1}, control ${index}`;
            await withinStepLimit(
              page.mouse.move(step.at.x, step.at.y),
              `Moving the pointer to ${where}`,
            );
            step = await withinStepLimit(
              page.evaluate(measure, {
                selector: FOCUSABLE_SELECTOR,
                read: [index],
                aim: hovered[k + 1] ?? -1,
              }),
              `Reading ${where}`,
            );
            report(step.found, true);
          }
          expect(
            short,
            `${route} has a ring that lands on its own shadow`,
          ).toEqual([]);
        });
      }
    }
  });
}

import type { Page } from '@playwright/test';

/** One focused control, probed on a grid over each of its line boxes. */
export interface Obscured {
  control: string;
  /** Probe points inside the viewport. */
  probed: number;
  /** What sat on top at a covered point; empty when nothing did. */
  coveredBy: string[];
}

/** Probes per side of each client rect; the edges are inset so they land on the control. */
const GRID = 5;
const INSET_PX = 1;

/**
 * SC 2.4.12 Focus Not Obscured (Enhanced): no part of the focused control is
 * hidden by author content. Per client rect, so a link wrapped over two lines
 * is probed on its own fragments, not the box between them.
 */
export const readObscured = (page: Page): Promise<Obscured> =>
  page.evaluate(
    ({ grid, inset }) => {
      const el = document.activeElement;
      if (!el || el === document.body) {
        throw new Error('nothing is focused to probe.');
      }
      const label = (node: Element): string =>
        node.tagName.toLowerCase() +
        (node.id ? `#${node.id}` : '') +
        (typeof node.className === 'string' && node.className.trim()
          ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : '');

      let probed = 0;
      const coveredBy = new Set<string>();
      for (const rect of el.getClientRects()) {
        if (rect.width <= 2 * inset || rect.height <= 2 * inset) continue;
        for (let i = 0; i < grid; i += 1) {
          for (let j = 0; j < grid; j += 1) {
            const x =
              rect.left + inset + ((rect.width - 2 * inset) * i) / (grid - 1);
            const y =
              rect.top + inset + ((rect.height - 2 * inset) * j) / (grid - 1);
            if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
            probed += 1;
            const hit = document.elementFromPoint(x, y);
            if (hit && (el.contains(hit) || hit.contains(el))) continue;
            coveredBy.add(hit ? label(hit) : 'nothing');
          }
        }
      }
      return {
        control: `${label(el)} ${JSON.stringify((el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40))}`,
        probed,
        coveredBy: [...coveredBy],
      };
    },
    { grid: GRID, inset: INSET_PX },
  );

/** Controls with any covered point, or none inside the viewport, one per line. */
export const obscuredReport = (stops: Obscured[]): string[] =>
  stops
    .filter((stop) => stop.probed === 0 || stop.coveredBy.length > 0)
    .map((stop) =>
      stop.probed === 0
        ? `${stop.control}: outside the viewport`
        : `${stop.control}: under ${stop.coveredBy.join(', ')}`,
    );

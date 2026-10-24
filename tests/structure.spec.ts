import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES } from './routes';
import { DESKTOP_VIEWPORT } from './wcag';
import { SITE_NAME } from '../src/lib/site';

/**
 * The accessibility tree a screen reader lists (docs/MANUAL_TESTING.md §6.6,
 * §6.8), read from Playwright's ARIA snapshot so it is what the browser
 * exposes, not what the markup says.
 */

interface Node {
  role: string;
  name: string;
  level: number;
  depth: number;
  parents: string[];
}

const LANDMARKS = new Set([
  'banner',
  'main',
  'contentinfo',
  'navigation',
  'region',
  'complementary',
  'search',
  'form',
]);
const SINGLE_LANDMARKS = ['banner', 'main', 'contentinfo'] as const;
const ENTRY_LINE = /^(\s*)- (.*)$/;
const NODE_TEXT = /^(\w+)(?: "((?:[^"\\]|\\.)*)")?(.*)$/;
/* YAML single-quotes an entry that holds a colon: 'heading "A: B" [level=1]'. */
const unquote = (text: string) =>
  text.startsWith("'")
    ? text
        .slice(1)
        .replace(/'(:?)$/, '$1')
        .replace(/''/g, "'")
    : text;
const LEVEL = /\[level=(\d+)\]/;
const INDENT = 2;

const readTree = async (page: Page): Promise<Node[]> => {
  const nodes: Node[] = [];
  const stack: Node[] = [];
  for (const line of (await page.locator('body').ariaSnapshot()).split('\n')) {
    const [, indent, text] = ENTRY_LINE.exec(line) ?? [];
    const [, role, name, rest] =
      (text === undefined ? null : NODE_TEXT.exec(unquote(text))) ?? [];
    if (indent === undefined || role === undefined || rest === undefined)
      continue;
    const depth = indent.length / INDENT;
    while ((stack.at(-1)?.depth ?? -Infinity) >= depth) stack.pop();
    const node: Node = {
      role,
      name: (name ?? '').replace(/\\"/g, '"'),
      level: Number(LEVEL.exec(rest)?.[1] ?? 0),
      depth,
      parents: stack.map((parent) => parent.role),
    };
    nodes.push(node);
    stack.push(node);
  }
  return nodes;
};

const label = (node: Node) =>
  node.name ? `${node.role} "${node.name}"` : node.role;

test.use({ viewport: DESKTOP_VIEWPORT });

for (const route of SAMPLED_ROUTES) {
  test.describe(`${route} in the accessibility tree`, () => {
    let tree: Node[];

    test.beforeEach(async ({ page }) => {
      await gotoSettled(page, route);
      tree = await readTree(page);
    });

    /* SC 1.3.1, 2.4.1: one of each page landmark, in reading order. */
    test('has one banner, main and contentinfo, in that order', () => {
      const landmarks = tree.filter((node) => LANDMARKS.has(node.role));
      const order = SINGLE_LANDMARKS.map((role) =>
        landmarks.findIndex((node) => node.role === role),
      );
      for (const role of SINGLE_LANDMARKS)
        expect(
          landmarks.filter((node) => node.role === role),
          `${route} should expose exactly one ${role}`,
        ).toHaveLength(1);
      expect(
        order,
        `${route} lists banner, main and contentinfo out of order`,
      ).toEqual([...order].sort((a, b) => a - b));
      expect(
        landmarks
          .filter(
            (node) =>
              node.role === 'navigation' &&
              node.name === 'Primary' &&
              node.parents.includes('banner'),
          )
          .map(label),
        `${route} should have one Primary navigation, in the banner`,
      ).toHaveLength(1);
    });

    /* SC 1.3.1: a landmark a list cannot tell apart is noise. */
    test('names every repeated landmark, each name once', () => {
      const landmarks = tree.filter((node) => LANDMARKS.has(node.role));
      const unnamed = landmarks.filter(
        (node) =>
          !SINGLE_LANDMARKS.includes(
            node.role as (typeof SINGLE_LANDMARKS)[number],
          ) && !node.name,
      );
      expect(unnamed.map(label), `${route} has an unnamed landmark`).toEqual(
        [],
      );
      const seen = landmarks.map(label);
      expect(
        seen.filter((entry, index) => seen.indexOf(entry) !== index),
        `${route} repeats a landmark name`,
      ).toEqual([]);
    });

    /* SC 1.3.1, 2.4.6: the outline a heading list reads. */
    test('opens main with its one h1, skips no level, and heads each region', () => {
      const headings = tree.filter((node) => node.role === 'heading');
      const inMain = headings.filter((node) => node.parents.includes('main'));
      expect(
        headings.filter((node) => node.level === 1).map(label),
        `${route} should have exactly one h1`,
      ).toHaveLength(1);
      expect(
        inMain[0]?.level,
        `${route}: main's first heading is not the h1`,
      ).toBe(1);
      const skips = headings.filter((node, index) => {
        const previous = headings[index - 1];
        return previous !== undefined && node.level > previous.level + 1;
      });
      expect(skips.map(label), `${route} skips a heading level`).toEqual([]);

      const regions = tree
        .map((node, index) => ({ node, index }))
        .filter(
          ({ node }) => node.role === 'region' && node.parents.includes('main'),
        );
      for (const { node, index } of regions) {
        const first = tree
          .slice(index + 1)
          .find((next) => next.role === 'heading' || next.depth <= node.depth);
        expect(
          first?.role === 'heading' ? first.level : null,
          `${route}: region "${node.name}" does not open with an h2`,
        ).toBe(2);
      }
    });

    /* SC 1.1.1, 2.4.4: the home link is the site name, and the mark beside it is silent. */
    test('names the home link for the site and hides its mark', () => {
      const banner = tree.findIndex((node) => node.role === 'banner');
      const home = tree
        .slice(banner + 1)
        .find(
          (node) => node.role === 'link' && node.parents.includes('banner'),
        );
      expect(
        home?.name,
        `${route}: the first banner link is not the site name`,
      ).toBe(SITE_NAME);
      const homeIndex = tree.indexOf(home!);
      const inside = tree
        .slice(homeIndex + 1)
        .filter((_, offset, rest) =>
          rest.slice(0, offset + 1).every((n) => n.depth > home!.depth),
        );
      expect(
        inside.filter((node) => node.role === 'img').map(label),
        `${route}: the home link's mark is exposed as an image`,
      ).toEqual([]);
    });
  });
}

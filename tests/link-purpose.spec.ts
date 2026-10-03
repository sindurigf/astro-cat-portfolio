import { expect, test, type Locator, type Page } from './test';
import { POSTS, ROUTES } from './routes';
import { gotoSettled } from './settle';

/**
 * SC 2.4.9 Link Purpose (Link Only): one accessible name, one destination, per
 * page. Destinations compare without the hash or a trailing slash.
 */

/** Post copy is the owner's to reword (AGENTS.md "Copy"); remove an entry once it passes. */
const OWNER_COPY: readonly { route: string; name: string }[] = [];

interface Link {
  name: string;
  destination: string;
}

/*
 * The accessible name per accname for the markup this site uses: aria-labelledby,
 * aria-label, then text and image alt, skipping aria-hidden and unrendered nodes.
 */
const exposedLinks = (page: Page): Promise<Link[]> =>
  page.evaluate(() => {
    const rendered = (el: Element): boolean =>
      el.checkVisibility({ visibilityProperty: true }) &&
      el.closest('[aria-hidden="true"], [inert]') === null;

    const textOf = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
      if (!(node instanceof Element)) return '';
      if (node.getAttribute('aria-hidden') === 'true') return '';
      if (node instanceof HTMLImageElement) return node.alt;
      if (getComputedStyle(node).display === 'none') return '';
      return [...node.childNodes].map(textOf).join('');
    };

    const nameOf = (link: HTMLAnchorElement): string => {
      const labelledBy = link.getAttribute('aria-labelledby');
      const raw = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => textOf(document.getElementById(id) ?? document))
            .join(' ')
        : (link.getAttribute('aria-label') ?? textOf(link));
      return raw.replace(/\s+/g, ' ').trim();
    };

    const destinationOf = (link: HTMLAnchorElement): string => {
      const url = new URL(link.href);
      url.hash = '';
      return url.href.replace(/\/$/, '');
    };

    return [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
      .filter(rendered)
      .map((link) => ({
        name: nameOf(link),
        destination: destinationOf(link),
      }));
  });

/** Names that lead to more than one destination, with those destinations. */
const ambiguous = (links: Link[]): Map<string, string[]> => {
  const byName = new Map<string, Set<string>>();
  for (const { name, destination } of links) {
    const key = name.toLowerCase();
    byName.set(key, (byName.get(key) ?? new Set()).add(destination));
  }
  return new Map(
    [...byName]
      .filter(([, destinations]) => destinations.size > 1)
      .map(([name, destinations]) => [name, [...destinations].sort()]),
  );
};

test.describe('link purpose from the name alone (SC 2.4.9)', () => {
  for (const route of ROUTES) {
    test(`${route} gives each link name one destination`, async ({ page }) => {
      await gotoSettled(page, route);
      const links = await exposedLinks(page);
      expect(
        links.length,
        `${route} exposes no links to check`,
      ).toBeGreaterThan(0);

      const allowed = new Set(
        OWNER_COPY.filter((entry) => entry.route === route).map((entry) =>
          entry.name.toLowerCase(),
        ),
      );
      const found = ambiguous(links);

      for (const name of allowed) {
        expect(
          found.has(name),
          `"${name}" on ${route} no longer leads two ways; remove it from OWNER_COPY.`,
        ).toBe(true);
      }

      const failing = [...found].filter(([name]) => !allowed.has(name));
      expect(
        failing.map(([name, to]) => `"${name}" -> ${to.join(', ')}`),
        `${route} has link names that lead to different destinations.`,
      ).toEqual([]);
    });
  }
});

/* Hidden text reaches the name with its space, in every engine (SC 2.5.3: visible words kept). */
const COMPLETED_NAMES: readonly {
  route: string;
  links: string;
  name: (visible: string) => string;
}[] = [
  {
    route: POSTS.find((post) => post.published && post.tags.length > 0)!.route,
    links: 'nav[aria-labelledby="post-tags"] a',
    name: (visible) => `${visible} tag`,
  },
  {
    route: '/blog',
    links: 'nav[aria-label="Filter posts by category"] a',
    name: (visible) => (/posts$/i.test(visible) ? visible : `${visible} posts`),
  },
  {
    route: '/',
    links: 'li.card > h3 > a.card-link',
    name: (visible) => `${visible} posts`,
  },
  {
    route: '/brand',
    links: '[data-component="tag-chips"] a',
    name: (visible) => `${visible} tag`,
  },
  {
    route: '/about',
    links: 'nav[aria-label="On this page"] a',
    name: (visible) => `${visible} section`,
  },
  {
    route: '/brand',
    links: 'nav[aria-label="On this page"] a',
    name: (visible) => `${visible} section`,
  },
];

/** The link's text without its visually hidden part, in source case. */
const visibleText = (link: Locator): Promise<string> =>
  link.evaluate((el) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove());
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
  });

test.describe('hidden text completes short link names', () => {
  for (const { route, links, name } of COMPLETED_NAMES) {
    test(`${route} names ${links} in full`, async ({ page }) => {
      await gotoSettled(page, route);
      const found = page.locator(links);
      expect(await found.count(), `${route} has no ${links}`).toBeGreaterThan(
        0,
      );
      for (const link of await found.all()) {
        const visible = await visibleText(link);
        await expect(
          link,
          `the name of "${visible}" on ${route} does not open with its visible text.`,
        ).toHaveAccessibleName(new RegExp(`^${RegExp.escape(visible)}`));
        await expect(link).toHaveAccessibleName(name(visible));
      }
    });
  }
});

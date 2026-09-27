import { expect, test } from './test';
import { builtHtml, listingPosts, POST_ROUTES, SAMPLED_ROUTES } from './routes';
import { NODE } from './tags';

/* SAMPLED_ROUTES groups listings by the posts they show; the build must agree. */
test(
  'each category and tag listing shows the posts its frontmatter says',
  NODE,
  () => {
    const html = builtHtml();
    const posts = new Set<string>(POST_ROUTES);
    const wrong: string[] = [];
    for (const [route, expected] of listingPosts()) {
      const page = html.get(route);
      if (page === undefined) {
        wrong.push(`${route} was not built`);
        continue;
      }
      const main = page.slice(page.indexOf('<main'), page.indexOf('</main>'));
      const shown = [
        ...new Set(
          [...main.matchAll(/href="(\/blog\/[^"/]+)\/"/g)]
            .map((m) => m[1]!)
            .filter((href) => posts.has(href)),
        ),
      ]
        .map((href) => href.replace('/blog/', ''))
        .sort();
      if (shown.join() !== [...expected].sort().join()) {
        wrong.push(`${route} shows [${shown}] but its posts are [${expected}]`);
      }
    }
    expect(wrong).toEqual([]);
    expect(
      SAMPLED_ROUTES.some((route) => route.startsWith('/blog/tag/')),
      'the sample keeps no tag listing',
    ).toBe(true);
  },
);

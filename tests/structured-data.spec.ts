import { expect, test } from './test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  builtHtml,
  DIST_DIR,
  PUBLISHED_POST_ROUTES,
  frontmatterDay,
  postFrontmatter,
  ROUTES,
} from './routes';
import { structuredDataScript } from '../src/lib/structured-data';
import { NODE } from './tags';
import { LD_JSON, metaContent } from './html';

/**
 * The JSON-LD graph in every page's head. `PERSON_NAME` must match the
 * homepage <h1>, and a `</script>` in a title must not end the block.
 * CSP handling of the block is tested in tests/headers-rules.spec.ts.
 */

type Node = Record<string, unknown>;

const graphOf = (rawHtml: string, route: string): Node[] => {
  const match = LD_JSON.exec(rawHtml);
  expect(
    match,
    `${route} has no JSON-LD block; has it stopped using BaseLayout?`,
  ).not.toBeNull();

  let parsed: { '@graph'?: Node[] };
  try {
    parsed = JSON.parse(match![1]!);
  } catch (error) {
    throw new Error(
      `${route} has JSON-LD that is not valid JSON: ${(error as Error).message}`,
    );
  }

  expect(
    Array.isArray(parsed['@graph']),
    `${route} has JSON-LD with no @graph array`,
  ).toBe(true);

  return parsed['@graph']!;
};

const nodeOfType = (graph: Node[], type: string): Node | undefined =>
  graph.find((node) => node['@type'] === type);

/** The homepage <h1>, flattened to the text a reader sees. */
const headingText = (rawHtml: string): string => {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(rawHtml);
  expect(
    h1,
    'the homepage has no <h1> to compare the name against',
  ).not.toBeNull();

  return h1![1]!
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

test.describe('JSON-LD structured data', NODE, () => {
  // `expect.soft` names every failing route in one run.
  test('every route carries one valid graph', () => {
    const pages = builtHtml();

    for (const route of ROUTES) {
      const html = pages.get(route);
      expect(html, `${route} was not found in the build`).toBeTruthy();

      const graph = graphOf(html!, route);

      expect
        .soft(
          nodeOfType(graph, 'Person'),
          `${route} has JSON-LD with no Person node`,
        )
        .toBeDefined();
      expect
        .soft(
          nodeOfType(graph, 'WebSite'),
          `${route} has JSON-LD with no WebSite node`,
        )
        .toBeDefined();
    }
  });

  test('/about/ is the profile page of the Person, and no other page is', () => {
    const pages = builtHtml();
    const profiles = [...pages].filter(([route, html]) =>
      nodeOfType(graphOf(html, route), 'ProfilePage'),
    );
    expect(
      profiles.map(([route]) => route),
      'the ProfilePage node is on the wrong pages.',
    ).toEqual(['/about']);

    const graph = graphOf(profiles[0]![1], '/about');
    expect(
      nodeOfType(graph, 'ProfilePage')!.mainEntity,
      "/about/'s ProfilePage does not point at the Person.",
    ).toEqual({ '@id': nodeOfType(graph, 'Person')!['@id'] });

    const image = String(nodeOfType(graph, 'Person')!.image ?? '');
    expect(image, "/about/'s Person has no absolute image URL.").toMatch(
      /^https:\/\//,
    );
    expect(
      existsSync(join(DIST_DIR, new URL(image).pathname)),
      "/about/'s Person image is not in the build.",
    ).toBe(true);
  });

  test('the published name is the name the homepage shows', () => {
    const pages = builtHtml();
    const person = nodeOfType(graphOf(pages.get('/')!, '/'), 'Person')!;

    // The heading is two coloured spans, so it cannot import PERSON_NAME.
    expect(
      person.name,
      'PERSON_NAME in src/lib/profiles.ts and the homepage <h1> disagree.',
    ).toBe(headingText(pages.get('/')!));
  });

  test('sameAs lists exactly the profiles the footer links', () => {
    for (const [route, html] of builtHtml()) {
      const person = nodeOfType(graphOf(html, route), 'Person')!;
      const sameAs = ((person.sameAs as string[]) ?? []).toSorted();

      // Scraped from the footer's Social nav, not imported, so filtering either list fails it.
      const social = html.indexOf(
        'aria-label="Social"',
        html.indexOf('<footer'),
      );
      const footer = html.slice(social, html.indexOf('</nav>', social));
      const footerProfiles = [
        ...new Set(
          [...footer.matchAll(/href="(https:\/\/[^"]+)"/g)].map(
            (match) => match[1]!,
          ),
        ),
      ].toSorted();

      expect(sameAs.length, `${route} has an empty sameAs.`).toBeGreaterThan(0);
      expect(
        sameAs,
        `${route}: sameAs and the footer's profile links differ.`,
      ).toEqual(footerProfiles);
    }
  });

  test('every post, and only a post, is a BlogPosting', () => {
    const pages = builtHtml();

    for (const route of ROUTES) {
      const html = pages.get(route)!;
      const graph = graphOf(html, route);
      const posting = nodeOfType(graph, 'BlogPosting');
      const isPost = PUBLISHED_POST_ROUTES.includes(route);

      if (!isPost) {
        expect
          .soft(posting, `${route} is not a post but carries a BlogPosting`)
          .toBeUndefined();
        continue;
      }

      expect(posting, `${route} is a post with no BlogPosting`).toBeDefined();
      const person = nodeOfType(graph, 'Person')!;
      const website = nodeOfType(graph, 'WebSite')!;
      const shownDate = /<time datetime="([^"]+)"/.exec(html)?.[1];

      expect.soft(posting!.author, `${route} author`).toEqual({
        '@id': person['@id'],
      });
      expect.soft(posting!.isPartOf, `${route} isPartOf`).toEqual({
        '@id': website['@id'],
      });
      // Google assumes Googlebot's zone when the date carries none.
      expect
        .soft(posting!.datePublished, `${route} datePublished vs <time>`)
        .toBe(`${shownDate}T00:00:00Z`);
      expect
        .soft(posting!.url, `${route} url vs canonical`)
        .toBe(/rel="canonical" href="([^"]+)"/.exec(html)?.[1]);
    }
  });

  test('the author is a reference, not a second person', () => {
    const html = builtHtml().get('/')!;
    const graph = graphOf(html, '/');
    const person = nodeOfType(graph, 'Person')!;
    const website = nodeOfType(graph, 'WebSite')!;

    for (const field of ['author', 'publisher'] as const) {
      expect(
        website[field],
        `WebSite.${field} repeats the Person instead of referencing its @id.`,
      ).toEqual({ '@id': person['@id'] });
    }
  });
});

test.describe('a title cannot end the data block', NODE, () => {
  const HOSTILE = '</script><script>alert(1)</script>';

  const written = (title: string): string =>
    `<script type="application/ld+json">${structuredDataScript({
      site: new URL('https://example.com'),
      article: {
        headline: title,
        datePublished: '2026-09-22',
        keywords: ['probe'],
        description: 'A teaser.',
        url: new URL('https://example.com/blog/probe/'),
        image: new URL('https://example.com/images/og-default.png'),
      },
    })}</script>`;

  test('the block a hostile title produces is one block', () => {
    const markup = written(HOSTILE);

    expect(
      markup.match(/<\/script/gi)?.length,
      'the title ended the data block early.',
    ).toBe(1);
    expect(
      markup.match(/<script/gi)?.length,
      'a second script tag reached the page from a post title.',
    ).toBe(1);
  });

  test('what it produces still parses, with the title intact', () => {
    // Lazy, like the HTML parser, which ends the block at the first `</script`.
    const inner = /<script[^>]*>([\s\S]*?)<\/script>/.exec(
      written(HOSTILE),
    )?.[1];
    const graph = JSON.parse(inner ?? '') as { '@graph': Node[] };
    const posting = graph['@graph'].find(
      (node) => node['@type'] === 'BlogPosting',
    );

    expect(
      posting?.headline,
      'escaping changed the headline a consumer reads.',
    ).toBe(HOSTILE);
  });
});

// A never-revised post has no `dateModified`, not a copy of `datePublished`.
test.describe('a post says when it was revised, and only then', NODE, () => {
  const updatedDay = (route: string): string | undefined =>
    frontmatterDay(postFrontmatter(route.split('/').pop()!), 'updated');

  test('dateModified and article:modified_time are present exactly when the post says updated', () => {
    const wrong: string[] = [];
    const checked: string[] = [];

    for (const [route, html] of builtHtml()) {
      if (!PUBLISHED_POST_ROUTES.includes(route)) continue;

      const posting = graphOf(html, route).find(
        (node) => node['@type'] === 'BlogPosting',
      );
      if (!posting) {
        wrong.push(`${route} has no BlogPosting to carry dateModified`);
        continue;
      }
      checked.push(route);

      const declared = posting['dateModified'];
      const updated = updatedDay(route);

      if (updated === undefined && declared !== undefined) {
        wrong.push(`${route} claims dateModified ${String(declared)}`);
      }
      if (updated !== undefined && declared !== `${updated}T00:00:00Z`) {
        wrong.push(
          `${route} dateModified ${String(declared)}, updated ${updated}`,
        );
      }
      const modifiedTime = metaContent(html, 'article:modified_time');
      if (modifiedTime !== (declared ?? null)) {
        wrong.push(
          `${route} article:modified_time ${String(modifiedTime)}, dateModified ${String(declared)}`,
        );
      }
    }

    expect(
      wrong,
      "dateModified, article:modified_time and the post's own `updated` disagree.",
    ).toEqual([]);
    expect(checked.sort(), 'every post should be read here').toEqual(
      [...PUBLISHED_POST_ROUTES].sort(),
    );
  });
});

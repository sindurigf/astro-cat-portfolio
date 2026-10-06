import { ANALYTICS_ON } from '../src/lib/analytics-site';
import { CONTACT_FORM_ON } from '../src/lib/contact';
import { expect, test } from './test';
import { FUNCTIONAL_ROUTES, firstUse, mainText } from './first-use';
import { builtHtml } from './routes';
import { gotoSettled } from './settle';
import { NODE } from './tags';

/**
 * SC 3.1.3 Unusual Words, by G101 with G112 and H54: on functional pages each
 * listed term is a `<dfn>` at its first use, defined in the same sentence.
 */
const DEFINED: readonly { route: string; term: string; definition: string }[] =
  [
    {
      route: '/accessibility',
      term: 'screen reader',
      definition: 'reads the page aloud',
    },
    {
      route: '/accessibility',
      term: 'reflow',
      definition: 'without scrolling sideways',
    },
    { route: '/accessibility', term: 'engines', definition: 'draw pages' },
    {
      route: '/accessibility',
      term: 'axe',
      definition: 'automated accessibility checker',
    },
    {
      route: '/accessibility',
      term: 'focus ring',
      definition: 'the outline on the control',
    },
    {
      route: '/privacy',
      term: 'local storage',
      definition: 'a small store of settings',
    },
    ...(ANALYTICS_ON
      ? [
          {
            route: '/privacy',
            term: 'analytics script',
            definition: 'the code that counts visits',
          },
        ]
      : []),
    {
      route: '/privacy',
      term: 'security policy',
      definition: 'a rule your browser enforces',
    },
    ...(ANALYTICS_ON
      ? [
          {
            route: '/privacy',
            term: 'Do Not Track',
            definition: 'a privacy setting',
          },
        ]
      : []),
    {
      route: '/privacy',
      term: 'Cloudflare Worker',
      definition: "runs on Cloudflare's servers",
    },
    { route: '/privacy', term: 'trace', definition: 'a timed record' },
    ...(CONTACT_FORM_ON
      ? [
          {
            route: '/privacy',
            term: 'rate limiter',
            definition: 'the service that enforces it',
          },
        ]
      : []),
  ];

/** Jargon written out in plain words on functional pages; its return is a regression. */
const REPLACED: readonly { pattern: RegExp; plain: string }[] = [
  { pattern: /\bdomains?\b/i, plain: 'website' },
  { pattern: /\breferrer\b/i, plain: 'the page you came from' },
  { pattern: /\bpoint-in-time\b/i, plain: 'restored to any moment' },
  {
    pattern: /\bconformance claim\b/i,
    plain: 'no claim that the site meets it',
  },
  { pattern: /\bcomposited\b/i, plain: 'the color actually behind the text' },
  { pattern: /\btag manager\b/i, plain: 'third-party tracking tools' },
  { pattern: /\bembeds\b/i, plain: 'embedded from other sites' },
  { pattern: /\bevery route\b/i, plain: 'every page' },
  { pattern: /\bpointer targets?\b/i, plain: 'anything you click or tap' },
  { pattern: /\bis the floor\b/i, plain: 'is the minimum' },
  { pattern: /\bhard offsets\b/i, plain: 'solid offset copies' },
  { pattern: /\bfor meta\b/i, plain: 'dates and other details' },
  {
    pattern: /\bper the register\b/i,
    plain: 'only where the style guide allows',
  },
  { pattern: /\beyebrow\b/i, plain: 'label' },
  {
    pattern: /\bagent readiness\b/i,
    plain: 'how well automated assistants can read it',
  },
];

/** /404's idioms are explained on /credits; the link is the definition (G55). */
const IDIOM_LINK = '/credits/#not-found';
const IDIOM_ANCHOR = 'id="not-found"';
const IDIOM_SOURCE = 'Star Wars';

test.describe('unusual words are defined at first use (SC 3.1.3)', () => {
  const routes = [...new Set(DEFINED.map((entry) => entry.route))];

  for (const route of routes) {
    test(`${route} defines each listed term where it first appears`, async ({
      page,
    }) => {
      await gotoSettled(page, route);

      for (const { term, definition } of DEFINED.filter(
        (entry) => entry.route === route,
      )) {
        const use = await firstUse(page, term);
        expect(
          use,
          `${term} no longer appears in ${route}'s <main>; remove its entry.`,
        ).not.toBeNull();
        expect(
          use!.defining,
          `${route} first uses "${term}" outside a <dfn> of that exact term.`,
        ).toBe(true);
        expect(
          use!.sentence,
          `${route} first uses "${term}" without "${definition}" in the same sentence: ${use!.sentence}`,
        ).toContain(definition);
      }
    });
  }
});

test('every <dfn> on a functional page is listed in DEFINED', NODE, () => {
  const pages = builtHtml();
  const unlisted = FUNCTIONAL_ROUTES.flatMap((route) => {
    const html = pages.get(route);
    if (html === undefined) return [`${route} was not built`];
    const listed = new Set(
      DEFINED.filter((entry) => entry.route === route).map(
        (entry) => entry.term,
      ),
    );
    return [...html.matchAll(/<dfn\b[^>]*>([^<]+)<\/dfn>/g)]
      .map((match) => match[1]!.trim())
      .filter((term) => !listed.has(term))
      .map((term) => `${route}: ${term}`);
  });
  expect(unlisted, 'list each defined term in DEFINED').toEqual([]);
});

test('functional pages keep jargon written out in plain words', NODE, () => {
  const pages = builtHtml();
  const found = FUNCTIONAL_ROUTES.flatMap((route) => {
    const text = mainText(pages.get(route) ?? '');
    return REPLACED.filter(({ pattern }) => pattern.test(text)).map(
      ({ pattern, plain }) => `${route}: ${pattern.source}, write "${plain}"`,
    );
  });
  expect(found, 'jargon back on a functional page').toEqual([]);
});

test('/404 links its idioms to their explanation on /credits', NODE, () => {
  const pages = builtHtml();
  expect(
    pages.get('/404') ?? '',
    `/404 does not link to ${IDIOM_LINK}.`,
  ).toContain(`href="${IDIOM_LINK}"`);

  const credits = pages.get('/credits') ?? '';
  const section = credits.slice(credits.indexOf(IDIOM_ANCHOR));
  expect(
    credits,
    `/credits has no ${IDIOM_ANCHOR} for /404 to link to.`,
  ).toContain(IDIOM_ANCHOR);
  expect(
    section,
    `/credits#not-found no longer explains the ${IDIOM_SOURCE} lines.`,
  ).toContain(IDIOM_SOURCE);
});

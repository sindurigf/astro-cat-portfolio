import { expect, test } from './test';
import { defined } from '../src/lib/defined';
import { builtHtml } from './routes';
import { NODE } from './tags';

/**
 * Alt text rules axe cannot judge: every <img> has an `alt` (Astro writes an
 * empty one as a bare `alt`), only the logo mark and card thumbnails are empty, a filled one is not
 * a filename or "image/photo/picture/logo", and an inline <svg> is hidden or named.
 */

/** The one image the site draws for decoration. */
const DECORATIVE = /box-cat|logo-cat/;

/* A post card's square crop: the card heading names the post (H67). */
const CARD_THUMBNAIL = /\sdata-card-thumbnail(?=[\s>=/])/;

const SUPPLIED_BY_THE_READER = /\b(image|photo|picture|logo)\b/i;
const FILENAME = /\.(webp|avif|jpe?g|png|gif|svg)\b/i;

type Problem = { image: string; problem: string };

/** Whether the tag at `index` sits inside an open `<article class="card …">`. */
const insidePostCard = (html: string, index: number): boolean => {
  const open = html.lastIndexOf('<article', index);
  return (
    open > html.lastIndexOf('</article>', index) &&
    /^<article\b[^>]*\sclass="[^"]*\bcard\b/.test(html.slice(open))
  );
};

const auditImages = (html: string): Problem[] => {
  const problems: Problem[] = [];

  for (const { 0: tag, index } of html.matchAll(/<img\b[^>]*>/g)) {
    const source = /\ssrc="([^"]*)"/.exec(tag)?.[1] ?? '(no src)';
    const valued = /\salt="([^"]*)"/.exec(tag);
    const bare = /\salt(?=[\s>/])/.test(tag);
    const image = source.split('/').pop() ?? source;

    if (!valued && !bare) {
      problems.push({ image, problem: 'no alt attribute' });
      continue;
    }

    const alt = valued?.[1]?.trim() ?? '';
    if (alt === '') {
      if (CARD_THUMBNAIL.test(tag) && !insidePostCard(html, index)) {
        problems.push({
          image,
          problem: 'a card thumbnail outside a post card',
        });
      } else if (!DECORATIVE.test(source) && !CARD_THUMBNAIL.test(tag)) {
        problems.push({
          image,
          problem:
            'empty alt on an image that is not the logo mark or a card thumbnail',
        });
      }
      continue;
    }
    if (SUPPLIED_BY_THE_READER.test(alt)) {
      problems.push({
        image,
        problem: `alt says what a screen reader already says: "${alt}"`,
      });
    }
    if (FILENAME.test(alt)) {
      problems.push({ image, problem: `alt is a filename: "${alt}"` });
    }
  }

  /*
   * `role="img"` alone is not a name: it tells assistive technology to treat
   * the drawing as one image, which is then announced with no name at all.
   */
  for (const [svg, opening] of html.matchAll(
    /(<svg\b[^>]*>)[\s\S]*?<\/svg>/g,
  )) {
    const tag = defined(opening, 'svg opening tag');
    const hidden = /\saria-hidden="true"/.test(tag);
    const named =
      /\saria-label="[^"]*\S[^"]*"/.test(tag) ||
      /\saria-labelledby="[^"]*\S[^"]*"/.test(tag) ||
      /<title>[^<]*\S[^<]*<\/title>/.test(svg);
    if (!hidden && !named) {
      problems.push({
        image: 'svg',
        problem: 'an svg that is neither aria-hidden nor named',
      });
    }
  }

  return problems;
};

const FIXTURE = `
  <img src="/_astro/portrait.webp">
  <img src="/_astro/cat.webp" alt="">
  <img src="/_astro/desk.webp" alt="A photo of a desk">
  <img src="/_astro/mascot.webp" alt="mascot.webp">
  <svg viewBox="0 0 24 24"><path d="" /></svg>
  <img src="/_astro/box-cat-roundel.svg" alt>
  <img src="/_astro/bicycle.webp" alt="A person riding a bicycle down a tree-lined path.">
  <article class="card flex"><img src="/_astro/cover.webp" alt="" data-card-thumbnail></article>
  <img src="/_astro/stray.webp" alt="" data-card-thumbnail>
  <svg aria-hidden="true"><path d="" /></svg>
  <svg role="img"><path d="" /></svg>
  <svg role="img"><title>A mascot asleep</title><path d="" /></svg>
  <svg aria-label="A mascot asleep"><path d="" /></svg>
`;

test('the checker reports every kind of fault', NODE, () => {
  const problems = auditImages(FIXTURE).map((p) => p.problem);
  expect(problems).toEqual([
    'no alt attribute',
    'empty alt on an image that is not the logo mark or a card thumbnail',
    'alt says what a screen reader already says: "A photo of a desk"',
    'alt is a filename: "mascot.webp"',
    'a card thumbnail outside a post card',
    'an svg that is neither aria-hidden nor named',
    'an svg that is neither aria-hidden nor named',
  ]);
});

test('every image in the build is named or decorative on purpose', NODE, () => {
  const pages = [...builtHtml()];
  expect(pages.length, 'no built pages to read').toBeGreaterThan(0);

  const found = pages.flatMap(([route, html]) =>
    auditImages(html).map((p) => `${route}: ${p.image}: ${p.problem}`),
  );
  expect(found).toEqual([]);

  const images = pages.reduce(
    (total, [, html]) => total + [...html.matchAll(/<img\b/g)].length,
    0,
  );
  expect(images, 'no images found, so nothing was checked').toBeGreaterThan(0);
});

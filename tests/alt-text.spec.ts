import { expect, test } from './test';
import { builtHtml } from './routes';
import { NODE } from './tags';

/**
 * Alt text rules axe cannot judge: every <img> has an `alt` (Astro writes an
 * empty one as a bare `alt`), only the logo mark is empty, a filled one is not
 * a filename or "image/photo/picture/logo", and an inline <svg> is hidden or named.
 */

/** The one image the site draws for decoration. */
const DECORATIVE = /mark-dark/;

const SUPPLIED_BY_THE_READER = /\b(image|photo|picture|logo)\b/i;
const FILENAME = /\.(webp|avif|jpe?g|png|gif|svg)\b/i;

type Problem = { image: string; problem: string };

const auditImages = (html: string): Problem[] => {
  const problems: Problem[] = [];

  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    const source = /\ssrc="([^"]*)"/.exec(tag)?.[1] ?? '(no src)';
    const valued = /\salt="([^"]*)"/.exec(tag);
    const bare = /\salt(?=[\s>/])/.test(tag);
    const image = source.split('/').pop() ?? source;

    if (!valued && !bare) {
      problems.push({ image, problem: 'no alt attribute' });
      continue;
    }

    const alt = valued?.[1].trim() ?? '';
    if (alt === '') {
      if (!DECORATIVE.test(source)) {
        problems.push({
          image,
          problem: 'empty alt on an image that is not the logo mark',
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
  for (const [svg, tag] of html.matchAll(/(<svg\b[^>]*>)[\s\S]*?<\/svg>/g)) {
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
  <img src="/_astro/mark-dark.webp" alt>
  <img src="/_astro/bicycle.webp" alt="A person riding a bicycle down a tree-lined path.">
  <svg aria-hidden="true"><path d="" /></svg>
  <svg role="img"><path d="" /></svg>
  <svg role="img"><title>A mascot asleep</title><path d="" /></svg>
  <svg aria-label="A mascot asleep"><path d="" /></svg>
`;

test('the checker reports every kind of fault', NODE, () => {
  const problems = auditImages(FIXTURE).map((p) => p.problem);
  expect(problems).toEqual([
    'no alt attribute',
    'empty alt on an image that is not the logo mark',
    'alt says what a screen reader already says: "A photo of a desk"',
    'alt is a filename: "mascot.webp"',
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

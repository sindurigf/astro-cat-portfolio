import { expect, test } from './test';
import { BLOG_FEATURES_COVER, builtHtml, PHOTO_POST_ROUTES } from './routes';
import { NODE } from './tags';

const PRIORITY = /<img\b[^>]*\bfetchpriority="high"[^>]*>/g;

const BLOG_PHOTO_ROUTES = BLOG_FEATURES_COVER ? ['/blog'] : [];

/** The first content image, after the header's logo. */
const firstContentImage = (html: string): string | undefined =>
  html
    .slice(html.indexOf('<main'))
    .match(/<img\b[^>]*>/g)
    ?.find((tag) => !/mark-dark|logo-cat/.test(tag));

test.describe('image priority', NODE, () => {
  test('no page asks for more than one image first', () => {
    const crowded = [...builtHtml()]
      .filter(([, html]) => (html.match(PRIORITY) ?? []).length > 1)
      .map(([route]) => route);
    expect(
      crowded,
      'two high-priority images compete, and the one on screen loads later.',
    ).toEqual([]);
  });

  test('the blog feature cover and a post’s first photo load eagerly and first', () => {
    const routes = [...BLOG_PHOTO_ROUTES, ...PHOTO_POST_ROUTES];
    test.skip(
      routes.length === 0,
      'no feature cover and no post with a Markdown image',
    );
    const pages = builtHtml();
    for (const route of routes) {
      const image = firstContentImage(pages.get(route) ?? '');
      expect(image, `${route} has no content image`).toBeDefined();
      expect(
        image,
        `${route}'s first image is in the first screen on desktop and is lazy.`,
      ).toMatch(/loading="eager"/);
      expect(
        image,
        `${route}'s first image does not ask to load first.`,
      ).toMatch(/fetchpriority="high"/);
    }
  });

  test('every photo offers AVIF with a WebP fallback', () => {
    const pages = builtHtml();
    const pictures = [...pages].flatMap(([route, html]) =>
      (html.match(/<picture\b[\s\S]*?<\/picture>/g) ?? []).map((picture) => ({
        route,
        picture,
      })),
    );
    for (const route of ['/', '/about', ...BLOG_PHOTO_ROUTES]) {
      expect(
        pictures.some((p) => p.route === route),
        `${route} has no <picture>, so its photos send WebP only.`,
      ).toBe(true);
    }
    const unpaired = pictures
      .filter(
        ({ picture }) =>
          !/<source[^>]*type="image\/avif"/.test(picture) ||
          !/<img[^>]*src="[^"]*\.webp"/.test(picture),
      )
      .map(({ route }) => route);
    expect(
      unpaired,
      'a <picture> lacks the AVIF source or the WebP fallback <img>.',
    ).toEqual([]);
  });
});

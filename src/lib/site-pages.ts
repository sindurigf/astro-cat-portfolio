import { getCategoriesWithPosts, getSortedPosts, categoryLabel } from './blog';
import { BRAND_SECTIONS, BRAND_PATH, brandHref } from './brand-sections';
import { NAV_LINKS } from './nav';
import {
  ACCESSIBILITY_PATH,
  CONTACT_PATH,
  CREDITS_PATH,
  PRIVACY_PATH,
  categoryHref,
  postHref,
} from './paths';
import type { MatchablePage } from './page-match';
import { CV_PATH } from './profiles';
import { talkDecks } from './talk-deck';

/* The pages a lost visitor may have meant: the 404 page matches the address against these. */
export const sitePages = async (): Promise<MatchablePage[]> => {
  const talks = [...(await talkDecks())].map(([deck, slides]) => ({
    title: slides[0]?.slide.data.title ?? deck,
    path: `/talks/${deck}/`,
  }));
  return [
    ...NAV_LINKS.map(({ label, href }) => ({ title: label, path: href })),
    { title: 'Contact', path: CONTACT_PATH },
    { title: 'Brand', path: BRAND_PATH },
    { title: 'Accessibility', path: ACCESSIBILITY_PATH },
    { title: 'Privacy', path: PRIVACY_PATH },
    { title: 'Credits', path: CREDITS_PATH },
    ...(CV_PATH ? [{ title: 'CV', path: CV_PATH }] : []),
    ...(await getCategoriesWithPosts()).map((category) => ({
      title: categoryLabel(category),
      path: categoryHref(category),
    })),
    ...(await getSortedPosts()).map((post) => ({
      title: post.data.title,
      path: postHref(post.id),
    })),
    ...BRAND_SECTIONS.map(({ slug, title }) => ({
      title,
      path: brandHref(slug),
    })),
    ...talks,
  ];
};

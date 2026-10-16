import { SITE_NAME } from './site';
import { PERSON_NAME } from './profiles';
import { SITE_CONFIG } from '../site.config';
import { ogCardPath, ogRoute, type OgCardManifest } from './og-cards';
/* Bundled, not read from disk: the Worker renders /contact/send/ and has no public/. Path is OG_CARD_MANIFEST. */
import cards from '../../public/images/og/cards.json';

/*
 * 1.91:1, the large-card crop of Facebook, LinkedIn and X; every card is
 * drawn at it by `npm run og`. tests/seo.spec.ts checks every declared size
 * against its file.
 */
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

export interface OgImage {
  /** Root-relative; BaseLayout makes it absolute against `site`. */
  src: string;
  width: number;
  height: number;
  alt: string;
}

// TODO(fork): Describe your own sharing image in `alt` once you have redrawn it with npm run og.
export const DEFAULT_OG_IMAGE: OgImage = {
  src: '/images/og-default.png',
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  alt: `${PERSON_NAME}, ${SITE_CONFIG.site.tagline.join(', ')}, beside the ${SITE_NAME} logo, a smiling calico cat's head shaped like a tile.`,
};

const CARDS: OgCardManifest = cards;

/**
 * The page's own card, or the site card for a page `npm run og` has not drawn
 * yet: the card is drawn from the built page, so a new page can only have one
 * after a build. tests/seo.spec.ts fails until it is drawn.
 */
export const pageOgImage = (pathname: string): OgImage => {
  const route = ogRoute(pathname);
  const card = CARDS[route];
  return card
    ? {
        src: `/${ogCardPath(route)}`,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        alt: card.alt,
      }
    : DEFAULT_OG_IMAGE;
};

import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import { SITE_NAME } from './site';
import { PERSON_NAME } from './profiles';
import { SITE_CONFIG } from '../site.config';

/*
 * 1.91:1, the large-card crop of Facebook, LinkedIn and X; og-default.png is
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

export const DEFAULT_OG_IMAGE: OgImage = {
  src: '/images/og-default.png',
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  alt: `${PERSON_NAME}, ${SITE_CONFIG.site.tagline.join(', ')}, beside the ${SITE_NAME} logo, a smiling calico cat's head shaped like a tile.`,
};

/* JPEG: WebP support among link unfurlers is uneven. */
const CARD_FORMAT = 'jpg';

/* Crop, not letterbox. sharp's `attention` keeps faces a centered crop cuts. */
const CARD_FIT = 'cover';
const CARD_POSITION = 'attention';

export const coverOgImage = async (
  cover: ImageMetadata,
  alt: string,
): Promise<OgImage> => {
  const card = await getImage({
    src: cover,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fit: CARD_FIT,
    position: CARD_POSITION,
    format: CARD_FORMAT,
  });
  return {
    src: card.src,
    width: Number(card.attributes.width),
    height: Number(card.attributes.height),
    alt,
  };
};

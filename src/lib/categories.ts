import type { BlogCategory } from '../content.config';

/*
 * Full class names: Tailwind cannot see a composed `text-${accent}`. No cyan,
 * which is reserved for focus and hover. Ratios: docs/STYLEGUIDE.md#contrast.
 */
const ACCENTS = {
  gold: {
    text: 'text-gold',
    tile: 'bg-gold text-gold-text',
  },
  ink: {
    text: 'text-text',
    tile: 'bg-text text-background',
  },
  pink: {
    text: 'text-pink-text',
    tile: 'bg-mark text-background',
  },
} as const;

type CategoryAccent = (typeof ACCENTS)[keyof typeof ACCENTS];

interface Category {
  readonly accent: CategoryAccent;
  readonly glyph: string;
  /** Placeholder copy; also the category page's meta description. */
  readonly teaser: string;
}

export const CATEGORIES = {
  skincare: {
    accent: ACCENTS.ink,
    glyph: '✦',
    teaser: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  },
  travel: {
    accent: ACCENTS.ink,
    glyph: '✈',
    teaser: 'Sed do eiusmod tempor incididunt ut labore et dolore magna.',
  },
  'personal-thoughts': {
    accent: ACCENTS.pink,
    glyph: '❋',
    teaser: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco.',
  },
  'professional-journey': {
    accent: ACCENTS.gold,
    glyph: '◆',
    teaser:
      'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.',
  },
  'open-source': {
    accent: ACCENTS.gold,
    glyph: '</>',
    teaser: 'Excepteur sint occaecat cupidatat non proident, sunt in culpa.',
  },
} as const satisfies Record<BlogCategory, Category>;

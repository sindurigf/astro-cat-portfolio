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
  /** The sample persona's copy; also the category page's meta description. */
  readonly teaser: string;
}

export const CATEGORIES = {
  skincare: {
    accent: ACCENTS.ink,
    glyph: '✦',
    teaser:
      'Sun, salt and long days on deck: the plain routine I keep between islands.',
  },
  travel: {
    accent: ACCENTS.ink,
    glyph: '✈',
    teaser:
      'Islands, their ruins and their records, from Arabasta on, and what to read before you land.',
  },
  'personal-thoughts': {
    accent: ACCENTS.pink,
    glyph: '❋',
    teaser:
      'Quiet thoughts on reading, memory, and the crew that gave me a reason to live.',
  },
  'professional-journey': {
    accent: ACCENTS.gold,
    glyph: '◆',
    teaser:
      'How I work: reading Poneglyphs, keeping records, and studying a century the World Government forbids.',
  },
  'open-source': {
    accent: ACCENTS.gold,
    glyph: '</>',
    teaser:
      'Why history should be open: the scholars of Ohara, forbidden records, and the many hands that keep knowledge alive.',
  },
} as const satisfies Record<BlogCategory, Category>;

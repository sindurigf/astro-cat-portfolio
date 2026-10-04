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
      'Sun, salt and long days on deck: the simple routine that keeps my skin calm at sea.',
  },
  travel: {
    accent: ACCENTS.ink,
    glyph: '✈',
    teaser:
      'Islands, harbours and the ruins worth the climb, with what to read before you go.',
  },
  'personal-thoughts': {
    accent: ACCENTS.pink,
    glyph: '❋',
    teaser:
      'Quiet thoughts on reading, memory and the small kindnesses that make a crew feel like home.',
  },
  'professional-journey': {
    accent: ACCENTS.gold,
    glyph: '◆',
    teaser:
      'How an archaeologist works: learning old scripts, keeping careful notes and sharing what I find.',
  },
  'open-source': {
    accent: ACCENTS.gold,
    glyph: '</>',
    teaser:
      'Why knowledge should be open: shared archives, public records and the many hands that keep history alive.',
  },
} as const satisfies Record<BlogCategory, Category>;

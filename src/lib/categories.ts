import type { BlogCategory } from '../content.config';

/* Every category takes the gold register (docs/STYLEGUIDE.md row 5), so none drifts apart. */
export const CATEGORY_LABEL = 'text-gold';
/* The edge on gold is ink in both modes (11.32), like the glyph. */
export const CATEGORY_TILE = 'bg-gold text-gold-text border-gold-text';

interface Category {
  readonly glyph: string;
  /** The sample persona's copy; also the category page's meta description. */
  readonly teaser: string;
}

// TODO(fork): Write your own one-line description for each blog category.
export const CATEGORIES = {
  skincare: {
    glyph: '✦',
    teaser:
      'Sun, salt and long days on deck: the plain routine I keep between islands.',
  },
  travel: {
    glyph: '✈',
    teaser:
      'Islands, their ruins and their records, from Arabasta on, and what to read before you land.',
  },
  'personal-thoughts': {
    glyph: '❋',
    teaser: 'Quiet thoughts on reading, memory, and the crew that let me join.',
  },
  'professional-journey': {
    glyph: '◆',
    teaser:
      'How I work: reading Poneglyphs, keeping records, and studying a century the World Government forbids.',
  },
  'open-source': {
    glyph: '</>',
    teaser:
      'Why history should be open: the scholars of Ohara, forbidden records, and the many hands that keep knowledge alive.',
  },
} as const satisfies Record<BlogCategory, Category>;

import { colors } from '../../lib/brand';

/*
 * Each color shown doing its own job. Class names are literal so Tailwind
 * builds them; a token in the Color tokens table with no entry fails the build.
 */
export const SWATCH: Record<string, string | null> = {
  /* Framed in `text`: a ground's fill alone is lost against the card. */
  background: 'bg-background border-4 border-text',
  surface: 'bg-surface border-4 border-text',
  border: 'border-4 border-border',
  text: 'text-text',
  subtle: 'text-subtle',
  /* A fill: light mode turns gold text to ink, but keeps gold fills. */
  gold: 'bg-gold border-4 border-fill-edge',
  /* Never at rest: it shows in /brand's Controls section under the pointer and the keyboard. */
  cyan: null,
  pink: 'border-4 border-border shadow-hard-pink-4',
  'pink-text': 'text-pink-text',
  mark: 'border-4 border-border shadow-hard-mark-8',
  'tile-edge': 'border-4 border-tile-edge',
  'fill-edge': 'bg-gold border-4 border-fill-edge',
};

/* A swatch drawn as letters in its color rather than as a filled square. */
export const GLYPH = /^text-/;

export const SWATCH_BOX = 'grid size-16 shrink-0 place-items-center';

for (const { token } of colors) {
  if (!(token in SWATCH)) {
    throw new Error(
      `/brand: ${token} is in the Color tokens table but has no swatch in src/components/brand/swatches.ts`,
    );
  }
}

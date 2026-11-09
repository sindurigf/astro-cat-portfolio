import { ratio } from '../../scripts/contrast-table.mjs';
import { colors } from './brand';

/* Color, one part per role: its tokens and the one pair it is read on, with the ratio measured from the token hex values. */

export type Mode = 'dark' | 'light';
type Kind = 'text' | 'edge';

const NEEDS: Record<Kind, number> = { text: 7, edge: 3 };
const VERDICT: Record<Kind, string> = {
  text: `needs ${NEEDS.text}:1 AAA`,
  edge: `needs ${NEEDS.edge}:1`,
};
const RATIO_DIGITS = 2;
const MODES: readonly Mode[] = ['dark', 'light'];
const GROUNDS = ['background', 'surface'] as const;

/** The ratio every text color reaches, for the facts on /brand. */
export const TEXT_TARGET_RATIO = NEEDS.text;

export type Paint = 'fill' | 'glyph' | 'empty';

export interface Swatch {
  paint: Paint;
  cls: string;
}

/* A text color is drawn as "Aa" and `focus` stays unpainted, as the design rules ask; class names are literal so Tailwind builds them. */
export const SWATCH: Record<string, Swatch> = {
  background: { paint: 'fill', cls: 'bg-background' },
  surface: { paint: 'fill', cls: 'bg-surface' },
  border: { paint: 'fill', cls: 'bg-border' },
  'fill-edge': { paint: 'fill', cls: 'bg-fill-edge' },
  'code-edge': { paint: 'fill', cls: 'bg-code-edge' },
  text: { paint: 'glyph', cls: 'text-text' },
  subtle: { paint: 'glyph', cls: 'text-subtle' },
  gold: { paint: 'fill', cls: 'bg-gold' },
  throw: { paint: 'fill', cls: 'bg-throw' },
  focus: { paint: 'empty', cls: '' },
  error: { paint: 'fill', cls: 'bg-error' },
  'error-text': { paint: 'glyph', cls: 'text-error-text' },
  'tile-edge': { paint: 'fill', cls: 'bg-tile-edge' },
};

/* The page's own edge is the token the `bg-border` swatch paints; spelled out, check-tokens would read it as a width. */
const PAGE_EDGE = Object.entries(SWATCH).find(
  ([, swatch]) => swatch.cls === 'bg-border',
)?.[0];
if (PAGE_EDGE === undefined) {
  throw new Error(
    '/brand: no swatch paints bg-border in src/lib/brand-roles.ts',
  );
}

export const swatchOf = (token: string): Swatch => {
  const swatch = SWATCH[token];
  if (!swatch) {
    throw new Error(
      `/brand: ${token} is in the Color tokens table but has no swatch in src/lib/brand-roles.ts`,
    );
  }
  return swatch;
};

for (const { token } of colors) swatchOf(token);

const colorOf = (token: string) => {
  const color = colors.find((c) => c.token === token);
  if (!color) throw new Error(`/brand: no color token ${token}`);
  return color;
};
const hexOf = (token: string, mode: Mode): string => colorOf(token)[mode];

interface Reading {
  fg: string;
  bg: string;
  kind: Kind;
}

export interface RoleToken {
  token: string;
  job: string;
  swatch: Swatch;
  hex: Record<Mode, string>;
}

export interface RoleRead {
  /** The pair's tokens as painted: light mode's gold text becomes ink on the page ground. */
  fg: string;
  bg: string;
  kind: Kind;
  ratio: string;
  verdict: string;
}

export interface Role {
  id: string;
  use: string;
  rule: string;
  tokens: RoleToken[];
  read: Record<Mode, RoleRead>;
}

const measure = (reading: Reading, mode: Mode): RoleRead => {
  const ink = mode === 'light' && reading.fg === 'gold';
  const fg = ink ? 'text' : reading.fg;
  const bg = reading.bg;
  const value = ratio(hexOf(fg, mode), hexOf(bg, mode)) as number;
  if (value < NEEDS[reading.kind]) {
    throw new Error(
      `/brand: ${fg} on ${bg} measures ${value.toFixed(RATIO_DIGITS)} in ${mode} mode, under ${NEEDS[reading.kind]}. Fix the token or its use.`,
    );
  }
  return {
    fg,
    bg,
    kind: reading.kind,
    ratio: value.toFixed(RATIO_DIGITS),
    verdict: VERDICT[reading.kind],
  };
};

/* Every text color reaches 7 on both grounds and every edge 3, not just the pair a role names. */
const assertEveryPair = (): void => {
  const pairs: [string, Kind][] = [
    ['text', 'text'],
    ['subtle', 'text'],
    ['gold', 'text'],
    ['error-text', 'text'],
    [PAGE_EDGE, 'edge'],
    ['error', 'edge'],
    ['focus', 'edge'],
  ];
  for (const [fg, kind] of pairs) {
    for (const bg of GROUNDS) {
      for (const mode of MODES) measure({ fg, bg, kind }, mode);
    }
  }
};
assertEveryPair();

const role = (
  id: string,
  use: string,
  rule: string,
  tokens: string[],
  reading: Reading,
): Role => ({
  id,
  use,
  rule,
  tokens: tokens.map((token) => ({
    token,
    job: colorOf(token).job,
    swatch: swatchOf(token),
    hex: { dark: hexOf(token, 'dark'), light: hexOf(token, 'light') },
  })),
  read: {
    dark: measure(reading, 'dark'),
    light: measure(reading, 'light'),
  },
});

export const roles: Role[] = [
  role(
    'role-grounds',
    'what everything sits on.',
    'The page ground and the surface; every text color reads on both.',
    ['background', 'surface'],
    {
      fg: 'text',
      bg: 'background',
      kind: 'text',
    },
  ),
  role(
    'role-ink',
    'words and the quiet words around them.',
    'Text and subtle text both reach AAA on either ground.',
    ['text', 'subtle'],
    {
      fg: 'subtle',
      bg: 'background',
      kind: 'text',
    },
  ),
  role(
    'role-accent',
    'the one thing to notice.',
    'The accent reads on the dark ground and casts every shadow; light mode turns accent text to ink and throws darker.',
    ['gold', 'throw'],
    {
      fg: 'gold',
      bg: 'background',
      kind: 'text',
    },
  ),
  role(
    'role-interaction',
    'hover and focus only.',
    '`focus` is the ring and the hover color and never shows at rest.',
    ['focus'],
    {
      fg: 'focus',
      bg: 'background',
      kind: 'edge',
    },
  ),
  role(
    'role-errors',
    'errors only.',
    'Magenta marks errors: the edge of a failing field and the color of error words.',
    ['error', 'error-text'],
    {
      fg: 'error-text',
      bg: 'background',
      kind: 'text',
    },
  ),
  role(
    'role-edges',
    'every boundary but table lines.',
    'The edge is the text color: light on the dark page, ink on the light one.',
    [PAGE_EDGE, 'fill-edge', 'tile-edge'],
    {
      fg: PAGE_EDGE,
      bg: 'background',
      kind: 'edge',
    },
  ),
];

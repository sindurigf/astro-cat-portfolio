import { ratio } from '../../scripts/contrast-table.mjs';
import { colors } from './brand';

/* Color, one part per role: its tokens and the one pair it is read on, with the ratio measured from the token hex values. */

export type Mode = 'dark' | 'light';
type Kind = 'text' | 'edge';

const NEEDS: Record<Kind, number> = { text: 7, edge: 3 };
const VERDICT: Record<Kind, string> = { text: 'AAA', edge: '3:1' };
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

/* A text color is drawn as "Aa" and cyan stays unpainted, as the design rules ask; class names are literal so Tailwind builds them. */
export const SWATCH: Record<string, Swatch> = {
  background: { paint: 'fill', cls: 'bg-background' },
  surface: { paint: 'fill', cls: 'bg-surface' },
  border: { paint: 'fill', cls: 'bg-border' },
  'fill-edge': { paint: 'fill', cls: 'bg-fill-edge' },
  text: { paint: 'glyph', cls: 'text-text' },
  subtle: { paint: 'glyph', cls: 'text-subtle' },
  gold: { paint: 'fill', cls: 'bg-gold' },
  cyan: { paint: 'empty', cls: '' },
  pink: { paint: 'fill', cls: 'bg-pink' },
  'pink-text': { paint: 'glyph', cls: 'text-pink-text' },
  mark: { paint: 'fill', cls: 'bg-mark' },
  'tile-edge': { paint: 'fill', cls: 'bg-tile-edge' },
};

/* The page's own edge is the token the `bg-border` swatch paints; spelled out, check-tokens would read it as a width. */
const PAGE_EDGE = Object.keys(SWATCH).find(
  (t) => SWATCH[t]!.cls === 'bg-border',
);
if (PAGE_EDGE === undefined) {
  throw new Error(
    '/brand: no swatch paints bg-border in src/lib/brand-roles.ts',
  );
}

for (const { token } of colors) {
  if (!(token in SWATCH)) {
    throw new Error(
      `/brand: ${token} is in the Color tokens table but has no swatch in src/lib/brand-roles.ts`,
    );
  }
}

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
  const fg = ink ? 'fill-edge' : reading.fg;
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
    ['pink-text', 'text'],
    [PAGE_EDGE, 'edge'],
    ['pink', 'edge'],
    ['mark', 'edge'],
    ['cyan', 'edge'],
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
    swatch: SWATCH[token]!,
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
    'Gold reads on the dark ground; light mode turns gold text to ink.',
    ['gold', 'fill-edge'],
    {
      fg: 'gold',
      bg: 'background',
      kind: 'text',
    },
  ),
  role(
    'role-interaction',
    'hover and focus only.',
    'Cyan is the focus ring and never shows at rest.',
    ['cyan'],
    {
      fg: 'cyan',
      bg: 'background',
      kind: 'edge',
    },
  ),
  role(
    'role-depth',
    'shadows and errors.',
    'Pink casts the shadow; its text color carries error words.',
    ['pink', 'pink-text', 'mark'],
    {
      fg: 'pink-text',
      bg: 'background',
      kind: 'text',
    },
  ),
  role(
    'role-edges',
    'every boundary on the page.',
    'The edge is gold on the dark page and ink on the light one.',
    [PAGE_EDGE, 'tile-edge'],
    {
      fg: PAGE_EDGE,
      bg: 'background',
      kind: 'edge',
    },
  ),
];

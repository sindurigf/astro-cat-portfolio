/*
 * /brand's sections, in menu order, all on the one page. Plain data so the
 * page, the menu, llms.txt and the tests read one list. `anchor` is the
 * section's id on the page; it is also where the retired /brand/<slug>/ route
 * redirects to (public/_redirects).
 */

export const BRAND_PATH = '/brand/';

export type BrandGroup = 'Foundations' | 'Components' | 'About';

export interface BrandPart {
  id: string;
  name: string;
}

export interface BrandSection {
  slug: string;
  anchor: string;
  title: string;
  /* The h1 where the title needs a soft hyphen to fit at 305px (docs/STYLEGUIDE.md "Soft hyphens"). */
  heading?: string;
  group: BrandGroup;
  lead: string;
  rule: string;
  description: string;
  parts: readonly BrandPart[];
}

export const BRAND_GROUPS: readonly BrandGroup[] = [
  'Foundations',
  'Components',
  'About',
];

/* Draft copy: leads, rules, descriptions and the foundations' part names wait for the owner's approval. */
export const BRAND_SECTIONS: readonly BrandSection[] = [
  {
    slug: 'grounds',
    anchor: 'grounds',
    title: 'Grounds',
    group: 'Foundations',
    lead: 'Four grounds carry everything on the site. Each sets which colors may sit on it.',
    rule: 'Four grounds: page, surface, gold block and light block.',
    description:
      'The four grounds of the design system: page, surface, gold block and light block, and which colors may sit on each.',
    parts: [
      { id: 'ground-background', name: 'Page Ground' },
      { id: 'ground-surface', name: 'Surface' },
      { id: 'ground-gold', name: 'Gold Slab' },
      { id: 'ground-solid', name: 'Solid Ground' },
    ],
  },
  {
    slug: 'color',
    anchor: 'color',
    title: 'Color',
    group: 'Foundations',
    lead: 'Each color has one job. Light mode swaps the grounds, the ink and the edges.',
    rule: 'Each color has one job.',
    description:
      'Every color token in the design system, the one job it does, and its value in dark and light mode.',
    parts: [
      { id: 'ink-and-accents', name: 'Ink and Accents' },
      { id: 'edges-and-focus', name: 'Edges and Focus' },
      { id: 'color-grounds', name: 'Grounds' },
      { id: 'on-gold', name: 'On Gold' },
    ],
  },
  {
    slug: 'contrast',
    anchor: 'contrast',
    title: 'Contrast',
    group: 'Foundations',
    lead: "Measured from the color values in the site's code. Text needs 4.5, edges and icons 3.",
    rule: 'Text at 7 or more; edges and icons at 3.',
    description:
      "Contrast ratios for every approved color pairing, measured from the site's own color values, in dark and light mode.",
    parts: [{ id: 'pairings', name: 'Pairings' }],
  },
  {
    slug: 'type',
    anchor: 'type',
    title: 'Type',
    group: 'Foundations',
    lead: 'Lexend, at two weights: 400 for reading, 900 for headings, labels and buttons.',
    rule: 'Lexend at 400 and 900.',
    description:
      'The type scale: Lexend at 400 for reading and 900 for headings, labels and buttons, with the size of every step.',
    parts: [{ id: 'type-scale', name: 'Type Scale' }],
  },
  {
    slug: 'spacing',
    anchor: 'spacing',
    title: 'Spacing',
    group: 'Foundations',
    lead: "A 4px base. Each bar below is drawn at its token's width on this screen.",
    rule: 'A 4px base and named steps for sections, headings, grids and cards.',
    description:
      'The spacing steps: a 4px base and named steps for sections, headings, grids and cards, each drawn at its width.',
    parts: [{ id: 'spacing-steps', name: 'Spacing Steps' }],
  },
  {
    slug: 'borders-and-shadows',
    anchor: 'shadows',
    title: 'Borders and Shadows',
    group: 'Foundations',
    lead: 'Borders are gold on the dark page and ink on gold fills and in light mode. Cards and blocks have a 4px ink edge. Borders are 6px on panels and fields and 4px on controls and photos; the roundel keeps its 8px edge. Shadows are solid offset copies of the shape, with no blur. Corners are square.',
    rule: 'Hard shadows, no blur, square cards.',
    description:
      'Borders, hard shadows and square corners: the width of each edge, every shadow and what casts it.',
    parts: [{ id: 'edges-and-shadows', name: 'Edges and Shadows' }],
  },
  {
    slug: 'motion',
    anchor: 'motion',
    title: 'Motion',
    group: 'Foundations',
    lead: 'Movement is decoration, and it always stops.',
    rule: 'Over 5 seconds of motion gets a pause control.',
    description:
      'The motion rules: a pause control for anything that moves past 5 seconds, no movement under reduced motion, no flashing.',
    parts: [{ id: 'motion-rules', name: 'Motion Rules' }],
  },
  {
    slug: 'buttons-and-links',
    anchor: 'actions',
    title: 'Buttons and Links',
    group: 'Components',
    lead: 'Buttons do something; links go somewhere.',
    rule: 'One primary button per section.',
    description:
      'Primary, secondary and gold buttons, links in text and standalone links, with every state they show.',
    parts: [
      { id: 'primary-button', name: 'Primary Button' },
      { id: 'secondary-button', name: 'Secondary Button' },
      { id: 'gold-buttons', name: 'Buttons on Gold' },
      { id: 'text-links', name: 'Links in Text' },
      { id: 'standalone-links', name: 'Standalone Link' },
    ],
  },
  {
    slug: 'chips-and-labels',
    anchor: 'labels',
    title: 'Chips and Labels',
    group: 'Components',
    lead: 'A chip is always a link. A badge, a label and a sticker never are.',
    rule: 'A chip is always a link.',
    description:
      'Chips, tag chips, badges and stickers: which are links, which never are, and how the current chip shows.',
    parts: [
      { id: 'chips', name: 'Chips' },
      { id: 'tag-chips', name: 'Tag Chips' },
      { id: 'badges', name: 'Badge' },
      { id: 'stickers', name: 'Sticker' },
    ],
  },
  {
    slug: 'controls',
    anchor: 'controls',
    title: 'Controls',
    group: 'Components',
    lead: 'Small controls for motion, theme and focus.',
    rule: 'Every control shows the cyan ring.',
    description:
      'The small controls: pause and sleep controls for motion, the theme switch with its System, Light and Dark choice, and the cyan focus ring.',
    parts: [
      { id: 'pause-control', name: 'Pause Control' },
      { id: 'sleep-control', name: 'Sleep Control' },
      { id: 'theme-switch', name: 'Theme Switch' },
      { id: 'focus-ring', name: 'Focus Ring' },
    ],
  },
  {
    slug: 'heroes',
    anchor: 'heroes',
    title: 'Heroes',
    group: 'Components',
    lead: 'Every page opens on one hero. A main page opens on the full gold slab.',
    rule: 'One hero per page, owning the h1.',
    description:
      'The page heroes: the full gold slab, the thin slab and the plain hero, and the round logo mark on their edge.',
    parts: [
      { id: 'hero-full', name: 'Page Hero' },
      { id: 'roundel', name: 'Roundel' },
    ],
  },
  {
    slug: 'navigation',
    anchor: 'navigation',
    title: 'Navigation',
    group: 'Components',
    lead: 'How a reader moves around: breadcrumb, pager, contents, closing row and footer.',
    rule: 'Breadcrumbs stop at the parent.',
    description:
      'How a reader moves around the site: breadcrumb, pager, contents list, closing block and footer links.',
    parts: [
      { id: 'breadcrumb', name: 'Breadcrumb' },
      { id: 'pager', name: 'Pager' },
      { id: 'contents-list', name: 'On This Page' },
      { id: 'close-row', name: 'Close Row' },
      { id: 'footer-links', name: 'Footer Link Group' },
    ],
  },
  {
    slug: 'cards',
    anchor: 'cards',
    title: 'Cards',
    group: 'Components',
    lead: 'One card shape: a gold or light block.',
    rule: 'Only the title is a link.',
    description:
      'The gold card, the light card, stepped card blocks, post cards and fact strips.',
    parts: [
      { id: 'card', name: 'Card' },
      { id: 'card-solid', name: 'Light Card' },
      { id: 'card-block', name: 'Card Block' },
      { id: 'post-card', name: 'Post Card' },
      { id: 'fact-strip', name: 'Fact Strip' },
    ],
  },
  {
    slug: 'forms',
    anchor: 'forms',
    title: 'Forms',
    group: 'Components',
    lead: 'Every field has a visible label and says when it is required.',
    rule: 'Required is said in words.',
    description:
      'Forms: a visible label on every field, required said in words, and errors that say what is wrong and how to fix it.',
    parts: [{ id: 'form', name: 'Form' }],
  },
  {
    slug: 'photos',
    anchor: 'photos',
    title: 'Photos',
    group: 'Components',
    lead: 'Every photo sits in a frame and opens full size.',
    rule: 'Never cropped, never text over a photo.',
    description:
      'Photos: each one in a frame, never cropped, never under text, and each one opens full size.',
    parts: [{ id: 'photo-strip', name: 'Photo Strip' }],
  },
  {
    slug: 'text',
    anchor: 'text',
    title: 'Text',
    group: 'Components',
    lead: 'Running text, quotes, code and lists, each with one look.',
    rule: 'Lines of about 70 characters.',
    description:
      'Running text: prose, quotes, code blocks, standfirsts and bullet lists, each with one look and lines of about 70 characters.',
    parts: [
      { id: 'prose', name: 'Prose' },
      { id: 'blockquote', name: 'Quote' },
      { id: 'code-block', name: 'Code Block' },
      { id: 'standfirst', name: 'Standfirst and Lead' },
      { id: 'bullet-list', name: 'Bullet List' },
    ],
  },
  {
    slug: 'accessibility',
    anchor: 'accessibility',
    title: 'Accessibility Target',
    /* A soft hyphen (U+00AD) after "Acces". */
    heading: 'Acces\u00ADsibility Target',
    group: 'About',
    lead: 'The floor for every page, and where it is written down.',
    rule: 'WCAG 2.2 AA, and AAA for text contrast.',
    description:
      'The accessibility floor for every page, WCAG 2.2 AA with AAA for text contrast, and where it is written down.',
    parts: [{ id: 'standard', name: 'The Standard' }],
  },
  {
    slug: 'template',
    anchor: 'use',
    title: 'The Template',
    group: 'About',
    lead: 'This design system, its tests and its contact form, ready to use.',
    rule: 'MIT code and docs.',
    description:
      'The template that carries this design system, its tests and its contact form, and the licenses of its code, photos and font.',
    parts: [{ id: 'use-the-template', name: 'Use the Template' }],
  },
];

export const brandHref = (slug: string): string =>
  `${BRAND_PATH}#${brandSection(slug).anchor}`;

export const brandSection = (slug: string): BrandSection => {
  const found = BRAND_SECTIONS.find((s) => s.slug === slug);
  if (!found) throw new Error(`/brand: no section with the slug ${slug}`);
  return found;
};

/** The part's name, so a part is named in one place; throws on an unlisted id. */
export const brandPartName = (id: string): string => {
  const part = BRAND_SECTIONS.flatMap((s) => s.parts).find((p) => p.id === id);
  if (!part) {
    throw new Error(
      `/brand: the part ${id} is not listed in src/lib/brand-sections.ts`,
    );
  }
  return part.name;
};

const NUMBER_DIGITS = 2;

/** The section's place in the menu order, two digits: "01" for the first. */
export const sectionNumber = (slug: string): string =>
  String(BRAND_SECTIONS.indexOf(brandSection(slug)) + 1).padStart(
    NUMBER_DIGITS,
    '0',
  );

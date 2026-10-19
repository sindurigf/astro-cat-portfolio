/*
 * Adds `layout` and `sizes` to markdown images for getImage(). A lone image gets
 * an SVG-viewBox `.aspect-frame`: WebKit drops a failed image's size and the CSP
 * bars inline styles. In a post it becomes a figure, its title a figcaption
 * credited via CREDITS; on a slide only a titled image does.
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { imageMetadata } from 'astro/assets/utils';
import {
  LICENSED_PHOTOS,
  PHOTOGRAPHERS,
  PHOTO_CREDIT_PREFIX,
  SCREENSHOT_CREDIT_PREFIX,
  SCREENSHOT_SOURCES,
} from '../lib/credits.ts';

const CREDITS = [
  [PHOTO_CREDIT_PREFIX, PHOTOGRAPHERS],
  [SCREENSHOT_CREDIT_PREFIX, SCREENSHOT_SOURCES],
];

/* `--container-measure`, less the gutter on narrow viewports. */
const SIZES =
  '(min-width: 40rem) min(calc(100vw - 3rem), 36rem), min(calc(100vw - 2rem), 36rem)';

/*
 * A slide picture's column in slides.css (`.slide-body > p:has(> .aspect-frame)`);
 * `vh` not `svh` so the slot is never too small.
 * tests/image-size.spec.ts fails when this and the CSS drift apart.
 */
const SLIDE_SIZES =
  '(min-width: 64rem) min(calc((min(100vw - 11.5rem, 71.5rem) - 33rem) * 5 / 12 + 12rem), 55vh, 28rem), ' +
  '(min-width: 40rem) min(calc(100vw - 8.5rem), 55vh, 28rem), ' +
  'min(calc(100vw - 5.5rem), 55vh, 28rem)';

/* Must match where src/lib/talk-loader.ts reads the slides from. */
const TALKS_PATH = '/src/content/talks/';

const isTalk = (fileURL) => String(fileURL ?? '').includes(TALKS_PATH);

const sizesFor = (fileURL) => (isTalk(fileURL) ? SLIDE_SIZES : SIZES);

/*
 * A post figure's slot, `.post-layout .prose figure` in prose.css: a landscape
 * takes the page column, and from 80rem the measure plus the track right of it;
 * a portrait keeps the measure.
 */
const LANDSCAPE_SLOTS = [
  ['(min-width: 80rem)', 'calc((min(100vw - 3rem, 80rem) + 36rem) / 2)'],
  ['(min-width: 40rem)', 'calc(100vw - 3rem)'],
  ['', 'calc(100vw - 2rem)'],
];
const PORTRAIT_SLOTS = [
  ['(min-width: 40rem)', 'min(calc(100vw - 3rem), 36rem)'],
  ['', 'min(calc(100vw - 2rem), 36rem)'],
];

const isPortrait = ({ width, height }) => height > width;

/* `--figure-max-height` in prose.css. */
const FIGURE_MAX_HEIGHT_VH = 80;

/* Uncropped, the figure is drawn no wider than its file or than its capped height allows. */
const figureSizes = ({ width, height }) => {
  const heightCapped = `${((FIGURE_MAX_HEIGHT_VH * width) / height).toFixed(2)}vh`;
  const slots = isPortrait({ width, height })
    ? PORTRAIT_SLOTS
    : LANDSCAPE_SLOTS;
  return slots
    .map(([media, slot]) =>
      `${media} min(${slot}, ${width}px, ${heightCapped})`.trim(),
    )
    .join(', ');
};

/* Candidates come from `image.breakpoints` in astro.config.mjs: a `widths` array does not survive hast. */
const LAYOUT = 'full-width';

const isElement = (node, tagName) =>
  node?.type === 'element' && node.tagName === tagName;

const text = (value) => ({ type: 'text', value });

const sizeOf = async (src, fileURL) => {
  if (fileURL === undefined) {
    throw new Error(`post-figure: no document URL to resolve ${src} against`);
  }
  const url = new URL(src, fileURL);
  const { width, height } = await imageMetadata(await readFile(url), src);
  return { width, height };
};

const framed = (image, { width, height }) => ({
  type: 'element',
  tagName: 'span',
  properties: { className: ['aspect-frame', 'block'] },
  children: [
    {
      type: 'element',
      tagName: 'svg',
      properties: {
        className: ['aspect-sizer'],
        viewBox: `0 0 ${width} ${height}`,
        width,
        height,
        ariaHidden: 'true',
        focusable: 'false',
      },
      children: [],
    },
    image,
  ],
});

const link = (href, label) => ({
  type: 'element',
  tagName: 'a',
  properties: { href },
  children: [text(label)],
});

/**
 * A Creative Commons photo, keyed by its file name.
 * @param {unknown} src
 * @param {Readonly<Record<string, import('../lib/credits.ts').LicensedPhoto>>} photos
 */
const licensedPhoto = (src, photos) => {
  const stem =
    String(src)
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? '';
  return Object.hasOwn(photos, stem) ? photos[stem] : undefined;
};

/**
 * "Photo: Name", the name linked to the photo's page or else the photographer's;
 * a Creative Commons photo adds its short license, linked to its deed.
 * @param {string} caption
 * @param {unknown} src
 * @param {Readonly<Record<string, import('../lib/credits.ts').LicensedPhoto>>} [photos]
 */
export const captionChildren = (caption, src, photos = LICENSED_PHOTOS) => {
  const [prefix, sources] =
    CREDITS.find(([candidate]) => caption.startsWith(candidate)) ?? [];
  if (prefix === undefined) return [text(caption)];

  const name = caption.slice(prefix.length);
  const licensed =
    prefix === PHOTO_CREDIT_PREFIX ? licensedPhoto(src, photos) : undefined;
  if (licensed !== undefined && licensed.photographer !== name) {
    throw new Error(
      `post-figure: ${String(src)} is credited to "${name}", but LICENSED_PHOTOS names "${licensed.photographer}".`,
    );
  }
  const href =
    licensed?.source ??
    (Object.hasOwn(sources, name) ? sources[name] : undefined);
  if (href === undefined) return [text(caption)];

  const credit = [text(prefix), link(href, name)];
  if (licensed === undefined) return credit;

  return [
    ...credit,
    text(' ('),
    link(licensed.licenseHref, licensed.licenseShort),
    text(')'),
  ];
};

/* A post with a `cover` opens on it (src/pages/blog/[slug].astro), so that photo loads first. */
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;
const COVER_FIELD = /^cover:/m;

const opensOnCover = (fileURL) => {
  const path = String(fileURL ?? '');
  if (!path.endsWith('.md')) return false;
  const source = readFileSync(fileURLToPath(path), 'utf8');
  return COVER_FIELD.test(FRONTMATTER.exec(source)?.[1] ?? '');
};

/*
 * A factory, so each post gets its own first image, which sits in the first
 * screen. Not slides: each is compiled alone, so every slide would have one.
 */
export const postFigure = ({ fileURL } = {}) => {
  let firstSeen =
    String(fileURL ?? '').includes(TALKS_PATH) || opensOnCover(fileURL);
  const isFirst = () => !firstSeen && (firstSeen = true);

  return {
    name: 'post-figure',

    element: {
      filter: ['img'],

      async visit(node, ctx) {
        const { title, ...properties } = node.properties ?? {};
        const priority = isFirst();

        const parent = ctx.parent(node);
        const aloneInParagraph =
          isElement(parent, 'p') &&
          parent.children.length === 1 &&
          ctx.textContent(parent).trim() === '';

        const caption = typeof title === 'string' ? title.trim() : '';

        if (!aloneInParagraph) {
          ctx.setProperty(node, 'layout', LAYOUT);
          ctx.setProperty(node, 'sizes', sizesFor(ctx.fileURL));
          if (priority) ctx.setProperty(node, 'priority', true);
          return;
        }

        const size = await sizeOf(String(properties.src), ctx.fileURL);
        const talk = isTalk(ctx.fileURL);
        const frame = framed(
          {
            type: 'element',
            tagName: 'img',
            properties: {
              ...properties,
              layout: LAYOUT,
              sizes: talk ? SLIDE_SIZES : figureSizes(size),
              ...(priority ? { priority: true } : {}),
            },
            children: [],
          },
          size,
        );

        if (talk && caption === '') {
          ctx.replaceNode(node, frame);
          return;
        }

        ctx.replaceNode(parent, {
          type: 'element',
          tagName: 'figure',
          properties: isPortrait(size)
            ? { className: ['figure-portrait'] }
            : {},
          children: [
            frame,
            ...(caption === ''
              ? []
              : [
                  {
                    type: 'element',
                    tagName: 'figcaption',
                    properties: {},
                    children: captionChildren(caption, properties.src),
                  },
                ]),
          ],
        });
      },
    },
  };
};

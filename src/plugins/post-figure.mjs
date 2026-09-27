/*
 * Adds `layout` and `sizes` to markdown images for getImage(). A lone image gets
 * an SVG-viewBox `.aspect-frame`: WebKit drops a failed image's size and the CSP
 * bars inline styles. Its title becomes a figcaption, linked via PHOTOGRAPHERS.
 */

import { readFile } from 'node:fs/promises';
import { imageMetadata } from 'astro/assets/utils';
import { PHOTOGRAPHERS, PHOTO_CREDIT_PREFIX } from '../lib/credits.ts';

/* `--container-measure`, less the gutter on narrow viewports. */
const SIZES =
  '(min-width: 40rem) min(calc(100vw - 3rem), 36rem), min(calc(100vw - 2rem), 36rem)';

/*
 * A slide picture's column in slides.css (`.slide-body > p:has(> .aspect-frame)`);
 * `vh` not `svh` so the slot is never too small.
 * tests/image-size.spec.ts fails when this and the CSS drift apart.
 */
const SLIDE_SIZES =
  '(min-width: 64rem) min(calc((min(100vw - 12rem, 71rem) - 33rem) * 5 / 12 + 12rem), 55vh, 28rem), ' +
  '(min-width: 40rem) min(calc(100vw - 9rem), 55vh, 28rem), ' +
  'min(calc(100vw - 6rem), 55vh, 28rem)';

/* Must match where src/lib/talk-loader.ts reads the slides from. */
const TALKS_PATH = '/src/content/talks/';

const sizesFor = (fileURL) =>
  String(fileURL ?? '').includes(TALKS_PATH) ? SLIDE_SIZES : SIZES;

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
        ariaHidden: 'true',
        focusable: 'false',
      },
      children: [],
    },
    image,
  ],
});

const captionChildren = (caption) => {
  if (!caption.startsWith(PHOTO_CREDIT_PREFIX)) return [text(caption)];

  const name = caption.slice(PHOTO_CREDIT_PREFIX.length);
  const href = PHOTOGRAPHERS[name];
  if (href === undefined) return [text(caption)];

  return [
    text(PHOTO_CREDIT_PREFIX),
    {
      type: 'element',
      tagName: 'a',
      properties: { href },
      children: [text(name)],
    },
  ];
};

/*
 * A factory, so each post gets its own first image, which sits in the first
 * screen. Not slides: each is compiled alone, so every slide would have one.
 */
export const postFigure = ({ fileURL } = {}) => {
  let firstSeen = String(fileURL ?? '').includes(TALKS_PATH);
  const isFirst = () => !firstSeen && (firstSeen = true);

  return {
    name: 'post-figure',

    element: {
      filter: ['img'],

      async visit(node, ctx) {
        const { title, ...properties } = node.properties ?? {};
        const priority = isFirst();
        const image = {
          type: 'element',
          tagName: 'img',
          properties: {
            ...properties,
            layout: LAYOUT,
            sizes: sizesFor(ctx.fileURL),
            ...(priority ? { priority: true } : {}),
          },
          children: [],
        };

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

        const frame = framed(
          image,
          await sizeOf(String(properties.src), ctx.fileURL),
        );

        if (caption === '') {
          ctx.replaceNode(node, frame);
          return;
        }

        ctx.replaceNode(parent, {
          type: 'element',
          tagName: 'figure',
          properties: {},
          children: [
            frame,
            {
              type: 'element',
              tagName: 'figcaption',
              properties: {},
              children: captionChildren(caption),
            },
          ],
        });
      },
    },
  };
};

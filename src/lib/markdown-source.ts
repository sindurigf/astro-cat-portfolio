import type { ImageMetadata } from 'astro';
import { isoDate } from './time';
import { getImage } from 'astro:assets';
import type { BlogPost } from './blog';
import { postHref } from './paths';

/*
 * /blog/<slug>.md per llmstxt.org. Image paths become built WebP URLs and
 * root-relative links become absolute: the file has no origin to resolve from.
 */

/** The post column at 2x. */
const SOURCE_IMAGE_WIDTH = 1200;

const POST_IMAGES = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/blog/**/*.{jpg,jpeg,png,webp}',
  { eager: true },
);

const imageFor = (relativePath: string): ImageMetadata => {
  const key = relativePath.replace(/^(\.\.\/)+assets\//, '../assets/');
  const image = POST_IMAGES[key]?.default;
  if (!image) {
    throw new Error(
      `A post links ${relativePath}, which is not under src/assets/blog/.`,
    );
  }
  return image;
};

const builtImageUrl = async (
  relativePath: string,
  site: URL,
): Promise<string> => {
  /*
   * Never read a property of the image: any read marks the original for
   * shipping (`npm run check:untransformed`). Astro never enlarges.
   */
  const built = await getImage({
    src: imageFor(relativePath),
    width: SOURCE_IMAGE_WIDTH,
    format: 'webp',
  });
  return new URL(built.src, site).href;
};

const IMAGE = /!\[([^\]]*)\]\((\.\.\/[^)\s]+)((?:\s+(?:'[^']*'|"[^"]*"))?)\)/g;
const UNREWRITTEN_PATH = /\]\(\.\.\/[^)]*\)/;
const ROOT_RELATIVE_LINK = /\]\((\/[^)\s]*)/g;

const rewriteBody = async (
  id: string,
  body: string,
  site: URL,
): Promise<string> => {
  let out = body;
  for (const match of body.matchAll(IMAGE)) {
    const [whole, alt, path, title] = match;
    const url = await builtImageUrl(path, site);
    /* A function replacer: a `$` in alt text is not a replacement pattern. */
    out = out.replace(whole, () => `![${alt}](${url}${title})`);
  }
  const leftover = UNREWRITTEN_PATH.exec(out);
  if (leftover) {
    throw new Error(
      `${id}: "${leftover[0]}" is a relative path the Markdown copy cannot rewrite.`,
    );
  }
  return out.replace(
    ROOT_RELATIVE_LINK,
    (_, path: string) => `](${new URL(path, site).href}`,
  );
};

/* JSON strings are valid YAML double-quoted scalars, escapes included. */
const yaml = (value: string): string => JSON.stringify(value);

export const markdownSource = async (
  post: BlogPost,
  site: URL,
): Promise<string> => {
  const { title, date, category, tags, teaser } = post.data;
  const frontmatter = [
    '---',
    `title: ${yaml(title)}`,
    `date: ${isoDate(date)}`,
    `category: ${yaml(category)}`,
    `tags: [${tags.map(yaml).join(', ')}]`,
    `description: ${yaml(teaser)}`,
    `canonical: ${yaml(new URL(postHref(post.id), site).href)}`,
    '---',
  ].join('\n');
  return `${frontmatter}\n\n${await rewriteBody(post.id, post.body ?? '', site)}`;
};

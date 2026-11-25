/*
 * The `content:encoded` HTML of a feed item: cover, opening and a link back.
 * Built only from escaped plain text, so a repost carries no markup from a post.
 */

/* Long enough for a repost to read as a preview, short enough to need the click back. */
export const FEED_CONTENT_MAX_CHARACTERS = 1200;

export interface FeedCover {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface FeedCredit {
  name: string;
  href?: string | undefined;
}

interface FeedContent {
  url: string;
  siteName: string;
  opening: string;
  cover?: FeedCover;
  credit?: FeedCredit | undefined;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]!);

const creditHtml = (credit: FeedCredit): string => {
  const name = escapeHtml(credit.name);
  const named = credit.href
    ? `<a href="${escapeHtml(credit.href)}">${name}</a>`
    : name;
  return `<p>Photo: ${named}</p>`;
};

export const feedContentHtml = ({
  url,
  siteName,
  opening,
  cover,
  credit,
}: FeedContent): string => {
  const href = escapeHtml(url);
  return [
    cover
      ? `<p><a href="${href}"><img src="${escapeHtml(cover.src)}" width="${cover.width}" height="${cover.height}" alt="${escapeHtml(cover.alt)}"></a></p>`
      : '',
    credit ? creditHtml(credit) : '',
    `<p>${escapeHtml(opening)}</p>`,
    `<p><a href="${href}">Read the rest on ${escapeHtml(siteName)}</a></p>`,
  ].join('');
};

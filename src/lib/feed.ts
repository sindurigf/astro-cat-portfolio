import rss from '@astrojs/rss';
import { getImage } from 'astro:assets';
import { publishedPosts, tagLabel, type BlogPost } from './blog';
import { lastChanged } from './feed-date';
import { PHOTOGRAPHERS } from './credits';
import {
  escapeHtml,
  FEED_CONTENT_MAX_CHARACTERS,
  feedContentHtml,
  type FeedCover,
  type FeedCredit,
} from './feed-content';
import { feedExcerpt } from './feed-excerpt';
import { postHref } from './paths';
import { PERSON_NAME } from './profiles';
import { requireSite, SITE_NAME } from './site';
import { FEED_LANGUAGE } from './site-language';

/*
 * RSS 2.0 per the RSS Best Practices Profile (rssboard.org/rss-profile).
 * A planet aggregator reads a tag feed and needs W3C-valid output.
 * Placeholder posts are excluded.
 */

/* The channel title and the tag page's `<link rel="alternate">` title agree. */
export const tagFeedTitle = (tag: string): string =>
  `${SITE_NAME}: ${tagLabel(tag)}`;

interface Feed {
  title: string;
  description: string;
  /** Site-relative. */
  pagePath: string;
  /** Site-relative. */
  selfPath: string;
  posts: readonly BlogPost[];
  /** Describe each post by its opening instead of its teaser, for an aggregator. */
  opening?: boolean;
}

const NAMESPACES = {
  atom: 'http://www.w3.org/2005/Atom',
  dc: 'http://purl.org/dc/elements/1.1/',
  media: 'http://search.yahoo.com/mrss/',
};

const FEED_COVER_WIDTH = 1200;
const FEED_COVER_FORMAT = 'jpg';
const FEED_COVER_TYPE = 'image/jpeg';

const feedCover = async (post: BlogPost, site: URL): Promise<FeedCover> => {
  const built = await getImage({
    src: post.data.cover,
    width: FEED_COVER_WIDTH,
    format: FEED_COVER_FORMAT,
  });
  return {
    src: new URL(built.src, site).href,
    width: Number(built.attributes.width),
    height: Number(built.attributes.height),
    alt: post.data.coverAlt,
  };
};

const feedCredit = (name: string | undefined): FeedCredit | undefined => {
  if (!name) return undefined;
  const href: string | undefined = (
    PHOTOGRAPHERS as Readonly<Record<string, string>>
  )[name];
  return { name, href };
};

const mediaXml = (cover: FeedCover, credit: FeedCredit | undefined): string =>
  [
    `<media:content url="${escapeHtml(cover.src)}" medium="image" type="${FEED_COVER_TYPE}" width="${cover.width}" height="${cover.height}">`,
    `<media:description type="plain">${escapeHtml(cover.alt)}</media:description>`,
    credit ? `<media:credit>${escapeHtml(credit.name)}</media:credit>` : '',
    `</media:content>`,
  ].join('');

export const feedResponse = async (
  feed: Feed,
  configuredSite: URL | undefined,
): Promise<Response> => {
  const site = requireSite(
    configuredSite,
    'every link in a feed must be absolute.',
  );
  const posts = publishedPosts(feed.posts);
  const lastBuild = lastChanged(posts);
  const self = new URL(feed.selfPath, site).href;

  return rss({
    title: feed.title,
    description: feed.description,
    /* The channel link is the page the feed mirrors, not the site root. */
    site: new URL(feed.pagePath, site).href,
    xmlns: NAMESPACES,
    customData: [
      `<language>${FEED_LANGUAGE}</language>`,
      lastBuild
        ? `<lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>`
        : '',
      `<atom:link href="${self}" rel="self" type="application/rss+xml"/>`,
    ].join(''),
    items: await Promise.all(
      posts.map(async (post) => {
        const link = new URL(postHref(post.id), site).href;
        const cover = await feedCover(post, site);
        const credit = feedCredit(post.data.coverCredit);
        const opening =
          feedExcerpt(post.body ?? '', FEED_CONTENT_MAX_CHARACTERS) ??
          post.data.teaser;
        return {
          title: post.data.title,
          link,
          pubDate: post.data.date,
          description:
            (feed.opening && feedExcerpt(post.body ?? '')) || post.data.teaser,
          content: feedContentHtml({
            url: link,
            siteName: SITE_NAME,
            opening,
            cover,
            credit,
          }),
          categories: post.data.tags.map(tagLabel),
          customData: `<dc:creator>${PERSON_NAME}</dc:creator>${mediaXml(cover, credit)}`,
        };
      }),
    ),
  });
};

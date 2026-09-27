import rss from '@astrojs/rss';
import { publishedPosts, tagLabel, type BlogPost } from './blog';
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
}

const NAMESPACES = {
  atom: 'http://www.w3.org/2005/Atom',
  dc: 'http://purl.org/dc/elements/1.1/',
};

export const feedResponse = async (
  feed: Feed,
  configuredSite: URL | undefined,
): Promise<Response> => {
  const site = requireSite(
    configuredSite,
    'every link in a feed must be absolute.',
  );
  const posts = publishedPosts(feed.posts);
  const newest = posts[0]?.data.date;
  const self = new URL(feed.selfPath, site).href;

  return rss({
    title: feed.title,
    description: feed.description,
    /* The channel link is the page the feed mirrors, not the site root. */
    site: new URL(feed.pagePath, site).href,
    xmlns: NAMESPACES,
    customData: [
      `<language>${FEED_LANGUAGE}</language>`,
      newest ? `<lastBuildDate>${newest.toUTCString()}</lastBuildDate>` : '',
      `<atom:link href="${self}" rel="self" type="application/rss+xml"/>`,
    ].join(''),
    items: posts.map((post) => ({
      title: post.data.title,
      link: new URL(postHref(post.id), site).href,
      pubDate: post.data.date,
      description: post.data.teaser,
      categories: post.data.tags.map(tagLabel),
      customData: `<dc:creator>${PERSON_NAME}</dc:creator>`,
    })),
  });
};

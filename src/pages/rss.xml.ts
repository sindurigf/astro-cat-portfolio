import type { APIRoute } from 'astro';
import { getSortedPosts } from '../lib/blog';
import { feedResponse } from '../lib/feed';
import { BLOG_PATH, SITE_FEED_PATH } from '../lib/paths';
import { SITE_NAME } from '../lib/site';

export const GET: APIRoute = async ({ site }) =>
  feedResponse(
    {
      title: SITE_NAME,
      description: `Every post on ${SITE_NAME}, newest first.`,
      pagePath: BLOG_PATH,
      selfPath: SITE_FEED_PATH,
      posts: await getSortedPosts(),
    },
    site,
  );

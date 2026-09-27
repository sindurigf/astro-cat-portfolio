import { SITE_NAME } from '../../../../lib/site';
import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from 'astro';
import { getPostsByTag, tagLabel } from '../../../../lib/blog';
import { feedResponse, tagFeedTitle } from '../../../../lib/feed';
import { tagFeedPath, tagHref } from '../../../../lib/paths';

/* One feed per tag, for aggregators that follow a single topic. */
export const getStaticPaths = (async () =>
  [...(await getPostsByTag())].map(([tag, posts]) => ({
    params: { tag },
    props: { tag, posts },
  }))) satisfies GetStaticPaths;

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export const GET: APIRoute<Props> = ({ props: { tag, posts }, site }) =>
  feedResponse(
    {
      title: tagFeedTitle(tag),
      description: `Posts on ${SITE_NAME} tagged ${tagLabel(tag)}, newest first.`,
      pagePath: tagHref(tag),
      selfPath: tagFeedPath(tag),
      posts,
    },
    site,
  );

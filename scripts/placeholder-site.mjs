/* Warns on a build whose `site.url` is the shipped placeholder: deployed, every page is canonical to another domain. */
import { placeholderSiteNotice } from '../src/lib/example-host.ts';

export const placeholderSite = (siteUrl) => ({
  name: 'placeholder-site',
  hooks: {
    'astro:build:start': ({ logger }) => {
      const notice = placeholderSiteNotice(siteUrl);
      if (notice) logger.warn(notice);
    },
  },
});

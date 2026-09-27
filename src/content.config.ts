import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
/* `z` from `astro:content` is deprecated and removed in Astro 8. */
import { z } from 'astro/zod';
import { talkLoader } from './lib/talk-loader';
import { BLOG_CONTENT_DIR } from './lib/paths';

/* Top level only: `[slug].astro` is one path segment, and sitemap-filter.ts reads the same files. */
const BLOG_FILE_PATTERN = '*.md';

export const BLOG_CATEGORIES = [
  'skincare',
  'travel',
  'personal-thoughts',
  'professional-journey',
  'open-source',
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

const blog = defineCollection({
  loader: glob({ base: BLOG_CONTENT_DIR, pattern: BLOG_FILE_PATTERN }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        date: z.coerce.date(),
        /* A reader-visible revision. Absent omits `dateModified` rather than copying `date`. */
        updated: z.coerce.date().optional(),
        category: z.enum(BLOG_CATEGORIES),
        /* Lorem ipsum stand-in. Required so every post states it; tests/llms-txt.spec.ts checks the text. */
        placeholder: z.boolean(),
        /* Kebab-case: each tag is a URL segment in /blog/tag/<tag>/. */
        tags: z
          .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
          .default([]),
        teaser: z.string(),
        featured: z.boolean().default(false),
        readingTime: z.number().optional(),
        seoTitle: z.string().optional(),
        seoDescription: z.string().optional(),
        /* Shown on a featured card; relative to the post so astro:assets resizes it. */
        cover: image().optional(),
        coverAlt: z.string().optional(),
        /* Alt for the 1.91:1 og:image crop, when the crop drops something coverAlt names. */
        coverCardAlt: z.string().optional(),
      })
      .refine((post) => post.cover === undefined || Boolean(post.coverAlt), {
        message: 'A post with a cover needs coverAlt describing the photo.',
        path: ['coverAlt'],
      }),
});

const TALKS_CONTENT_DIR = 'src/content/talks';

/* A Slidev layout is listed only once the slideshow renders it. */
const TALK_LAYOUTS = ['cover', 'section', 'default'] as const;

const talks = defineCollection({
  loader: talkLoader({ base: TALKS_CONTENT_DIR }),
  /* Strict, so a misspelt key fails the build. Cross-slide rules are in src/lib/talk-loader.ts. */
  schema: z.strictObject({
    deck: z.string(),
    number: z.number().int().positive(),
    title: z.string(),
    layout: z.enum(TALK_LAYOUTS).default('default'),
    part: z.string().optional(),
    /* E.g. a pillar number, rendered inside the slide heading. */
    label: z.string().optional(),
    /* Slide 1 only: meta description, 50 to 160 characters. */
    info: z.string().optional(),
  }),
});

export const collections = { blog, talks };

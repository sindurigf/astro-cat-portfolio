import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
/* `z` from `astro:content` is deprecated and removed in Astro 8. */
import { z } from 'astro/zod';
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

/* Crop positions sharp reads for a post card's 4:3 cover. */
export const COVER_POSITIONS = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
] as const;

export type CoverPosition = (typeof COVER_POSITIONS)[number];

const blog = defineCollection({
  loader: glob({ base: BLOG_CONTENT_DIR, pattern: BLOG_FILE_PATTERN }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      /* A reader-visible revision. Absent omits `dateModified` rather than copying `date`. */
      updated: z.coerce.date().optional(),
      category: z.enum(BLOG_CATEGORIES),
      /* Lorem ipsum stand-in. Required so every post states it; tests/llms-txt.spec.ts checks the text. */
      placeholder: z.boolean(),
      /* Kebab-case: each tag is a URL segment in /blog/tag/<tag>/. */
      tags: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).default([]),
      teaser: z.string(),
      featured: z.boolean().default(false),
      readingTime: z.number().optional(),
      /* Ends the post with the sample persona's sources (src/lib/persona.ts). */
      personaSources: z.boolean().default(false),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
      /* Any ratio, relative to the post; uncropped on the post page and its sharing card, cropped to 4:3 on every card. */
      cover: image(),
      coverAlt: z.string().min(1),
      /* Where the build crops the card's 4:3 cover. */
      coverPosition: z.enum(COVER_POSITIONS).default('center'),
      /* The cover's photographer, shown in the post's date line; a PHOTOGRAPHERS name is linked. */
      coverCredit: z.string().optional(),
    }),
});

export const collections = { blog };

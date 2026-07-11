import { defineCollection, z } from 'astro:content';

// Shared frontmatter for imported WordPress content. `path` holds the EXACT
// original permalink (e.g. "/caton-moor/" or
// "/things-to-do/towns-and-villages/abbeystead/") so the catch-all route in
// src/pages/[...slug].astro can reproduce every legacy URL 1:1.
const base = {
  title: z.string(),
  description: z.string().optional().default(''),
  path: z.string(), // exact URL path, always leading + trailing slash
  pubDate: z.coerce.date().optional(),
  updatedDate: z.coerce.date().optional(),
  hero: z.string().optional(), // remote image URL (R2/CDN once migrated)
  heroAlt: z.string().optional().default(''),
  draft: z.boolean().optional().default(false),
  wpId: z.number().optional(),
};

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    ...base,
    categories: z.array(z.string()).optional().default([]),
  }),
});

const pages = defineCollection({
  type: 'content',
  schema: z.object({
    ...base,
    // pages can nest; parent path is derived from `path` at render time
  }),
});

export const collections = { posts, pages };

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { novaPortalLoader } from './lib/novaportal-loader.mjs';

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

// Posts are managed in NovaPortal; pulled at build time. mapData reshapes the
// portal payload back onto this site's own frontmatter schema (exact permalink
// in `path`, original pubDate, hero image, full category list) so routing and
// rendering are unchanged. Requires NOVAPORTAL_READ_TOKEN in the build env.
const posts = defineCollection({
  loader: novaPortalLoader({
    portal: 'https://novaportal-explorebowland.collectiq.workers.dev',
    mapData: (p) => ({
      title: p.title,
      description: p.description,
      path: p.extras.path,
      pubDate: p.extras.pubDate ?? p.date,
      updatedDate: p.extras.updatedDate,
      hero: p.image || undefined,
      heroAlt: p.imageAlt,
      draft: false, // the portal only serves published posts
      wpId: p.extras.wpId,
      categories: p.extras.categories ?? [p.categoryLabel],
    }),
  }),
  schema: z.object({
    ...base,
    categories: z.array(z.string()).optional().default([]),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    ...base,
    // pages can nest; parent path is derived from `path` at render time
  }),
});

export const collections = { posts, pages };

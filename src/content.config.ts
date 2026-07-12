import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { novaPortalLoader } from './lib/novaportal-loader.mjs';
import { buildRoute } from './lib/route-schema.mjs';
import { postPath } from './lib/post-path.mjs';
// Migrated route values parsed from the old inline tables (bridge until the
// portal serves them; portal values override these per field).
import routeFields from '../data/route-fields.json';

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
      // Posts nest under their section: <category parent>/<slug>/. Old flat
      // permalinks 301 to these (see the post-redirects build integration).
      path: postPath(p),
      pubDate: p.extras.pubDate ?? p.date,
      updatedDate: p.extras.updatedDate,
      hero: p.image || undefined,
      heroAlt: p.imageAlt,
      draft: false, // the portal only serves published posts
      wpId: p.extras.wpId,
      // The portal's category selector is the single source of truth — the
      // imported extras.categories array is deliberately ignored so selector
      // changes always render. (Cost: 2 of 116 WP posts lose a cross-listing.)
      categories: [p.categoryLabel],
      // Section (category) → parent page assignment, editable in the portal.
      // Used to list a section's posts on its parent page. Treated as data.
      sectionLabel: p.categoryLabel,
      sectionParent: p.categoryParent || '',
      // Route-info custom fields (walk posts). Delivered per post in `extras`
      // keyed by ROUTE_SCHEMA keys; blank fields are dropped. Empty for posts
      // the client hasn't filled yet.
      route: buildRoute({
        ...(routeFields[p.slug] || {}),
        ...(p.extras || {}),
        ...(p.route || {}),
        ...(p.fields || {}),
      }),
    }),
  }),
  schema: z.object({
    ...base,
    categories: z.array(z.string()).optional().default([]),
    sectionLabel: z.string().optional().default(''),
    sectionParent: z.string().optional().default(''),
    route: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          value: z.string(),
          coords: z.boolean().optional(),
        }),
      )
      .optional()
      .default([]),
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

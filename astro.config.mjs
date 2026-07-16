import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { writeFileSync } from 'node:fs';
import { postPath, legacyPaths } from './src/lib/post-path.mjs';
import { novaPortalRedirects } from './src/lib/redirects-integration.mjs';

const PORTAL = 'https://novaportal-explorebowland.collectiq.workers.dev';
const SITE_URL = 'https://www.explorebowland.co.uk';

// WP images live on the R2 media host, not www — mirror the loader's rewrite so
// sitemap <image:loc> URLs resolve (www/wp-content 404s; media 200s).
const IMAGE_BASE = (process.env.IMAGE_BASE || 'https://media.explorebowland.co.uk').replace(/\/+$/, '');
const toMedia = (u) =>
  typeof u === 'string'
    ? u.replace(/https?:\/\/(?:www\.)?explorebowland\.co\.uk\/wp-content\/uploads\//g, `${IMAGE_BASE}/wp-content/uploads/`)
    : u;

// Absolute-URL -> ISO lastmod for posts, filled during the build:start fetch
// below and consumed by the sitemap `serialize` hook so each post carries a
// real last-modified date. Empty (no lastmod emitted) when the fetch is skipped.
const lastmodByUrl = new Map();

// Absolute-URL -> hero image URL, for <image:image> entries in the sitemap so
// this photo-heavy site surfaces in Google Image search. Filled below.
const imageByUrl = new Map();

// Posts now live at <section>/<slug>/. This integration fetches the portal
// posts at build and writes functions/post-redirects.json mapping every old flat
// permalink -> its new nested URL, so the catch-all Pages Function 301s them.
// It also records each post's lastmod for the sitemap. Regenerated on each build,
// so section/slug changes keep redirects correct.
// Fails soft: no token / portal error -> empty map (no redirects, build unbroken).
function postRedirects() {
  return {
    name: 'post-redirects',
    hooks: {
      'astro:build:start': async ({ logger }) => {
        const out = {};
        const token = process.env.NOVAPORTAL_READ_TOKEN;
        if (token) {
          try {
            const res = await fetch(`${PORTAL}/api/v1/content/posts`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const { posts } = await res.json();
              for (const p of posts) {
                const to = postPath(p);
                for (const from of legacyPaths(p)) if (from !== to) out[from] = to;
                const d = p.extras?.updatedDate || p.extras?.pubDate || p.date;
                const t = d ? Date.parse(d) : NaN;
                if (!Number.isNaN(t)) lastmodByUrl.set(`${SITE_URL}${to}`, new Date(t).toISOString());
                if (p.image) imageByUrl.set(`${SITE_URL}${to}`, toMedia(p.image));
              }
            }
            // Portal-managed pages (towns, places…) also carry a hero image.
            const pagesRes = await fetch(`${PORTAL}/api/v1/content/pages`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (pagesRes.ok) {
              const data = await pagesRes.json();
              const pages = Array.isArray(data) ? data : data.pages || [];
              for (const pg of pages) {
                if (pg.path && pg.image) imageByUrl.set(`${SITE_URL}${pg.path}`, toMedia(pg.image));
              }
            }
          } catch (e) {
            logger.warn(`post-redirects: ${e.message}`);
          }
        }
        writeFileSync(new URL('./functions/post-redirects.json', import.meta.url), JSON.stringify(out));
        logger.info(`post-redirects: ${Object.keys(out).length} legacy URLs -> nested`);
      },
    },
  };
}

export default defineConfig({
  site: 'https://www.explorebowland.co.uk',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    postRedirects(),
    novaPortalRedirects({ portal: PORTAL }),
    sitemap({
      // The /nova-preview/ placeholder templates are noindexed build artefacts.
      filter: (page) => !page.includes('/nova-preview/'),
      // Attach a real lastmod + hero image to each URL (maps filled during the
      // postRedirects fetch) so the sitemap carries lastmod and <image:image>.
      serialize(item) {
        const lastmod = lastmodByUrl.get(item.url);
        if (lastmod) item.lastmod = lastmod;
        const img = imageByUrl.get(item.url);
        if (img) item.img = [{ url: img }];
        return item;
      },
    }),
  ],
  image: {
    remotePatterns: [{ protocol: 'https' }],
    // In-content (markdown) images render responsively and never generate wider
    // than 800px, so heavy originals (some 2048px / ~1MB) download small on
    // mobile. Display is also capped at 800px in content.css.
    layout: 'constrained',
    breakpoints: [320, 480, 640, 800],
  },
});

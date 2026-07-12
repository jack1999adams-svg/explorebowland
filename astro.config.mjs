import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { writeFileSync } from 'node:fs';
import { postPath, legacyPaths } from './src/lib/post-path.mjs';

const PORTAL = 'https://novaportal-explorebowland.collectiq.workers.dev';
const SITE_URL = 'https://www.explorebowland.co.uk';

// Absolute-URL -> ISO lastmod for posts, filled during the build:start fetch
// below and consumed by the sitemap `serialize` hook so each post carries a
// real last-modified date. Empty (no lastmod emitted) when the fetch is skipped.
const lastmodByUrl = new Map();

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
    sitemap({
      // The /nova-preview/ placeholder templates are noindexed build artefacts.
      filter: (page) => !page.includes('/nova-preview/'),
      // Attach a real lastmod to posts (map filled during postRedirects' fetch).
      serialize(item) {
        const lastmod = lastmodByUrl.get(item.url);
        if (lastmod) item.lastmod = lastmod;
        return item;
      },
    }),
  ],
  image: {
    remotePatterns: [{ protocol: 'https' }],
  },
});

import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { writeFileSync } from 'node:fs';
import { postPath, legacyPaths } from './src/lib/post-path.mjs';

const PORTAL = 'https://novaportal-explorebowland.collectiq.workers.dev';

// Posts now live at <section>/<slug>/. This integration fetches the portal
// posts at build and writes functions/post-redirects.json mapping every old flat
// permalink -> its new nested URL, so the catch-all Pages Function 301s them.
// Regenerated on each build, so section/slug changes keep redirects correct.
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
  integrations: [sitemap(), postRedirects()],
  image: {
    remotePatterns: [{ protocol: 'https' }],
  },
});

/**
 * NovaPortal content loader for Astro's content layer.
 *
 * Usage in content.config.ts:
 *
 *   import { novaPortalLoader } from '@novaportal/astro';
 *   const news = defineCollection({
 *     loader: novaPortalLoader({ portal: 'https://portal.example.com' }),
 *     schema: z.object({ ... })   // unchanged from the glob-loader days
 *   });
 *
 * The read token comes from options.token or the NOVAPORTAL_READ_TOKEN
 * environment variable. Entries keep the same ids (slugs) and data shape the
 * site used with local markdown, and provide rendered HTML + headings so
 * `render(entry)` and its `headings` export keep working.
 */
/**
 * @param {object} options
 * @param {string} options.portal - Instance URL, e.g. https://portal.example.com
 * @param {string} [options.token] - Read token (default: NOVAPORTAL_READ_TOKEN env)
 * @param {(post: object) => object} [options.mapData] - Map an API post onto the
 *   site's own schema shape. Default matches the standard Nova template
 *   (title/description/category/categoryLabel/date/image/imageAlt/author).
 *   The full post (including `extras` carried over from import) is passed in.
 */
export function novaPortalLoader({ portal, token, mapData } = {}) {
  if (!portal) throw new Error('novaPortalLoader: `portal` (instance URL) is required');
  const base = portal.replace(/\/+$/, '');

  return {
    name: 'novaportal-loader',
    load: async ({ store, parseData, generateDigest, logger }) => {
      const readToken = token ?? process.env.NOVAPORTAL_READ_TOKEN;
      if (!readToken) {
        throw new Error(
          'novaPortalLoader: no read token. Set NOVAPORTAL_READ_TOKEN in the build environment.'
        );
      }
      const res = await fetch(`${base}/api/v1/content/posts`, {
        headers: { Authorization: `Bearer ${readToken}` },
      });
      if (!res.ok) {
        throw new Error(`novaPortalLoader: portal responded ${res.status} — ${await res.text()}`);
      }
      const { posts } = await res.json();

      const defaultMap = (p) => ({
        title: p.title,
        description: p.description,
        category: p.category,
        categoryLabel: p.categoryLabel,
        date: p.date,
        image: p.image,
        imageAlt: p.imageAlt,
        author: p.author,
        ...p.extras,
      });
      const map = mapData ?? defaultMap;

      store.clear();
      for (const p of posts) {
        const data = await parseData({ id: p.slug, data: map(p) });
        store.set({
          id: p.slug,
          data,
          body: p.body,
          rendered: { html: p.html, metadata: { headings: p.headings ?? [] } },
          digest: generateDigest(JSON.stringify([p.title, p.body, p.date, p.image])),
        });
      }
      logger.info(`Loaded ${posts.length} published posts from ${base}`);
    },
  };
}

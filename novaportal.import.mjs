/**
 * NovaPortal import map for Explore Bowland.
 *
 * WordPress-imported frontmatter (title/description/path/pubDate/hero/heroAlt/
 * categories[]/wpId/draft) → portal post shape. The primary category becomes
 * the portal category; everything the site's own schema needs at build time
 * (exact permalink path, full category list, original timestamps) rides in
 * extras and is mapped back by novaPortalLoader's mapData in content.config.ts.
 */
const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export function mapPost({ fm, body, slug }) {
  const categories = Array.isArray(fm.categories) ? fm.categories : fm.categories ? [fm.categories] : []
  const primary = categories[0] ?? 'Journal'
  return {
    slug,
    title: fm.title ?? slug,
    description: fm.description ?? '',
    category: slugify(primary),
    categoryLabel: primary,
    date: String(fm.pubDate ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    image: fm.hero ?? '',
    imageAlt: fm.heroAlt ?? '',
    author: 'Explore Bowland',
    body,
    template: 'guide',
    status: fm.draft === true ? 'draft' : 'published',
    extras: {
      path: fm.path,
      categories,
      pubDate: fm.pubDate,
      updatedDate: fm.updatedDate,
      wpId: fm.wpId ? Number(fm.wpId) : undefined,
    },
  }
}

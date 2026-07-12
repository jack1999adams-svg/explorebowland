// Canonical URL for a post: <category parent>/<slug>/, driven by the portal's
// category → parent-page assignment. Falls back to the post's own permalink
// (or /<slug>/) when it has no section parent. Used by both the content loader
// mapping and the build-time redirect generator so the two never drift.
export function postPath(p) {
  const parent = p.categoryParent && p.categoryParent !== '/' ? p.categoryParent.replace(/\/+$/, '') : '';
  const slug = p.slug;
  if (parent) return `${parent}/${slug}/`;
  return (p.extras && p.extras.path) || `/${slug}/`;
}

// The old flat permalink(s) that should 301 to postPath(p): the imported
// WordPress URL and the bare /<slug>/ form.
export function legacyPaths(p) {
  const set = new Set();
  if (p.extras && p.extras.path) set.add(p.extras.path);
  set.add(`/${p.slug}/`);
  return [...set];
}

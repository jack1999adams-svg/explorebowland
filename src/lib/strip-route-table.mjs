// Remove the redundant inline "Route info" table from a walk post's body — its
// data now lives in the RoutePanel (from structured fields). This strips it at
// render time only; the portal's stored content is untouched, so cleaning it at
// source later just makes this a no-op. Only tables identified as the route table
// (by their field labels) are removed; other tables are left alone.

const KNOWN = new Set([
  'postcode', 'starting postcode', 'post code',
  'map reference', 'map ref', 'grid ref', 'grid reference',
  'low point', 'high point', 'distance', 'difficulty',
  'ascent', 'total ascent', 'total height gain', 'total ascent (over entire walk)',
  'steps', 'calories estimate', 'cows', 'bogs',
  'dogs', 'ok for dogs', 'nearby pub', 'nearest pub',
  'nearby hotel', 'stay over', 'accommodation', 'links',
]);

const label = (s = '') => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

export function stripRouteTable(html) {
  if (!html || !/<table/i.test(html)) return html;

  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const tableHtml = m[0];
    const labels = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => {
      const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
      return cells[0] ? label(cells[0][1]) : '';
    });
    if (labels.filter((l) => KNOWN.has(l)).length < 2) continue; // not the route table

    const start = m.index;
    let before = html.slice(0, start);
    before = before.replace(/\s*<hr\s*\/?>\s*$/i, '');
    before = before.replace(/\s*<h[1-6][^>]*>\s*route\s*info(?:rmation)?\s*<\/h[1-6]>\s*$/i, '');
    return (before + html.slice(start + tableHtml.length)).replace(/\n{3,}/g, '\n\n').trim();
  }
  return html;
}

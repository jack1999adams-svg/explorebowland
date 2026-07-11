// Extract the "Route info" table that lives inline in walk-post content, so the
// template can render it as a sidebar panel instead of a table in the body.
//
// Transitional by design: today the data is an HTML table in the post content.
// When NovaPortal starts serving structured route fields, pass those to the
// template instead and this parser becomes the fallback for un-migrated posts.
//
// Returns { route: [{label, key, valueHtml}], strippedHtml } or null if the post
// has no recognisable route table.

// Canonical labels used to identify the route table (needs a few to match).
const KNOWN = new Set([
  'postcode', 'map reference', 'grid reference', 'low point', 'high point',
  'distance', 'difficulty', 'ascent', 'cows', 'dogs', 'parking', 'start',
  'terrain', 'nearby pub', 'nearby hotel', 'links',
]);

const stripTags = (s = '') => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const keyify = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Keep inline markup (links) but drop paragraph wrappers and sheet cruft.
const cleanValue = (s = '') =>
  s
    .replace(/<\/?p[^>]*>/gi, '')
    .replace(/\sdata-sheets-[a-z]+="[^"]*"/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function parseRows(tableHtml) {
  const items = [];
  for (const row of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
    if (cells.length < 2) continue;
    const label = stripTags(cells[0]);
    const valueHtml = cleanValue(cells[1]);
    if (!label) continue;
    items.push({ label, key: keyify(label), valueHtml });
  }
  return items;
}

export function extractRoute(html) {
  if (!html || !/<table/i.test(html)) return null;

  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const tableHtml = m[0];
    const items = parseRows(tableHtml);
    const knownHits = items.filter((i) => KNOWN.has(i.label.toLowerCase())).length;
    if (knownHits < 2) continue; // not the route table

    // Keep only rows that actually have a value.
    const route = items.filter((i) => stripTags(i.valueHtml));
    if (!route.length) return null;

    // Strip the table plus an immediately-preceding <hr> and "Route info" heading.
    const start = m.index;
    let before = html.slice(0, start);
    before = before.replace(/\s*<hr\s*\/?>\s*$/i, '');
    before = before.replace(/\s*<h[1-6][^>]*>\s*route\s*info(?:rmation)?\s*<\/h[1-6]>\s*$/i, '');
    const strippedHtml = (before + html.slice(start + tableHtml.length))
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { route, strippedHtml };
  }
  return null;
}

// One-time migration: parse the inline "Route info" table out of each walk post
// and emit structured route field values keyed by ROUTE_SCHEMA keys.
//
//   NOVAPORTAL_READ_TOKEN=... node scripts/migrate-route-fields.mjs
//
// Writes data/route-fields.json = { <slug>: { <key>: <value>, ... } }. The site
// merges this into each post's route data (portal values override it), so the
// panels render for verification; the content tables are left untouched until
// you remove them. Re-runnable and read-only against the portal.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTAL = 'https://novaportal-explorebowland.collectiq.workers.dev';

// label (lowercased) -> canonical ROUTE_SCHEMA key
const ALIAS = {
  postcode: 'postcode', 'starting postcode': 'postcode', 'post code': 'postcode',
  'map reference': 'map_reference', 'map ref': 'map_reference', 'grid ref': 'map_reference', 'grid reference': 'map_reference',
  'low point': 'low_point', 'high point': 'high_point',
  distance: 'distance',
  'total ascent': 'ascent', 'total height gain': 'ascent', 'total ascent (over entire walk)': 'ascent', ascent: 'ascent',
  difficulty: 'difficulty',
  steps: 'steps', 'calories estimate': 'calories', calories: 'calories',
  cows: 'cows', bogs: 'bogs',
  dogs: 'dogs', 'ok for dogs': 'dogs',
  'nearby pub': 'nearby_pub', 'nearest pub': 'nearby_pub',
  'nearby hotel': 'nearby_hotel', 'stay over': 'nearby_hotel', accommodation: 'nearby_hotel',
  links: 'links',
};
// Labels that identify a table as the route table (canonical or aliased).
const IDENTIFYING = new Set(['postcode', 'map_reference', 'low_point', 'high_point', 'distance', 'difficulty']);

const strip = (s = '') =>
  s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#8217;|&#x2019;/g, '’').replace(/\s+/g, ' ').trim();

function cleanValue(html, key) {
  if (key === 'links') {
    const href = html.match(/href="([^"]+)"/i);
    if (href) return href[1];
  }
  return strip(html);
}

function parseTable(tableHtml) {
  const out = {};
  const unmapped = [];
  for (const r of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    if (cells.length < 2) continue;
    const label = strip(cells[0][1]).toLowerCase();
    if (!label) continue;
    const key = ALIAS[label];
    if (!key) { unmapped.push(label); continue; }
    const value = cleanValue(cells[1][1], key);
    if (value && out[key] == null) out[key] = value;
  }
  return { out, unmapped };
}

function extractRoute(html) {
  for (const m of (html || '').matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const { out, unmapped } = parseTable(m[0]);
    const idHits = Object.keys(out).filter((k) => IDENTIFYING.has(k)).length;
    if (idHits >= 2) return { fields: out, unmapped };
  }
  return null;
}

// ---------------------------------------------------------------------------

const token = process.env.NOVAPORTAL_READ_TOKEN;
if (!token) { console.error('Set NOVAPORTAL_READ_TOKEN'); process.exit(1); }

const res = await fetch(`${PORTAL}/api/v1/content/posts`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) { console.error('Portal responded', res.status); process.exit(1); }
const { posts } = await res.json();

const data = {};
const unmappedAll = {};
let count = 0;
for (const p of posts) {
  const r = extractRoute(p.html);
  if (!r) continue;
  data[p.slug] = r.fields;
  count++;
  for (const u of r.unmapped) unmappedAll[u] = (unmappedAll[u] || 0) + 1;
}

// stable key order
const sorted = {};
for (const slug of Object.keys(data).sort()) sorted[slug] = data[slug];

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/route-fields.json'), JSON.stringify(sorted, null, 2) + '\n');

console.log(`Migrated ${count} posts -> data/route-fields.json`);
const fieldFreq = {};
for (const f of Object.values(data)) for (const k of Object.keys(f)) fieldFreq[k] = (fieldFreq[k] || 0) + 1;
console.log('field coverage:', fieldFreq);
if (Object.keys(unmappedAll).length) console.log('UNMAPPED labels (dropped):', unmappedAll);

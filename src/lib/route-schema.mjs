// Canonical route-info fields for walk posts. The portal fills these as custom
// fields (its ROUTE_SCHEMA in .novaportal/instance.jsonc mirrors this list, keyed
// by the same `key`s); the site renders them in the RoutePanel. Keep the two in
// sync. Blank fields are omitted from the panel.
//
// `coords: true` renders the value as a "view on map" link.
export const ROUTE_SCHEMA = [
  { key: 'postcode', label: 'Postcode' },
  { key: 'map_reference', label: 'Map reference', coords: true },
  { key: 'low_point', label: 'Low point' },
  { key: 'high_point', label: 'High point' },
  { key: 'distance', label: 'Distance' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'cows', label: 'Cows' },
  { key: 'dogs', label: 'Dogs' },
  { key: 'nearby_pub', label: 'Nearby pub' },
  { key: 'nearby_hotel', label: 'Nearby hotel' },
  { key: 'links', label: 'Links' },
];

/**
 * Build the ordered, non-empty route rows from a values object supplied by the
 * portal (keyed by the schema `key`s). Blank values are left out.
 */
export function buildRoute(values = {}) {
  const v = values || {};
  return ROUTE_SCHEMA
    .map((f) => ({ ...f, value: v[f.key] == null ? '' : String(v[f.key]).trim() }))
    .filter((f) => f.value !== '');
}

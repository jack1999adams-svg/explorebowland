// Structured-data (JSON-LD schema.org) builders. Pure functions returning plain
// objects; rendered by src/components/Schema.astro. Organization + WebSite are
// emitted site-wide from BaseLayout; pages add BreadcrumbList / BlogPosting /
// Recipe / TouristAttraction as appropriate.

export const SITE = {
  name: 'Explore Bowland',
  url: 'https://www.explorebowland.co.uk',
  description:
    "A walking and visitor guide to the Forest of Bowland — Lancashire's Area of Outstanding Natural Beauty.",
  logo: 'https://www.explorebowland.co.uk/logo.png',
};

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;

/** Absolute URL for a site-relative path. */
export function abs(path) {
  return new URL(path, SITE.url + '/').href;
}

/** Turn a slug segment into a readable label ("towns-and-villages" → "Towns and villages"). */
export function humanize(slug) {
  const s = String(slug).replace(/-/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function organization() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.name,
    url: `${SITE.url}/`,
    logo: SITE.logo,
    description: SITE.description,
  };
}

export function website() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: SITE.name,
    url: `${SITE.url}/`,
    description: SITE.description,
    publisher: { '@id': ORG_ID },
    inLanguage: 'en-GB',
  };
}

/**
 * BreadcrumbList from an ordered list of { name, url } crumbs (absolute URLs).
 * The last crumb is the current page.
 */
export function breadcrumbs(crumbs) {
  const list = (crumbs || []).filter((c) => c && c.name);
  if (list.length < 2) return null; // a single "Home" crumb isn't a trail
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

export function article({ title, description, canonical, image, published, modified }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    ...(description ? { description } : {}),
    mainEntityOfPage: canonical,
    url: canonical,
    ...(image ? { image } : {}),
    ...(published ? { datePublished: published } : {}),
    dateModified: modified || published || undefined,
    inLanguage: 'en-GB',
    isPartOf: { '@id': SITE_ID },
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
  };
}

export function recipe({ title, description, canonical, image, published }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: title,
    ...(description ? { description } : {}),
    url: canonical,
    ...(image ? { image } : {}),
    ...(published ? { datePublished: published } : {}),
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
  };
}

/** Parse a decimal "lat,lng" (or a maps URL containing @lat,lng) into coords. */
function parseLatLng(value) {
  if (!value) return null;
  const m = String(value).match(/(-?\d{1,2}\.\d+)[,\s@]+(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * TouristAttraction for a walk, enriched from its route custom fields
 * (postcode → PostalAddress; a decimal map reference → GeoCoordinates).
 */
export function walkPlace({ title, description, canonical, image, route }) {
  const byKey = Object.fromEntries((route || []).map((r) => [r.key, r.value]));
  const node = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: title,
    ...(description ? { description } : {}),
    url: canonical,
    ...(image ? { image } : {}),
    isAccessibleForFree: true,
  };
  if (byKey.postcode) {
    node.address = {
      '@type': 'PostalAddress',
      postalCode: byKey.postcode.replace(/\s+/g, ' ').trim(),
      addressCountry: 'GB',
    };
  }
  const geo = parseLatLng(byKey.map_reference);
  if (geo) node.geo = { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng };
  return node;
}

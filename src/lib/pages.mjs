/**
 * Loads portal-managed pages at build time from the NovaPortal content API
 * (GET /api/v1/content/pages, bearer read token). Returns [] on any failure so
 * the site always builds. These pages are ADDITIVE to the site's own routes and
 * file-based `pages` collection — rendered through the [...slug] catch-all.
 */
const PORTAL = 'https://novaportal-explorebowland.collectiq.workers.dev';

export async function loadPages() {
  const token = process.env.NOVAPORTAL_READ_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(`${PORTAL}/api/v1/content/pages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return (await res.json()).pages ?? [];
  } catch {
    return [];
  }
}

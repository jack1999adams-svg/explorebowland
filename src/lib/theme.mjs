// Build-time fetch of the portal-managed site chrome: theme (CSS custom-
// property overrides) and custom head code (named snippets with per-page
// scoping). Fails soft by design: a portal problem must never break a site
// build, so any error — missing token, network, bad response — yields empty
// output and the site renders with its defaults, byte-identical to before.

const PORTAL = 'https://novaportal-explorebowland.collectiq.workers.dev';

async function loadTheme() {
  const token = process.env.NOVAPORTAL_READ_TOKEN;
  if (!token) return {};
  try {
    const res = await fetch(`${PORTAL}/api/v1/content/theme`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

const theme = await loadTheme();
export const themeCss = theme.css || '';

const snippets = theme.headSnippets || [];
const withSlashes = (p) => `/${String(p || '').replace(/^\/+|\/+$/g, '')}/`.replace(/\/{2,}/g, '/');

/**
 * Head code for a given page, honouring each snippet's scope: 'site'
 * (everywhere), 'section' (a page and everything under it), or 'page'
 * (that page only). Called from the base layout with Astro.url.pathname.
 */
export function headHtmlFor(pathname) {
  const page = withSlashes(pathname);
  return snippets
    .filter((s) => {
      if (s.scope === 'page') return page === withSlashes(s.path);
      if (s.scope === 'section') return page.startsWith(withSlashes(s.path));
      return true;
    })
    .map((s) => s.html)
    .join('\n');
}

// Build-time fetch of the portal-edited theme (CSS custom-property overrides).
// Fails soft by design: a theme problem must never break a site build, so any
// error — missing token, network, bad response — yields an empty string and the
// site renders with its stylesheet defaults, byte-identical to before.

const PORTAL = 'https://novaportal-explorebowland.collectiq.workers.dev';

async function loadThemeCss() {
  const token = process.env.NOVAPORTAL_READ_TOKEN;
  if (!token) return '';
  try {
    const res = await fetch(`${PORTAL}/api/v1/content/theme`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return '';
    return (await res.json()).css || '';
  } catch {
    return '';
  }
}

export const themeCss = await loadThemeCss();

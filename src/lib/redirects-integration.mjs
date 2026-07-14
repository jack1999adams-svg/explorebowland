/**
 * Astro integration for the NovaPortal Redirects app: after the build, fetch
 * the portal-managed rules and append them to dist/_redirects (Cloudflare
 * Pages format). Fails soft — no rules, no token, or a portal problem leaves
 * the build exactly as it was.
 */
import { readFile, writeFile } from 'node:fs/promises';

export function novaPortalRedirects({ portal }) {
  return {
    name: 'novaportal-redirects',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const token = process.env.NOVAPORTAL_READ_TOKEN;
        if (!token) return;
        try {
          const res = await fetch(`${portal.replace(/\/+$/, '')}/api/v1/apps/redirects/rules.txt`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const rules = (await res.text()).trim();
          if (!rules) return;
          const out = new URL('_redirects', dir);
          let existing = '';
          try {
            existing = await readFile(out, 'utf8');
          } catch {}
          await writeFile(
            out,
            (existing ? existing.trimEnd() + '\n' : '') + '# managed by NovaPortal — edit in the portal\n' + rules + '\n'
          );
          logger.info(`wrote ${rules.split('\n').length} portal-managed redirect rule(s)`);
        } catch {
          /* never break the build over redirects */
        }
      },
    },
  };
}

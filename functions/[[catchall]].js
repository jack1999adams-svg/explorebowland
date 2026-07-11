// Cloudflare Pages catch-all Function.
//
// Pages serves static assets first; this runs ONLY for paths with no matching
// file (i.e. legacy WordPress attachment URLs and genuine 404s). It 301-redirects
// old attachment image-pages to their parent post, then falls through to the
// static 404 for anything else. Zero overhead on real pages.
import redirects from './redirects.json';

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  let pathname = url.pathname;
  if (!pathname.endsWith('/')) pathname += '/';

  const target = redirects[pathname];
  if (target) {
    return new Response(null, {
      status: 301,
      headers: { Location: new URL(target, url.origin).toString() },
    });
  }
  return next();
}

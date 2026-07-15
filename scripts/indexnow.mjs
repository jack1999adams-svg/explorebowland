// IndexNow submitter — instantly notifies Bing, Yandex & other IndexNow engines
// that URLs have changed. Run after a meaningful content/structure change:
//
//   node scripts/indexnow.mjs                       # submit all live sitemap URLs
//   node scripts/indexnow.mjs https://…/a/ https://…/b/   # submit only the URLs you pass
//
// The key is public (it's served at /<key>.txt) — not a secret.

const HOST = 'www.explorebowland.co.uk';
const KEY = '2bd1317f54aedee9e29549288be0f0bd';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const SITEMAP = `https://${HOST}/sitemap-0.xml`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

async function sitemapUrls() {
  const res = await fetch(SITEMAP);
  if (!res.ok) throw new Error(`sitemap fetch ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function submit(urlList) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });
  return res.status;
}

const args = process.argv.slice(2);
const urls = args.length ? args : [...new Set(await sitemapUrls())];

// IndexNow accepts up to 10,000 URLs per request; batch to be safe.
const BATCH = 5000;
console.log(`Submitting ${urls.length} URLs to IndexNow (${HOST})…`);
for (let i = 0; i < urls.length; i += BATCH) {
  const chunk = urls.slice(i, i + BATCH);
  const status = await submit(chunk);
  // 200 = accepted; 202 = accepted, key validation pending; 4xx = problem.
  console.log(`  batch ${i / BATCH + 1}: ${chunk.length} URLs -> HTTP ${status}`);
}
console.log('Done.');

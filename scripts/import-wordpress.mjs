// Import a WordPress WXR export into Astro content collections.
//
//   node scripts/import-wordpress.mjs <export.xml>
//
// - Posts  -> src/content/posts/*.md   (root-level permalinks, e.g. /caton-moor/)
// - Pages  -> src/content/pages/*.md    (nested permalinks preserved verbatim)
// - Every post/page keeps its EXACT original URL in frontmatter `path`.
// - Attachment (image) pages are turned into 301 redirects to their parent so
//   no legacy URL 404s, without building thousands of junk pages.
// - Image URLs are rewritten to $IMAGE_CDN_BASE when set (point at R2 later);
//   otherwise the original wp-content URLs are kept so the site renders today.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { makeConverter, decode } from './lib/avia.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://www.explorebowland.co.uk';
const IMAGE_CDN_BASE = process.env.IMAGE_CDN_BASE || ''; // e.g. https://images.explorebowland.co.uk

const xmlPath =
  process.argv[2] ||
  '/root/.claude/uploads/4a54b429-8c1a-5d89-97e4-dce5762448a1/744dfc3e-explorebowland.WordPress.20260711.xml';

const val = (v) => (v && typeof v === 'object' ? v.__cdata ?? v['#text'] ?? '' : v ?? '');
const toArr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^\w\s/-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

function pathFromLink(link) {
  try {
    let p = new URL(link).pathname;
    if (!p.startsWith('/')) p = '/' + p;
    if (!p.endsWith('/')) p += '/';
    return p;
  } catch {
    return null;
  }
}

const cdnify = (url) => {
  if (!IMAGE_CDN_BASE || !url) return url;
  return url
    .replace(/^https?:\/\/(www\.)?explorebowland\.co\.uk\/wp-content\/uploads\//, IMAGE_CDN_BASE.replace(/\/$/, '') + '/')
    ;
};

function metaValue(item, key) {
  for (const m of toArr(item['wp:postmeta'])) {
    if (val(m['wp:meta_key']) === key) return val(m['wp:meta_value']);
  }
  return '';
}

// ---------------------------------------------------------------------------

const xml = fs.readFileSync(xmlPath, 'utf8');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', cdataPropName: '__cdata', trimValues: false });
const items = toArr(parser.parse(xml).rss.channel.item);

// Attachment map: id -> { url, alt }
const attachments = new Map(); // id -> {url, alt, parent}
const idToLink = new Map(); // post/page id -> permalink path
for (const it of items) {
  const type = val(it['wp:post_type']);
  const id = String(val(it['wp:post_id']));
  if (type === 'attachment') {
    attachments.set(id, {
      url: val(it['wp:attachment_url']),
      alt: metaValue(it, '_wp_attachment_image_alt') || val(it.title) || '',
      parent: String(val(it['wp:post_parent']) || '0'),
    });
  }
}

const resolveImage = (ref) => {
  if (!ref) return { url: '', alt: '' };
  const asId = String(ref);
  if (attachments.has(asId)) {
    const a = attachments.get(asId);
    return { url: cdnify(a.url), alt: a.alt };
  }
  // ref is a URL (possibly a resized variant) — de-resize to the original
  const full = String(ref).replace(/-\d+x\d+(\.\w+)$/i, '$1');
  return { url: cdnify(full), alt: '' };
};

const convert = makeConverter(resolveImage);

// ---------------------------------------------------------------------------
// Write content files

const dirs = {
  post: path.join(ROOT, 'src/content/posts'),
  page: path.join(ROOT, 'src/content/pages'),
};
fs.rmSync(dirs.post, { recursive: true, force: true });
fs.rmSync(dirs.page, { recursive: true, force: true });
fs.mkdirSync(dirs.post, { recursive: true });
fs.mkdirSync(dirs.page, { recursive: true });

const yamlStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function excerptFrom(md) {
  const text = md
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 155).replace(/\s+\S*$/, '').trim();
}

// Pass 1: build a record per published post/page.
const records = [];
for (const it of items) {
  const type = val(it['wp:post_type']);
  if (type !== 'post' && type !== 'page') continue;
  if (val(it['wp:status']) !== 'publish') continue;

  const id = Number(val(it['wp:post_id']));
  const urlPath = pathFromLink(val(it.link));
  idToLink.set(String(id), urlPath);
  if (!urlPath) continue;
  if (urlPath === '/') continue; // front page owned by custom index.astro

  const title = decode(val(it.title) || 'Untitled').trim();
  const categories = toArr(it.category)
    .filter((c) => c['@_domain'] === 'category' && val(c) !== 'Uncategorized')
    .map((c) => decode(val(c)));

  // hero image
  const thumbId = metaValue(it, '_thumbnail_id');
  let hero = thumbId ? resolveImage(thumbId).url : '';
  let heroAlt = thumbId ? resolveImage(thumbId).alt : '';
  const rawContent = val(it['content:encoded']);
  if (!hero) {
    const slideId = /\[av_slide_full[^\]]*\bid='(\d+)'/.exec(rawContent)?.[1];
    if (slideId) ({ url: hero, alt: heroAlt } = resolveImage(slideId));
  }

  let body = convert(rawContent);
  // Drop a leading H1 that just repeats the title (the layout renders the title),
  // plus any leading horizontal rule left behind.
  const titleH1 = new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\n+`, 'i');
  body = body.replace(titleH1, '').replace(/^(?:---\s*\n+)+/, '').trim();
  if (IMAGE_CDN_BASE) {
    body = body.replace(/https?:\/\/(www\.)?explorebowland\.co\.uk\/wp-content\/uploads\//g, IMAGE_CDN_BASE.replace(/\/$/, '') + '/');
  }

  const rawExcerpt = decode(val(it['excerpt:encoded']) || '').replace(/<[^>]+>/g, '').trim();
  const description = rawExcerpt || excerptFrom(body);
  const pubDate = val(it['wp:post_date_gmt']) || val(it.pubDate) || '';

  records.push({
    id, type, urlPath, title, categories, hero, heroAlt, body, description, pubDate,
    dateMs: pubDate && pubDate !== '0000-00-00 00:00:00' ? Date.parse(pubDate.replace(' ', 'T') + 'Z') || 0 : 0,
  });
}

// Resolve duplicate permalinks (WordPress data can contain two published posts
// with the same slug — only one can be canonical). The NEWER post keeps the
// original URL (matching what the live site serves); older ones are preserved
// at a suffixed URL so no content is lost.
const byPath = new Map();
for (const r of records) (byPath.get(r.urlPath) ?? byPath.set(r.urlPath, []).get(r.urlPath)).push(r);
const collisions = [];
for (const [p, group] of byPath) {
  if (group.length < 2) continue;
  group.sort((a, b) => b.dateMs - a.dateMs); // newest first keeps canonical path
  group.forEach((r, i) => {
    if (i === 0) return;
    const stem = p.replace(/\/$/, '');
    r.urlPath = `${stem}-${i + 1}/`;
    collisions.push({ title: r.title, wpId: r.id, keptCanonical: group[0].title, newPath: r.urlPath });
  });
}

// Pass 2: write files with guaranteed-unique names.
const urlMap = [];
const usedFiles = new Set();
let counts = { post: 0, page: 0 };
for (const r of records) {
  const fm = [
    '---',
    `title: ${yamlStr(r.title)}`,
    `description: ${yamlStr(r.description)}`,
    `path: ${yamlStr(r.urlPath)}`,
    r.dateMs ? `pubDate: ${yamlStr(r.pubDate.replace(' ', 'T') + 'Z')}` : '',
    r.hero ? `hero: ${yamlStr(r.hero)}` : '',
    r.hero ? `heroAlt: ${yamlStr(r.heroAlt)}` : '',
    r.type === 'post' && r.categories.length ? `categories:\n${r.categories.map((c) => `  - ${yamlStr(c)}`).join('\n')}` : '',
    `wpId: ${r.id}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
  const frontmatter = `${fm}\n---\n\n`;

  let fileSlug = slugify(r.urlPath.replace(/^\/|\/$/g, '').replace(/\//g, '--')) || `id-${r.id}`;
  while (usedFiles.has(fileSlug)) fileSlug = `${fileSlug}-${r.id}`;
  usedFiles.add(fileSlug);

  const dir = r.type === 'post' ? dirs.post : dirs.page;
  fs.writeFileSync(path.join(dir, `${fileSlug}.md`), frontmatter + r.body + '\n');
  urlMap.push({ type: r.type, path: r.urlPath, title: r.title, file: `${fileSlug}.md` });
  counts[r.type]++;
}

if (collisions.length) {
  console.log(`\nResolved ${collisions.length} duplicate permalink(s):`);
  for (const c of collisions) console.log(`  "${c.title}" (id ${c.wpId}) -> ${c.newPath}  [canonical URL kept by "${c.keptCanonical}"]`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Redirects: attachment pages -> parent permalink (301)
//
// There are ~2,300 of these, which exceeds Cloudflare Pages' _redirects line
// limit (~2,100). Instead we emit a JSON map consumed by the catch-all Pages
// Function (functions/[[catchall]].js), which only runs when no static asset
// matches — so real pages pay zero overhead and every legacy URL is covered.

const redirects = {};
for (const it of items) {
  if (val(it['wp:post_type']) !== 'attachment') continue;
  const parent = String(val(it['wp:post_parent']) || '0');
  if (parent === '0') continue;
  const from = pathFromLink(val(it.link));
  const to = idToLink.get(parent);
  if (from && to && from !== to) redirects[from] = to;
}
// Also 301 the losing side of any resolved duplicate-permalink collision's old
// path is unnecessary (that URL never resolved on the live site), so skip.

fs.mkdirSync(path.join(ROOT, 'functions'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'functions/redirects.json'), JSON.stringify(redirects));
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/url-map.json'), JSON.stringify(urlMap, null, 2));

console.log(`Imported ${counts.post} posts, ${counts.page} pages.`);
console.log(`Generated ${Object.keys(redirects).length} attachment redirects -> functions/redirects.json`);
console.log(`Image CDN base: ${IMAGE_CDN_BASE || '(none — keeping original wp-content URLs)'}`);

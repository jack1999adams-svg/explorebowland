// Migrate the images the LIVE SITE actually references (not the full 40GB
// archive) from the WordPress server onto Cloudflare R2, at the SAME
// wp-content/uploads/... path so repointing content is a pure domain swap.
//
//   node scripts/migrate-referenced-images.mjs            # dry run: download+optimize, measure, no upload
//   node scripts/migrate-referenced-images.mjs --upload   # + push to R2 (needs R2_* env, see .env.example)
//
// Streaming + resumable: each image is downloaded, optimized in memory, uploaded,
// and discarded — so disk stays tiny and re-runs skip objects already on R2.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DO_UPLOAD = process.argv.includes('--upload');
const MAX_DIM = Number(process.env.MAX_DIM || 2048); // cap longest side
const QUALITY = Number(process.env.IMG_QUALITY || 80);
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const WP_ORIGIN = 'https://www.explorebowland.co.uk';

const CONTENT_TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

// 1. Collect every referenced wp-content image URL from the imported content.
function collectUrls() {
  const urls = new Set();
  const re = /https:\/\/www\.explorebowland\.co\.uk\/wp-content\/uploads\/[^\s"')]+?\.(?:jpe?g|png|gif|webp)/gi;
  for (const dir of ['src/content/posts', 'src/content/pages']) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      const txt = fs.readFileSync(path.join(abs, f), 'utf8');
      for (const m of txt.matchAll(re)) urls.add(m[0]);
    }
  }
  return [...urls];
}

async function download(url) {
  // Use curl so the environment's proxy + TLS are honoured.
  const { stdout } = await execFileP(
    'curl',
    ['-sSL', '--fail', '-A', 'Mozilla/5.0', '--max-time', '60', '--output', '-', url],
    { encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 },
  );
  return stdout;
}

async function optimize(buf, ext) {
  const img = sharp(buf, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  let pipe = img.resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true });
  if (ext === 'png') {
    pipe = meta.hasAlpha ? pipe.png({ compressionLevel: 9, palette: true }) : pipe.jpeg({ quality: QUALITY, mozjpeg: true });
  } else if (ext === 'webp') {
    pipe = pipe.webp({ quality: QUALITY });
  } else if (ext === 'gif') {
    return buf; // leave gifs (often animated) untouched
  } else {
    pipe = pipe.jpeg({ quality: QUALITY, mozjpeg: true });
  }
  return pipe.toBuffer();
}

async function pMap(items, fn, limit) {
  let i = 0;
  const out = [];
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx).catch((e) => ({ error: e.message }));
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------

let urls = collectUrls();
console.log(`Referenced images: ${urls.length}`);
if (process.env.LIMIT) { urls = urls.slice(0, Number(process.env.LIMIT)); console.log(`LIMIT -> processing ${urls.length}`); }
console.log(DO_UPLOAD ? 'Mode: UPLOAD to R2' : 'Mode: DRY RUN (add --upload to push)');

let r2 = null;
if (DO_UPLOAD) r2 = await import('./lib/r2.mjs');

let origBytes = 0, optBytes = 0, done = 0, skipped = 0, failed = 0;
const manifest = {};

await pMap(
  urls,
  async (url) => {
    const key = new URL(url).pathname.replace(/^\//, ''); // wp-content/uploads/...
    const ext = key.split('.').pop().toLowerCase();
    try {
      if (DO_UPLOAD && (await r2.objectExists(key))) { skipped++; return; }
      const raw = await download(url);
      const opt = await optimize(raw, ext);
      origBytes += raw.length;
      optBytes += opt.length;
      if (DO_UPLOAD) await r2.putObject(key, opt, CONTENT_TYPE[ext] || 'application/octet-stream');
      manifest[url] = '/' + key;
    } catch (e) {
      failed++;
      if (failed <= 15) console.warn(`! ${url.split('/uploads/')[1]}: ${e.message}`);
      return;
    }
    if (++done % 100 === 0) console.log(`  ${done}/${urls.length} (opt ${(optBytes / 1e6).toFixed(0)}MB)`);
  },
  CONCURRENCY,
);

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/referenced-image-map.json'), JSON.stringify(manifest, null, 2));

console.log(`\nProcessed ${done}, skipped ${skipped}, failed ${failed}.`);
console.log(`Original ≈ ${(origBytes / 1e6).toFixed(0)}MB → optimized ≈ ${(optBytes / 1e6).toFixed(0)}MB (${origBytes ? (100 - (optBytes / origBytes) * 100).toFixed(0) : 0}% smaller).`);
console.log(`Map -> data/referenced-image-map.json`);
if (!DO_UPLOAD) console.log('Dry run only. Re-run with --upload once R2_* env is set.');

// One-time legacy image migration: local wp-content/uploads -> optimized -> R2.
//
//   1. SFTP/rsync the live wp-content/uploads folder to a local dir.
//   2. Set env (see .env.example) and run:
//        UPLOADS_DIR=./uploads-raw node scripts/migrate-images.mjs           # dry run
//        UPLOADS_DIR=./uploads-raw node scripts/migrate-images.mjs --upload  # push to R2
//
// It filters out WordPress-generated derivatives (-150x150, -scaled, etc.),
// optionally keeps ONLY images referenced by the imported content, then runs
// each surviving original through the SHARED optimizer and uploads AVIF/WebP
// derivatives to R2. Resumable: existing objects are skipped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizeImage, contentHash, objectKey, imageDescriptor } from './lib/optimize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const UPLOADS_DIR = process.env.UPLOADS_DIR;
const DO_UPLOAD = process.argv.includes('--upload');
const REFERENCED_ONLY = process.env.REFERENCED_ONLY !== '0'; // default: only used images
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?)$/i;
// WordPress auto-generated sizes we must skip (the optimizer regenerates them).
const WP_DERIVATIVE = /-\d+x\d+\.(jpe?g|png|webp|tiff?)$/i;
const WP_SCALED = /-scaled\.(jpe?g|png)$/i;

if (!UPLOADS_DIR) {
  console.error(`\nUPLOADS_DIR is not set.\n
Pull the live uploads folder first, e.g.:
  rsync -avz user@host:/var/www/.../wp-content/uploads/ ./uploads-raw/
then run:
  UPLOADS_DIR=./uploads-raw node scripts/migrate-images.mjs          # dry run
  UPLOADS_DIR=./uploads-raw node scripts/migrate-images.mjs --upload # to R2\n`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (IMAGE_EXT.test(e.name)) out.push(full);
  }
  return out;
}

// Collect image basenames actually referenced by the imported content so we
// don't pay to process years of orphaned uploads.
function referencedBasenames() {
  const set = new Set();
  const dirs = ['src/content/posts', 'src/content/pages'];
  const urlRe = /wp-content\/uploads\/[^\s"')]+?\.(?:jpe?g|png|webp|tiff?)/gi;
  for (const d of dirs) {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      const txt = fs.readFileSync(path.join(abs, f), 'utf8');
      for (const m of txt.matchAll(urlRe)) {
        const base = path.basename(m[0]).replace(WP_DERIVATIVE, '.$1').replace(WP_SCALED, '.$1');
        set.add(base.toLowerCase());
      }
    }
  }
  return set;
}

async function pMap(items, fn, limit) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------

const all = walk(UPLOADS_DIR);
let originals = all.filter((f) => !WP_DERIVATIVE.test(f) && !WP_SCALED.test(f));

const referenced = REFERENCED_ONLY ? referencedBasenames() : null;
if (referenced) {
  originals = originals.filter((f) => referenced.has(path.basename(f).toLowerCase()));
}

const rawBytes = all.reduce((n, f) => n + fs.statSync(f).size, 0);
console.log(`Scanned ${all.length} files (${(rawBytes / 1e9).toFixed(1)} GB).`);
console.log(`Originals after stripping WP derivatives: ${all.filter((f) => !WP_DERIVATIVE.test(f) && !WP_SCALED.test(f)).length}`);
if (referenced) console.log(`Referenced by content: keeping ${originals.length}.`);
console.log(DO_UPLOAD ? 'Mode: UPLOAD to R2' : 'Mode: DRY RUN (pass --upload to push)');

let r2mod = null;
if (DO_UPLOAD) r2mod = await import('./lib/r2.mjs');
const publicBase = r2mod?.R2_PUBLIC_BASE_URL || (process.env.R2_PUBLIC_BASE ?? 'https://images.explorebowland.co.uk');

const manifest = {};
let done = 0, outBytes = 0;

await pMap(
  originals,
  async (file) => {
    const buf = fs.readFileSync(file);
    const hash = contentHash(buf);
    const slug = path.basename(file).replace(IMAGE_EXT, '');
    try {
      const { outputs } = await optimizeImage(buf);
      for (const o of outputs) {
        const key = objectKey(slug, hash, o.width, o.ext);
        outBytes += o.buffer.length;
        if (DO_UPLOAD) {
          if (!(await r2mod.objectExists(key))) await r2mod.putObject(key, o.buffer, o.contentType);
        }
      }
      manifest[path.basename(file)] = imageDescriptor(publicBase, slug, hash, outputs);
    } catch (err) {
      console.warn(`! skipped ${file}: ${err.message}`);
    }
    if (++done % 50 === 0) console.log(`  ${done}/${originals.length}`);
  },
  CONCURRENCY,
);

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/image-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nProcessed ${done} images.`);
console.log(`Optimized output ≈ ${(outBytes / 1e9).toFixed(2)} GB (was ${(rawBytes / 1e9).toFixed(1)} GB raw).`);
console.log(`Manifest -> data/image-manifest.json`);
if (!DO_UPLOAD) console.log('Dry run only — re-run with --upload to push to R2.');

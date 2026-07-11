// Shared image optimizer — used by BOTH the one-time legacy migration
// (scripts/migrate-images.mjs) and the live portal upload endpoint
// (server/upload-endpoint.mjs) so every image, old or new, is processed
// identically.
//
// For each source image it produces AVIF + WebP at a set of responsive widths,
// plus a capped "master" so sizes/formats can be regenerated later without the
// original 40GB. EXIF orientation is honoured, then all metadata is stripped.

import sharp from 'sharp';
import { createHash } from 'node:crypto';

export const WIDTHS = [480, 960, 1600];
export const MASTER_WIDTH = 2560;
export const QUALITY = { avif: 55, webp: 78 };

const FORMATS = [
  { ext: 'avif', contentType: 'image/avif' },
  { ext: 'webp', contentType: 'image/webp' },
];

/** Short, stable content hash for deterministic, immutable keys. */
export function contentHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 12);
}

/**
 * Optimize one image.
 * @param {Buffer} input raw image bytes
 * @param {object} [opts]
 * @returns {Promise<{ meta: object, outputs: Array<{width:number, ext:string, contentType:string, buffer:Buffer, isMaster:boolean}> }>}
 */
export async function optimizeImage(input, opts = {}) {
  const widths = opts.widths ?? WIDTHS;
  const masterWidth = opts.masterWidth ?? MASTER_WIDTH;
  const quality = { ...QUALITY, ...(opts.quality ?? {}) };

  const pipeline = sharp(input, { failOn: 'none' }).rotate(); // honour EXIF, then strip
  const meta = await pipeline.metadata();
  const srcWidth = meta.width ?? masterWidth;

  // Never upscale; always include a master (capped at the source width).
  const targets = new Set(widths.filter((w) => w < srcWidth));
  targets.add(Math.min(masterWidth, srcWidth));

  const outputs = [];
  for (const width of [...targets].sort((a, b) => a - b)) {
    const resized = sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true });
    for (const fmt of FORMATS) {
      const buffer = await resized
        .clone()
        [fmt.ext]({ quality: quality[fmt.ext] })
        .toBuffer();
      outputs.push({
        width,
        ext: fmt.ext,
        contentType: fmt.contentType,
        buffer,
        isMaster: width === Math.min(masterWidth, srcWidth),
      });
    }
  }
  return { meta: { width: meta.width, height: meta.height, format: meta.format }, outputs };
}

/**
 * Build the R2 object key for a derivative.
 * e.g. images/caton-moor/a1b2c3d4e5f6-960.webp
 */
export function objectKey(slug, hash, width, ext) {
  const clean = String(slug || 'misc').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return `images/${clean}/${hash}-${width}.${ext}`;
}

/** Build the <img>/<picture> descriptor the frontend needs. */
export function imageDescriptor(publicBase, slug, hash, outputs) {
  const base = publicBase.replace(/\/$/, '');
  const byFormat = {};
  for (const o of outputs) {
    (byFormat[o.ext] ??= []).push({ width: o.width, url: `${base}/${objectKey(slug, hash, o.width, o.ext)}` });
  }
  const srcset = (ext) =>
    (byFormat[ext] ?? []).map((x) => `${x.url} ${x.width}w`).join(', ');
  const widest = Math.max(...outputs.map((o) => o.width));
  return {
    // biggest webp as the plain-src fallback
    src: `${base}/${objectKey(slug, hash, widest, 'webp')}`,
    sources: [
      { type: 'image/avif', srcset: srcset('avif') },
      { type: 'image/webp', srcset: srcset('webp') },
    ],
    widths: [...new Set(outputs.map((o) => o.width))].sort((a, b) => a - b),
  };
}

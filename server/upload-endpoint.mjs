// On-ingest image optimizer for the client authoring portal.
//
// Drop `handleImageUpload` into your existing Node backend's upload route. When
// the client uploads a photo it is optimized (AVIF/WebP, responsive widths,
// EXIF-stripped) via the SAME shared module as the legacy migration, pushed to
// R2, and a ready-to-embed descriptor is returned. Nothing touches git.
//
// A tiny standalone server is included at the bottom so you can test the flow
// today:  node server/upload-endpoint.mjs   (POST multipart 'image' + 'slug')

import http from 'node:http';
import { optimizeImage, contentHash, objectKey, imageDescriptor } from '../scripts/lib/optimize.mjs';
import { putObject, objectExists, R2_PUBLIC_BASE_URL } from '../scripts/lib/r2.mjs';

/**
 * @param {Buffer} buffer   raw uploaded image bytes
 * @param {object} opts
 * @param {string} opts.slug  post slug (namespaces the R2 keys)
 * @returns descriptor: { src, sources[], widths[], base } for a <picture>
 */
export async function handleImageUpload(buffer, { slug = 'uploads' } = {}) {
  const hash = contentHash(buffer);
  const { outputs, meta } = await optimizeImage(buffer);

  await Promise.all(
    outputs.map(async (o) => {
      const key = objectKey(slug, hash, o.width, o.ext);
      if (!(await objectExists(key))) await putObject(key, o.buffer, o.contentType);
    }),
  );

  const publicBase = R2_PUBLIC_BASE_URL || 'https://images.explorebowland.co.uk';
  return { ...imageDescriptor(publicBase, slug, hash, outputs), meta };
}

// ---------------------------------------------------------------------------
// Standalone demo server (optional). Parses a single multipart field 'image'.
// In production use your framework's multipart handling (multer/busboy) and
// call handleImageUpload() with the resulting buffer.

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || '';
    const m = /boundary=(.+)$/.exec(ct);
    if (!m) return reject(new Error('Expected multipart/form-data'));
    const boundary = Buffer.from(`--${m[1]}`);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const fields = {};
      let image = null, slug = 'uploads';
      let start = 0;
      while (true) {
        const bIdx = body.indexOf(boundary, start);
        if (bIdx < 0) break;
        const next = body.indexOf(boundary, bIdx + boundary.length);
        if (next < 0) break;
        const part = body.slice(bIdx + boundary.length, next);
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd < 0) { start = next; continue; }
        const header = part.slice(0, headerEnd).toString();
        const content = part.slice(headerEnd + 4, part.length - 2); // trim trailing CRLF
        const nameM = /name="([^"]+)"/.exec(header);
        const name = nameM?.[1];
        if (/filename="/.test(header)) image = content;
        else if (name) fields[name] = content.toString();
        start = next;
      }
      slug = fields.slug || slug;
      resolve({ image, slug });
    });
    req.on('error', reject);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787);
  http
    .createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/api/images') {
        res.writeHead(404).end('POST /api/images');
        return;
      }
      try {
        const { image, slug } = await parseMultipart(req);
        if (!image) throw new Error('No image field');
        const result = await handleImageUpload(image, { slug });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    })
    .listen(port, () => console.log(`Upload endpoint on http://localhost:${port}/api/images`));
}

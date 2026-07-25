import { getImage } from 'astro:assets';

// Build responsive hero <img> attributes from a (usually remote) source so the
// LCP image ships an appropriately-sized WebP per device instead of one large
// file. Fails soft to the original URL if optimisation errors, so a bad/blocked
// image never breaks the page.
export async function heroImage(src, fallbackW = 1600, fallbackH = 900) {
  if (!src) return null;
  try {
    const img = await getImage({
      src,
      inferSize: true,
      widths: [480, 768, 1024, 1440, 1920],
      format: 'webp',
    });
    return {
      src: img.src,
      srcset: img.srcSet?.attribute || undefined,
      width: img.attributes?.width ?? fallbackW,
      height: img.attributes?.height ?? fallbackH,
    };
  } catch {
    return { src, srcset: undefined, width: fallbackW, height: fallbackH };
  }
}

// Convert Enfold/Avia page-builder shortcodes into clean Markdown/HTML.
//
// Strategy: replace the content-bearing shortcodes (text, headings, images,
// galleries, buttons, video, callouts) with their Markdown/HTML equivalent,
// then unwrap every remaining layout shortcode (columns, sections, hr) leaving
// only its inner content. Attachment IDs are resolved to full-size image URLs
// via the map built from the WXR <attachment> items.

const decode = (s = '') =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;|&#x2019;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8230;/g, '…');

// Parse `key='value'` (and key="value") attributes from a shortcode tag body.
function parseAttrs(str = '') {
  const attrs = {};
  const re = /(\w[\w-]*)\s*=\s*('([^']*)'|"([^"]*)")/g;
  let m;
  while ((m = re.exec(str))) attrs[m[1]] = m[3] ?? m[4] ?? '';
  return attrs;
}

// Match a paired shortcode [name ...]INNER[/name] (non-greedy, no nesting of
// the same tag). Returns a global regex.
const paired = (name) =>
  new RegExp(`\\[${name}\\b([^\\]]*)\\]([\\s\\S]*?)\\[\\/${name}\\]`, 'g');
const selfClose = (name) => new RegExp(`\\[${name}\\b([^\\]]*)\\]`, 'g');

export function makeConverter(resolveImage) {
  // resolveImage(idOrUrl) -> { url, alt } for full-size image
  const imgTag = (idOrUrl, caption = '') => {
    const { url, alt } = resolveImage(idOrUrl);
    if (!url) return '';
    const a = (caption || alt || '').replace(/"/g, '&quot;');
    return `![${a}](${url})`;
  };

  function galleryFrom(ids) {
    const list = String(ids)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const figs = list
      .map((id) => {
        const { url, alt } = resolveImage(id);
        if (!url) return '';
        return `  <a href="${url}"><img src="${url}" alt="${(alt || '').replace(/"/g, '&quot;')}" loading="lazy" /></a>`;
      })
      .filter(Boolean)
      .join('\n');
    return figs ? `\n\n<div class="gallery" data-count="${list.length}">\n${figs}\n</div>\n\n` : '';
  }

  return function convert(raw = '') {
    let s = raw;

    // Hero slideshows are rendered from frontmatter `hero`, so strip them here.
    s = s.replace(paired('av_slideshow_full'), '');
    s = s.replace(paired('av_slideshow'), '');
    s = s.replace(selfClose('av_layerslider'), '');

    // Headings -> markdown heading of the right level.
    s = s.replace(paired('av_heading'), (_, a) => {
      const at = parseAttrs(a);
      const level = /h([1-6])/.exec(at.tag || 'h2')?.[1] || '2';
      const text = decode(at.heading || '').trim();
      if (!text) return '\n\n';
      const hashes = '#'.repeat(Math.min(6, Math.max(1, +level)));
      return `\n\n${hashes} ${text}\n\n`;
    });

    // Icon boxes -> subheading + content.
    s = s.replace(paired('av_icon_box'), (_, a, inner) => {
      const at = parseAttrs(a);
      const title = decode(at.title || '').trim();
      return `\n\n${title ? `### ${title}\n\n` : ''}${inner.trim()}\n\n`;
    });

    // Promoboxes / notifications -> blockquote callout.
    s = s.replace(paired('av_promobox'), (_, __, inner) => `\n\n> ${inner.trim().replace(/\n/g, '\n> ')}\n\n`);
    s = s.replace(paired('av_notification'), (_, __, inner) => `\n\n> ${inner.trim().replace(/\n/g, '\n> ')}\n\n`);

    // Text blocks -> their inner HTML/text verbatim (content must stay the same).
    s = s.replace(paired('av_textblock'), (_, __, inner) => `\n\n${inner.trim()}\n\n`);

    // Code blocks -> fenced code.
    s = s.replace(paired('av_codeblock'), (_, __, inner) => `\n\n\`\`\`\n${inner.trim()}\n\`\`\`\n\n`);

    // Single images.
    s = s.replace(paired('av_image'), (_, a) => {
      const at = parseAttrs(a);
      const ref = at.attachment || at.src;
      return `\n\n${imgTag(ref, decode(at.caption || ''))}\n\n`;
    });
    s = s.replace(selfClose('av_image'), (_, a) => {
      const at = parseAttrs(a);
      const ref = at.attachment || at.src;
      return `\n\n${imgTag(ref, decode(at.caption || ''))}\n\n`;
    });

    // Galleries (thumbnail, masonry, horizontal) -> responsive grid.
    const galleryReplacer = (_, a) => galleryFrom(parseAttrs(a).ids || '');
    s = s.replace(paired('av_gallery'), galleryReplacer);
    s = s.replace(selfClose('av_gallery'), galleryReplacer);
    s = s.replace(paired('av_masonry_gallery'), galleryReplacer);
    s = s.replace(selfClose('av_masonry_gallery'), galleryReplacer);
    s = s.replace(paired('av_horizontal_gallery'), galleryReplacer);
    s = s.replace(selfClose('av_horizontal_gallery'), galleryReplacer);

    // Buttons -> markdown links.
    const buttonReplacer = (_, a) => {
      const at = parseAttrs(a);
      const label = decode(at.label || 'Read more').trim();
      const link = (at.link || '').replace(/^manually,/, '');
      return link ? `\n\n[${label}](${link})\n\n` : '\n\n';
    };
    s = s.replace(paired('av_button'), buttonReplacer);
    s = s.replace(selfClose('av_button'), buttonReplacer);
    s = s.replace(selfClose('av_button_big'), buttonReplacer);

    // Videos -> responsive embed for YouTube/Vimeo, else a link.
    const videoReplacer = (_, a) => {
      const at = parseAttrs(a);
      const src = at.src || '';
      let embed = '';
      const yt = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/.exec(src);
      const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(src);
      if (yt) embed = `https://www.youtube-nocookie.com/embed/${yt[1]}`;
      else if (vm) embed = `https://player.vimeo.com/video/${vm[1]}`;
      if (embed)
        return `\n\n<div class="embed"><iframe src="${embed}" loading="lazy" allowfullscreen title="Video"></iframe></div>\n\n`;
      return src ? `\n\n[Watch video](${src})\n\n` : '\n\n';
    };
    s = s.replace(paired('av_video'), videoReplacer);
    s = s.replace(selfClose('av_video'), videoReplacer);

    // Drop contact forms / interactive-only shortcodes.
    s = s.replace(paired('av_contact'), '');
    s = s.replace(selfClose('av_contact_field'), '');
    s = s.replace(paired('av_social_share'), '');
    s = s.replace(selfClose('av_social_share'), '');
    s = s.replace(paired('av_comments_list'), '');

    // Horizontal rules.
    s = s.replace(selfClose('av_hr'), '\n\n---\n\n');

    // Unwrap every remaining layout shortcode (columns, sections, etc.):
    // keep inner content, drop the tags.
    s = s.replace(/\[\/?av_[a-z0-9_]+\b[^\]]*\]/g, '');

    // Core WP shortcodes: keep caption inner content, drop wrappers.
    s = s.replace(/\[caption\b[^\]]*\]([\s\S]*?)\[\/caption\]/g, (_, inner) => `\n\n${inner.trim()}\n\n`);
    s = s.replace(/\[\/?[a-z][a-z0-9_-]*\b[^\]]*\]/g, ''); // any stray shortcodes

    // Strip pasted-from-Word noise: <style> blocks and HTML comments.
    s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');

    // Whitespace cleanup.
    s = s
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return s;
  };
}

export { parseAttrs, decode };

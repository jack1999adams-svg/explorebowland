// Split rendered page HTML around its first inline <img>, so a feature can be
// injected directly beneath that image. Returns:
//   before — everything up to the image, with the image re-wrapped in its own
//            clean <p> (any trailing text in the image's paragraph is dropped —
//            e.g. leftover WordPress "### …" heading fragments)
//   after  — everything after the image's paragraph
// If there's no image, returns { before: html, after: null } so callers degrade
// to rendering the feature after the content.
export function splitAfterImage(html) {
  if (!html) return { before: '', after: null };
  const img = html.match(/<img\b[^>]*>/i);
  if (!img) return { before: html, after: null };

  const imgStart = img.index;
  const imgEnd = imgStart + img[0].length;

  // Enclosing <p>…</p> around the image, if any.
  const pOpen = html.lastIndexOf('<p', imgStart);
  const closeRel = html.indexOf('</p>', imgEnd);
  const pClose = closeRel >= 0 ? closeRel + 4 : imgEnd;

  const head = html.slice(0, pOpen >= 0 ? pOpen : imgStart);
  const before = `${head}<p>${img[0]}</p>`;
  const after = html.slice(pClose).replace(/^\s+/, '');
  return { before, after: after || null };
}

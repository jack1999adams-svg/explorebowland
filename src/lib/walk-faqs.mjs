// Build a small FAQ (question/answer pairs) for a walk from its route fields.
// Only filled fields produce a question; blank ones are skipped. The same list
// drives the visible "Good to know" block and the FAQPage JSON-LD, so the
// marked-up Q&A always matches what's on the page (Google's requirement).
const FAQ_FIELDS = [
  ['distance', 'How long is this walk?', (v) => `This walk is ${v}.`],
  ['difficulty', 'How difficult is it?', (v) => v],
  ['ascent', 'How much ascent is there?', (v) => `The total ascent is ${v}.`],
  ['postcode', 'Where do I park?', (v) => `The nearest parking postcode is ${v}.`],
  ['dogs', 'Is the walk dog-friendly?', (v) => v],
  ['nearby_pub', 'Is there a pub nearby?', (v) => v],
  ['nearby_hotel', 'Where can I stay nearby?', (v) => v],
];

const period = (s) => (/[.!?)]$/.test(s.trim()) ? s.trim() : s.trim() + '.');

export function buildWalkFaqs(route = []) {
  const byKey = Object.fromEntries((route || []).map((r) => [r.key, r.value]));
  const faqs = [];
  for (const [key, q, a] of FAQ_FIELDS) {
    const v = (byKey[key] || '').trim();
    if (v) faqs.push({ q, a: period(a(v)) });
  }
  return faqs;
}

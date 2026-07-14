// POST /api/contact — contact-form handler.
//
// Receives the submission same-origin, validates it, and forwards the lead to
// the NovaPortal form-capture endpoint (/api/f/lead) server-side — so there's
// no cross-origin request from the browser. The portal stores it under the
// "lead" form (Submissions inbox). Returns JSON { ok } / { error }.
//
// Optional override: NOVAPORTAL_LEADS_ENDPOINT (Pages env var) if the portal's
// URL ever changes.
const DEFAULT_ENDPOINT =
  'https://novaportal-explorebowland.collectiq.workers.dev/api/f/lead';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  // Honeypot: bots fill the hidden "company" field. Pretend success, drop it.
  if (body.company) return json({ ok: true });

  const name = (body.name || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const subject = (body.subject || '').toString().trim();
  const message = (body.message || '').toString().trim();

  if (!name || !email || !message) {
    return json({ error: 'Please fill in your name, email and message.' }, 400);
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }
  if (message.length > 4000 || name.length > 120 || subject.length > 160) {
    return json({ error: 'That message is too long.' }, 400);
  }

  const endpoint = env.NOVAPORTAL_LEADS_ENDPOINT || DEFAULT_ENDPOINT;
  const payload = {
    name,
    email,
    subject: subject || 'Website contact',
    message,
    source: 'website-contact-form',
    page: request.headers.get('referer') || '',
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return json({ error: 'Sorry, we couldn’t send your message. Please try again later.' }, 502);
    }
    return json({ ok: true });
  } catch {
    return json({ error: 'Sorry, we couldn’t send your message. Please try again later.' }, 502);
  }
}

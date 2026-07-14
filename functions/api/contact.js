// POST /api/contact — contact-form handler.
//
// Receives the form submission same-origin, validates it, and forwards the lead
// to NovaPortal server-side so the submit token never reaches the browser and
// there's no cross-origin request. Returns JSON { ok } / { error }.
//
// Runtime config (Cloudflare Pages → Settings → Environment variables, so it's
// available to Functions):
//   NOVAPORTAL_SUBMIT_TOKEN   (secret)  token that authorises lead submission
//   NOVAPORTAL_LEADS_ENDPOINT (var, optional) defaults to the portal /api/v1/leads
const DEFAULT_ENDPOINT =
  'https://novaportal-explorebowland.collectiq.workers.dev/api/v1/leads';

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

  const token = env.NOVAPORTAL_SUBMIT_TOKEN;
  if (!token) {
    // Not wired up yet — fail clearly rather than silently dropping the lead.
    return json(
      { error: 'The contact form isn’t available right now. Please try again later.' },
      503,
    );
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
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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

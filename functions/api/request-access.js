const OWNER_EMAIL    = 'horizoneworld@gmail.com';
const APP_URL        = 'https://vivaah-ledger.pages.dev';
const SESSION_DAYS   = 180;
const TOKEN_TTL_MS   = 15 * 60 * 1000;
const EMAILJS_SERVICE_ID  = 'service_rrh49ga';
const EMAILJS_TEMPLATE_ID = 'template_nkz7qec';
const EMAILJS_PUBLIC_KEY  = '84IAbs0-O2AoJTARe';

async function randomToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sendApprovalEmail(requesterEmail, approveUrl, rejectUrl) {
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'origin': APP_URL },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email: OWNER_EMAIL,
        subject: `Login request from ${requesterEmail}`,
        requester_email: requesterEmail,
        approve_url: approveUrl,
        reject_url: rejectUrl,
        app_url: APP_URL,
        time: time,
      },
    }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`EmailJS ${resp.status}: ${text}`);
  return true;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'Invalid email' }, { status: 400 });
  }

  if (email === OWNER_EMAIL.toLowerCase()) {
    await env.VIVAAH_KV.put(`approved:${email}`,
      JSON.stringify({ approvedAt: Date.now() }),
      { expirationTtl: SESSION_DAYS * 24 * 3600 }
    );
    return Response.json({ status: 'approved' });
  }

  const existing = await env.VIVAAH_KV.get(`approved:${email}`);
  if (existing) return Response.json({ status: 'approved' });

  const pendingRaw = await env.VIVAAH_KV.get(`pending:${email}`);
  if (pendingRaw) {
    const pending = JSON.parse(pendingRaw);
    if (Date.now() - pending.requestedAt < TOKEN_TTL_MS) {
      const approveUrl = `${APP_URL}/api/approve?token=${pending.token}&email=${encodeURIComponent(email)}`;
      const rejectUrl  = `${APP_URL}/api/reject?token=${pending.token}&email=${encodeURIComponent(email)}`;
      try { await sendApprovalEmail(email, approveUrl, rejectUrl); } catch(e) { console.error(e); }
      return Response.json({ status: 'pending' });
    }
  }

  const token = await randomToken();
  await env.VIVAAH_KV.put(`pending:${email}`,
    JSON.stringify({ email, token, requestedAt: Date.now() }),
    { expirationTtl: Math.ceil(TOKEN_TTL_MS / 1000) }
  );

  const approveUrl = `${APP_URL}/api/approve?token=${token}&email=${encodeURIComponent(email)}`;
  const rejectUrl  = `${APP_URL}/api/reject?token=${token}&email=${encodeURIComponent(email)}`;

  try {
    await sendApprovalEmail(email, approveUrl, rejectUrl);
  } catch (e) {
    return Response.json({ error: 'Could not send approval email. Please try again.' }, { status: 500 });
  }

  return Response.json({ status: 'pending' });
}

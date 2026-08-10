/**
 * Vivaah Ledger — Unified Worker
 * Runs on vivaah-ledger.pages.dev/api/* — NO CORS issues!
 * Same domain as the app = browser never blocks it
 */

const OWNER_EMAIL    = 'horizoneworld@gmail.com';
const APP_URL        = 'https://vivaah-ledger.pages.dev';
const SESSION_DAYS   = 180; // 6 months
const TOKEN_TTL_MS   = 15 * 60 * 1000; // 15 minutes

const EMAILJS_SERVICE_ID  = 'service_rrh49ga';
const EMAILJS_TEMPLATE_ID = 'template_nkz7qec';
const EMAILJS_PUBLIC_KEY  = '84IAbs0-O2AoJTARe';

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResp(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function randomToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sendApprovalEmail(requesterEmail, approveUrl, rejectUrl) {
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'origin': APP_URL,
    },
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
  const responseText = await resp.text();
  if (!resp.ok) throw new Error(`EmailJS ${resp.status}: ${responseText}`);
  return true;
}

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // Only handle /api/* routes — everything else goes to Pages static files
    if (!path.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const apiPath = path.replace('/api', '');

    // ── POST /api/request-access ─────────────────────────────────
    if (apiPath === '/request-access' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }

      const email = (body.email || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResp({ error: 'Invalid email' }, 400);
      }

      if (email === OWNER_EMAIL.toLowerCase()) {
        await env.VIVAAH_KV.put(`approved:${email}`,
          JSON.stringify({ approvedAt: Date.now() }),
          { expirationTtl: SESSION_DAYS * 24 * 3600 }
        );
        return jsonResp({ status: 'approved' });
      }

      const existing = await env.VIVAAH_KV.get(`approved:${email}`);
      if (existing) return jsonResp({ status: 'approved' });

      const pendingRaw = await env.VIVAAH_KV.get(`pending:${email}`);
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw);
        if (Date.now() - pending.requestedAt < TOKEN_TTL_MS) {
          const approveUrl = `${APP_URL}/api/approve?token=${pending.token}&email=${encodeURIComponent(email)}`;
          const rejectUrl  = `${APP_URL}/api/reject?token=${pending.token}&email=${encodeURIComponent(email)}`;
          try { await sendApprovalEmail(email, approveUrl, rejectUrl); } catch(e) { console.error(e); }
          return jsonResp({ status: 'pending' });
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
        console.error('Email send failed:', e.message);
        return jsonResp({ error: 'Could not send approval email. Please try again.' }, 500);
      }

      return jsonResp({ status: 'pending' });
    }

    // ── GET /api/approve ──────────────────────────────────────────
    if (apiPath === '/approve' && request.method === 'GET') {
      const token = url.searchParams.get('token');
      const email = (url.searchParams.get('email') || '').toLowerCase();
      if (!token || !email) return htmlResp(resultPage('❌ Invalid', 'Invalid link.', '#B5562F'));

      const pendingRaw = await env.VIVAAH_KV.get(`pending:${email}`);
      if (!pendingRaw) return htmlResp(resultPage('⏰ Expired', 'This link has expired or was already used.', '#B5562F'));

      const pending = JSON.parse(pendingRaw);
      if (pending.token !== token) return htmlResp(resultPage('❌ Invalid', 'Invalid link.', '#B5562F'));

      await env.VIVAAH_KV.put(`approved:${email}`,
        JSON.stringify({ approvedAt: Date.now() }),
        { expirationTtl: SESSION_DAYS * 24 * 3600 }
      );
      await env.VIVAAH_KV.delete(`pending:${email}`);
      return htmlResp(resultPage('✅ Approved!', `<strong>${email}</strong> can now log in to Vivaah Ledger.`, '#2E7D32'));
    }

    // ── GET /api/reject ───────────────────────────────────────────
    if (apiPath === '/reject' && request.method === 'GET') {
      const token = url.searchParams.get('token');
      const email = (url.searchParams.get('email') || '').toLowerCase();

      const pendingRaw = await env.VIVAAH_KV.get(`pending:${email}`);
      if (pendingRaw) {
        const p = JSON.parse(pendingRaw);
        if (p.token === token) {
          await env.VIVAAH_KV.delete(`pending:${email}`);
          await env.VIVAAH_KV.put(`rejected:${email}`, '1', { expirationTtl: 300 });
        }
      }
      return htmlResp(resultPage('❌ Rejected', `Login request from <strong>${email}</strong> has been rejected.`, '#B5562F'));
    }

    // ── POST /api/check-status ────────────────────────────────────
    if (apiPath === '/check-status' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return jsonResp({ status: 'none' }); }

      const email = (body.email || '').trim().toLowerCase();
      if (!email) return jsonResp({ status: 'none' });

      const approved = await env.VIVAAH_KV.get(`approved:${email}`);
      if (approved) return jsonResp({ status: 'approved' });

      const rejected = await env.VIVAAH_KV.get(`rejected:${email}`);
      if (rejected) {
        await env.VIVAAH_KV.delete(`rejected:${email}`);
        return jsonResp({ status: 'rejected' });
      }

      const pending = await env.VIVAAH_KV.get(`pending:${email}`);
      if (pending) return jsonResp({ status: 'pending' });

      return jsonResp({ status: 'none' });
    }

    // ── POST /api/revoke ──────────────────────────────────────────
    if (apiPath === '/revoke' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }

      const email      = (body.email || '').trim().toLowerCase();
      const ownerEmail = (body.ownerEmail || '').trim().toLowerCase();

      if (ownerEmail !== OWNER_EMAIL.toLowerCase()) return jsonResp({ error: 'Unauthorized' }, 403);
      if (!email) return jsonResp({ error: 'Email required' }, 400);
      if (email === OWNER_EMAIL.toLowerCase()) return jsonResp({ error: 'Cannot revoke owner' }, 400);

      await env.VIVAAH_KV.delete(`approved:${email}`);
      await env.VIVAAH_KV.delete(`pending:${email}`);
      return jsonResp({ success: true });
    }

    // ── GET /api/test-email ───────────────────────────────────────
    if (apiPath === '/test-email' && request.method === 'GET') {
      try {
        await sendApprovalEmail('test@example.com',
          `${APP_URL}/api/approve?token=test&email=test%40example.com`,
          `${APP_URL}/api/reject?token=test&email=test%40example.com`
        );
        return jsonResp({ success: true, message: 'Test email sent to ' + OWNER_EMAIL });
      } catch(e) {
        return jsonResp({ success: false, error: e.message }, 500);
      }
    }

    return jsonResp({ error: 'Not found' }, 404);
  },
};

function resultPage(title, message, color) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#FBF6EE;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
  .card{background:#fff;border-radius:18px;padding:40px 36px;max-width:420px;text-align:center;box-shadow:0 8px 32px rgba(92,26,43,0.12);}
  h2{color:${color};font-size:22px;margin:0 0 16px;}
  p{color:#555;font-size:15px;line-height:1.6;}
  a{display:inline-block;margin-top:20px;padding:12px 28px;background:#5C1A2B;color:#D4A24C;border-radius:10px;text-decoration:none;font-weight:600;}
</style></head>
<body><div class="card">
  <h2>${title}</h2><p>${message}</p>
  <a href="${APP_URL}">Open Vivaah Ledger</a>
</div></body></html>`;
}

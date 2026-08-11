const APP_URL     = 'https://vivaah-ledger.pages.dev';
const SESSION_DAYS = 180;

function resultPage(title, message, color) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
  <style>body{font-family:'Segoe UI',Arial,sans-serif;background:#FBF6EE;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
  .card{background:#fff;border-radius:18px;padding:40px 36px;max-width:420px;text-align:center;box-shadow:0 8px 32px rgba(92,26,43,0.12);}
  h2{color:${color};font-size:22px;margin:0 0 16px;}p{color:#555;font-size:15px;line-height:1.6;}
  a{display:inline-block;margin-top:20px;padding:12px 28px;background:#5C1A2B;color:#D4A24C;border-radius:10px;text-decoration:none;font-weight:600;}
  </style></head><body><div class="card"><h2>${title}</h2><p>${message}</p><a href="${APP_URL}">Open Vivaah Ledger</a></div></body></html>`;
}

export async function onRequestGet({ request, env }) {
  const url    = new URL(request.url);
  const token  = url.searchParams.get('token');
  const email  = (url.searchParams.get('email') || '').toLowerCase();
  const months = parseInt(url.searchParams.get('months') || '0');

  if (!token || !email) return new Response(resultPage('❌ Invalid', 'Invalid link.', '#B5562F'), { headers: { 'Content-Type': 'text/html' } });

  const pendingRaw = await env.VIVAAH_KV.get(`pending:${email}`);
  if (!pendingRaw) return new Response(resultPage('⏰ Expired', 'This link has expired or was already used.', '#B5562F'), { headers: { 'Content-Type': 'text/html' } });

  const pending = JSON.parse(pendingRaw);
  if (pending.token !== token) return new Response(resultPage('❌ Invalid', 'Invalid link.', '#B5562F'), { headers: { 'Content-Type': 'text/html' } });

  // If months not selected yet — show duration selection page
  if (!months || ![3,6,9,12].includes(months)) {
    return new Response(durationPage(email, token), { headers: { 'Content-Type': 'text/html' } });
  }

  // Approve with selected duration
  const days = months * 30;
  await env.VIVAAH_KV.put(`approved:${email}`,
    JSON.stringify({ approvedAt: Date.now(), months }),
    { expirationTtl: days * 24 * 3600 }
  );
  await env.VIVAAH_KV.delete(`pending:${email}`);
  return new Response(resultPage('✅ Approved!', `<strong>${email}</strong> has been granted access for <strong>${months} months</strong>.`, '#2E7D32'), { headers: { 'Content-Type': 'text/html' } });
}

export async function onRequestPost({ request, env }) {
  // Handle extension of existing approved user
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const email      = (body.email || '').trim().toLowerCase();
  const ownerEmail = (body.ownerEmail || '').trim().toLowerCase();
  const months     = parseInt(body.months || 6);

  if (ownerEmail !== 'horizoneworld@gmail.com') return Response.json({ error: 'Unauthorized' }, { status: 403 });
  if (!email) return Response.json({ error: 'Email required' }, { status: 400 });
  if (![3,6,9,12].includes(months)) return Response.json({ error: 'Invalid duration' }, { status: 400 });

  const days = months * 30;
  await env.VIVAAH_KV.put(`approved:${email}`,
    JSON.stringify({ approvedAt: Date.now(), months }),
    { expirationTtl: days * 24 * 3600 }
  );
  return Response.json({ success: true, message: `Access extended for ${months} months` });
}

function durationPage(email, token) {
  const base = `${APP_URL}/api/approve?token=${token}&email=${encodeURIComponent(email)}`;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Approve Access — Vivaah Ledger</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#FBF6EE;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;}
  .card{background:#fff;border-radius:18px;padding:36px;max-width:440px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(92,26,43,0.12);}
  .logo{font-size:32px;margin-bottom:8px;}
  h2{color:#5C1A2B;font-size:20px;margin:0 0 6px;}
  .email{background:#F3EBDB;border-radius:8px;padding:8px 14px;font-size:14px;font-weight:600;color:#5C1A2B;margin:14px 0 20px;}
  p{color:#666;font-size:14px;margin:0 0 20px;}
  .duration-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;}
  .dur-btn{display:block;padding:16px 10px;background:#FBF6EE;border:2px solid #D4A24C;border-radius:12px;text-decoration:none;color:#5C1A2B;font-weight:700;font-size:16px;transition:all .15s;}
  .dur-btn:hover{background:#5C1A2B;color:#D4A24C;border-color:#5C1A2B;}
  .dur-btn small{display:block;font-size:11px;font-weight:400;color:#888;margin-top:3px;}
  .dur-btn:hover small{color:#F0D8A8;}
  .reject-link{display:block;margin-top:16px;font-size:13px;color:#C62828;text-decoration:none;}
</style></head>
<body><div class="card">
  <div class="logo">🌸</div>
  <h2>Approve Access — Vivaah Ledger</h2>
  <p>Select how long to grant access for:</p>
  <div class="email">📧 ${email}</div>
  <div class="duration-grid">
    <a href="${base}&months=3" class="dur-btn">3 Months<small>~90 days</small></a>
    <a href="${base}&months=6" class="dur-btn">6 Months<small>~180 days</small></a>
    <a href="${base}&months=9" class="dur-btn">9 Months<small>~270 days</small></a>
    <a href="${base}&months=12" class="dur-btn">12 Months<small>~365 days</small></a>
  </div>
  <a href="${APP_URL}/api/reject?token=${token}&email=${encodeURIComponent(email)}" class="reject-link">❌ Reject this request</a>
</div></body></html>`;
}

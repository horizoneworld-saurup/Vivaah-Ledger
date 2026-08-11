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
  const url   = new URL(request.url);
  const token = url.searchParams.get('token');
  const email = (url.searchParams.get('email') || '').toLowerCase();
  if (!token || !email) return new Response(resultPage('❌ Invalid', 'Invalid link.', '#B5562F'), { headers: { 'Content-Type': 'text/html' } });

  const pendingRaw = await env.VIVAAH_KV.get(`pending:${email}`);
  if (!pendingRaw) return new Response(resultPage('⏰ Expired', 'This link has expired or was already used.', '#B5562F'), { headers: { 'Content-Type': 'text/html' } });

  const pending = JSON.parse(pendingRaw);
  if (pending.token !== token) return new Response(resultPage('❌ Invalid', 'Invalid link.', '#B5562F'), { headers: { 'Content-Type': 'text/html' } });

  await env.VIVAAH_KV.put(`approved:${email}`,
    JSON.stringify({ approvedAt: Date.now() }),
    { expirationTtl: SESSION_DAYS * 24 * 3600 }
  );
  await env.VIVAAH_KV.delete(`pending:${email}`);
  return new Response(resultPage('✅ Approved!', `<strong>${email}</strong> can now log in to Vivaah Ledger.`, '#2E7D32'), { headers: { 'Content-Type': 'text/html' } });
}

const APP_URL = 'https://vivaah-ledger.pages.dev';

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

  const pendingRaw = await env.VIVAAH_KV.get(`pending:${email}`);
  if (pendingRaw) {
    const p = JSON.parse(pendingRaw);
    if (p.token === token) {
      await env.VIVAAH_KV.delete(`pending:${email}`);
      await env.VIVAAH_KV.put(`rejected:${email}`, '1', { expirationTtl: 300 });
    }
  }
  return new Response(resultPage('❌ Rejected', `Login request from <strong>${email}</strong> has been rejected.`, '#B5562F'), { headers: { 'Content-Type': 'text/html' } });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ status: 'none' }); }

  const email = (body.email || '').trim().toLowerCase();
  if (!email) return Response.json({ status: 'none' });

  const approved = await env.VIVAAH_KV.get(`approved:${email}`);
  if (approved) return Response.json({ status: 'approved' });

  const rejected = await env.VIVAAH_KV.get(`rejected:${email}`);
  if (rejected) {
    await env.VIVAAH_KV.delete(`rejected:${email}`);
    return Response.json({ status: 'rejected' });
  }

  const pending = await env.VIVAAH_KV.get(`pending:${email}`);
  if (pending) return Response.json({ status: 'pending' });

  return Response.json({ status: 'none' });
}

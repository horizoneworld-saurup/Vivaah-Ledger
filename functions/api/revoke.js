const OWNER_EMAIL = 'horizoneworld@gmail.com';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const email      = (body.email || '').trim().toLowerCase();
  const ownerEmail = (body.ownerEmail || '').trim().toLowerCase();

  if (ownerEmail !== OWNER_EMAIL.toLowerCase()) return Response.json({ error: 'Unauthorized' }, { status: 403 });
  if (!email) return Response.json({ error: 'Email required' }, { status: 400 });
  if (email === OWNER_EMAIL.toLowerCase()) return Response.json({ error: 'Cannot revoke owner' }, { status: 400 });

  await env.VIVAAH_KV.delete(`approved:${email}`);
  await env.VIVAAH_KV.delete(`pending:${email}`);
  return Response.json({ success: true });
}

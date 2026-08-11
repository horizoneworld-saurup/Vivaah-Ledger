// Saves user reminders to KV so cron job can check them
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid' }, { status: 400 }); }

  const email = (body.email || '').trim().toLowerCase();
  const reminders = body.reminders;

  if (!email || !reminders) return Response.json({ error: 'Missing data' }, { status: 400 });

  await env.VIVAAH_KV.put(
    `reminders:${email}`,
    JSON.stringify({ email, reminders, updatedAt: Date.now() }),
    { expirationTtl: 365 * 24 * 3600 } // keep for 1 year
  );

  return Response.json({ success: true });
}

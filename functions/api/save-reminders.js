// Saves user reminders + EP + timeline + branding to KV so cron job can send emails
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid' }, { status: 400 }); }

  const email = (body.email || '').trim().toLowerCase();
  const reminders = body.reminders;

  if (!email || !reminders) return Response.json({ error: 'Missing data' }, { status: 400 });

  await env.VIVAAH_KV.put(
    `reminders:${email}`,
    JSON.stringify({
      email,
      reminders,
      timeline:  body.timeline  || {},
      branding:  body.branding  || {},
      ep:        body.ep        || {},
      updatedAt: Date.now()
    }),
    { expirationTtl: 365 * 24 * 3600 }
  );

  return Response.json({ success: true });
}

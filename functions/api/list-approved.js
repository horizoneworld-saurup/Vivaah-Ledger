// Lists all approved users from KV — owner only
const OWNER_EMAIL = 'horizoneworld@gmail.com';

export async function onRequestGet({ request, env }) {
  // Only allow from the app origin
  const users = [];

  try {
    // List all approved: keys
    const list = await env.VIVAAH_KV.list({ prefix: 'approved:' });

    for (const key of (list.keys || [])) {
      const email = key.name.replace('approved:', '');
      const raw = await env.VIVAAH_KV.get(key.name);
      let approvedAt = null;
      let months = 6;

      if (raw) {
        try {
          const data = JSON.parse(raw);
          approvedAt = data.approvedAt || null;
          months = data.months || 6;
        } catch(e) {}
      }

      const expiresAt = approvedAt ? approvedAt + (months * 30 * 24 * 60 * 60 * 1000) : null;

      users.push({
        email,
        approvedAt,
        months,
        expiresAt,
      });
    }

    // Sort: owner first, then by approvedAt descending
    users.sort((a, b) => {
      if (a.email === OWNER_EMAIL) return -1;
      if (b.email === OWNER_EMAIL) return 1;
      return (b.approvedAt || 0) - (a.approvedAt || 0);
    });

    return Response.json({ success: true, count: users.length, users });
  } catch(e) {
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

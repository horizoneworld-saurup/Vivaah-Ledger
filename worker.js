/**
 * Vivaah Ledger — Auth + Reminder Worker v5
 * Handles: auth approval flow + daily reminder emails via cron
 */

const OWNER_EMAILS   = ['horizoneworld@gmail.com','rmsfincoresolutions@gmail.com','saurabh@horizoneworld.com'];
const APP_URL        = 'https://vivaah-ledger.pages.dev';
const WORKER_URL     = 'https://vivaah-auth.rms-d21.workers.dev';
const SESSION_DAYS   = 180;
const TOKEN_TTL_MS   = 15 * 60 * 1000;

const EMAILJS_SERVICE_ID  = 'service_rrh49ga';
const EMAILJS_TEMPLATE_ID = 'template_nkz7qec';
const EMAILJS_REMINDER_ID = 'template_reminder';
const EMAILJS_PUBLIC_KEY  = '84IAbs0-O2AoJTARe';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Origin, X-Requested-With',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'false',
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
function htmlResp(html, status = 200) {
  return new Response(html, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
async function randomToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Send auth approval email ─────────────────────────────────────────────
async function sendApprovalEmail(requesterEmail, approveUrl, rejectUrl) {
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  // Send to all owner emails
  for (const ownerEmail of OWNER_EMAILS) {
    const payload = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email: ownerEmail,
        subject: `Login request from ${requesterEmail}`,
        requester_email: requesterEmail,
        approve_url: approveUrl,
        reject_url: rejectUrl,
        app_url: APP_URL,
        time: time,
      },
    };
    await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'origin': APP_URL },
      body: JSON.stringify(payload),
    });
  }
  return true;
}

// ── Send reminder email to a specific user ───────────────────────────────
async function sendReminderEmailToUser(toEmail, alerts, coupleName) {
  const urgency = alerts.some(a => a.daysLeft <= 1) ? '🔴 URGENT: ' : '🌸 ';
  const subject = urgency + 'Vivaah Reminder — ' + alerts.length + ' item' + (alerts.length > 1 ? 's' : '') + ' need attention';

  const rows = alerts.map(function(a) {
    const dl = a.daysLeft;
    const absDl = Math.abs(dl); const urg = dl < 0 ? '🔴 OVERDUE by ' + absDl + ' day' + (absDl>1?'s':'') : dl === 0 ? '🔴 Due TODAY' : dl === 1 ? '🔴 TOMORROW' : dl <= 3 ? '🟡 ' + dl + ' days left' : '🟢 ' + dl + ' days left';
    const col = dl <= 3 ? '#C62828' : '#C45000';
    return `<tr style="border-bottom:1px solid #f5e8e8;">
      <td style="padding:10px 8px;font-size:13px;">${a.emoji || '🌺'} <strong>${a.text}</strong>
        <div style="font-size:11px;color:#888;margin-top:2px;">${a.module}</div></td>
      <td style="padding:10px 8px;font-size:12px;font-weight:700;white-space:nowrap;color:${col};">${urg}</td>
    </tr>`;
  }).join('');

  const html = `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fff8f5;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#8B1A6B,#C4306A);padding:28px 24px;text-align:center;">
      <div style="font-size:32px;">🌸</div>
      <div style="color:#fff;font-size:20px;font-weight:700;">Vivaah Ledger</div>
      <div style="color:#fce4ec;font-size:13px;margin-top:4px;">${coupleName || 'Wedding Planner'}</div>
    </div>
    <div style="padding:24px;">
      <div style="font-size:18px;font-weight:700;color:#5C1A2B;margin-bottom:4px;">🔔 Wedding Reminders</div>
      <div style="font-size:13px;color:#888;margin-bottom:16px;">${alerts.length} item${alerts.length > 1 ? 's' : ''} need your attention</div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #f0e0e8;">${rows}</table>
      <div style="margin-top:20px;text-align:center;">
        <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#8B1A6B,#C4306A);color:#fff;text-decoration:none;padding:12px 28px;border-radius:25px;font-size:14px;font-weight:700;">🌸 Open Vivaah Ledger</a>
      </div>
      <div style="font-size:11px;color:#aaa;text-align:center;margin-top:16px;">Items disappear once marked as done in the app.</div>
    </div></div>`;

  const payload = {
    service_id: EMAILJS_SERVICE_ID,
    template_id: EMAILJS_REMINDER_ID,
    user_id: EMAILJS_PUBLIC_KEY,
    accessToken: EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: toEmail,
      subject: subject,
      message_html: html,
      app_url: APP_URL,
    },
  };

  const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'origin': APP_URL },
    body: JSON.stringify(payload),
  });
  console.log('Reminder email to', toEmail, ':', resp.status);
  return resp.ok;
}

// ── Scan reminders for a user and return due alerts ──────────────────────
function scanReminders(reminderData, today) {
  const alerts = [];
  const rem = reminderData.reminders || {};
  const tl  = reminderData.timeline  || {};
  const ep  = reminderData.ep        || {};
  const coupleName = (reminderData.branding || {}).title || '';

  function getDate(ev) {
    const t = tl[ev]; if (!t || !t.date) return null;
    const d = new Date(t.date); d.setHours(0,0,0,0); return d;
  }
  function daysUntil(d) {
    if (!d) return null;
    return Math.round((d - today) / 86400000);
  }
  function deadline(base, daysBefore) {
    if (!base) return null;
    const d = new Date(base); d.setDate(d.getDate() - daysBefore); return d;
  }
  function addAlert(text, deadlineDate, module, emoji, firstTriggerDays) {
    if (!deadlineDate) return;
    const dl = daysUntil(deadlineDate);
    if (dl === null) return; // no lower bound — keep sending weekly after deadline passes
    // firstTriggerDays = how many days before deadline the first email fires
    // e.g. Home Decor: firstTriggerDays=0 (deadline IS 90 days before Kankotri)
    // After first trigger, send every 7 days until done
    // So: fire if dl <= firstTriggerDays AND (firstTriggerDays - dl) % 7 === 0
    const triggerDays = firstTriggerDays !== undefined ? firstTriggerDays : 0;
    const daysSinceFirst = triggerDays - dl;
    if (daysSinceFirst >= 0 && daysSinceFirst % 7 === 0) {
      alerts.push({ text, daysLeft: dl, module, emoji: emoji || '🌺' });
    }
    // Always also send at 3 days and 1 day before deadline as final alerts
    if ((dl === 3 || dl === 1 || dl === 0) && !alerts.find(a => a.text === text && a.daysLeft === dl)) {
      alerts.push({ text, daysLeft: dl, module, emoji: emoji || '🌺' });
    }
  }

  // Existing: Trial / Clothes / Guest reminders
  ['trial','clothes','guest'].forEach(key => {
    (rem[key] || []).forEach(r => {
      if (r.done || !r.date) return;
      const d = new Date(r.date); d.setHours(0,0,0,0);
      const dl = daysUntil(d);
      // Fire on reminder date (dl=0), then every week after (dl=-7,-14...), plus 3d and 1d before
      const daysSinceReminder = -dl;
      const isWeekly = dl <= 0 && daysSinceReminder % 7 === 0;
      const isFinal  = dl === 3 || dl === 1;
      if (dl !== null && (isWeekly || isFinal)) {
        alerts.push({ text: r.text || 'Reminder', daysLeft: dl, module: key.charAt(0).toUpperCase()+key.slice(1), emoji: key==='clothes'?'👗':key==='guest'?'👥':'🪡' });
      }
    });
  });

  // EP reminders — also send weekly from trigger date until deadline
  const EVENTS = ['Kankotri','Ganesh-Grahshanti','Mosalu','Mehendi','Sangeet','Haldi','Marriage','Reception'];
  const kankDate   = getDate('Kankotri');
  const ganeshDate = getDate('Ganesh-Grahshanti');
  const meals      = ['breakfast','lunch','dinner','latenight'];

  // Catering — weekly from 60 days before Kankotri
  if (kankDate) {
    const dl = deadline(kankDate, 60);
    EVENTS.forEach(ev => {
      const evData = (ep.catering || {})[ev] || {};
      const pend = meals.filter(m => { const s=(evData[m]||{}).status; return s!=='confirmed'&&s!=='not-required'; }).length;
      if (pend > 0) addAlert('Catering: ' + ev + ' — ' + pend + ' meal slot' + (pend>1?'s':'') + ' unconfirmed', dl, 'Catering', '🍛', 0);
    });
  }

  // Decor — weekly from 60 days before each function
  EVENTS.forEach(ev => {
    const d = getDate(ev); if (!d) return;
    const dec = (ep.decor || {})[ev] || {};
    if (dec.status !== 'confirmed') addAlert('Decor: ' + ev + ' not confirmed', deadline(d,60), 'Decor', '🌸', 0);
  });
  // Home Decor — weekly from 90 days before Kankotri
  if (kankDate && (ep.homeDecor||{}).status !== 'confirmed')
    addAlert('Home Decor not finalised (inside + outside)', deadline(kankDate,90), 'Decor', '🏠', 0);

  // Puja — weekly from 60 days before Kankotri
  if (kankDate) {
    ['Kankotri','Ganesh-Grahshanti','Marriage'].forEach(ev => {
      const puja = (ep.puja||{})[ev]||{};
      const pend = ((puja.weProvide||[]).filter(i=>!i.done)).length + ((puja.maharajBrings||[]).filter(i=>!i.done)).length;
      if (pend > 0) addAlert('Puja Samagri: ' + ev + ' — ' + pend + ' item' + (pend>1?'s':'') + ' pending', deadline(kankDate,60), 'Puja', '🪔', 0);
    });
  }

  // Gifts — weekly from 30 days before Ganesh
  if (ganeshDate) {
    ['Ganesh-Grahshanti','Mosalu','Marriage'].forEach(ev => {
      const gift = (ep.gifts||{})[ev]||{};
      const all  = (gift.covers||[]).concat(gift.ladies||[]).concat(gift.akhand||[]);
      const pend = all.filter(i=>i.status!=='given').length;
      if (pend > 0) addAlert('Gifts & Covers: ' + ev + ' — ' + pend + ' item' + (pend>1?'s':'') + ' not given', deadline(ganeshDate,30), 'Gifts', '🎁', 0);
    });
  }

  // Carnival — weekly from 90 days before Kankotri
  if (kankDate) {
    const stalls = (ep.carnival||{}).stalls||[];
    const notFin = stalls.filter(s=>s.status!=='finalised').length;
    if (notFin > 0) addAlert('Carnival: ' + notFin + ' stall' + (notFin>1?'s':'') + ' not finalised', deadline(kankDate,90), 'Carnival', '🎪', 0);
  }

  // Clothes — weekly from 30 days before each function
  EVENTS.forEach(ev => {
    const d = getDate(ev); if (!d) return;
    const undel = (ep.clothes||[]).filter(c=>c.event===ev&&c.status!=='delivered');
    if (undel.length > 0) addAlert('Clothes: ' + undel.length + ' outfit' + (undel.length>1?'s':'') + ' not delivered for ' + ev, deadline(d,30), 'Clothes', '👗');
  });

  return { alerts, coupleName };
}

export default {
  // ── HTTP requests ────────────────────────────────────────────────────────
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Origin',
        'Access-Control-Max-Age': '86400',
      }});
    }

    // POST /request-access
    if (path === '/request-access' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      const email = (body.email || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResp({ error: 'Invalid email' }, 400);

      if (OWNER_EMAILS.map(e=>e.toLowerCase()).includes(email)) {
        await env.VIVAAH_KV.put(`approved:${email}`, JSON.stringify({ approvedAt: Date.now() }), { expirationTtl: SESSION_DAYS * 24 * 3600 });
        return jsonResp({ status: 'approved' });
      }
      const existing = await env.VIVAAH_KV.get(`approved:${email}`);
      if (existing) return jsonResp({ status: 'approved' });
      const pendingRaw = await env.VIVAAH_KV.get(`pending:${email}`);
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw);
        if (Date.now() - pending.requestedAt < TOKEN_TTL_MS) {
          const approveUrl = `${WORKER_URL}/approve?token=${pending.token}&email=${encodeURIComponent(email)}`;
          const rejectUrl  = `${WORKER_URL}/reject?token=${pending.token}&email=${encodeURIComponent(email)}`;
          try { await sendApprovalEmail(email, approveUrl, rejectUrl); } catch(e) { console.error(e); }
          return jsonResp({ status: 'pending' });
        }
      }
      const token = await randomToken();
      await env.VIVAAH_KV.put(`pending:${email}`, JSON.stringify({ email, token, requestedAt: Date.now() }), { expirationTtl: Math.ceil(TOKEN_TTL_MS / 1000) });
      const approveUrl = `${WORKER_URL}/approve?token=${token}&email=${encodeURIComponent(email)}`;
      const rejectUrl  = `${WORKER_URL}/reject?token=${token}&email=${encodeURIComponent(email)}`;
      try { await sendApprovalEmail(email, approveUrl, rejectUrl); }
      catch (e) { return jsonResp({ error: 'Could not send approval email. Please try again.' }, 500); }
      return jsonResp({ status: 'pending' });
    }

    // GET /approve
    if (path === '/approve' && request.method === 'GET') {
      const token = url.searchParams.get('token');
      const email = (url.searchParams.get('email') || '').toLowerCase();
      if (!token || !email) return htmlResp(resultPage('❌ Invalid', 'Invalid link.', '#B5562F'));
      const pendingRaw = await env.VIVAAH_KV.get(`pending:${email}`);
      if (!pendingRaw) return htmlResp(resultPage('⏰ Expired', 'This link has expired or was already used.', '#B5562F'));
      const pending = JSON.parse(pendingRaw);
      if (pending.token !== token) return htmlResp(resultPage('❌ Invalid', 'Invalid link.', '#B5562F'));
      await env.VIVAAH_KV.put(`approved:${email}`, JSON.stringify({ approvedAt: Date.now() }), { expirationTtl: SESSION_DAYS * 24 * 3600 });
      await env.VIVAAH_KV.delete(`pending:${email}`);
      return htmlResp(resultPage('✅ Approved!', `<strong>${email}</strong> can now log in to Vivaah Ledger.`, '#2E7D32'));
    }

    // GET /reject
    if (path === '/reject' && request.method === 'GET') {
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

    // POST /check-status
    if (path === '/check-status' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return jsonResp({ status: 'none' }); }
      const email = (body.email || '').trim().toLowerCase();
      if (!email) return jsonResp({ status: 'none' });
      const approved = await env.VIVAAH_KV.get(`approved:${email}`);
      if (approved) return jsonResp({ status: 'approved' });
      const rejected = await env.VIVAAH_KV.get(`rejected:${email}`);
      if (rejected) { await env.VIVAAH_KV.delete(`rejected:${email}`); return jsonResp({ status: 'rejected' }); }
      const pending = await env.VIVAAH_KV.get(`pending:${email}`);
      if (pending) return jsonResp({ status: 'pending' });
      return jsonResp({ status: 'none' });
    }

    // POST /revoke
    if (path === '/revoke' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      const email      = (body.email || '').trim().toLowerCase();
      const ownerEmail = (body.ownerEmail || '').trim().toLowerCase();
      if (!OWNER_EMAILS.map(e=>e.toLowerCase()).includes(ownerEmail)) return jsonResp({ error: 'Unauthorized' }, 403);
      if (!email) return jsonResp({ error: 'Email required' }, 400);
      if (OWNER_EMAILS.map(e=>e.toLowerCase()).includes(email)) return jsonResp({ error: 'Cannot revoke owner access' }, 400);
      await env.VIVAAH_KV.delete(`approved:${email}`);
      await env.VIVAAH_KV.delete(`pending:${email}`);
      return jsonResp({ success: true, message: `Access revoked for ${email}` });
    }

    // POST /save-reminders — saves reminder + EP + timeline + branding data to KV
    if (path === '/save-reminders' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid' }, 400); }
      const email = (body.email || '').trim().toLowerCase();
      if (!email) return jsonResp({ error: 'Missing email' }, 400);
      await env.VIVAAH_KV.put(
        `reminders:${email}`,
        JSON.stringify({
          email,
          reminders: body.reminders || {},
          timeline:  body.timeline  || {},
          branding:  body.branding  || {},
          ep:        body.ep        || {},
          updatedAt: Date.now()
        }),
        { expirationTtl: 365 * 24 * 3600 }
      );
      return jsonResp({ success: true });
    }

    // GET /debug-kv — show raw KV data for debugging
    if (path === '/debug-kv' && request.method === 'GET') {
      const email = (url.searchParams.get('email') || '').toLowerCase();
      if (!email) return jsonResp({ error: 'email param required' }, 400);
      const raw = await env.VIVAAH_KV.get(`reminders:${email}`);
      if (!raw) return jsonResp({ error: 'No KV data for ' + email }, 404);
      const data = JSON.parse(raw);
      return jsonResp({
        email: data.email,
        updatedAt: new Date(data.updatedAt||0).toISOString(),
        hasTimeline: Object.keys(data.timeline||{}).length > 0,
        kankotriDate: (data.timeline||{}).Kankotri?.date || 'NOT SET',
        hasEP: Object.keys(data.ep||{}).length > 0,
        epModules: Object.keys(data.ep||{}),
        cateringEvents: Object.keys((data.ep||{}).catering||{}),
        reminderKeys: Object.keys(data.reminders||{})
      });
    }

    // GET /test-reminder — manually trigger reminder check for your email
    if (path === '/test-reminder' && request.method === 'GET') {
      const email = (url.searchParams.get('email') || '').toLowerCase();
      if (!email) return jsonResp({ error: 'email param required' }, 400);
      const raw = await env.VIVAAH_KV.get(`reminders:${email}`);
      if (!raw) return jsonResp({ error: 'No reminder data found for ' + email }, 404);
      const data  = JSON.parse(raw);
      const today = new Date(); today.setHours(0,0,0,0);
      const { alerts, coupleName } = scanReminders(data, today);
      if (!alerts.length) return jsonResp({ message: 'No reminders due today', email });
      await sendReminderEmailToUser(email, alerts, coupleName);
      return jsonResp({ success: true, email, alertCount: alerts.length, alerts });
    }

    // POST /save-pins — saves PIN hashes to KV (called after Admin Google sync)
    if (path === '/save-pins' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid' }, 400); }
      const pinHashes = body.pinHashes || {};
      if (!Object.keys(pinHashes).length) return jsonResp({ error: 'No pins' }, 400);
      await env.VIVAAH_KV.put('pin-hashes', JSON.stringify({ pinHashes, updatedAt: Date.now() }), { expirationTtl: 365 * 24 * 3600 });
      return jsonResp({ success: true });
    }

    // GET /get-pins — returns PIN hashes so fresh device can unlock without Google OAuth
    if (path === '/get-pins' && request.method === 'GET') {
      const raw = await env.VIVAAH_KV.get('pin-hashes');
      if (!raw) return jsonResp({ pinHashes: {} });
      const data = JSON.parse(raw);
      return jsonResp({ pinHashes: data.pinHashes || {} });
    }

    return jsonResp({ error: 'Not found' }, 404);
  },

  // ── Cron job — runs every day at 8:00 AM IST (02:30 UTC) ────────────────
  async scheduled(event, env, ctx) {
    console.log('Cron triggered:', new Date().toISOString());
    const today = new Date(); today.setHours(0,0,0,0);

    // List all reminder keys in KV
    let cursor = undefined;
    let processed = 0;

    do {
      const listResult = await env.VIVAAH_KV.list({ prefix: 'reminders:', cursor, limit: 100 });

      for (const key of listResult.keys) {
        try {
          const raw = await env.VIVAAH_KV.get(key.name);
          if (!raw) continue;
          const data = JSON.parse(raw);
          const email = data.email;
          if (!email) continue;

          const { alerts, coupleName } = scanReminders(data, today);
          if (alerts.length === 0) {
            console.log('No reminders due for', email);
            continue;
          }

          await sendReminderEmailToUser(email, alerts, coupleName);
          processed++;
          console.log('Sent', alerts.length, 'reminders to', email);
        } catch(e) {
          console.error('Error processing', key.name, ':', e.message);
        }
      }

      cursor = listResult.cursor;
    } while (cursor);

    console.log('Cron complete. Processed', processed, 'users.');
  }
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

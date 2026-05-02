/* Cloudflare Pages Advanced Mode — single _worker.js bundling:
 *  - /api/verify/start and /api/verify/check  (Twilio Verify SMS)
 *  - HTTP Basic Auth gate for /mockups/* and /ads/* paths (internal libraries — same credentials)
 *  - Static-asset fallthrough via env.ASSETS.fetch(request)
 *
 * Env vars required (set in Pages project Settings -> Variables and Secrets):
 *   TWILIO_ACCOUNT_SID         "AC..."  (Plain text)
 *   TWILIO_VERIFY_SERVICE_SID  "VA..."  (Plain text)
 *   TWILIO_AUTH_TOKEN          (Secret)
 *   MOCKUPS_AUTH_USER          (Plain text)  — username for /mockups/ Basic Auth
 *   MOCKUPS_AUTH_PASS          (Secret)      — password for /mockups/ Basic Auth
 */

const ALLOWED_ORIGINS = [
  'https://plumbingslatepress.com',
  'https://www.plumbingslatepress.com',
  'https://plumbingslatepress-com.pages.dev',
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function normalizePhone(raw) {
  let phone = String(raw || '').trim().replace(/[^\d+]/g, '');
  if (!phone) return '';
  if (phone.startsWith('+')) return phone;
  if (phone.length === 10) return '+1' + phone;
  if (phone.length === 11 && phone.startsWith('1')) return '+' + phone;
  return '+' + phone;
}

async function handleStart(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ ok: false, message: 'Invalid JSON' }), { status: 400, headers });
  }

  const phone = normalizePhone(body && body.phone);
  if (!phone) {
    return new Response(JSON.stringify({ ok: false, message: 'Phone required' }), { status: 400, headers });
  }

  const sid = env.TWILIO_ACCOUNT_SID;
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !serviceSid || !token) {
    return new Response(JSON.stringify({ ok: false, message: 'Twilio not configured' }), { status: 500, headers });
  }

  const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/Verifications`;
  const auth = 'Basic ' + btoa(`${sid}:${token}`);
  const form = new URLSearchParams();
  form.set('To', phone);
  form.set('Channel', 'sms');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return new Response(JSON.stringify({ ok: true, status: data.status || 'pending' }), { status: 200, headers });
    }
    return new Response(JSON.stringify({
      ok: false,
      message: (data && data.message) || `Twilio error (${res.status})`,
      code: data && data.code,
    }), { status: 400, headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, message: 'Upstream error' }), { status: 502, headers });
  }
}

async function handleCheck(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ ok: false, message: 'Invalid JSON' }), { status: 400, headers });
  }

  const phone = normalizePhone(body && body.phone);
  const code = String((body && body.code) || '').trim();
  if (!phone || !code) {
    return new Response(JSON.stringify({ ok: false, message: 'Phone and code required' }), { status: 400, headers });
  }

  const sid = env.TWILIO_ACCOUNT_SID;
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !serviceSid || !token) {
    return new Response(JSON.stringify({ ok: false, message: 'Twilio not configured' }), { status: 500, headers });
  }

  const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/VerificationCheck`;
  const auth = 'Basic ' + btoa(`${sid}:${token}`);
  const form = new URLSearchParams();
  form.set('To', phone);
  form.set('Code', code);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const approved = data && data.status === 'approved';
      return new Response(JSON.stringify({ ok: true, approved, status: data.status }), { status: 200, headers });
    }
    return new Response(JSON.stringify({
      ok: false, approved: false,
      message: (data && data.message) || `Twilio error (${res.status})`,
      code: data && data.code,
    }), { status: 400, headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, approved: false, message: 'Upstream error' }), { status: 502, headers });
  }
}

// Constant-time-ish string compare (don't leak length via early-exit)
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function checkBasicAuth(request, env) {
  const expectedUser = env.MOCKUPS_AUTH_USER;
  const expectedPass = env.MOCKUPS_AUTH_PASS;
  if (!expectedUser || !expectedPass) return { configured: false, ok: false };

  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return { configured: true, ok: false };

  let decoded;
  try { decoded = atob(header.slice(6)); } catch { return { configured: true, ok: false }; }
  const idx = decoded.indexOf(':');
  if (idx < 0) return { configured: true, ok: false };
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);
  return { configured: true, ok: safeEqual(user, expectedUser) && safeEqual(pass, expectedPass) };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight for the API routes
    if (method === 'OPTIONS' && (path === '/api/verify/start' || path === '/api/verify/check')) {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin') || '') });
    }

    if (path === '/api/verify/start' && method === 'POST') {
      return handleStart(request, env);
    }
    if (path === '/api/verify/check' && method === 'POST') {
      return handleCheck(request, env);
    }

    // Basic Auth gate for the internal mockup library
    if (path === '/mockups' || path.startsWith('/mockups/') || path === '/ads' || path.startsWith('/ads/')) {
      const auth = checkBasicAuth(request, env);
      if (!auth.configured) {
        return new Response('Internal library auth not configured. Set MOCKUPS_AUTH_USER and MOCKUPS_AUTH_PASS in Pages env vars.', { status: 503 });
      }
      if (!auth.ok) {
        return new Response('Authentication required.', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="Plumbing Slatepress Internal"' },
        });
      }
      // Auth passed — fall through to static asset.
    }

    return env.ASSETS.fetch(request);
  },
};

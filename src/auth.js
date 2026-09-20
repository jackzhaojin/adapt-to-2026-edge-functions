/// <reference types="@fastly/js-compute" />

// Sign in with Google at the edge.
//
//   GET  /auth/login     serves a page with the Google button
//   POST /auth/callback  Google posts the ID token here; we verify it and set a cookie
//   GET  /auth/logout    clears the cookie
//   GET  /api/me         who am I, as JSON
//
// The cookie holds the Google ID token itself. Google signed it, and getSession()
// re-verifies it on every request, so there is no session store and no secret.

import { CacheOverride } from 'fastly:cache-override';
import { GOOGLE_JWKS_URL, verifyIdToken } from './lib/google-token.js';
import { GOOGLE_CLIENT_ID } from './lib/settings.js';
import {
  RETURN_COOKIE, SESSION_COOKIE, expireCookie, parseCookies, safeReturnPath, serializeCookie,
} from './lib/session.js';
import { escapeHtml } from './lib/personalize.js';

/**
 * The origin the browser used. Behind Caddy that is https://local.jackzhaojin.com
 * even though the function itself only sees plain http on 7676.
 * @param {Request} req
 * @returns {{ origin: string, secure: boolean }}
 */
export function requestOrigin(req) {
  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host;
  return { origin: `${proto}://${host}`, secure: proto === 'https' };
}

/**
 * Google rotates its signing keys, so fetch the JWKS document and let the
 * function's fetch cache keep it for an hour.
 * @returns {Promise<{ keys: object[] }>}
 */
async function getGoogleJwks() {
  const res = await fetch(GOOGLE_JWKS_URL, { cacheOverride: new CacheOverride({ ttl: 3600 }) });
  if (!res.ok) throw new Error(`JWKS fetch failed with ${res.status}`);
  return res.json();
}

/**
 * Reads and verifies the session cookie. Never throws: a bad or expired cookie
 * simply means an anonymous visitor.
 * @param {Request} req
 * @returns {Promise<{ user: object|null, token: string|null }>}
 */
export async function getSession(req) {
  const token = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE];
  if (!token) return { user: null, token: null };
  try {
    const user = await verifyIdToken(token, { clientId: GOOGLE_CLIENT_ID, getJwks: getGoogleJwks });
    return { user, token };
  } catch (err) {
    console.log(`session cookie rejected: ${err.message}`);
    return { user: null, token: null };
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * GET /auth/login
 * @param {Request} req
 * @returns {Response}
 */
export function loginPage(req) {
  const url = new URL(req.url);
  const { origin, secure } = requestOrigin(req);
  const returnPath = safeReturnPath(url.searchParams.get('return'));
  const loginUri = `${origin}/auth/callback`;

  // The Google library posts the credential to data-login_uri as a form, along
  // with a g_csrf_token that it also stores in a cookie (double submit).
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in</title>
  <script src="https://accounts.google.com/gsi/client" async></script>
  <!-- The site's font faces, served through the proxy from the same origin. -->
  <link rel="stylesheet" href="/styles/fonts.css">
  <style>
    body{font-family:'Inter',system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f0e9;color:#111c2c}
    .card{background:#fff;padding:36px 44px;border-radius:12px;box-shadow:0 8px 30px rgba(45,71,57,.12);text-align:center;max-width:440px}
    h1{font-family:'Playfair Display',georgia,serif;font-weight:700;color:#173124;font-size:1.75rem;margin:0 0 8px}
    p{margin:0 0 24px;opacity:.75;font-size:.95rem}
    .g_id_signin{display:flex;justify-content:center}
    .fine{font-size:.75rem;opacity:.55;margin-top:22px}
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign in to the Wilderness Path</h1>
    <p>This page is served by the edge function, not by Edge Delivery.</p>
    <div id="g_id_onload"
         data-client_id="${escapeHtml(GOOGLE_CLIENT_ID)}"
         data-login_uri="${escapeHtml(loginUri)}"
         data-auto_select="true"
         data-itp_support="true"></div>
    <div class="g_id_signin" data-type="standard" data-size="large" data-theme="outline"
         data-text="signin_with" data-shape="rectangular"></div>
    <div class="fine">After sign-in you return to ${escapeHtml(returnPath)}</div>
  </div>
</body>
</html>`;

  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  headers.append('set-cookie', serializeCookie(RETURN_COOKIE, returnPath, { maxAge: 300, secure }));
  return new Response(html, { status: 200, headers });
}

/**
 * POST /auth/callback
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export async function callback(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  }
  const { secure } = requestOrigin(req);
  const cookies = parseCookies(req.headers.get('cookie'));
  const form = new URLSearchParams(await req.text());

  // 1. CSRF: the token in the body must match the cookie Google's script set.
  const csrf = form.get('g_csrf_token');
  if (!csrf || csrf !== cookies.g_csrf_token) {
    return new Response('CSRF token mismatch', { status: 400 });
  }

  // 2. Verify the credential exactly as we will on every later request.
  const credential = form.get('credential');
  if (!credential) return new Response('Missing credential', { status: 400 });
  let claims;
  try {
    claims = await verifyIdToken(credential, { clientId: GOOGLE_CLIENT_ID, getJwks: getGoogleJwks });
  } catch (err) {
    return new Response(`Sign-in rejected: ${escapeHtml(err.message)}`, { status: 401 });
  }

  // 3. Session lasts as long as the token, capped at an hour.
  const now = Math.floor(Date.now() / 1000);
  const maxAge = Math.max(60, Math.min(claims.exp - now, 3600));
  const headers = new Headers({
    location: safeReturnPath(cookies[RETURN_COOKIE]),
    'cache-control': 'no-store',
  });
  headers.append('set-cookie', serializeCookie(SESSION_COOKIE, credential, { maxAge, secure }));
  headers.append('set-cookie', expireCookie(RETURN_COOKIE, { secure }));
  console.log(`signed in: ${claims.email} (${claims.sub})`);
  return new Response(null, { status: 303, headers });
}

/**
 * GET /auth/logout
 * @param {Request} req
 * @returns {Response}
 */
export function logout(req) {
  const { secure } = requestOrigin(req);
  const headers = new Headers({ location: '/', 'cache-control': 'no-store' });
  headers.append('set-cookie', expireCookie(SESSION_COOKIE, { secure }));
  return new Response(null, { status: 303, headers });
}

/**
 * GET /api/me
 * @param {{ user: object|null }} session
 * @returns {Response}
 */
export function me(session) {
  if (!session.user) return json({ error: 'not signed in' }, 401);
  const {
    sub, email, name, given_name: givenName, picture, exp,
  } = session.user;
  return json({
    sub, email, name, given_name: givenName, picture, exp, verified_by: 'adapt-edge-function',
  });
}

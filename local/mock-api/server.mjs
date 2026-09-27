// Mock first-party "trails" API for the edge demo.
//
// It stands in for an API you own. It accepts the visitor's Google ID token as
// a bearer token and verifies it fully on its own side, audience included,
// using the same verifier the edge function uses. It never trusts a header the
// edge could have set; the token is the only proof of identity.
//
//   node local/mock-api/server.mjs   listens on http://127.0.0.1:9000
//   GET /trails                requires "Authorization: Bearer <google id token>"

import http from 'node:http';
import { verifyIdToken, GOOGLE_JWKS_URL } from '../../src/lib/google-token.js';
import { GOOGLE_CLIENT_ID } from '../../src/lib/settings.js';

const PORT = 9000;
const TRAILS = ['Inca Trail', 'Wilderness Path', 'Ridge & Rim Loop', 'Salkantay Trek', 'Lares Valley', 'Ausangate Circuit'];

let jwksCache = { fetchedAt: 0, doc: null };
async function getJwks() {
  if (jwksCache.doc && Date.now() - jwksCache.fetchedAt < 3600_000) return jwksCache.doc;
  const res = await fetch(GOOGLE_JWKS_URL);
  jwksCache = { fetchedAt: Date.now(), doc: await res.json() };
  return jwksCache.doc;
}

// Deterministic "saved trails" per user id, so the demo is stable.
function trailsFor(sub) {
  let hash = 0;
  for (const ch of sub) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const count = 2 + (hash % 3);
  const start = hash % TRAILS.length;
  return Array.from({ length: count }, (_, i) => TRAILS[(start + i) % TRAILS.length]);
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

// Shortens a bearer token for display, same idea as the edge's /echo.
function previewAuth(value) {
  if (!value) return value;
  const [scheme, ...rest] = value.split(' ');
  const token = rest.join(' ');
  return token.length > 20 ? `${scheme} ${token.slice(0, 12)}…(${token.length} chars)` : value;
}

const server = http.createServer(async (req, res) => {
  const stamp = new Date().toISOString();

  // Demo endpoint: report exactly what this API received from the edge.
  if (req.method === 'GET' && req.url === '/echo') {
    const headers = { ...req.headers };
    if (headers.authorization) headers.authorization = previewAuth(headers.authorization);
    console.log(`${stamp} GET /echo -> 200 (auth ${headers.authorization ? 'present' : 'absent'}, cookie ${headers.cookie ? 'present' : 'absent'})`);
    return send(res, 200, {
      note: 'what the mock API received from the edge',
      method: req.method,
      url: req.url,
      headers,
    });
  }

  if (req.method !== 'GET' || req.url !== '/trails') {
    console.log(`${stamp} ${req.method} ${req.url} -> 404`);
    return send(res, 404, { error: 'not found' });
  }
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    console.log(`${stamp} GET /trails -> 401 (no bearer token)`);
    return send(res, 401, { error: 'bearer token required' });
  }
  try {
    const claims = await verifyIdToken(auth.slice(7), { clientId: GOOGLE_CLIENT_ID, getJwks });
    console.log(`${stamp} GET /trails -> 200 for ${claims.email} (${claims.sub})`);
    return send(res, 200, {
      user: { sub: claims.sub, email: claims.email },
      trails: trailsFor(claims.sub),
      verified_by: 'mock-trails-api',
    });
  } catch (err) {
    console.log(`${stamp} GET /trails -> 401 (${err.message})`);
    return send(res, 401, { error: `token rejected: ${err.message}` });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock trails API listening on http://127.0.0.1:${PORT}`);
});

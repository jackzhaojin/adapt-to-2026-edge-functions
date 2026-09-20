/// <reference types="@fastly/js-compute" />

// Backend-for-frontend call. The edge relays the visitor's Google ID token to a
// first-party API, which verifies it again on its side (audience included).
// That is Google's documented pattern for your own backends. The token is never
// sent to anything we do not own.

import { CacheOverride } from 'fastly:cache-override';
import { TRAILS_API_BACKEND, TRAILS_API_URL } from './lib/settings.js';

/**
 * @param {string} token verified Google ID token from the session
 * @returns {Promise<{ user: object, trails: string[] }>}
 */
export async function fetchTrails(token) {
  const res = await fetch(`${TRAILS_API_URL}/trails`, {
    backend: TRAILS_API_BACKEND,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cacheOverride: new CacheOverride('pass'),
  });
  if (!res.ok) throw new Error(`trails API responded ${res.status}`);
  return res.json();
}

/**
 * GET /api/trails
 * @param {{ user: object|null, token: string|null }} session
 * @returns {Promise<Response>}
 */
export async function trailsHandler(session) {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (!session.user) {
    return new Response(JSON.stringify({ error: 'sign in first' }), { status: 401, headers });
  }
  try {
    const data = await fetchTrails(session.token);
    return new Response(JSON.stringify(data, null, 2), { status: 200, headers });
  } catch (err) {
    console.log(`trails API error: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), { status: 502, headers });
  }
}

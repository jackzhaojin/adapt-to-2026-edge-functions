/// <reference types="@fastly/js-compute" />

// GET /echo: a demo endpoint that shows the request at each hop.
//
//   received  what the browser sent to the edge (plus what Fastly knows about the client)
//   upstream  what the proxy would send to the Edge Delivery origin (computed, not sent)
//   api       what the first-party mock API actually received when the edge called it
//             with the visitor's token (only when signed in)
//
// Sensitive header values are truncated so the output is safe to show on screen.

import { CacheOverride } from 'fastly:cache-override';
import { getGeolocationForIpAddress } from 'fastly:geolocation';
import { buildUpstreamRequest } from './lib/proxy-utils.js';
import { headersToObject } from './lib/echo-utils.js';
import { TRAILS_API_BACKEND, TRAILS_API_URL } from './lib/settings.js';

async function echoFromApi(token) {
  const res = await fetch(`${TRAILS_API_URL}/echo`, {
    backend: TRAILS_API_BACKEND,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cacheOverride: new CacheOverride('pass'),
  });
  if (!res.ok) throw new Error(`mock API responded ${res.status}`);
  return res.json();
}

/**
 * @param {Request} req
 * @param {{ user: object|null, token: string|null }} session
 * @param {object} client event.client from the Fastly runtime
 * @returns {Promise<Response>}
 */
export async function echoHandler(req, session, client) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : client?.address;
  let geo = null;
  try {
    const g = getGeolocationForIpAddress(clientIp);
    geo = g ? { city: g.city, country: g.country_code, lat: g.latitude, lon: g.longitude } : null;
  } catch (err) {
    geo = { unavailable: err.message };
  }

  const upstream = buildUpstreamRequest(req);

  let api;
  if (session.user) {
    try {
      api = await echoFromApi(session.token);
    } catch (err) {
      api = { error: err.message };
    }
  } else {
    api = { skipped: 'sign in to see the authenticated hop to the API' };
  }

  const body = {
    session: session.user
      ? { signedIn: true, email: session.user.email, sub: session.user.sub }
      : { signedIn: false },
    received: {
      method: req.method,
      url: req.url,
      headers: headersToObject(req.headers),
      client: { ip: clientIp, geo },
    },
    upstream: {
      note: 'what the proxy sends to Edge Delivery: cookies and auth stripped, host swapped',
      method: upstream.method,
      url: upstream.url,
      headers: headersToObject(upstream.headers),
    },
    api,
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

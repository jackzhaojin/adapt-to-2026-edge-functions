/// <reference types="@fastly/js-compute" />

import { CacheOverride } from 'fastly:cache-override';
import { buildUpstreamRequest, toLocalLocation } from './lib/proxy-utils.js';
import { injectGreeting, isHtmlResponse } from './lib/personalize.js';
import { fetchTrails } from './api.js';

// Response headers that describe the hop between the function and the origin,
// not the hop to the browser, so they must not be copied back.
const DROPPED_RESPONSE_HEADERS = ['connection', 'keep-alive', 'transfer-encoding'];

/**
 * Proxy to the Edge Delivery origin. Non-HTML responses stream straight
 * through. HTML pages get the greeting bar, personalized when the visitor has
 * a valid session, and are marked uncacheable in that case.
 * @param {Request} req incoming request
 * @param {{ user: object|null, token: string|null }} session from getSession()
 * @returns {Promise<Response>}
 */
export async function proxyHandler(req, session = { user: null, token: null }) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  const upstream = buildUpstreamRequest(req);

  // "pass" keeps the function's own fetch cache out of the picture. Edge Delivery
  // already caches at the origin and the CDN caches in front of the function, and
  // neither of those would purge this third copy when content changes.
  const res = await fetch(upstream, { cacheOverride: new CacheOverride('pass') });

  const headers = new Headers(res.headers);
  DROPPED_RESPONSE_HEADERS.forEach((name) => headers.delete(name));
  const location = headers.get('location');
  if (location) headers.set('location', toLocalLocation(location));
  headers.set('x-edge-function', 'adapt-edge-function');
  headers.set('x-edge-origin', upstream.url);

  const personalize = req.method === 'GET' && res.status === 200 && isHtmlResponse(headers.get('content-type'));
  if (!personalize) {
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }

  // Signed in: ask the first-party API for this visitor's data while we have the
  // page in hand, so the result is rendered into the HTML, not fetched by the browser.
  let trails = null;
  if (session.user) {
    try {
      trails = (await fetchTrails(session.token)).trails;
    } catch (err) {
      console.log(`trails unavailable for greeting: ${err.message}`);
    }
  }

  const url = new URL(req.url);
  const html = await res.text();
  const body = injectGreeting(html, { user: session.user, path: `${url.pathname}${url.search}`, trails });

  // The body changed, so the origin's length and encoding no longer apply.
  headers.delete('content-length');
  headers.delete('content-encoding');
  // A page with someone's name in it must never be stored by a shared cache.
  if (session.user) headers.set('cache-control', 'private, no-store');
  const vary = headers.get('vary');
  headers.set('vary', vary ? `${vary}, Cookie` : 'Cookie');
  headers.set('x-edge-personalized', session.user ? 'signed-in' : 'anonymous');

  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

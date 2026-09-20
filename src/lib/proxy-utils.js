// Pure helpers for the proxy. This file deliberately imports nothing from
// "fastly:*" so it can be unit tested in plain Node with Mocha. The handler
// that needs the Fastly runtime lives in ../proxy.js.

// The Edge Delivery host this function fronts. Preview host for now; switch to
// the .aem.live host when you want published content.
export const AEM_ORIGIN = 'https://main--adapt-to-2026-demo--jackzhaojin.aem.page';

// Only these incoming request headers are forwarded to the origin. Everything
// else (cookies, authorization, hop-by-hop headers) stops at the edge on purpose.
const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'user-agent',
  'if-none-match',
  'if-modified-since',
];

/**
 * Builds the request the function sends upstream: same path and query as the
 * incoming request, but on the origin host and with an allow-listed header set.
 * @param {Request} req incoming request
 * @param {string} origin origin base URL, no trailing slash
 * @returns {Request}
 */
export function buildUpstreamRequest(req, origin = AEM_ORIGIN) {
  const url = new URL(req.url);
  const headers = new Headers();
  FORWARDED_REQUEST_HEADERS.forEach((name) => {
    const value = req.headers.get(name);
    if (value !== null) headers.set(name, value);
  });
  // Ask for uncompressed bytes so a later HTML rewrite step can read the body.
  headers.set('accept-encoding', 'identity');
  return new Request(`${origin}${url.pathname}${url.search}`, { method: req.method, headers });
}

/**
 * Rewrites an absolute Location header that points at the origin so the
 * browser stays on the edge host instead of bouncing to aem.page.
 * @param {string|null} location value of the upstream Location header
 * @param {string} origin origin base URL, no trailing slash
 * @returns {string|null}
 */
export function toLocalLocation(location, origin = AEM_ORIGIN) {
  if (!location || !location.startsWith(origin)) return location;
  return location.slice(origin.length) || '/';
}

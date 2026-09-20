// Cookie helpers for the edge session. The session value is the Google ID
// token itself: Google signed it, and the edge re-verifies it on every request,
// so no server-side session store or signing secret is needed.

export const SESSION_COOKIE = 'edge_session';
export const RETURN_COOKIE = 'edge_return';

/**
 * @param {string|null} header the Cookie request header
 * @returns {Record<string, string>}
 */
export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  });
  return cookies;
}

/**
 * Builds a Set-Cookie header value. Defaults are the safe ones: HttpOnly so
 * page scripts cannot read the token, SameSite=Lax so it still rides along on
 * top-level navigations, Secure unless explicitly disabled for plain-http dev.
 * @param {string} name
 * @param {string} value
 * @param {{ maxAge?: number, secure?: boolean, httpOnly?: boolean, sameSite?: string, path?: string }} [opts]
 * @returns {string}
 */
export function serializeCookie(name, value, {
  maxAge, secure = true, httpOnly = true, sameSite = 'Lax', path = '/',
} = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (typeof maxAge === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * A Set-Cookie value that deletes the cookie.
 * @param {string} name
 * @param {{ secure?: boolean }} [opts]
 * @returns {string}
 */
export function expireCookie(name, opts = {}) {
  return serializeCookie(name, '', { ...opts, maxAge: 0 });
}

/**
 * Only allow same-site relative paths as post-login destinations, so the
 * login flow cannot be used as an open redirect.
 * @param {string|null|undefined} path
 * @returns {string}
 */
export function safeReturnPath(path) {
  if (typeof path !== 'string') return '/';
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return '/';
  return path;
}

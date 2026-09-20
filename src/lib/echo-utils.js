// Helpers for the /echo demo endpoint. Pure, so they are unit tested in Node.

const SENSITIVE = new Set(['authorization', 'cookie', 'set-cookie']);

/**
 * Shortens a long secret-looking value to a safe preview: the first few
 * characters plus its length. Used so /echo can be shown on screen without
 * leaking a full token.
 * @param {string} value
 * @param {number} [keep] characters to keep
 * @returns {string}
 */
export function preview(value, keep = 12) {
  if (typeof value !== 'string' || value.length <= keep + 8) return value;
  return `${value.slice(0, keep)}…(${value.length} chars)`;
}

/**
 * Redacts values of sensitive headers. Cookies are handled per cookie so the
 * names stay readable while the values are previewed.
 * @param {string} name header name
 * @param {string} value header value
 * @returns {string}
 */
export function redact(name, value) {
  const lower = name.toLowerCase();
  if (!SENSITIVE.has(lower)) return value;
  if (lower === 'cookie') {
    return value.split(';').map((part) => {
      const index = part.indexOf('=');
      if (index < 0) return part.trim();
      return `${part.slice(0, index).trim()}=${preview(part.slice(index + 1).trim())}`;
    }).join('; ');
  }
  if (lower === 'authorization') {
    const [scheme, ...rest] = value.split(' ');
    return rest.length ? `${scheme} ${preview(rest.join(' '))}` : preview(value);
  }
  return preview(value);
}

/**
 * Turns a Headers object into a plain, sorted, redacted object for JSON output.
 * @param {Headers} headers
 * @returns {Record<string, string>}
 */
export function headersToObject(headers) {
  const out = {};
  const names = [];
  headers.forEach((_, name) => names.push(name));
  names.sort().forEach((name) => {
    out[name] = redact(name, headers.get(name));
  });
  return out;
}

// Minimal JWT plumbing: decoding and claim checks only. Signature verification
// lives in google-token.js because it needs a key source. No "fastly:" imports,
// so everything here runs in plain Node for unit tests.

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Decodes a base64url string (RFC 7515 style, no padding) to bytes.
 * @param {string} input
 * @returns {Uint8Array}
 */
export function base64UrlToBytes(input) {
  if (typeof input !== 'string' || !BASE64URL.test(input)) {
    throw new Error('invalid base64url input');
  }
  const padding = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Splits a compact JWT into its parts without trusting any of them.
 * @param {string} token
 * @returns {{ header: object, payload: object, signingInput: string, signature: Uint8Array }}
 */
export function decodeJwt(token) {
  if (typeof token !== 'string') throw new Error('token must be a string');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('token must have three dot-separated parts');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const decoder = new TextDecoder();
  return {
    header: JSON.parse(decoder.decode(base64UrlToBytes(encodedHeader))),
    payload: JSON.parse(decoder.decode(base64UrlToBytes(encodedPayload))),
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: base64UrlToBytes(encodedSignature),
  };
}

/**
 * Checks the standard claims an ID token must satisfy. Returns a list of
 * problems, empty when the token is acceptable.
 * @param {object} payload decoded claims
 * @param {{ issuers: string[], audience: string, now?: number, leeway?: number }} opts
 * @returns {string[]}
 */
export function checkClaims(payload, { issuers, audience, now = Math.floor(Date.now() / 1000), leeway = 60 }) {
  const problems = [];
  if (!issuers.includes(payload.iss)) problems.push(`issuer "${payload.iss}" is not trusted`);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(audience)) problems.push('audience does not match this client');
  if (typeof payload.exp !== 'number' || payload.exp + leeway < now) problems.push('token has expired');
  if (typeof payload.iat === 'number' && payload.iat - leeway > now) problems.push('token issued in the future');
  return problems;
}

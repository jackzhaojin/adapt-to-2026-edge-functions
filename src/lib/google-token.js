// Verifies a Google ID token with Google's published public keys (JWKS).
// The key source is injected so unit tests can use a locally generated key
// and the edge runtime can fetch Google's JWKS with its own caching.
// Uses only Web Crypto, which exists in both Node and the Fastly runtime.

import { checkClaims, decodeJwt } from './jwt.js';

export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * @param {string} token compact JWT from Sign in with Google
 * @param {object} opts
 * @param {string} opts.clientId expected audience (your OAuth client ID)
 * @param {() => Promise<{ keys: object[] }>} opts.getJwks returns the JWKS document
 * @param {number} [opts.now] unix seconds, for tests
 * @param {string[]} [opts.issuers]
 * @returns {Promise<object>} the verified claims
 */
export async function verifyIdToken(token, {
  clientId, getJwks, now, issuers = GOOGLE_ISSUERS,
}) {
  const {
    header, payload, signingInput, signature,
  } = decodeJwt(token);

  // 1. Only the algorithm Google uses. Never let the token pick something weaker.
  if (header.alg !== 'RS256') throw new Error(`unsupported algorithm "${header.alg}"`);

  // 2. Find the public key the token says it was signed with.
  const jwks = await getJwks();
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid);
  if (!jwk) throw new Error(`no published key matches kid "${header.kid}"`);

  // 3. Check the signature over header.payload.
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    new TextEncoder().encode(signingInput),
  );
  if (!valid) throw new Error('signature is invalid');

  // 4. Only now look at the claims: issuer, audience, expiry.
  const problems = checkClaims(payload, { issuers, audience: clientId, now });
  if (problems.length > 0) throw new Error(problems.join('; '));

  return payload;
}

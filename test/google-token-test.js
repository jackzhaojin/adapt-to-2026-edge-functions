import assert from 'assert';
import { verifyIdToken } from '../src/lib/google-token.js';

// These tests mint tokens with a throwaway RSA key and hand the matching
// public key to the verifier as if it were Google's JWKS. That exercises the
// real signature path without any network.

const b64url = (input) => Buffer.from(input).toString('base64url');
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const NOW = 1_800_000_000;

let privateKey;
let jwks;

async function mintToken(payload, { kid = 'kid-1', alg = 'RS256', key = privateKey } = {}) {
  const header = b64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, Buffer.from(signingInput));
  return `${signingInput}.${b64url(Buffer.from(signature))}`;
}

const goodClaims = () => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '1234567890',
  email: 'jack@example.com',
  given_name: 'Jack',
  iat: NOW - 30,
  exp: NOW + 3600,
});

describe('google-token verifyIdToken', function () {
  this.timeout(10000);

  before(async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    privateKey = pair.privateKey;
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    jwks = { keys: [{ ...publicJwk, kid: 'kid-1', use: 'sig', alg: 'RS256' }] };
  });

  const opts = () => ({ clientId: CLIENT_ID, getJwks: async () => jwks, now: NOW });

  it('returns the claims for a correctly signed, current token', async () => {
    const token = await mintToken(goodClaims());
    const claims = await verifyIdToken(token, opts());
    assert.equal(claims.given_name, 'Jack');
  });

  it('rejects a token whose payload was altered after signing', async () => {
    const token = await mintToken(goodClaims());
    const [h, , s] = token.split('.');
    const tampered = `${h}.${b64url(JSON.stringify({ ...goodClaims(), given_name: 'Mallory' }))}.${s}`;
    await assert.rejects(verifyIdToken(tampered, opts()), /signature is invalid/);
  });

  it('rejects a token for a different client', async () => {
    const token = await mintToken({ ...goodClaims(), aud: 'someone-else' });
    await assert.rejects(verifyIdToken(token, opts()), /audience/);
  });

  it('rejects an expired token', async () => {
    const token = await mintToken({ ...goodClaims(), exp: NOW - 7200 });
    await assert.rejects(verifyIdToken(token, opts()), /expired/);
  });

  it('rejects a token signed with an unknown key id', async () => {
    const token = await mintToken(goodClaims(), { kid: 'rotated-away' });
    await assert.rejects(verifyIdToken(token, opts()), /no published key/);
  });

  it('rejects any algorithm other than RS256', async () => {
    const token = await mintToken(goodClaims(), { alg: 'none' });
    await assert.rejects(verifyIdToken(token, opts()), /unsupported algorithm/);
  });
});

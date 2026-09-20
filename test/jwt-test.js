import assert from 'assert';
import { base64UrlToBytes, checkClaims, decodeJwt } from '../src/lib/jwt.js';

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

describe('jwt', () => {
  describe('base64UrlToBytes', () => {
    it('decodes unpadded base64url', () => {
      const bytes = base64UrlToBytes(Buffer.from('hello?>').toString('base64url'));
      assert.equal(Buffer.from(bytes).toString(), 'hello?>');
    });
    it('rejects characters outside the alphabet', () => {
      assert.throws(() => base64UrlToBytes('abc+/='), /invalid base64url/);
    });
  });

  describe('decodeJwt', () => {
    it('splits header, payload, signing input and signature', () => {
      const header = { alg: 'RS256', kid: 'k1' };
      const payload = { sub: '123' };
      const token = `${b64url(header)}.${b64url(payload)}.${Buffer.from('sig').toString('base64url')}`;
      const decoded = decodeJwt(token);
      assert.deepEqual(decoded.header, header);
      assert.deepEqual(decoded.payload, payload);
      assert.equal(decoded.signingInput, `${b64url(header)}.${b64url(payload)}`);
      assert.equal(Buffer.from(decoded.signature).toString(), 'sig');
    });
    it('rejects anything that is not three parts', () => {
      assert.throws(() => decodeJwt('a.b'), /three/);
      assert.throws(() => decodeJwt(42), /string/);
    });
  });

  describe('checkClaims', () => {
    const now = 1_800_000_000;
    const good = {
      iss: 'https://accounts.google.com', aud: 'client-1', exp: now + 600, iat: now - 10,
    };
    const opts = { issuers: ['https://accounts.google.com'], audience: 'client-1', now };

    it('accepts a valid token', () => {
      assert.deepEqual(checkClaims(good, opts), []);
    });
    it('accepts an audience array containing the client', () => {
      assert.deepEqual(checkClaims({ ...good, aud: ['other', 'client-1'] }, opts), []);
    });
    it('flags wrong issuer, wrong audience and expiry', () => {
      const problems = checkClaims({ ...good, iss: 'evil', aud: 'x', exp: now - 3600 }, opts);
      assert.equal(problems.length, 3);
    });
    it('tolerates small clock skew but not more', () => {
      assert.deepEqual(checkClaims({ ...good, exp: now - 30 }, opts), []);
      assert.equal(checkClaims({ ...good, exp: now - 120 }, opts).length, 1);
    });
  });
});

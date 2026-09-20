import assert from 'assert';
import {
  expireCookie, parseCookies, safeReturnPath, serializeCookie,
} from '../src/lib/session.js';

describe('session cookies', () => {
  it('parses a Cookie header', () => {
    assert.deepEqual(parseCookies('a=1; edge_session=tok%3D; b = 2'), { a: '1', edge_session: 'tok=', b: '2' });
    assert.deepEqual(parseCookies(null), {});
  });

  it('serializes with safe defaults', () => {
    const value = serializeCookie('edge_session', 'abc', { maxAge: 3600 });
    assert.equal(value, 'edge_session=abc; Path=/; SameSite=Lax; Max-Age=3600; HttpOnly; Secure');
  });

  it('can drop Secure for plain-http development', () => {
    assert.ok(!serializeCookie('x', 'y', { secure: false }).includes('Secure'));
  });

  it('expires with Max-Age=0', () => {
    assert.ok(expireCookie('edge_session').includes('Max-Age=0'));
  });

  it('only allows same-site relative return paths', () => {
    assert.equal(safeReturnPath('/ai-content/blocks/'), '/ai-content/blocks/');
    assert.equal(safeReturnPath('https://evil.example'), '/');
    assert.equal(safeReturnPath('//evil.example'), '/');
    assert.equal(safeReturnPath(undefined), '/');
  });
});

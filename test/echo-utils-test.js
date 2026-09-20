import assert from 'assert';
import { headersToObject, preview, redact } from '../src/lib/echo-utils.js';

describe('echo-utils', () => {
  it('previews long values and leaves short ones alone', () => {
    assert.equal(preview('short'), 'short');
    assert.equal(preview('a'.repeat(40)), `${'a'.repeat(12)}…(40 chars)`);
  });

  it('redacts bearer tokens but keeps the scheme', () => {
    const out = redact('Authorization', `Bearer ${'x'.repeat(50)}`);
    assert.equal(out, `Bearer ${'x'.repeat(12)}…(50 chars)`);
  });

  it('redacts cookie values per cookie and keeps names', () => {
    const out = redact('cookie', `edge_session=${'t'.repeat(30)}; g_csrf_token=abc`);
    assert.equal(out, `edge_session=${'t'.repeat(12)}…(30 chars); g_csrf_token=abc`);
  });

  it('does not touch ordinary headers', () => {
    assert.equal(redact('accept', 'text/html'), 'text/html');
  });

  it('converts Headers to a sorted, redacted object', () => {
    const headers = new Headers({ 'user-agent': 'curl', authorization: `Bearer ${'y'.repeat(40)}`, accept: '*/*' });
    const obj = headersToObject(headers);
    assert.deepEqual(Object.keys(obj), ['accept', 'authorization', 'user-agent']);
    assert.ok(obj.authorization.endsWith('(40 chars)'));
  });
});

import assert from 'assert';
import { AEM_ORIGIN, buildUpstreamRequest, toLocalLocation } from '../src/lib/proxy-utils.js';

describe('proxy-utils', () => {
  describe('buildUpstreamRequest', () => {
    it('keeps path and query, swaps the host for the origin', () => {
      const req = new Request('http://127.0.0.1:7676/ai-content/blocks/?x=1', {
        headers: { accept: 'text/html', cookie: 'secret=1' },
      });
      const up = buildUpstreamRequest(req);
      assert.equal(up.url, `${AEM_ORIGIN}/ai-content/blocks/?x=1`);
      assert.equal(up.headers.get('accept'), 'text/html');
      assert.equal(up.headers.get('accept-encoding'), 'identity');
      assert.equal(up.headers.get('cookie'), null, 'cookies must not leak upstream');
    });
  });

  describe('toLocalLocation', () => {
    it('rewrites absolute origin URLs to relative paths', () => {
      assert.equal(toLocalLocation(`${AEM_ORIGIN}/ai-content/blocks/`), '/ai-content/blocks/');
    });
    it('maps the bare origin to /', () => {
      assert.equal(toLocalLocation(AEM_ORIGIN), '/');
    });
    it('leaves other locations alone', () => {
      assert.equal(toLocalLocation('https://example.com/x'), 'https://example.com/x');
      assert.equal(toLocalLocation('/relative'), '/relative');
      assert.equal(toLocalLocation(null), null);
    });
  });
});

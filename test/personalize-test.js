import assert from 'assert';
import {
  escapeHtml, greetingHtml, injectGreeting, isHtmlResponse,
} from '../src/lib/personalize.js';

const PAGE = '<html><head><title>t</title></head><body><header></header><main class="x"><div class="hero"><h1>Hi</h1></div></main></body></html>';

describe('personalize', () => {
  it('escapes HTML special characters', () => {
    assert.equal(escapeHtml('<b>"J&J"</b>'), '&lt;b&gt;&quot;J&amp;J&quot;&lt;/b&gt;');
  });

  it('detects HTML content types', () => {
    assert.ok(isHtmlResponse('text/html; charset=utf-8'));
    assert.ok(!isHtmlResponse('text/javascript'));
    assert.ok(!isHtmlResponse(null));
  });

  it('places the bar between header and main, never inside main', () => {
    const out = injectGreeting(PAGE, { user: null, path: '/ai-content/blocks/' });
    const headerEnd = out.indexOf('</header>');
    const barAt = out.indexOf('<aside class="edge-greeting"');
    const mainAt = out.indexOf('<main class="x">');
    assert.ok(headerEnd < barAt && barAt < mainAt, 'bar must sit before <main>');
    assert.ok(!out.slice(mainAt).includes('edge-greeting'), 'nothing injected inside main');
  });

  it('puts the stylesheet in head', () => {
    const out = injectGreeting(PAGE, { user: null, path: '/' });
    const styleAt = out.indexOf('id="edge-greeting-style"');
    assert.ok(styleAt > 0 && styleAt < out.indexOf('</head>'));
  });

  it('leaves documents without main untouched', () => {
    assert.equal(injectGreeting('<p>fragment</p>', { user: null, path: '/' }), '<p>fragment</p>');
  });

  it('offers sign-in with an encoded return path when anonymous', () => {
    const html = greetingHtml({ user: null, path: '/a b/' });
    assert.ok(html.includes('data-edge="anonymous"'));
    assert.ok(html.includes('/auth/login?return=%2Fa%20b%2F'));
  });

  it('greets by first name, escapes it, and shows trails as pills when signed in', () => {
    const html = greetingHtml({
      user: { given_name: 'Jack <script>', picture: 'https://example.com/p.png' },
      path: '/',
      trails: ['Ridge & Rim'],
    });
    assert.ok(html.includes('Hey Jack &lt;script&gt;, thanks for logging in.'));
    assert.ok(html.includes('src="https://example.com/p.png"'));
    assert.ok(html.includes('<span class="edge-greeting__pill">Ridge &amp; Rim</span>'));
    assert.ok(html.includes('/auth/logout'));
    assert.ok(!html.includes('<script>'));
  });

  it('ignores non-https avatars', () => {
    const html = greetingHtml({ user: { given_name: 'J', picture: 'javascript:alert(1)' }, path: '/' });
    assert.ok(!html.includes('<img'));
  });
});

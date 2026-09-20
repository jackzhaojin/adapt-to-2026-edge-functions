// HTML personalization by plain string manipulation. Good enough for a demo
// where pages are a few kilobytes; the production upgrade is the streaming
// HTML rewriter in @fastly/js-compute. Everything injected is HTML and CSS
// only, so the site's script-src Content Security Policy is never violated.
//
// Placement matters: the bar goes between <header> and <main>, never inside
// <main>. Edge Delivery's aem.js treats every direct child of <main> as a
// section and rewraps its children, which would wreck the layout.

const ESCAPES = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/**
 * @param {string|null} contentType
 * @returns {boolean}
 */
export function isHtmlResponse(contentType) {
  return /text\/html/i.test(contentType || '');
}

// Styled with the site's own custom properties (see styles/styles.css in the
// site repo) so the bar follows the paper, white and forest themes.
export const GREETING_STYLE = `<style id="edge-greeting-style">
.edge-greeting{background:var(--forest-color,#2d4739);color:#e7eee8;font-family:var(--body-font-family,Inter,sans-serif);font-size:var(--body-font-size-xs,14px);line-height:1.4}
.edge-greeting__inner{max-width:calc(var(--content-width,720px) + 32px);margin:0 auto;padding:10px 16px;display:flex;flex-direction:column;gap:8px}
.edge-greeting__row{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap}
.edge-greeting__who{display:flex;align-items:center;gap:10px;font-weight:600}
.edge-greeting__avatar{width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.35);flex:none}
.edge-greeting__trails{opacity:.95}
.edge-greeting__trails > span:first-child{margin-right:4px;opacity:.8}
.edge-greeting__pill{display:inline-block;padding:2px 10px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);font-size:12px;white-space:nowrap}
.edge-greeting__actions{margin-left:auto;display:flex;align-items:center;gap:12px}
/* Specificity is deliberate: the site styles a:any-link, which would otherwise win. */
.edge-greeting a.edge-greeting__button:any-link{display:inline-block;padding:6px 14px;border-radius:999px;font-weight:600;text-decoration:none;color:#fff;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.45);transition:background .15s}
.edge-greeting a.edge-greeting__button:hover{background:rgba(255,255,255,.3);color:#fff}
.edge-greeting a.edge-greeting__button--primary:any-link{background:#fff;color:var(--forest-color,#2d4739);border-color:#fff}
.edge-greeting a.edge-greeting__button--primary:hover{background:#e7eee8;color:var(--forest-color,#2d4739)}
.edge-greeting__badge{font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.65;white-space:nowrap}
@media (max-width:600px){.edge-greeting__actions{margin-left:0;width:100%;justify-content:space-between}}
</style>`;

const BADGE = '<span class="edge-greeting__badge" title="Injected at the CDN edge, not by Edge Delivery">edge function</span>';

/**
 * Builds the greeting bar for a signed-in or anonymous visitor.
 * @param {{ user: object|null, path: string, trails?: string[]|null }} opts
 * @returns {string}
 */
export function greetingHtml({ user, path, trails = null }) {
  if (!user) {
    const signIn = `/auth/login?return=${encodeURIComponent(path || '/')}`;
    return `<aside class="edge-greeting" data-edge="anonymous" aria-label="Sign-in status">
  <div class="edge-greeting__inner">
    <div class="edge-greeting__row">
      <span class="edge-greeting__who">Browsing as a guest</span>
      <span>Sign in for saved trails and member articles.</span>
      <span class="edge-greeting__actions">
        <a class="edge-greeting__button edge-greeting__button--primary" href="${escapeHtml(signIn)}">Sign in with Google</a>
        ${BADGE}
      </span>
    </div>
  </div>
</aside>`;
  }

  const name = escapeHtml(user.given_name || user.name || 'there');
  const avatar = typeof user.picture === 'string' && user.picture.startsWith('https://')
    ? `<img class="edge-greeting__avatar" src="${escapeHtml(user.picture)}" alt="" referrerpolicy="no-referrer">`
    : '';
  let trailsHtml = '';
  if (Array.isArray(trails)) {
    trailsHtml = trails.length
      ? `<div class="edge-greeting__row edge-greeting__trails"><span>Saved trails</span>${trails.map((t) => `<span class="edge-greeting__pill">${escapeHtml(t)}</span>`).join('')}</div>`
      : '<div class="edge-greeting__row edge-greeting__trails"><span>No saved trails yet.</span></div>';
  }
  return `<aside class="edge-greeting" data-edge="signed-in" aria-label="Sign-in status">
  <div class="edge-greeting__inner">
    <div class="edge-greeting__row">
      <span class="edge-greeting__who">${avatar}<span>Hey ${name}, thanks for logging in.</span></span>
      <span class="edge-greeting__actions">
        <a class="edge-greeting__button" href="/auth/logout">Sign out</a>
        ${BADGE}
      </span>
    </div>
    ${trailsHtml}
  </div>
</aside>`;
}

/**
 * Puts the stylesheet in <head> and the bar just before <main>. Returns the
 * HTML unchanged when there is no <main>, which keeps fragments intact.
 * @param {string} html
 * @param {{ user: object|null, path: string, trails?: string[]|null }} opts
 * @returns {string}
 */
export function injectGreeting(html, opts) {
  const main = /<main\b[^>]*>/i.exec(html);
  if (!main) return html;
  let out = `${html.slice(0, main.index)}${greetingHtml(opts)}\n${html.slice(main.index)}`;
  const head = out.indexOf('</head>');
  out = head >= 0
    ? `${out.slice(0, head)}${GREETING_STYLE}\n${out.slice(head)}`
    : `${GREETING_STYLE}\n${out}`;
  return out;
}

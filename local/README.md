# Run the whole demo on a laptop

Four pieces, all local:

| Port | What | Start it |
|---|---|---|
| 7676 | The Edge Function on Viceroy, Fastly's local runtime, in watch mode | `aio aem edge-functions serve --watch` |
| 9000 | Mock "trails" API, stands in for an API you own | `node local/mock-api/server.mjs` |
| 443 | Caddy, HTTPS in front of 7676 on a real-looking hostname | `caddy run --config local/Caddyfile` |
| - | The Edge Delivery site | Nothing to run. The function proxies `aem.page` directly (`AEM_ORIGIN` in `src/lib/proxy-utils.js`) |

Run every command from the repo root.

## One-time setup

1. **Adobe CLI and the plugin**

   ```bash
   npm install -g @adobe/aio-cli
   aio plugins:install @adobe/aio-cli-plugin-aem-edge-functions
   npm install && npm test
   ```

2. **A hostname and HTTPS.** Google only accepts plain `http` on `localhost`, and the session
   cookie is `Secure`, so the demo runs on `https://local.jackzhaojin.com`. Change the name in
   `local/Caddyfile` to your own.

   ```bash
   echo "127.0.0.1 local.jackzhaojin.com" | sudo tee -a /etc/hosts
   brew install caddy
   caddy trust
   ```

   `caddy trust` installs Caddy's local root certificate. Quit and reopen Chrome afterwards,
   because Chrome caches certificate decisions. Never click "Proceed (unsafe)": Google's
   sign-in script refuses to run on a page the browser does not trust.

3. **A Google OAuth client.** In Google Cloud, create an OAuth client of type Web application.
   - Authorized JavaScript origins: `https://local.jackzhaojin.com` and `http://localhost:7676`
   - Authorized redirect URIs: none. Sign in with Google hands the ID token to the page.
   - Client secret: not needed. The edge and the API only verify Google's signature with
     Google's public keys.
   - Put the client ID in `GOOGLE_CLIENT_ID` in `src/lib/settings.js`. It is public by design:
     it goes into the sign-in button and is the audience every token must match.
   - While the consent screen is in Testing mode, only the test users you add can sign in.

## Try it

- `https://local.jackzhaojin.com/ai-content/blocks/` the site with a guest bar added at the edge
- `https://local.jackzhaojin.com/ai-articles/inca-trail` members only, sends you to sign in
- `https://local.jackzhaojin.com/api/me` and `/api/trails` JSON, 401 when signed out
- `https://local.jackzhaojin.com/echo` the request as seen by the browser, the edge and the API

Changing code rebuilds in a couple of seconds. Changing `fastly.toml` needs a restart of `serve`.

## What does not run locally

The CDN routing rules in `config/cdn.yaml`, the CDN cache in front of the function, and real
geolocation. Those need a deploy to a Cloud Manager program with the Edge Delivery add-on and a
custom domain mapped to Adobe's CDN.

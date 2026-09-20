/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/// <reference types="@fastly/js-compute" />

import * as response from './lib/response.js';
import { log } from './lib/log.js';
import { weatherHandler } from "./weather.js";
import { proxyHandler } from "./proxy.js";
import {
  callback, getSession, loginPage, logout, me,
} from "./auth.js";
import { trailsHandler } from "./api.js";
import { echoHandler } from "./echo.js";
import { PROTECTED_PATHS } from "./lib/settings.js";

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event) {
  const req = event.request;
  const url = new URL(req.url);
  const path = url.pathname;

  let finalResponse;

  try {
    // Every request starts by checking for a session cookie. No cookie, no work.
    const session = await getSession(req);

    if (path === "/auth/login") {
      finalResponse = loginPage(req);
    } else if (path === "/auth/callback") {
      finalResponse = await callback(req);
    } else if (path === "/auth/logout") {
      finalResponse = logout(req);
    } else if (path === "/api/me") {
      finalResponse = me(session);
    } else if (path === "/api/trails") {
      finalResponse = await trailsHandler(session);
    } else if (path === "/echo" && req.method === "GET") {
      // Demo: the request as seen at each hop (browser -> edge -> origin / API)
      finalResponse = await echoHandler(req, session, event.client);
    } else if (path === "/status" && req.method === "GET") {
      // Cacheable JSON health endpoint (see skipCache: false in config/cdn.yaml)
      finalResponse = new Response(JSON.stringify({ status: "ok", site: "adapt-to-2026-demo", ts: new Date().toISOString() }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      });
    } else if (path === "/hello-world" && req.method === "GET") {
      finalResponse = new Response("Hello World from the edge!", { status: 200 });
    } else if (path === "/weather" && req.method === "GET") {
      finalResponse = await weatherHandler(req, event.client);
    } else if (!session.user && PROTECTED_PATHS.some((prefix) => path.startsWith(prefix))) {
      // Members-only area: send anonymous visitors to sign in, then bring them back.
      finalResponse = new Response(null, {
        status: 302,
        headers: {
          location: `/auth/login?return=${encodeURIComponent(`${path}${url.search}`)}`,
          "cache-control": "no-store",
        },
      });
    } else {
      // Everything else is the Edge Delivery site, proxied and personalized.
      finalResponse = await proxyHandler(req, session);
    }
  } catch (err) {
    console.log(err);
    finalResponse = response.error();
  }

  // Log the request and response
  log(req, finalResponse);

  return finalResponse;
}

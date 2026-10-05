/**
 * Legacy *.workers.dev rewrite tests (worker.js).
 *
 * The freebie page moved from the workers.dev root to /freebie/. Old FreeBuddy
 * builds pin the iframe origin to the workers.dev hostname and reject bridge
 * messages from anywhere else, so worker.js rewrites the legacy root paths
 * internally — a redirect would change the origin and break the bridge.
 *
 * The ASSETS binding is stubbed to echo the resolved asset path, which proves
 * which file each URL actually serves without needing wrangler/miniflare.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "../worker.js";

const LEGACY_HOST = "freebuddy-freebie.binbinzhaili.workers.dev";
const SITE_HOST = "freebuddy.si";

/** ASSETS stub: returns the resolved asset pathname as the body. */
function envThatResolves() {
  const calls = [];
  const env = {
    ASSETS: {
      async fetch(request) {
        const pathname = new URL(request.url).pathname;
        calls.push(pathname);
        return new Response(`asset:${pathname}`, { status: 200 });
      }
    }
  };
  return { env, calls };
}

async function resolvedAsset(hostname, path, headers) {
  const { env, calls } = envThatResolves();
  const response = await worker.fetch(new Request(`https://${hostname}${path}`, { headers }), env);
  return { response, calls };
}

test("workers.dev / serves the freebie page internally (no redirect)", async () => {
  const { response, calls } = await resolvedAsset(LEGACY_HOST, "/");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset:/freebie/");
  assert.deepEqual(calls, ["/freebie/"]);
});

test("workers.dev legacy asset paths without Referer serve freebie files", async () => {
  const { calls } = await resolvedAsset(LEGACY_HOST, "/providers.json");
  assert.deepEqual(calls, ["/freebie/providers.json"]);
});

test("workers.dev child requests from the freebie iframe (Referer /) stay on freebie", async () => {
  const { calls } = await resolvedAsset(LEGACY_HOST, "/styles.css", {
    referer: `https://${LEGACY_HOST}/?embed=1&lang=zh-CN`
  });
  assert.deepEqual(calls, ["/freebie/styles.css"]);
});

test("workers.dev child requests from the landing page get the site files", async () => {
  const { calls } = await resolvedAsset(LEGACY_HOST, "/styles.css", {
    referer: `https://${LEGACY_HOST}/index.html`
  });
  assert.deepEqual(calls, ["/styles.css"]);
});

test("the site host serves the landing page at the root", async () => {
  const { calls } = await resolvedAsset(SITE_HOST, "/");
  assert.deepEqual(calls, ["/"]);
});

test("the site host serves the freebie page under /freebie/", async () => {
  const { calls } = await resolvedAsset(SITE_HOST, "/freebie/");
  assert.deepEqual(calls, ["/freebie/"]);
});

test("site-root filenames win on the site host even when they are legacy paths", async () => {
  const { calls } = await resolvedAsset(SITE_HOST, "/styles.css");
  assert.deepEqual(calls, ["/styles.css"]);
});

test("/api/* is handled by the API on every hostname, never rewritten to assets", async () => {
  const { env, calls } = envThatResolves();
  const response = await worker.fetch(
    new Request(`https://${LEGACY_HOST}/api/providers`),
    env
  );
  assert.deepEqual(calls, []);
  assert.equal(response.headers.get("content-type")?.includes("application/json"), true);
});

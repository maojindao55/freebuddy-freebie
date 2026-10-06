/**
 * GET /api/release/latest tests (worker.js).
 *
 * The landing page needs the latest GitHub release tag + asset URLs. Browser
 * calls to api.github.com share a 60/hr unauthenticated quota per egress IP, so
 * the worker proxies it with edge caching, falling back to the /releases/latest
 * 302 redirect (tag only) when the API is unavailable.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "../worker.js";

const API_URL = "https://api.github.com/repos/maojindao55/freebuddy/releases/latest";
const PAGE_URL = "https://github.com/maojindao55/freebuddy/releases/latest";

/** Stubs global fetch with a route table; restores it afterwards. */
function withFetch(t, routes) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const handler = routes[String(url)];
    if (!handler) throw new Error(`unexpected fetch: ${url}`);
    return handler();
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

function apiPayload() {
  return new Response(
    JSON.stringify({
      tag_name: "v0.10.26",
      assets: [
        { name: "FreeBuddy_macOS-Apple-Silicon-v0.10.26.dmg", browser_download_url: "https://x/dmg" },
        { name: "skip-me", browser_download_url: null }
      ]
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

test("release endpoint returns tag and assets from the GitHub API", async (t) => {
  const calls = withFetch(t, { [API_URL]: apiPayload });
  const res = await worker.fetch(new Request("https://freebuddy.si/api/release/latest"), {});
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.tag, "v0.10.26");
  assert.deepEqual(body.assets, [
    { name: "FreeBuddy_macOS-Apple-Silicon-v0.10.26.dmg", url: "https://x/dmg" }
  ]);
  assert.deepEqual(calls, [API_URL]);
});

test("API failure falls back to the releases/latest redirect for the tag", async (t) => {
  const calls = withFetch(t, {
    [API_URL]: () => new Response("rate limited", { status: 403 }),
    [PAGE_URL]: () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://github.com/maojindao55/freebuddy/releases/tag/v0.10.26" }
      })
  });
  const res = await worker.fetch(new Request("https://freebuddy.si/api/release/latest"), {});
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.tag, "v0.10.26");
  assert.deepEqual(body.assets, []);
  assert.deepEqual(calls, [API_URL, PAGE_URL]);
});

test("when both probes fail the endpoint answers 502", async (t) => {
  withFetch(t, {
    [API_URL]: () => {
      throw new Error("network down");
    },
    [PAGE_URL]: () => new Response("oops", { status: 500 })
  });
  const res = await worker.fetch(new Request("https://freebuddy.si/api/release/latest"), {});
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.ok, false);
});

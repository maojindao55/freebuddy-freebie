/**
 * Client catalog merge tests for app.js (runtime providers from /api/providers).
 *
 * app.js runs unmodified inside node:vm with a stub DOM and a routed fetch mock:
 *  - the static providers.json catalog must render even while /api/providers hangs
 *  - runtime entries must never introduce a non-https clickable URL
 *  - static ids win, runtime-only entries are appended, failures degrade silently
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { brokenJsonResponse, createApp, jsonResponse } from "./helpers/dom-stub.mjs";

const STATIC_CATALOG = {
  updatedAt: "2026-01-01",
  providers: [
    {
      id: "static-a",
      name: "Static A",
      protocol: "openai-chat",
      baseUrl: "https://api.a.example.com/v1",
      homepage: "https://a.example.com",
      consoleUrl: "https://a.example.com/keys",
      models: [{ id: "a-1" }],
      region: "global"
    },
    {
      id: "static-b",
      name: "Static B",
      protocol: "anthropic",
      baseUrl: "https://api.b.example.com/v1",
      models: [{ id: "b-1" }],
      region: "cn"
    }
  ]
};

const emptySummary = () => jsonResponse({ ok: true, summary: {} });

function staticRoutes(overrides = {}) {
  return {
    "./providers.json": () => jsonResponse(STATIC_CATALOG),
    "./api/summary": emptySummary,
    ...overrides
  };
}

// The static catalog renders newest-first (providers.json is reversed by app.js).
const STATIC_RENDERED_IDS = ["static-b", "static-a"];

function cards(app) {
  return app.elements.get("providers").children.map((card) => {
    const icon = card.querySelector(".card-icon");
    return {
      id: card.dataset.providerId,
      name: card.querySelector(".card-name").textContent,
      homepage: card.querySelector(".card-homepage").href,
      consoleUrl: card.querySelector(".card-console").href,
      homepageRemoved: card.querySelector(".card-homepage").removed,
      iconSrc: icon ? icon.src : undefined,
      iconHidden: icon ? icon.hidden : undefined
    };
  });
}

function cardIds(app) {
  return cards(app).map((card) => card.id);
}

function cardNodes(app) {
  return app.elements.get("providers").children;
}

function modalIcon(app) {
  return app.document.getElementById("detail-modal").querySelector(".modal-icon");
}

function openDetail(card) {
  const button = card.querySelector(".open-detail-btn");
  assert.ok(button.listeners.click && button.listeners.click.length > 0, "the card must expose an open-detail button");
  // The production handler calls event.stopPropagation() before opening the modal.
  button.listeners.click[0]({ stopPropagation() {} });
}

test("sanitizeRemoteProvider keeps valid entries and rejects or clears unsafe ones", () => {
  const { internals } = createApp();
  const { sanitizeRemoteProvider } = internals;

  const valid = sanitizeRemoteProvider({
    id: "runtime-c",
    name: "Runtime C",
    baseUrl: "https://api.c.example.com/v1",
    homepage: "https://c.example.com",
    consoleUrl: "https://c.example.com/keys",
    icon: "openai",
    region: "global",
    protocol: "anthropic",
    protocols: ["anthropic", "anthropic", "nonsense"],
    models: [{ id: "c-1", contextWindow: 4096 }]
  });
  assert.equal(valid.id, "runtime-c");
  assert.equal(valid.homepage, "https://c.example.com");
  assert.equal(valid.consoleUrl, "https://c.example.com/keys");
  // Spread into a host-realm array: app.js runs inside node:vm, so its arrays have
  // a different prototype and would fail a strict deep comparison.
  assert.deepEqual([...valid.protocols], ["anthropic"]);

  // Unsafe URLs are cleared, so the entry can still be shown without a link.
  const cleared = sanitizeRemoteProvider({
    id: "runtime-d",
    name: "Runtime D",
    baseUrl: "https://api.d.example.com/v1",
    homepage: "javascript:alert(1)",
    consoleUrl: "data:text/html,<script>alert(1)</script>",
    icon: "//evil.example.com/icon.svg",
    protocol: "chat",
    models: [{ id: "d-1" }]
  });
  assert.equal(cleared.homepage, undefined);
  assert.equal(cleared.consoleUrl, undefined);
  assert.equal(cleared.icon, undefined);
  assert.equal(cleared.protocol, "openai-chat", "unknown protocol falls back to the default");

  // Unusable records are dropped entirely.
  assert.equal(sanitizeRemoteProvider({ ...valid, baseUrl: "http://api.c.example.com/v1" }), null);
  assert.equal(sanitizeRemoteProvider({ ...valid, baseUrl: "javascript:alert(1)" }), null);
  assert.equal(sanitizeRemoteProvider({ ...valid, id: "../../etc/passwd" }), null);
  assert.equal(sanitizeRemoteProvider({ ...valid, name: "" }), null);
  assert.equal(sanitizeRemoteProvider({ ...valid, models: [] }), null);
  assert.equal(sanitizeRemoteProvider({ ...valid, models: [{ name: "no id" }] }), null);
  assert.equal(sanitizeRemoteProvider(null), null);
  assert.equal(sanitizeRemoteProvider("nope"), null);
  assert.equal(sanitizeRemoteProvider(["nope"]), null);
});

test("mergeCatalogProviders keeps static ids and appends runtime-only entries", () => {
  const { internals } = createApp();
  const staticProviders = STATIC_CATALOG.providers.slice();
  const merged = internals.mergeCatalogProviders(staticProviders, [
    { id: "static-a", name: "Hijacked A", baseUrl: "https://api.evil.example.com/v1", models: [{ id: "x" }] },
    { id: "runtime-c", name: "Runtime C", baseUrl: "https://api.c.example.com/v1", models: [{ id: "c-1" }] }
  ]);

  assert.deepEqual(
    merged.map((provider) => provider.id),
    ["static-a", "static-b", "runtime-c"]
  );
  assert.equal(merged[0].name, "Static A", "the reviewed static entry wins on id conflicts");
  assert.equal(merged[2].name, "Runtime C");
});

test("static catalog renders while the /api/providers request hangs", async () => {
  const app = createApp({ routes: (io) => staticRoutes({ "./api/providers": () => io.hang() }) });

  await app.settle();

  assert.deepEqual(cardIds(app), STATIC_RENDERED_IDS, "static providers must render before the runtime API answers");
  const runtimeCall = app.io.calls.find((call) => call.url.includes("api/providers"));
  assert.ok(runtimeCall, "the runtime catalog request must be issued");
  assert.ok(runtimeCall.options.signal, "the runtime request must carry an AbortSignal timeout");

  app.io.settleHangs();
  await app.settle();
  assert.deepEqual(cardIds(app), STATIC_RENDERED_IDS, "a late runtime failure must not disturb the static catalog");
});

test("a timed-out runtime request degrades to the static catalog", async () => {
  const app = createApp({ routes: (io) => staticRoutes({ "./api/providers": () => io.hang() }) });

  const result = await app.internals.fetchJsonWithTimeout("./api/providers", {}, 20);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "timeout");

  await app.settle();
  assert.deepEqual(cardIds(app), STATIC_RENDERED_IDS);

  app.io.settleHangs();
  await app.settle();
});

test("a failed or malformed runtime response degrades to the static catalog", async () => {
  const aborted = () => {
    const error = new Error("This operation was aborted");
    error.name = "AbortError";
    return Promise.reject(error);
  };
  const app = createApp({ routes: staticRoutes({ "./api/providers": aborted }) });

  await app.settle();
  assert.deepEqual(cardIds(app), STATIC_RENDERED_IDS);
  assert.equal(app.elements.get("providers").innerHTML, "", "no load error when only the runtime API fails");

  const malformed = createApp({
    routes: staticRoutes({ "./api/providers": () => brokenJsonResponse() })
  });
  assert.deepEqual([...(await malformed.internals.fetchRuntimeProviders())], []);

  const wrongShape = createApp({
    routes: staticRoutes({ "./api/providers": () => jsonResponse({ ok: true, providers: "nope" }) })
  });
  assert.deepEqual([...(await wrongShape.internals.fetchRuntimeProviders())], []);
});

test("valid runtime providers merge in after the static catalog, static ids first", async () => {
  const app = createApp({
    routes: staticRoutes({
      "./api/providers": () =>
        jsonResponse({
          ok: true,
          providers: [
            {
              id: "static-b",
              name: "Hijacked B",
              baseUrl: "https://api.evil.example.com/v1",
              homepage: "javascript:alert(1)",
              models: [{ id: "x-1" }]
            },
            {
              id: "runtime-c",
              name: "Runtime C",
              baseUrl: "https://api.c.example.com/v1",
              homepage: "https://c.example.com",
              consoleUrl: "https://c.example.com/keys",
              protocol: "openai-chat",
              models: [{ id: "c-1" }]
            },
            {
              id: "runtime-dirty",
              name: "Runtime Dirty",
              baseUrl: "http://api.plaintext.example.com/v1",
              models: [{ id: "d-1" }]
            }
          ]
        })
    })
  });

  await app.settle();

  assert.deepEqual(cardIds(app), [...STATIC_RENDERED_IDS, "runtime-c"]);
  const rendered = cards(app);
  assert.equal(rendered[0].name, "Static B", "the static entry keeps the conflicting id");
  assert.equal(rendered[2].homepage, "https://c.example.com");
  assert.equal(rendered[2].consoleUrl, "https://c.example.com/keys");
});

test("an unsafe URL in the static catalog never becomes a clickable link", async () => {
  const app = createApp({
    routes: staticRoutes({
      "./providers.json": () =>
        jsonResponse({
          providers: [
            {
              id: "static-evil",
              name: "Static Evil",
              protocol: "openai-chat",
              baseUrl: "https://api.evil.example.com/v1",
              homepage: "javascript:alert(1)",
              consoleUrl: "http://evil.example.com/keys",
              models: [{ id: "e-1" }]
            }
          ]
        })
    })
  });

  await app.settle();

  const [card] = cards(app);
  assert.equal(card.id, "static-evil");
  assert.equal(card.homepage, undefined, "no href may be assigned from a javascript: URL");
  assert.equal(card.consoleUrl, undefined, "no href may be assigned from a plaintext http URL");
  assert.equal(card.homepageRemoved, true, "the unsafe link is removed from the card");
});

test("a broken providers.json shows the load error instead of an empty catalog", async () => {
  const app = createApp({ routes: staticRoutes({ "./providers.json": () => brokenJsonResponse() }) });

  await app.settle();

  assert.match(app.elements.get("providers").innerHTML, /load-error/);
  assert.deepEqual(cardIds(app), []);
});

test("the shipped providers.json still renders every provider through the hardened path", async () => {
  const realCatalog = JSON.parse(readFileSync(new URL("../providers.json", import.meta.url), "utf8"));
  const app = createApp({
    routes: (io) =>
      staticRoutes({
        "./providers.json": () => jsonResponse(realCatalog),
        "./api/providers": () => io.hang()
      })
  });

  await app.settle();

  const rendered = cards(app);
  assert.equal(rendered.length, realCatalog.providers.length);
  assert.deepEqual(
    [...rendered.map((card) => card.id)].sort(),
    [...realCatalog.providers.map((provider) => provider.id)].sort()
  );
  for (const card of rendered) {
    for (const link of [card.homepage, card.consoleUrl]) {
      if (link !== undefined) assert.match(link, /^https:\/\//, `${card.id} must only link to https URLs`);
    }
  }

  app.io.settleHangs();
  await app.settle();
});

const SYSTEM_FAVICON = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
const LOBEHUB_ICON = (slug) =>
  `https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.0/icons/${slug}.svg`;

/** One static-catalog provider, so each icon case starts from a clean page render. */
function staticCatalogWith({ id, icon, homepage }) {
  return staticRoutes({
    "./providers.json": () =>
      jsonResponse({
        providers: [
          {
            id,
            name: id,
            icon,
            homepage,
            protocol: "openai-chat",
            baseUrl: "https://api.example.com/v1",
            models: [{ id: "m-1" }]
          }
        ]
      })
  });
}

test("unsafe icons never reach the card or modal img src (static catalog)", async () => {
  const cases = [
    {
      id: "icon-protocol-relative",
      icon: "//evil.example.com/icon.svg",
      homepage: "https://icon-protocol-relative.example.com",
      expected: SYSTEM_FAVICON("icon-protocol-relative.example.com"),
      unsafe: true
    },
    {
      id: "icon-javascript",
      icon: "javascript:alert(1)",
      homepage: "https://icon-javascript.example.com",
      expected: SYSTEM_FAVICON("icon-javascript.example.com"),
      unsafe: true
    },
    // No homepage: there is no safe fallback either, so the img must stay empty and hidden.
    { id: "icon-data", icon: "data:image/svg+xml,<svg onload=alert(1)>", expected: undefined, unsafe: true },
    { id: "icon-http", icon: "http://evil.example.com/icon.svg", expected: undefined, unsafe: true },
    // Positive controls: https URLs and lobehub slugs are still rendered.
    { id: "icon-slug", icon: "openai", expected: LOBEHUB_ICON("openai") },
    { id: "icon-https", icon: "https://cdn.example.com/icon.svg", expected: "https://cdn.example.com/icon.svg" }
  ];

  for (const testCase of cases) {
    const app = createApp({ routes: staticCatalogWith(testCase) });
    await app.settle();

    const [card] = cardNodes(app);
    assert.equal(card.dataset.providerId, testCase.id);

    const cardIcon = card.querySelector(".card-icon");
    assert.equal(cardIcon.src, testCase.expected, `${testCase.id}: card img src`);
    assert.equal(cardIcon.hidden, testCase.expected === undefined, `${testCase.id}: card img hidden without a safe src`);

    openDetail(card);
    const icon = modalIcon(app);
    assert.equal(icon.src, testCase.expected, `${testCase.id}: modal img src`);
    assert.equal(icon.hidden, testCase.expected === undefined, `${testCase.id}: modal img hidden without a safe src`);

    if (testCase.unsafe) {
      assert.ok(
        cardIcon.src === undefined || !cardIcon.src.includes(testCase.icon),
        `${testCase.id}: the raw icon value must never be used as an asset URL`
      );
      assert.ok(
        icon.src === undefined || !icon.src.includes(testCase.icon),
        `${testCase.id}: the raw icon value must never reach the modal`
      );
    }
  }
});

test("unsafe icons from /api/providers are cleared before the card or modal img src", async () => {
  const unsafeIcons = [
    ["runtime-protocol-relative", "//evil.example.com/icon.svg"],
    ["runtime-javascript", "javascript:alert(1)"],
    ["runtime-data", "data:image/svg+xml,<svg onload=alert(1)>"],
    ["runtime-http", "http://evil.example.com/icon.svg"]
  ];
  const app = createApp({
    routes: staticRoutes({
      "./api/providers": () =>
        jsonResponse({
          ok: true,
          providers: [
            ...unsafeIcons.map(([id, icon]) => ({
              id,
              name: id,
              baseUrl: `https://api.${id}.example.com/v1`,
              icon,
              models: [{ id: "m-1" }]
            })),
            { id: "runtime-slug", name: "Runtime Slug", baseUrl: "https://api.runtime-slug.example.com/v1", icon: "openai", models: [{ id: "m-1" }] }
          ]
        })
    })
  });

  await app.settle();

  const nodes = cardNodes(app);
  const byId = Object.fromEntries(nodes.map((card) => [card.dataset.providerId, card]));

  for (const [id, icon] of unsafeIcons) {
    const card = byId[id];
    assert.ok(card, `${id} must still render, just without an icon`);
    const cardIcon = card.querySelector(".card-icon");
    assert.equal(cardIcon.src, undefined, `${id}: no src may be set`);
    assert.equal(cardIcon.hidden, true, `${id}: the img must stay hidden`);

    openDetail(card);
    const icon2 = modalIcon(app);
    assert.equal(icon2.src, undefined, `${id}: no modal src may be set`);
    assert.equal(icon2.hidden, true, `${id}: the modal img must stay hidden`);
  }

  const slugCard = byId["runtime-slug"];
  assert.equal(slugCard.querySelector(".card-icon").src, LOBEHUB_ICON("openai"));
  openDetail(slugCard);
  assert.equal(modalIcon(app).src, LOBEHUB_ICON("openai"));
});

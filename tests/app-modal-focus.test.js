/**
 * Keyboard a11y of the provider detail modal:
 *  - background siblings become inert while the modal is open, and only the nodes
 *    app.js locked itself are unlocked again on close
 *  - Tab / Shift+Tab wrap inside the modal and pull stray focus back in
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { StubElement, createApp, jsonResponse } from "./helpers/dom-stub.mjs";

const CATALOG = {
  updatedAt: "2026-01-01",
  providers: [
    {
      id: "focus-a",
      name: "Focus A",
      protocol: "openai-chat",
      baseUrl: "https://api.a.example.com/v1",
      homepage: "https://a.example.com",
      consoleUrl: "https://a.example.com/keys",
      models: [{ id: "a-1" }],
      region: "global"
    }
  ]
};

function routes() {
  return {
    "./providers.json": () => jsonResponse(CATALOG),
    "/api/summary": () => jsonResponse({ ok: true, summary: {} })
  };
}

async function loadApp() {
  const app = createApp({ routes: routes() });
  await app.settle();
  return app;
}

async function openModal(app) {
  const card = app.elements.get("providers").children[0];
  assert.ok(card, "the catalog must render at least one card");
  const button = card.querySelector(".open-detail-btn");
  assert.ok(button.listeners.click && button.listeners.click.length > 0, "the card must expose an open-detail button");
  button.listeners.click[0]({ stopPropagation() {} });
  await app.settle();
  const modal = app.document.getElementById("detail-modal");
  assert.equal(modal.hidden, false, "the detail modal must be open");
  return modal;
}

function keyEvent(key, shiftKey = false) {
  return {
    key,
    shiftKey,
    target: null,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {}
  };
}

function press(app, key, shiftKey = false) {
  const event = keyEvent(key, shiftKey);
  app.dispatchWindow("keydown", event);
  return event;
}

async function pressEscape(app) {
  press(app, "Escape");
  await app.settle();
}

function isInert(node) {
  return node.inert === true && node.hasAttribute("inert");
}

// Three real focus targets plus a hidden trailing button that must be skipped.
function installFocusables(modal) {
  const first = new StubElement("button");
  const middle = new StubElement("a");
  const last = new StubElement("button");
  const hiddenTail = new StubElement("button");
  hiddenTail.hidden = true;
  const all = [first, middle, last, hiddenTail];
  all.forEach((el) => modal.appendChild(el));
  modal.queryAllHandler = (selector) => (String(selector).includes("[tabindex]") ? all : []);
  return { first, middle, last };
}

test("opening the detail modal makes background siblings inert; closing unlocks them", async () => {
  const app = await loadApp();
  const { hero, main, script } = app.layout;
  const modal = await openModal(app);

  assert.equal(isInert(hero), true, "header must be inert while the modal is open");
  assert.equal(isInert(main), true, "main must be inert while the modal is open");
  assert.equal(isInert(script), false, "script tags are skipped");
  assert.equal(isInert(modal), false, "the modal itself must stay interactive");

  await pressEscape(app);
  assert.equal(modal.hidden, true, "Escape must close the modal");
  assert.equal(isInert(hero), false, "header must be unlocked after close");
  assert.equal(isInert(main), false, "main must be unlocked after close");
  assert.equal(hero.hasAttribute("inert"), false, "the inert attribute must be removed too");

  await openModal(app);
  assert.equal(isInert(hero), true, "reopening must lock the background again");
  await pressEscape(app);
  assert.equal(isInert(hero), false, "and unlock it again on the second close");
});

test("closing the modal keeps inert that was on the page before it opened", async () => {
  const app = await loadApp();
  const { hero, main } = app.layout;
  main.inert = true;
  main.setAttribute("inert", "");

  await openModal(app);
  await pressEscape(app);

  assert.equal(isInert(main), true, "pre-existing inert must survive the modal closing");
  assert.equal(isInert(hero), false, "nodes app.js locked are still unlocked");
});

test("Tab and Shift+Tab wrap inside the open modal and skip hidden items", async () => {
  const app = await loadApp();
  const modal = await openModal(app);
  const { first, middle, last } = installFocusables(modal);

  last.focus();
  let event = press(app, "Tab");
  assert.equal(app.document.activeElement, first, "Tab on the last visible item wraps to the first");
  assert.equal(event.defaultPrevented, true);

  first.focus();
  event = press(app, "Tab", true);
  assert.equal(app.document.activeElement, last, "Shift+Tab on the first item wraps to the last visible one");
  assert.equal(event.defaultPrevented, true);

  middle.focus();
  event = press(app, "Tab");
  assert.equal(event.defaultPrevented, false, "Tab in the middle is left to the browser");
  assert.equal(app.document.activeElement, middle);
});

test("Tab pulls focus that escaped the modal back inside", async () => {
  const app = await loadApp();
  const modal = await openModal(app);
  const { first, last } = installFocusables(modal);

  app.layout.hero.focus();
  let event = press(app, "Tab");
  assert.equal(app.document.activeElement, first, "Tab from outside lands on the first item");
  assert.equal(event.defaultPrevented, true);

  app.layout.hero.focus();
  event = press(app, "Tab", true);
  assert.equal(app.document.activeElement, last, "Shift+Tab from outside lands on the last item");
  assert.equal(event.defaultPrevented, true);
});

test("Tab is not intercepted once the modal is closed", async () => {
  const app = await loadApp();
  const modal = await openModal(app);
  installFocusables(modal);
  await pressEscape(app);

  app.layout.hero.focus();
  const event = press(app, "Tab");
  assert.equal(event.defaultPrevented, false, "a closed modal must not trap focus");
  assert.equal(app.document.activeElement, app.layout.hero);
});

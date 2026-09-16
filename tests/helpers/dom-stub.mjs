/**
 * Minimal DOM + fetch stand-ins so the real app.js can run under node:vm without a
 * browser. querySelector()/getElementById() hand out stable, auto-created stubs, so
 * the production render code paths run unchanged without mirroring index.html here.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const APP_SOURCE = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

class StubClassList {
  constructor() {
    this._names = new Set();
  }
  add(...names) {
    names.forEach((name) => this._names.add(name));
  }
  remove(...names) {
    names.forEach((name) => this._names.delete(name));
  }
  contains(name) {
    return this._names.has(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this._names.has(name) : Boolean(force);
    if (on) this._names.add(name);
    else this._names.delete(name);
    return on;
  }
}

export class StubElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.classList = new StubClassList();
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.removed = false;
    this.onclick = null;
    this.onerror = null;
    this._text = "";
    this._html = "";
    this._queries = new Map();
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  get textContent() {
    return this._text;
  }
  set textContent(value) {
    this._text = String(value);
    this.children.length = 0;
  }

  get innerHTML() {
    return this._html;
  }
  set innerHTML(value) {
    this._html = String(value);
    this.children.length = 0;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  remove() {
    this.removed = true;
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  cloneNode() {
    return new StubElement(this.tagName);
  }

  // Stable per-node, per-selector stub: render code can write into it and the test
  // can read the same object back afterwards.
  querySelector(selector) {
    if (!this._queries.has(selector)) this._queries.set(selector, new StubElement("div"));
    return this._queries.get(selector);
  }

  querySelectorAll() {
    return [];
  }
}

function createDocument(elements) {
  const byId = elements || new Map();
  return {
    documentElement: new StubElement("html"),
    body: new StubElement("body"),
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, new StubElement("div"));
      return byId.get(id);
    },
    createElement(tagName) {
      return new StubElement(tagName);
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {}
  };
}

export function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

/** A response whose body is not valid JSON, to exercise the invalid_json branch. */
export function brokenJsonResponse(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    }
  };
}

/**
 * Route table keyed by URL substring. Each route is a function (url, options) that
 * returns a Response-like object. Requests without a matching route answer 404.
 * Pending requests reject when their AbortSignal fires, like real fetch does.
 */
export function createFetchMock(initialRoutes = {}) {
  const calls = [];
  const hangs = [];
  let routes = initialRoutes;

  function hang() {
    return new Promise((resolve) => {
      hangs.push(() => resolve(jsonResponse({ ok: false }, 504)));
    });
  }

  function abortError() {
    const error = new Error("This operation was aborted");
    error.name = "AbortError";
    return error;
  }

  function watchAbort(result, signal) {
    if (!signal) return Promise.resolve(result);
    return Promise.race([
      Promise.resolve(result),
      new Promise((resolve, reject) => {
        if (signal.aborted) reject(abortError());
        else signal.addEventListener("abort", () => reject(abortError()), { once: true });
      })
    ]);
  }

  function fetchImpl(url, options = {}) {
    const target = String(url);
    calls.push({ url: target, options });
    const route = Object.keys(routes).find((key) => target.includes(key));
    if (!route) return Promise.resolve(jsonResponse({ ok: false, error: "not_found" }, 404));
    return watchAbort(routes[route](target, options), options.signal);
  }

  return {
    fetch: fetchImpl,
    calls,
    hang,
    setRoutes(next) {
      routes = next || {};
    },
    urls: () => calls.map((call) => call.url),
    settleHangs: () => {
      const pending = hangs.splice(0, hangs.length);
      pending.forEach((resolve) => resolve());
    }
  };
}

/**
 * Loads app.js in a sandbox and returns test handles. `routes` may be a route table
 * or a function receiving the fetch mock (useful to answer with `io.hang()`).
 */
export function createApp({ routes = {} } = {}) {
  const io = createFetchMock();
  io.setRoutes(typeof routes === "function" ? routes(io) : routes);
  const elements = new Map();

  const template = new StubElement("template");
  template.content = { firstElementChild: new StubElement("article") };
  elements.set("provider-card", template);

  const document = createDocument(elements);

  const sandbox = {
    __freebieTestMode: true,
    console: { log() {}, warn() {}, error() {} },
    document,
    navigator: { language: "en" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search: "", hash: "", pathname: "/", href: "https://freebie.test/", replace() {} },
    history: { replaceState() {} },
    fetch: io.fetch,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    alert() {},
    addEventListener() {},
    FreeBuddyBridge: {
      embedded: false,
      onState: () => () => {},
      connect: () => Promise.reject(new Error("not-embedded")),
      importAgent: async () => ({ ok: true }),
      openExternal() {},
      submitReview: async () => ({ ok: true }),
      submitVote: async () => ({ ok: true }),
      refreshState() {}
    }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.parent = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(APP_SOURCE, sandbox, { filename: "app.js" });

  const internals = sandbox.__freebieInternals;
  const settle = async (rounds = 4) => {
    for (let i = 0; i < rounds; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  return { internals, io, elements, document, settle };
}

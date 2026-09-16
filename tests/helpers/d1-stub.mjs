/**
 * Shared D1 test doubles for the Worker API / migration / sync tests.
 *
 * `node:sqlite` is built into Node (>= 22.13), so a real in-memory database can be wired
 * up as a D1 binding without adding any dependency: the bridge only implements the
 * subset of the D1 API the Worker uses (`prepare().bind().all()/first()/run()`).
 */
import worker from "../../worker.js";

/** Wraps a node:sqlite DatabaseSync so it looks like a D1 binding. */
export function createD1(sqlite) {
  return {
    prepare(sql) {
      return {
        _params: [],
        bind(...params) {
          this._params = params;
          return this;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...this._params) };
        },
        async first() {
          return sqlite.prepare(sql).get(...this._params) ?? null;
        },
        async run() {
          sqlite.prepare(sql).run(...this._params);
          return { success: true };
        }
      };
    }
  };
}

/** Runs the real Worker fetch handler against an in-memory database. */
export async function fetchApi(sqlite, path, init) {
  const request = new Request(`https://freebie.test${path}`, init);
  const response = await worker.fetch(request, { DB: createD1(sqlite) });
  return { response, body: await response.json() };
}

/** GET /api/providers — the public runtime catalog. */
export function requestProviders(sqlite) {
  return fetchApi(sqlite, "/api/providers");
}

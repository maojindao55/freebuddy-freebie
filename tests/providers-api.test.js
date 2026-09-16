/**
 * Runtime provider catalog API tests (worker.js + schema.sql).
 *
 * Runs the real Worker fetch handler against an in-memory SQLite database wired up
 * as a D1 binding (node:sqlite is built into Node, so no dependencies are added).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import { requestProviders } from "./helpers/d1-stub.mjs";

const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const MIGRATION = readFileSync(new URL("../migrations/0001_providers_constraints.sql", import.meta.url), "utf8");

const BASE_ROW = {
  id: "runtime-alpha",
  name: "Runtime Alpha",
  icon: "openai",
  region: "global",
  homepage: "https://alpha.example.com",
  console_url: "https://alpha.example.com/console",
  free_tier_summary: JSON.stringify({ en: "Free tier for new accounts" }),
  protocol: "openai-chat",
  protocols: JSON.stringify(["openai-chat"]),
  base_url: "https://api.alpha.example.com/v1",
  env_key: "ALPHA_API_KEY",
  models: JSON.stringify([{ id: "alpha-1", name: "Alpha 1" }]),
  context_window: 8192,
  verified_at: "2026-01-05",
  status: "approved",
  submitted_by: "test",
  created_at: 1,
  updated_at: 2
};

/** Simulates the legacy/loose table shape dirty admin imports could still write to. */
const LOOSE_TABLE_SQL = `CREATE TABLE providers (
  id TEXT PRIMARY KEY, name TEXT, icon TEXT, region TEXT, homepage TEXT, console_url TEXT,
  free_tier_summary TEXT, protocol TEXT, protocols TEXT, base_url TEXT, env_key TEXT,
  models TEXT, context_window INTEGER, verified_at TEXT, status TEXT, submitted_by TEXT,
  created_at INTEGER, updated_at INTEGER
);`;

function insertProvider(sqlite, overrides = {}) {
  const row = { ...BASE_ROW, ...overrides };
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  sqlite
    .prepare(`INSERT INTO providers (${columns.join(", ")}) VALUES (${placeholders})`)
    .run(...columns.map((column) => row[column]));
  return row;
}

function migratedDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  return sqlite;
}

/** A database that still has the old, constraint-free providers table. */
function legacyDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(LOOSE_TABLE_SQL);
  return sqlite;
}

function tableNames(sqlite) {
  return sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name);
}

/**
 * Runs the migration only up to the comment marking an interruption window, i.e. what the database
 * looks like when `wrangler d1 execute --file` (or the network) dies at that point.
 */
function migrateThrough(sqlite, marker) {
  const index = MIGRATION.indexOf(marker);
  assert.ok(index > 0, `migration must keep the "${marker}" interruption-window marker`);
  sqlite.exec(MIGRATION.slice(0, index));
}

test("schema.sql CHECK constraints reject unsafe or unusable provider rows", () => {
  const sqlite = migratedDatabase();

  // A clean approved row is accepted, and so is an explicitly decommissioned one.
  insertProvider(sqlite);
  insertProvider(sqlite, { id: "disabled-one", status: "disabled", base_url: "https://api.disabled.example.com/v1" });

  const invalidRows = [
    ["non-https base_url", { id: "bad-base-url", base_url: "http://api.alpha.example.com/v1" }],
    ["javascript homepage", { id: "bad-homepage", homepage: "javascript:alert(1)" }],
    ["http console_url", { id: "bad-console", console_url: "http://alpha.example.com/console" }],
    ["empty models", { id: "bad-empty-models", models: "[]" }],
    ["malformed models JSON", { id: "bad-models-json", models: "{oops" }],
    ["invalid id characters", { id: "Alpha/Runtime" }],
    ["blank name", { id: "bad-name", name: "   " }],
    ["unknown protocol", { id: "bad-protocol", protocol: "grpc" }],
    ["unknown status", { id: "bad-status", status: "maybe" }]
  ];

  for (const [label, overrides] of invalidRows) {
    assert.throws(
      () => insertProvider(sqlite, overrides),
      /CHECK constraint failed/,
      `expected the database to reject ${label}`
    );
  }
});

test("GET /api/providers returns approved rows only, in camelCase", async () => {
  const sqlite = migratedDatabase();
  insertProvider(sqlite, { id: "approved-one", status: "approved", updated_at: 30 });
  insertProvider(sqlite, { id: "pending-one", status: "pending", base_url: "https://api.pending.example.com/v1" });
  insertProvider(sqlite, { id: "rejected-one", status: "rejected", base_url: "https://api.rejected.example.com/v1" });
  insertProvider(sqlite, { id: "disabled-one", status: "disabled", base_url: "https://api.disabled.example.com/v1" });

  const { response, body } = await requestProviders(sqlite);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(
    body.providers.map((provider) => provider.id),
    ["approved-one"]
  );

  const provider = body.providers[0];
  assert.equal(provider.name, BASE_ROW.name);
  assert.equal(provider.baseUrl, BASE_ROW.base_url);
  assert.equal(provider.consoleUrl, BASE_ROW.console_url);
  assert.equal(provider.homepage, BASE_ROW.homepage);
  assert.equal(provider.protocol, "openai-chat");
  assert.deepEqual(provider.protocols, ["openai-chat"]);
  assert.deepEqual(provider.models, [{ id: "alpha-1", name: "Alpha 1" }]);
  assert.equal(provider.contextWindow, 8192);
  assert.equal(provider.verifiedAt, "2026-01-05");
  assert.deepEqual(provider.freeTierSummary, { en: "Free tier for new accounts" });
});

test("app layer clears unsafe URLs and drops unusable rows from a dirty database", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(LOOSE_TABLE_SQL);

  insertProvider(sqlite, { id: "clean-provider" });
  insertProvider(sqlite, {
    id: "unsafe-links",
    homepage: "javascript:alert(document.cookie)",
    console_url: "http://insecure.example.com/keys",
    base_url: "https://api.unsafe-links.example.com/v1"
  });
  insertProvider(sqlite, {
    id: "unsafe-icon",
    icon: "//evil.example.com/icon.svg",
    base_url: "https://api.unsafe-icon.example.com/v1"
  });
  insertProvider(sqlite, { id: "unsafe-base-url", base_url: "http://api.plaintext.example.com/v1" });
  insertProvider(sqlite, { id: "no-models", models: "[]", base_url: "https://api.no-models.example.com/v1" });
  insertProvider(sqlite, { id: "broken-models", models: "{not json", base_url: "https://api.broken-models.example.com/v1" });
  insertProvider(sqlite, { id: "../etc/passwd", base_url: "https://api.bad-id.example.com/v1" });
  insertProvider(sqlite, { id: "", name: "", base_url: null });
  insertProvider(sqlite, {
    id: "broken-summary",
    free_tier_summary: "not json at all",
    base_url: "https://api.broken-summary.example.com/v1"
  });

  const { response, body } = await requestProviders(sqlite);

  assert.equal(response.status, 200);
  // ORDER BY updated_at DESC, id ASC (all rows share the same updated_at here).
  assert.deepEqual(
    body.providers.map((provider) => provider.id),
    ["broken-summary", "clean-provider", "unsafe-icon", "unsafe-links"]
  );

  const byId = Object.fromEntries(body.providers.map((provider) => [provider.id, provider]));
  assert.equal(byId["unsafe-links"].homepage, undefined, "unsafe homepage must be cleared");
  assert.equal(byId["unsafe-links"].consoleUrl, undefined, "unsafe consoleUrl must be cleared");
  assert.equal(byId["unsafe-icon"].icon, undefined, "protocol-relative icon must be cleared");
  assert.equal(byId["broken-summary"].freeTierSummary, undefined, "unparsable JSON must degrade silently");
  assert.equal(byId["clean-provider"].homepage, BASE_ROW.homepage, "valid rows keep their links");

  const payload = JSON.stringify(body);
  assert.ok(!payload.includes("javascript:"), "no javascript: URL may leave the API");
  assert.ok(!payload.includes("http://"), "no plaintext http URL may leave the API");
  assert.ok(!payload.includes("evil.example.com"), "no protocol-relative host may leave the API");
});

test("missing providers table degrades to an empty list instead of failing", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const { response, body } = await requestProviders(sqlite);

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, providers: [] });
});

test("migration keeps conforming legacy providers, quarantines the rest, and installs the constraints", async () => {
  const sqlite = legacyDatabase();

  insertProvider(sqlite);
  insertProvider(sqlite, {
    id: "pending-one",
    status: "pending",
    base_url: "https://api.pending.example.com/v1",
    updated_at: 5
  });

  // Every row below is rejected by exactly one of the new CHECK constraints.
  const rejects = [
    ["bad-icon-protocol-relative", { icon: "//evil.example.com/icon.svg" }, "icon"],
    ["bad-icon-javascript", { icon: "javascript:alert(1)" }, "icon"],
    ["bad-icon-data", { icon: "data:image/svg+xml,<svg/>" }, "icon"],
    ["bad-icon-http", { icon: "http://evil.example.com/icon.svg" }, "icon"],
    ["bad-summary-json", { free_tier_summary: "not json at all" }, "free_tier_summary"],
    ["bad-models-json", { models: "{oops" }, "models"],
    ["bad-models-empty", { models: "[]" }, "models"],
    ["bad-base-url", { base_url: "http://api.plain.example.com/v1" }, "base_url"],
    ["bad-status", { status: "maybe" }, "status"],
    ["bad-verified-at", { verified_at: "2026/01/05" }, "verified_at"],
    ["bad-context-window", { context_window: -1 }, "context_window"],
    ["bad-region", { region: "eu" }, "region"],
    ["bad-name", { name: "   " }, "name"],
    ["Bad-Upper-Id", {}, "id"],
    ["bad-created-at", { created_at: null }, "created_at"]
  ];
  for (const [id, overrides] of rejects) insertProvider(sqlite, { id, ...overrides });

  const legacyCount = sqlite.prepare("SELECT COUNT(*) AS c FROM providers").get().c;
  assert.equal(legacyCount, 2 + rejects.length);

  sqlite.exec(MIGRATION);

  // Conforming rows survive verbatim, statuses (approved included) unchanged.
  const kept = sqlite.prepare("SELECT * FROM providers ORDER BY id").all();
  assert.deepEqual(kept.map((row) => row.id), ["pending-one", "runtime-alpha"]);
  const approved = kept.find((row) => row.id === "runtime-alpha");
  assert.equal(approved.status, "approved");
  for (const column of Object.keys(BASE_ROW)) {
    assert.deepEqual(approved[column], BASE_ROW[column], `runtime-alpha.${column} must be copied unchanged`);
  }

  // Rows that cannot satisfy the new constraints are quarantined with a reason, never dropped.
  const quarantined = Object.fromEntries(
    sqlite
      .prepare("SELECT id, failed_checks FROM providers_quarantine")
      .all()
      .map((row) => [row.id, row.failed_checks])
  );
  assert.deepEqual(Object.keys(quarantined).sort(), rejects.map(([id]) => id).sort());
  for (const [id, , failedCheck] of rejects) {
    assert.equal(quarantined[id], failedCheck, `${id} must record why it was quarantined`);
  }
  assert.equal(kept.length + Object.keys(quarantined).length, legacyCount, "no legacy row may disappear");

  // Only the audit table is left behind besides the rebuilt providers table.
  assert.deepEqual(
    tableNames(sqlite)
      .filter((name) => name === "providers" || name.startsWith("providers_"))
      .sort(),
    ["providers", "providers_quarantine"]
  );
  assert.ok(
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_providers_status'").get(),
    "idx_providers_status must be rebuilt"
  );

  // The migrated table now really enforces the constraints.
  assert.throws(
    () => insertProvider(sqlite, { id: "post-migration-http", base_url: "http://api.plain.example.com/v1" }),
    /CHECK constraint failed/
  );

  // The runtime API serves the migrated approved row.
  const { body } = await requestProviders(sqlite);
  assert.deepEqual(
    body.providers.map((provider) => provider.id),
    ["runtime-alpha"]
  );

  // Re-running the migration is safe and does not duplicate the audit trail.
  sqlite.exec(MIGRATION);
  assert.deepEqual(
    sqlite.prepare("SELECT id FROM providers ORDER BY id").all().map((row) => row.id),
    ["pending-one", "runtime-alpha"]
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers_quarantine").get().c, rejects.length);
  assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT run_id) AS c FROM providers_quarantine").get().c, 1);
});

test("an interrupted migration aborts without losing the copied rows and can be recovered", () => {
  const sqlite = legacyDatabase();
  insertProvider(sqlite);

  // Reproduce the only dangerous window: everything up to (and including) dropping the old table ran.
  const throughDrop = MIGRATION.slice(0, MIGRATION.indexOf("DROP TABLE providers;") + "DROP TABLE providers;".length);
  sqlite.exec(throughDrop);

  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'providers'").get().c,
    0
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers_new").get().c, 1, "the copied row must still exist");

  assert.throws(
    () => sqlite.exec(MIGRATION),
    /CHECK constraint failed/,
    "a rerun must abort while providers_new holds the only copy"
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS c FROM providers_new").get().c,
    1,
    "the aborted rerun must not discard the copied rows"
  );

  // Documented recovery in migrations/0001_providers_constraints.sql, then the migration can be re-run.
  sqlite.exec("ALTER TABLE providers_new RENAME TO providers");
  sqlite.exec(MIGRATION);

  assert.deepEqual(
    sqlite.prepare("SELECT id, status FROM providers").all().map((row) => [row.id, row.status]),
    [["runtime-alpha", "approved"]]
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers_quarantine").get().c, 0);
});

test("a retry after an interruption right after the quarantine insert neither fails nor duplicates audit rows", () => {
  const sqlite = legacyDatabase();

  insertProvider(sqlite);
  insertProvider(sqlite, {
    id: "pending-one",
    status: "pending",
    base_url: "https://api.pending.example.com/v1",
    updated_at: 5
  });
  const rejects = ["Bad-Upper-Id", "bad-status"];
  insertProvider(sqlite, { id: "Bad-Upper-Id" });
  insertProvider(sqlite, { id: "bad-status", status: "maybe" });

  // Simulate `wrangler d1 execute --file` dying right after the audit rows were written: D1 has no
  // explicit transactions, so this window is real and must survive a plain retry of the same file.
  migrateThrough(sqlite, "-- [中断窗口 W2]");

  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers").get().c, 2 + rejects.length);
  assert.deepEqual(
    sqlite
      .prepare("SELECT id, run_id FROM providers_quarantine ORDER BY legacy_rowid")
      .all()
      .map((row) => [row.id, row.run_id]),
    [["Bad-Upper-Id", 1], ["bad-status", 1]],
    "the interrupted attempt already recorded both rejects"
  );

  // The operator retries the very same file — this used to fail on the providers_quarantine primary key.
  sqlite.exec(MIGRATION);

  assert.deepEqual(
    sqlite.prepare("SELECT id FROM providers ORDER BY id").all().map((row) => row.id),
    ["pending-one", "runtime-alpha"]
  );
  const audited = sqlite
    .prepare("SELECT legacy_rowid, run_id, id, failed_checks FROM providers_quarantine ORDER BY legacy_rowid")
    .all();
  assert.deepEqual(audited.map((row) => row.id), ["Bad-Upper-Id", "bad-status"], "one audit row per legacy row");
  assert.deepEqual(audited.map((row) => row.failed_checks), ["id", "status"]);
  assert.equal(new Set(audited.map((row) => row.run_id)).size, 1, "the retry refreshes every audit row to its own run");

  // The retry still installs the constraints and leaves no scratch table behind.
  assert.throws(
    () => insertProvider(sqlite, { id: "post-migration-http", base_url: "http://api.plain.example.com/v1" }),
    /CHECK constraint failed/
  );
  assert.deepEqual(
    tableNames(sqlite)
      .filter((name) => name === "providers" || name.startsWith("providers_"))
      .sort(),
    ["providers", "providers_quarantine"]
  );

  // A rerun after success must not add audit rows either.
  sqlite.exec(MIGRATION);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers_quarantine").get().c, rejects.length);
});

test("a retry after an interruption between copying rows and quarantining is safe", () => {
  const sqlite = legacyDatabase();
  insertProvider(sqlite);
  insertProvider(sqlite, { id: "bad-status", status: "maybe" });

  migrateThrough(sqlite, "-- [中断窗口 W1]");

  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers").get().c, 2, "the source table is untouched");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers_new").get().c, 1, "only the derived copy exists");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers_quarantine").get().c, 0);

  sqlite.exec(MIGRATION);

  assert.deepEqual(
    sqlite.prepare("SELECT id FROM providers ORDER BY id").all().map((row) => row.id),
    ["runtime-alpha"]
  );
  assert.deepEqual(
    sqlite.prepare("SELECT id FROM providers_quarantine").all().map((row) => row.id),
    ["bad-status"]
  );
});

test("the migration also builds the constrained providers table on a fresh database", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(MIGRATION);
  // schema.sql must stay usable for fresh installs and must not clobber the migrated table.
  sqlite.exec(SCHEMA);

  assert.deepEqual(tableNames(sqlite).sort(), ["providers", "providers_quarantine", "reviews", "votes"]);
  insertProvider(sqlite);
  assert.throws(
    () => insertProvider(sqlite, { id: "fresh-http", base_url: "http://api.plain.example.com/v1" }),
    /CHECK constraint failed/
  );
});

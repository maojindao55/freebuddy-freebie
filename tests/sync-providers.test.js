/**
 * Provider declaration sync tests (scripts/sync-providers.mjs + migrations/0002).
 *
 * Covers the "merge a PR -> D1 upsert" pipeline end to end: the CLI is spawned for real,
 * the SQL it emits is applied to an in-memory node:sqlite database, and the result is read
 * back through the Worker's GET /api/providers handler.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { fetchApi, requestProviders } from "./helpers/d1-stub.mjs";

const SYNC_SCRIPT = fileURLToPath(new URL("../scripts/sync-providers.mjs", import.meta.url));
const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const MIGRATION_0001 = readFileSync(new URL("../migrations/0001_providers_constraints.sql", import.meta.url), "utf8");
const MIGRATION_0002 = readFileSync(
  new URL("../migrations/0002_providers_status_disabled.sql", import.meta.url),
  "utf8"
);

/** A valid, complete declaration — every test only overrides what it is about. */
const BASE_DECLARATION = {
  id: "alpha-provider",
  name: "Alpha Provider",
  icon: "openai",
  region: "global",
  homepage: "https://alpha.example.com",
  consoleUrl: "https://alpha.example.com/console",
  freeTierSummary: { en: "Free tier for new accounts" },
  protocol: "openai-chat",
  protocols: ["openai-chat"],
  baseUrl: "https://api.alpha.example.com/v1",
  envKey: "ALPHA_API_KEY",
  models: [{ id: "alpha-1", name: "Alpha 1", contextWindow: 8192 }],
  verifiedAt: "2026-09-16",
  status: "approved",
  submittedBy: "alice"
};

/** Row shape used to seed the legacy (constraint-free) providers table. */
const LEGACY_ROW = {
  id: "legacy-alpha",
  name: "Legacy Alpha",
  icon: "openai",
  region: "global",
  homepage: "https://legacy.example.com",
  console_url: "https://legacy.example.com/console",
  free_tier_summary: JSON.stringify({ en: "Free tier" }),
  protocol: "openai-chat",
  protocols: JSON.stringify(["openai-chat"]),
  base_url: "https://api.legacy.example.com/v1",
  env_key: "LEGACY_API_KEY",
  models: JSON.stringify([{ id: "legacy-1" }]),
  context_window: 4096,
  verified_at: "2026-01-05",
  status: "approved",
  submitted_by: "legacy",
  created_at: 1,
  updated_at: 2
};

const LOOSE_TABLE_SQL = `CREATE TABLE providers (
  id TEXT PRIMARY KEY, name TEXT, icon TEXT, region TEXT, homepage TEXT, console_url TEXT,
  free_tier_summary TEXT, protocol TEXT, protocols TEXT, base_url TEXT, env_key TEXT,
  models TEXT, context_window INTEGER, verified_at TEXT, status TEXT, submitted_by TEXT,
  created_at INTEGER, updated_at INTEGER
);`;

function insertRow(sqlite, overrides = {}) {
  const row = { ...LEGACY_ROW, ...overrides };
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

function legacyDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(LOOSE_TABLE_SQL);
  return sqlite;
}

/** Runs the sync CLI the same way the GitHub Action does. */
function runSync(args) {
  const result = spawnSync(process.execPath, [SYNC_SCRIPT, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function makeDeclarationDir(t) {
  const dir = join(mkdtempSync(join(tmpdir(), "freebuddy-declarations-")), "providers");
  mkdirSync(dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeDeclaration(dir, name, declaration) {
  writeFileSync(join(dir, name), `${JSON.stringify(declaration, null, 2)}\n`);
}

function writeDeclarations(t, declarations) {
  const dir = makeDeclarationDir(t);
  for (const [name, declaration] of Object.entries(declarations)) {
    if (typeof declaration === "string") writeFileSync(join(dir, name), declaration);
    else writeDeclaration(dir, name, declaration);
  }
  return dir;
}

test("an approved declaration becomes a deterministic, idempotent upsert", (t) => {
  const dir = writeDeclarations(t, { "alpha-provider.json": BASE_DECLARATION });

  const first = runSync(["--dir", dir, "--out", join(dir, "first.sql")]);
  const second = runSync(["--dir", dir, "--out", join(dir, "second.sql")]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);

  const sql = readFileSync(join(dir, "first.sql"), "utf8");
  assert.equal(sql, readFileSync(join(dir, "second.sql"), "utf8"), "same input must produce byte-identical SQL");
  assert.match(sql, /INSERT INTO providers \(id, name, [^)]*submitted_by, created_at, updated_at\)/);
  assert.match(sql, /ON CONFLICT\(id\) DO UPDATE SET\n/);
  assert.ok(sql.includes("'alpha-provider', 'Alpha Provider', 'openai', 'global'"));
  assert.ok(
    sql.includes("CAST(strftime('%s', 'now') AS INTEGER) * 1000"),
    "timestamps must be evaluated by SQLite at execution time, not baked in"
  );
  assert.ok(!sql.includes(dir), "the generated SQL must not embed a machine-specific path");
  assert.ok(sql.includes("-- alpha-provider.json"), "each statement names its declaration for the CI log");
  assert.equal(
    sql.match(/submitted_by = /g).length,
    1,
    "submitted_by must be assigned exactly once (via COALESCE) or the update list would be ambiguous"
  );

  // The row can only be identified by one column list, so a single faulty statement would
  // fail the whole file instead of half-writing it.
  const sqlite = migratedDatabase();
  sqlite.exec(sql);
  sqlite.exec(sql);
  const rows = sqlite.prepare("SELECT id, status, created_at FROM providers").all();
  assert.equal(rows.length, 1, "re-applying the sync must not duplicate rows");
  assert.equal(rows[0].status, "approved");
});

test("disabling a declaration takes the provider offline; re-approving restores it", async (t) => {
  const dir = makeDeclarationDir(t);
  const sqlite = migratedDatabase();

  writeDeclaration(dir, "alpha-provider.json", BASE_DECLARATION);
  const approved = runSync(["--dir", dir]);
  assert.equal(approved.status, 0, approved.stderr);
  sqlite.exec(approved.stdout);

  let { body } = await requestProviders(sqlite);
  assert.deepEqual(body.providers.map((provider) => provider.id), ["alpha-provider"]);
  const createdAt = sqlite.prepare("SELECT created_at FROM providers WHERE id = 'alpha-provider'").get().created_at;

  // PR #2: the same file, now explicitly disabled.
  writeDeclaration(dir, "alpha-provider.json", {
    ...BASE_DECLARATION,
    status: "disabled",
    offlineReason: "免费额度活动已结束",
    offlineAt: "2026-09-16"
  });
  const disabled = runSync(["--dir", dir]);
  assert.equal(disabled.status, 0, disabled.stderr);
  sqlite.exec(disabled.stdout);

  ({ body } = await requestProviders(sqlite));
  assert.deepEqual(body.providers, [], "a disabled provider must disappear from the public API");

  const disabledRow = sqlite.prepare("SELECT * FROM providers WHERE id = 'alpha-provider'").get();
  assert.equal(disabledRow.status, "disabled");
  assert.equal(disabledRow.submitted_by, "alice", "submitted_by must survive the update");
  assert.equal(disabledRow.created_at, createdAt, "created_at must survive the update");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers").get().c, 1, "the row is kept, not deleted");

  // PR #3: back to approved — the row is reused instead of re-inserted.
  writeDeclaration(dir, "alpha-provider.json", BASE_DECLARATION);
  const restored = runSync(["--dir", dir]);
  assert.equal(restored.status, 0, restored.stderr);
  sqlite.exec(restored.stdout);

  ({ body } = await requestProviders(sqlite));
  assert.deepEqual(body.providers.map((provider) => provider.id), ["alpha-provider"]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers").get().c, 1);
  assert.equal(sqlite.prepare("SELECT created_at FROM providers WHERE id = 'alpha-provider'").get().created_at, createdAt);
});

test('status "disabled" needs offlineReason + offlineAt, and other statuses forbid them', (t) => {
  const cases = [
    [
      "no-reasons",
      { status: "disabled" },
      ["offlineReason: is required when status is \"disabled\"", "offlineAt: is required when status is \"disabled\""]
    ],
    ["no-date", { status: "disabled", offlineReason: "活动结束" }, ["offlineAt: is required"]],
    [
      "impossible-date",
      { status: "disabled", offlineReason: "活动结束", offlineAt: "2026-02-31" },
      ["offlineAt: must be a real YYYY-MM-DD date"]
    ],
    ["blank-reason", { status: "disabled", offlineReason: "   ", offlineAt: "2026-09-16" }, ["offlineReason: must not be empty"]],
    ["stale-reason-on-approved", { offlineReason: "已经结束了" }, ["offlineReason / offlineAt: only allowed when status is \"disabled\""]],
    ["stale-reason-on-pending", { status: "pending", offlineAt: "2026-09-16" }, ["only allowed when status is \"disabled\""]],
    ["unknown-status", { status: "maybe" }, ["status: must be one of pending, approved, disabled, rejected"]],
    ["missing-status", { status: undefined }, ["status: must be one of"]]
  ];

  for (const [id, overrides, expected] of cases) {
    const declaration = { ...BASE_DECLARATION, ...overrides };
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete declaration[key];
    }
    const dir = writeDeclarations(t, { [`${id}.json`]: { ...declaration, id } });
    const out = join(dir, "sync.sql");
    const result = runSync(["--dir", dir, "--out", out]);

    assert.equal(result.status, 1, `"${id}" must be rejected`);
    for (const fragment of expected) {
      assert.ok(result.stderr.includes(fragment), `"${id}" must report "${fragment}", got:\n${result.stderr}`);
    }
    assert.equal(existsSync(out), false, `"${id}" must not leave a partially written SQL file`);
  }
});

test("hostile strings are escaped, unsafe URLs and ids are rejected", (t) => {
  const hostile = {
    ...BASE_DECLARATION,
    id: "evil-provider",
    name: "Evil'); DROP TABLE providers; --",
    freeTierSummary: { en: "'; DELETE FROM providers; --" }
  };
  const dir = writeDeclarations(t, { "evil-provider.json": hostile });
  const result = runSync(["--dir", dir]);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("''"), "single quotes must be doubled in string literals");

  // The real proof: apply it and check nothing was executed as SQL.
  const sqlite = migratedDatabase();
  sqlite.exec(result.stdout);
  assert.ok(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'providers'").get(),
    "the providers table must survive an injected payload"
  );
  const row = sqlite.prepare("SELECT name, free_tier_summary FROM providers WHERE id = 'evil-provider'").get();
  assert.equal(row.name, hostile.name, "the payload must round-trip as data");
  assert.deepEqual(JSON.parse(row.free_tier_summary), { en: "'; DELETE FROM providers; --" });

  const rejects = [
    ["http-base-url", { baseUrl: "http://api.alpha.example.com/v1" }, "baseUrl: must be an https:// URL"],
    ["javascript-homepage", { homepage: "javascript:alert(1)" }, "homepage: must be an https:// URL"],
    ["credentials-in-url", { consoleUrl: "https://user:pass@alpha.example.com/keys" }, "consoleUrl: must be an https:// URL"],
    ["localhost-base-url", { baseUrl: "https://localhost/v1" }, "baseUrl: must be an https:// URL"],
    ["protocol-relative-icon", { icon: "//evil.example.com/icon.svg" }, "icon: must be an https:// URL"],
    ["unknown-protocol", { protocol: "grpc" }, "protocol: must be one of"],
    ["unknown-region", { region: "eu" }, 'region: must be "cn" or "global"'],
    ["empty-models", { models: [] }, "models: must be a non-empty array"],
    ["duplicate-model-ids", { models: [{ id: "a-1" }, { id: "a-1" }] }, "duplicate model id"],
    ["sql-shaped-id", { id: "alpha'; --" }, "id: must match"],
    ["unknown-field", { baseURL: "https://api.alpha.example.com/v1" }, 'unknown field "baseURL"'],
    ["stale-file-name", { id: "renamed" }, 'id: must equal the file name']
  ];

  for (const [id, overrides, expected] of rejects) {
    const caseDir = writeDeclarations(t, { [`${id}.json`]: { ...BASE_DECLARATION, ...overrides } });
    const rejected = runSync(["--dir", caseDir]);
    assert.equal(rejected.status, 1, `"${id}" must be rejected`);
    assert.ok(rejected.stderr.includes(expected), `"${id}" must report "${expected}", got:\n${rejected.stderr}`);
    assert.equal(rejected.stdout, "", `"${id}" must not emit any SQL`);
  }
});

test("one invalid declaration blocks the whole batch and reports every offender", (t) => {
  const dir = writeDeclarations(t, {
    "alpha-provider.json": BASE_DECLARATION,
    "beta-provider.json": { ...BASE_DECLARATION, id: "beta-provider", baseUrl: "http://api.beta.example.com/v1" },
    "gamma-provider.json": { ...BASE_DECLARATION, id: "gamma-provider", status: "disabled", offlineReason: "结束" }
  });
  const out = join(dir, "sync.sql");

  const result = runSync(["--dir", dir, "--out", out]);

  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes("error: beta-provider.json"), result.stderr);
  assert.ok(result.stderr.includes("error: gamma-provider.json"), result.stderr);
  assert.ok(!result.stderr.includes("alpha-provider.json"), "valid declarations must not be reported as errors");
  assert.ok(result.stderr.includes("2 of 3 declaration file(s) are invalid"), result.stderr);
  assert.ok(result.stderr.includes("D1 was not modified"), "the operator must be told nothing was written");
  assert.equal(result.stdout, "");
  assert.equal(existsSync(out), false, "the valid declarations must not be written on their own");

  // Fixing both offenders produces the full batch again.
  writeDeclaration(dir, "beta-provider.json", { ...BASE_DECLARATION, id: "beta-provider", baseUrl: "https://api.beta.example.com/v1" });
  writeDeclaration(dir, "gamma-provider.json", {
    ...BASE_DECLARATION,
    id: "gamma-provider",
    status: "disabled",
    offlineReason: "结束",
    offlineAt: "2026-09-16"
  });
  const fixed = runSync(["--dir", dir, "--out", out]);
  assert.equal(fixed.status, 0, fixed.stderr);
  const sql = readFileSync(out, "utf8");
  assert.ok(sql.indexOf("'alpha-provider'") < sql.indexOf("'beta-provider'"));
  assert.ok(sql.indexOf("'beta-provider'") < sql.indexOf("'gamma-provider'"), "statements must be ordered by id");
});

test("an empty declaration directory produces a comment-only script", (t) => {
  const dir = makeDeclarationDir(t);
  const result = runSync(["--dir", dir]);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("AUTO-GENERATED FILE"));
  assert.ok(!result.stdout.includes("INSERT INTO providers"), "nothing may be written when nothing is declared");
});

test("a missing declaration directory fails with a diagnostic instead of emitting SQL", () => {
  const result = runSync(["--dir", join(tmpdir(), "freebuddy-missing-directory")]);

  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes("declaration directory not found"), result.stderr);
  assert.equal(result.stdout, "");
});

test("schema.sql and the migrations accept exactly the same status set", () => {
  const fromSchema = migratedDatabase();

  // Everything 0001 can see, then 0002 on top of it.
  const fromMigrations = legacyDatabase();
  insertRow(fromMigrations);
  fromMigrations.exec(MIGRATION_0001);
  fromMigrations.exec(MIGRATION_0002);

  for (const sqlite of [fromSchema, fromMigrations]) {
    for (const status of ["pending", "approved", "disabled", "rejected"]) {
      assert.doesNotThrow(
        () => insertRow(sqlite, { id: `status-${status}`, status, base_url: "https://api.example.com/v1" }),
        `${status} must be accepted`
      );
    }
    assert.throws(
      () => insertRow(sqlite, { id: "status-maybe", status: "maybe" }),
      /CHECK constraint failed/,
      "an unknown status must still be rejected"
    );
  }
});

test("0002 rebuilds a database that only ran 0001 without losing a single row", async () => {
  const sqlite = legacyDatabase();
  insertRow(sqlite);
  insertRow(sqlite, { id: "pending-alpha", status: "pending", updated_at: 5 });
  sqlite.exec(MIGRATION_0001);

  // The status set installed by 0001 is what makes decommissioning impossible today.
  assert.throws(
    () => insertRow(sqlite, { id: "would-be-disabled", status: "disabled" }),
    /CHECK constraint failed/,
    "0001 must still reject 'disabled' — that is why 0002 exists"
  );

  sqlite.exec(MIGRATION_0002);

  const kept = sqlite.prepare("SELECT * FROM providers ORDER BY id").all();
  assert.deepEqual(kept.map((row) => [row.id, row.status]), [
    ["legacy-alpha", "approved"],
    ["pending-alpha", "pending"]
  ]);
  for (const column of Object.keys(LEGACY_ROW)) {
    assert.deepEqual(kept[0][column], LEGACY_ROW[column], `legacy-alpha.${column} must be copied unchanged`);
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers_quarantine").get().c, 0);

  insertRow(sqlite, { id: "disabled-alpha", status: "disabled", base_url: "https://api.disabled.example.com/v1" });
  assert.throws(() => insertRow(sqlite, { id: "status-maybe", status: "maybe" }), /CHECK constraint failed/);
  assert.ok(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_providers_status'").get(),
    "idx_providers_status must be rebuilt"
  );
  assert.deepEqual(
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'providers%' ORDER BY name")
      .all()
      .map((row) => row.name),
    ["providers", "providers_quarantine"],
    "no scratch table may be left behind"
  );

  // The Worker still serves only the approved row.
  const { body } = await requestProviders(sqlite);
  assert.deepEqual(body.providers.map((provider) => provider.id), ["legacy-alpha"]);

  // Re-running is safe: same data, no new audit rows.
  sqlite.exec(MIGRATION_0002);
  assert.deepEqual(
    sqlite.prepare("SELECT id FROM providers ORDER BY id").all().map((row) => row.id),
    ["disabled-alpha", "legacy-alpha", "pending-alpha"]
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers_quarantine").get().c, 0);
});

test("0002 quarantines unusable rows instead of dropping them and survives an interruption", () => {
  const sqlite = legacyDatabase();
  insertRow(sqlite);
  insertRow(sqlite, { id: "bad-status", status: "maybe" });
  sqlite.exec(MIGRATION_0001);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers").get().c, 1);
  assert.deepEqual(
    sqlite.prepare("SELECT id, failed_checks FROM providers_quarantine").all().map((row) => [row.id, row.failed_checks]),
    [["bad-status", "status"]]
  );

  // Reproduce the only dangerous window for 0002 as well: everything up to the DROP ran.
  const throughDrop = MIGRATION_0002.slice(0, MIGRATION_0002.indexOf("DROP TABLE providers;") + "DROP TABLE providers;".length);
  sqlite.exec(throughDrop);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'providers'").get().c,
    0
  );
  assert.throws(
    () => sqlite.exec(MIGRATION_0002),
    /CHECK constraint failed/,
    "a rerun must abort while providers_new holds the only copy"
  );

  // Documented recovery in migrations/0002_providers_status_disabled.sql, then rerun.
  sqlite.exec("ALTER TABLE providers_new RENAME TO providers");
  sqlite.exec(MIGRATION_0002);

  assert.deepEqual(
    sqlite.prepare("SELECT id, status FROM providers ORDER BY id").all().map((row) => [row.id, row.status]),
    [["legacy-alpha", "approved"]]
  );
  assert.deepEqual(
    sqlite.prepare("SELECT id, failed_checks FROM providers_quarantine").all().map((row) => [row.id, row.failed_checks]),
    [["bad-status", "status"]],
    "the audit trail must survive the recovery"
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(DISTINCT run_id) AS c FROM providers_quarantine").get().c,
    1,
    "one audit row per legacy row"
  );
});

test("there is no public write path into the runtime catalog", async (t) => {
  const dir = writeDeclarations(t, { "alpha-provider.json": BASE_DECLARATION });
  const sqlite = migratedDatabase();
  sqlite.exec(runSync(["--dir", dir]).stdout);

  // The only way in is a merged declaration: a declaration-shaped request body must not be
  // routed to anything, with or without client credentials.
  const body = JSON.stringify({
    id: "attacker",
    name: "Attacker",
    protocol: "openai-chat",
    baseUrl: "https://attacker.example.com/v1",
    models: [{ id: "attacker-1" }],
    status: "approved"
  });
  for (const method of ["POST", "PUT", "PATCH"]) {
    const { response } = await fetchApi(sqlite, "/api/providers", {
      method,
      headers: { "content-type": "application/json" },
      body
    });
    assert.equal(response.status, 404, `${method} /api/providers must not be routed`);
  }

  assert.deepEqual(
    sqlite.prepare("SELECT id FROM providers ORDER BY id").all().map((row) => row.id),
    ["alpha-provider"],
    "the catalog must only contain what the declarations produced"
  );
});

test("0002 leaves the audit trail written by an earlier migration alone", () => {
  const sqlite = legacyDatabase();
  insertRow(sqlite);
  insertRow(sqlite, { id: "bad-name", name: "   " });
  sqlite.exec(MIGRATION_0001);
  const before = sqlite.prepare("SELECT legacy_rowid, run_id, id, failed_checks FROM providers_quarantine").all();
  assert.equal(before.length, 1);

  sqlite.exec(MIGRATION_0002);

  const after = sqlite.prepare("SELECT legacy_rowid, run_id, id, failed_checks FROM providers_quarantine").all();
  assert.deepEqual(
    after.map((row) => [row.legacy_rowid, row.id, row.failed_checks]),
    before.map((row) => [row.legacy_rowid, row.id, row.failed_checks])
  );
  assert.deepEqual(
    sqlite.prepare("SELECT id FROM providers ORDER BY id").all().map((row) => row.id),
    ["legacy-alpha"]
  );
});

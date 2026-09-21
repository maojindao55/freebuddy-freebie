/**
 * Historical static catalog import tests (providers.json -> submissions/providers/<id>.json).
 *
 * The historical catalog used to live only in the statically published providers.json. It is
 * imported 1:1 as reviewed runtime declarations: identical facts, `"status": "approved"`, and the
 * provenance marker `"submittedBy": "static-catalog-import"`, so that merging the import PR
 * upserts every entry into D1 without touching the static file.
 *
 * These tests pin the conversion:
 *  - every providers.json entry converts into a declaration the sync script accepts,
 *  - the committed files are exactly that conversion plus the explicitly listed post-import
 *    declarations (POST_IMPORT_DECLARATION_IDS) — no missing entries, no ghost entries, and the
 *    submissions/examples files never become real declarations,
 *  - the real sync CLI turns the whole directory into an idempotent SQL file that a migrated D1
 *    database executes, and GET /api/providers serves all of it,
 *  - nothing is added to the statically published catalog: providers.json stays facts-only (no
 *    status/submittedBy) and submissions/ stays outside the published assets.
 *
 * The historical batch is a snapshot: if the runtime catalog is deliberately changed later
 * (a provider is taken offline, a fact is corrected), update the expected conversion here in the
 * same PR — this file is the record of what the import promised. A provider added *after* the
 * import has no providers.json entry, so its id must be registered in POST_IMPORT_DECLARATION_IDS
 * in that same PR: the count checks below then still fail on an unnoticed ghost declaration.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { validateDeclaration } from "../scripts/sync-providers.mjs";
import { requestProviders } from "./helpers/d1-stub.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CATALOG_PATH = join(REPO_ROOT, "providers.json");
const DECLARATION_DIR = join(REPO_ROOT, "submissions", "providers");
const SYNC_SCRIPT = fileURLToPath(new URL("../scripts/sync-providers.mjs", import.meta.url));
const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const ASSETS_IGNORE = readFileSync(new URL("../.assetsignore", import.meta.url), "utf8");

/** Provenance recorded on every declaration created by the historical import. */
const IMPORT_MARKER = "static-catalog-import";

/**
 * Declarations merged after the historical import: they deliberately have no providers.json
 * entry. Listing them here keeps the counts below honest — adding a provider stays a reviewed,
 * visible change instead of an unnoticed ghost entry in the declared batch.
 */
const POST_IMPORT_DECLARATION_IDS = ["senseaudio", "stepfun", "tierflow"];

/** Provider facts copied verbatim from providers.json; runtime bookkeeping is added on import. */
const FACT_FIELDS = [
  "name",
  "icon",
  "region",
  "homepage",
  "consoleUrl",
  "freeTierSummary",
  "protocol",
  "protocols",
  "baseUrl",
  "envKey",
  "models",
  "verifiedAt"
];

/** Fields the static catalog may carry; status/submittedBy/offline* must never leak into it. */
const STATIC_ONLY_FIELDS = new Set(["id", ...FACT_FIELDS]);

function readCatalog() {
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

function committedDeclarationNames() {
  // Same scan rule as scripts/sync-providers.mjs: direct *.json children, dotfiles ignored.
  return readdirSync(DECLARATION_DIR)
    .filter((name) => name.endsWith(".json") && !name.startsWith("."))
    .sort();
}

function readCommittedDeclarations() {
  return committedDeclarationNames().map((name) => ({
    name,
    declaration: JSON.parse(readFileSync(join(DECLARATION_DIR, name), "utf8"))
  }));
}

/** The canonical conversion rule applied by the import: static entry -> approved declaration. */
function toDeclaration(provider) {
  const declaration = { $schema: "../providers.schema.json", id: provider.id };
  for (const field of FACT_FIELDS) {
    if (provider[field] !== undefined) declaration[field] = provider[field];
  }
  declaration.status = "approved";
  declaration.submittedBy = IMPORT_MARKER;
  return declaration;
}

function factsOf(source) {
  const facts = {};
  for (const field of FACT_FIELDS) {
    if (source[field] !== undefined) facts[field] = source[field];
  }
  return facts;
}

function migratedDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  return sqlite;
}

/** Runs the sync CLI the same way the GitHub Action does. */
function runSync(args) {
  const result = spawnSync(process.execPath, [SYNC_SCRIPT, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("every historical providers.json entry converts into a declaration the sync script accepts", async (t) => {
  const catalog = readCatalog();
  assert.ok(Array.isArray(catalog.providers) && catalog.providers.length > 0);

  // Convert the catalog in memory, then run the real CLI over the conversion. A single
  // non-convertible entry would make the script exit 1 and emit no SQL at all.
  const dir = join(mkdtempSync(join(tmpdir(), "freebuddy-import-")), "providers");
  mkdirSync(dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  for (const provider of catalog.providers) {
    const declaration = toDeclaration(provider);
    const { messages, row } = validateDeclaration(declaration);
    assert.deepEqual(messages, [], `${provider.id} must convert without validation messages`);
    assert.equal(row.id, provider.id);
    assert.equal(row.status, "approved", `${provider.id} must be imported as approved`);
    assert.equal(row.submitted_by, IMPORT_MARKER, `${provider.id} must carry the provenance marker`);
    writeFileSync(join(dir, `${provider.id}.json`), `${JSON.stringify(declaration, null, 2)}\n`);
  }

  const out = join(dir, "sync.sql");
  const result = runSync(["--dir", dir, "--out", out]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");

  const sql = readFileSync(out, "utf8");
  assert.equal(
    sql.match(/INSERT INTO providers \(/g).length,
    catalog.providers.length,
    "the conversion must produce one upsert per historical entry"
  );

  const sqlite = migratedDatabase();
  sqlite.exec(sql);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers").get().c, catalog.providers.length);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS c FROM providers WHERE status = 'approved'").get().c,
    catalog.providers.length
  );

  const { body } = await requestProviders(sqlite);
  assert.deepEqual(
    body.providers.map((provider) => provider.id).sort(),
    catalog.providers.map((provider) => provider.id).sort(),
    "GET /api/providers must serve the whole converted catalog"
  );
});

test("the committed declaration batch is exactly the historical catalog, counts included", () => {
  const catalog = readCatalog();
  const declarations = readCommittedDeclarations();
  const imported = declarations.filter(({ declaration }) => declaration.submittedBy === IMPORT_MARKER);

  // Record counts must match: one declaration for every historical entry, no extras.
  assert.equal(
    imported.length,
    catalog.providers.length,
    `${catalog.providers.length} historical entries must be imported as exactly ${catalog.providers.length} declaration(s)`
  );
  assert.deepEqual(
    imported.map(({ declaration }) => declaration.id).sort(),
    catalog.providers.map((provider) => provider.id).sort(),
    "the imported ids must equal the static catalog ids"
  );

  // Everything without the provenance marker is a post-import declaration and must be listed
  // explicitly, so a stray extra file cannot silently widen the catalog.
  assert.deepEqual(
    declarations
      .filter(({ declaration }) => declaration.submittedBy !== IMPORT_MARKER)
      .map(({ declaration }) => declaration.id)
      .sort(),
    [...POST_IMPORT_DECLARATION_IDS].sort(),
    "post-import declarations must be registered in POST_IMPORT_DECLARATION_IDS"
  );

  const byId = new Map(declarations.map((entry) => [entry.declaration.id, entry]));
  assert.ok(
    !byId.has("example-provider"),
    "submissions/examples/approved.example.json must never be imported as a real declaration"
  );

  for (const provider of catalog.providers) {
    const entry = byId.get(provider.id);
    assert.ok(entry, `${provider.id} must have a declaration`);
    assert.equal(entry.name, `${provider.id}.json`, "the file name must equal the declaration id");
    // The committed file must be byte-for-byte the canonical conversion: same facts, the schema
    // pointer, status approved and the provenance marker — nothing more, nothing less.
    assert.deepEqual(
      entry.declaration,
      toDeclaration(provider),
      `${provider.id}.json must be exactly the historical entry imported as approved`
    );
    assert.deepEqual(factsOf(entry.declaration), factsOf(provider), `${provider.id} facts must be preserved`);
  }
});

test("the committed declarations pass the sync CLI and produce an idempotent, servable approved catalog", async (t) => {
  const expectedCount = committedDeclarationNames().length;
  assert.equal(expectedCount, readCatalog().providers.length + POST_IMPORT_DECLARATION_IDS.length);

  const outDir = mkdtempSync(join(tmpdir(), "freebuddy-import-sql-"));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  const out = join(outDir, "sync.sql");

  const result = runSync(["--dir", DECLARATION_DIR, "--out", out]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");

  const sql = readFileSync(out, "utf8");
  assert.ok(sql.includes("AUTO-GENERATED FILE"), "the CLI must emit its generated-file header");
  assert.ok(
    sql.includes(`${expectedCount} of ${expectedCount} declaration file(s) produced statements`),
    "every committed declaration must produce a statement"
  );
  assert.equal(sql.match(/INSERT INTO providers \(/g).length, expectedCount);
  assert.equal(
    sql.match(/ON CONFLICT\(id\) DO UPDATE SET/g).length,
    expectedCount,
    "every statement must be an upsert"
  );
  assert.ok(!sql.includes(DECLARATION_DIR), "the SQL must stay machine-independent");

  const sqlite = migratedDatabase();
  // Applying the same file twice proves it is an executable, idempotent upsert set.
  sqlite.exec(sql);
  sqlite.exec(sql);

  assert.equal(sqlite.prepare("SELECT COUNT(*) AS c FROM providers").get().c, expectedCount);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS c FROM providers WHERE status = 'approved'").get().c,
    expectedCount,
    "every imported declaration must be approved"
  );
  assert.equal(
    sqlite.prepare(`SELECT COUNT(*) AS c FROM providers WHERE submitted_by = '${IMPORT_MARKER}'`).get().c,
    readCatalog().providers.length,
    "the provenance marker must reach D1 for every imported entry"
  );

  const { body } = await requestProviders(sqlite);
  assert.deepEqual(
    body.providers.map((provider) => provider.id).sort(),
    [...readCatalog().providers.map((provider) => provider.id), ...POST_IMPORT_DECLARATION_IDS].sort(),
    "the runtime API must serve every imported provider plus the registered post-import declarations"
  );
});

test("the import adds nothing to the statically published catalog", () => {
  const catalog = readCatalog();

  // providers.json remains a facts-only static file: the runtime bookkeeping never leaks in.
  assert.equal(committedDeclarationNames().length, catalog.providers.length + POST_IMPORT_DECLARATION_IDS.length);
  for (const provider of catalog.providers) {
    for (const key of Object.keys(provider)) {
      assert.ok(
        STATIC_ONLY_FIELDS.has(key),
        `${provider.id}: runtime-only field "${key}" must not be added to providers.json`
      );
    }
  }

  // The declaration files live under submissions/, which .assetsignore keeps out of the
  // published assets (evaluated for real by tests/assets-ignore.test.js).
  assert.ok(
    ASSETS_IGNORE.split("\n").some((line) => line.trim() === "submissions/"),
    ".assetsignore must keep submissions/ out of the published static assets"
  );
});

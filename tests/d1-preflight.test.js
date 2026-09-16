/**
 * Behavioural tests for scripts/check-d1-preflight.mjs, the read-only gate the sync workflow
 * runs after generating SQL and before it writes anything to D1.
 *
 * The script turns "the workflow credentials can see freebie-db" into a hard requirement: the
 * database must be listed under its committed UUID and name, otherwise the job fails with a
 * readable error instead of surfacing an opaque 7003 mid-write. It must never echo the token,
 * and it never reads — let alone prints — an account id (wrangler resolves that from
 * wrangler.toml).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { EXPECTED_DATABASE_NAME, EXPECTED_DATABASE_UUID } from "../scripts/check-d1-preflight.mjs";

const PREFLIGHT = fileURLToPath(new URL("../scripts/check-d1-preflight.mjs", import.meta.url));
const WRANGLER_TOML = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const FREEBIE_DB_UUID = "b95f4660-142c-4896-a71e-5ded41c64030";

const FAKE_TOKEN = "fake-token-must-never-be-printed";
const OTHER_DATABASE = { uuid: "00000000-0000-0000-0000-000000000000", name: "some-other-db", num_tables: 1 };

function runPreflight(stdin, extraEnv = {}) {
  return spawnSync(process.execPath, [PREFLIGHT], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, CLOUDFLARE_API_TOKEN: FAKE_TOKEN, ...extraEnv }
  });
}

test("the asserted target is exactly the database wrangler.toml binds", () => {
  assert.ok(
    WRANGLER_TOML.includes(`database_name = "${EXPECTED_DATABASE_NAME}"`),
    "the preflight name must match wrangler.toml database_name"
  );
  assert.ok(
    WRANGLER_TOML.includes(`database_id = "${EXPECTED_DATABASE_UUID}"`),
    "the preflight uuid must match wrangler.toml database_id"
  );
  assert.equal(EXPECTED_DATABASE_UUID, FREEBIE_DB_UUID, "the preflight uuid must stay the freebie-db uuid");
  assert.equal(EXPECTED_DATABASE_NAME, "freebie-db", "the preflight name must stay the d1 execute argument");
});

test("a visible freebie-db passes and the token is never echoed", () => {
  const result = runPreflight(
    JSON.stringify([OTHER_DATABASE, { uuid: FREEBIE_DB_UUID, name: "freebie-db", num_tables: 3 }])
  );
  assert.equal(result.status, 0, `a visible database must pass: ${result.stderr}`);
  assert.match(result.stdout, /freebie-db/);
  assert.ok(result.stdout.includes(FREEBIE_DB_UUID), "the uuid should be reported so the log can be correlated");
  assert.ok(
    !result.stdout.includes(FAKE_TOKEN) && !result.stderr.includes(FAKE_TOKEN),
    "the preflight must never print the API token it is running under"
  );
});

test("the wrapped result shape from older wrangler builds is accepted too", () => {
  const result = runPreflight(JSON.stringify({ result: [{ uuid: FREEBIE_DB_UUID, name: "freebie-db" }] }));
  assert.equal(result.status, 0, `the { result: [...] } shape must parse: ${result.stderr}`);
});

test("a database that is not visible fails with an actionable message", () => {
  const result = runPreflight(JSON.stringify([OTHER_DATABASE]));
  assert.equal(result.status, 1, "a missing database must fail the preflight");
  assert.match(result.stderr, new RegExp(FREEBIE_DB_UUID), "the error must name the expected uuid");
  assert.match(result.stderr, /CLOUDFLARE_API_TOKEN/, "the error must point at the credential to check");
  assert.match(result.stderr, /account_id/, "the error must explain that the account comes from wrangler.toml");
  assert.match(result.stderr, /some-other-db/, "the visible database names help diagnose a wrong account");
  assert.ok(!result.stdout.includes(FAKE_TOKEN) && !result.stderr.includes(FAKE_TOKEN));
});

test("a renamed database fails instead of silently writing somewhere else", () => {
  const result = runPreflight(JSON.stringify([{ uuid: FREEBIE_DB_UUID, name: "freebie-db-v2" }]));
  assert.equal(result.status, 1, "the name assertion must be enforced, not just the uuid");
  assert.match(result.stderr, /freebie-db-v2/);
  assert.match(result.stderr, /freebie-db/);
});

test("empty, invalid and empty-list outputs all fail clearly", () => {
  for (const stdin of ["", "not json", "null", "{}", "[]"]) {
    const result = runPreflight(stdin);
    assert.equal(result.status, 1, `stdin ${JSON.stringify(stdin)} must fail the preflight`);
    assert.ok(result.stderr.trim().length > 0, `stdin ${JSON.stringify(stdin)} must produce an error message`);
    assert.ok(
      !result.stdout.includes(FAKE_TOKEN) && !result.stderr.includes(FAKE_TOKEN),
      "no failure path may print the token"
    );
  }
});

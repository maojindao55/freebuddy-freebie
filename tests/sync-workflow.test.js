/**
 * GitHub Action wiring checks for .github/workflows/sync-providers.yml.
 *
 * That workflow is the only writer of the runtime catalog, and its transport is load-bearing:
 * the file-import mode of `wrangler d1 execute` uploads the script to D1's /import endpoint,
 * which answers Cloudflare error 7003 for this database, while `--command` goes through the
 * /query endpoint. The value must use the equals form (`--command="$(< file)"`): both SQL
 * files start with a `--` comment banner, and wrangler's CLI parser treats a value starting
 * with `-` as another option, so the space-separated form fails with `Unknown argument`
 * (verified on wrangler 4.5.0 and 4.133.0).
 *
 * Credentials are just as load-bearing: only CLOUDFLARE_API_TOKEN may come from GitHub. The
 * account id is pinned as the top-level `account_id` in wrangler.toml, so no
 * CLOUDFLARE_ACCOUNT_ID secret/variable may be referenced any more, and the run must prove with
 * a read-only `wrangler d1 list` preflight — before schema.sql / the upserts — that the token
 * can see freebie-db; a mis-filled account id used to surface as an opaque 7003.
 *
 * These are static assertions on the YAML/TOML text so a later edit cannot quietly reintroduce
 * the /import path, regress to the space-separated form, drop the skip guard, re-add the account
 * id secret, move the preflight after the writes, or start applying migrations on its own.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const WORKFLOW = readFileSync(new URL("../.github/workflows/sync-providers.yml", import.meta.url), "utf8");
const WRANGLER_TOML = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const D1_EXECUTE_LINES = WORKFLOW.split("\n").filter((line) => line.includes("d1 execute"));
const SCHEMA_COMMAND = '--command="$(< schema.sql)"';
const UPSERT_COMMAND = '--command="$(< "$SYNC_SQL_FILE")"';
const SKIP_GUARD = 'if ! grep -q "^INSERT INTO providers (" "$SYNC_SQL_FILE"; then';
const CREDENTIAL_CHECK = 'if [ -z "${CLOUDFLARE_API_TOKEN}" ]; then';
const PREFLIGHT_COMMAND = "npx --yes wrangler@4 d1 list --json";
const PREFLIGHT_SCRIPT = "node scripts/check-d1-preflight.mjs";
const ACCOUNT_ID = "ca3b2549d8dcb98799c42e7b56f4e912";
const DATABASE_ID = "b95f4660-142c-4896-a71e-5ded41c64030";

test("the workflow never uploads SQL through D1's failing file-import path", () => {
  assert.ok(
    !WORKFLOW.includes("--file"),
    "no file flag may appear anywhere: it routes the run through the /import endpoint that returns error 7003"
  );
});

test("schema.sql and the generated upserts are both sent through --command", () => {
  assert.equal(D1_EXECUTE_LINES.length, 2, "exactly two remote D1 calls are expected: schema, then upserts");
  for (const line of D1_EXECUTE_LINES) {
    assert.match(
      line,
      /npx --yes wrangler@4 d1 execute freebie-db --remote --yes --command=/,
      `unexpected D1 call shape: ${line.trim()}`
    );
    assert.ok(
      !line.includes('--command "'),
      `the space-separated form breaks on a value starting with "-": ${line.trim()}`
    );
  }
  assert.ok(WORKFLOW.includes(SCHEMA_COMMAND), "schema.sql must be applied via a quoted --command= argument");
  assert.ok(WORKFLOW.includes(UPSERT_COMMAND), "the generated SQL must be applied via a quoted --command= argument");
  assert.ok(
    WORKFLOW.indexOf(SCHEMA_COMMAND) < WORKFLOW.indexOf(UPSERT_COMMAND),
    "a brand-new database needs the schema before the first upsert"
  );
});

test("a sync with nothing to apply leaves D1 completely untouched", () => {
  const guardAt = WORKFLOW.indexOf(SKIP_GUARD);
  assert.ok(guardAt !== -1, "the empty-SQL skip guard must stay");
  const exitAt = WORKFLOW.indexOf("exit 0");
  assert.ok(exitAt > guardAt, "the skip guard must exit the step");
  assert.ok(exitAt < WORKFLOW.indexOf(SCHEMA_COMMAND), "the guard must exit before any D1 call, including schema.sql");
  assert.ok(
    guardAt < WORKFLOW.indexOf(SCHEMA_COMMAND) && guardAt < WORKFLOW.indexOf(UPSERT_COMMAND),
    "the guard must be evaluated before the D1 commands"
  );
});

test("the generator runs first and only the API token is taken from GitHub", () => {
  assert.ok(
    WORKFLOW.includes('node scripts/sync-providers.mjs --out "$SYNC_SQL_FILE"'),
    "the SQL generator must write to $SYNC_SQL_FILE"
  );
  assert.ok(
    WORKFLOW.indexOf("node scripts/sync-providers.mjs") < WORKFLOW.indexOf(SCHEMA_COMMAND),
    "the generator must run before the D1 steps"
  );
  assert.ok(
    WORKFLOW.includes("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"),
    "the API token must come from the secret store"
  );
  assert.ok(
    !WORKFLOW.includes("CLOUDFLARE_ACCOUNT_ID"),
    "no CLOUDFLARE_ACCOUNT_ID secret or variable may be referenced: the account id is pinned in wrangler.toml"
  );
  assert.ok(
    !/vars\.[A-Z_]*ACCOUNT_ID/.test(WORKFLOW),
    "the account id must not be read from repository variables either"
  );
  const checkAt = WORKFLOW.indexOf(CREDENTIAL_CHECK);
  assert.ok(checkAt !== -1, "the credential pre-check must stay and must require exactly the token");
  assert.ok(checkAt < WORKFLOW.indexOf("exit 1"), "the pre-check must fail the job");
  assert.ok(checkAt < WORKFLOW.indexOf(SCHEMA_COMMAND), "the pre-check must run before any D1 call");
  assert.ok(!/[0-9a-f]{32}/i.test(WORKFLOW), "no raw Cloudflare account or database UUID may be committed");
  assert.ok(
    !WORKFLOW.includes("continue-on-error") && !WORKFLOW.includes("|| true"),
    "a wrangler failure must stop the job, not be swallowed"
  );
});

test("a read-only preflight proves freebie-db is visible before any write", () => {
  assert.ok(
    WORKFLOW.includes(PREFLIGHT_COMMAND),
    "the preflight must list the account's databases with the workflow credentials"
  );
  assert.ok(
    WORKFLOW.includes(PREFLIGHT_SCRIPT),
    "the UUID/name assertion must live in scripts/check-d1-preflight.mjs, not in shell text"
  );
  const preflightAt = WORKFLOW.indexOf(PREFLIGHT_COMMAND);
  assert.ok(
    preflightAt > WORKFLOW.indexOf(CREDENTIAL_CHECK),
    "the preflight only makes sense after the token pre-check"
  );
  assert.ok(preflightAt < WORKFLOW.indexOf(SCHEMA_COMMAND), "the preflight must run before schema.sql is applied");
  assert.ok(preflightAt < WORKFLOW.indexOf(UPSERT_COMMAND), "the preflight must run before the upserts are applied");
  const errorAt = WORKFLOW.indexOf("title=d1-preflight-failed");
  assert.ok(errorAt > preflightAt, "a failing `wrangler d1 list` must produce its own clear error");
  assert.ok(WORKFLOW.indexOf("exit 1", errorAt) > errorAt, "the preflight step must stop the job when wrangler fails");
});

test("wrangler.toml pins the project account id and the freebie-db target", () => {
  assert.ok(
    WRANGLER_TOML.includes(`account_id = "${ACCOUNT_ID}"`),
    "the project account id must be pinned top-level in wrangler.toml so no GitHub secret is needed"
  );
  const firstTableAt = WRANGLER_TOML.indexOf("\n[");
  assert.ok(
    WRANGLER_TOML.indexOf("account_id") < firstTableAt,
    "account_id must be a top-level key, not a value inside a table"
  );
  assert.ok(WRANGLER_TOML.includes('database_name = "freebie-db"'), "the D1 target name must stay freebie-db");
  assert.ok(
    WRANGLER_TOML.includes(`database_id = "${DATABASE_ID}"`),
    "the D1 target uuid must stay the one the preflight asserts"
  );
});

test("the workflow never applies the data-rebuilding migrations automatically", () => {
  assert.ok(!WORKFLOW.includes("migrations apply"), "wrangler d1 migrations apply must stay a manual step");
  assert.ok(!WORKFLOW.includes("0001") && !WORKFLOW.includes("0002"), "0001 / 0002 target existing tables and stay manual");
});

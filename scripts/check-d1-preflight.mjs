#!/usr/bin/env node
/**
 * D1 connectivity preflight for .github/workflows/sync-providers.yml.
 *
 * Reads the JSON printed by `wrangler d1 list --json` on stdin and fails unless the expected
 * database is visible to the current workflow credentials. The workflow runs this immediately
 * before it applies schema.sql / the generated upserts, so a token that cannot reach the D1
 * API, or a `wrangler.toml` whose account_id does not own this database, stops the job with an
 * actionable message instead of an opaque 7003 in the middle of a write.
 *
 * The account id is never taken from a GitHub secret: wrangler resolves it from the
 * `account_id` key in wrangler.toml (that is exactly the behaviour this preflight exercises).
 *
 * Output discipline: only the database name and uuid are ever printed (both are already
 * committed to wrangler.toml). The token is never read or echoed, and the account id is never
 * printed — not even masked, since it would add no diagnostic value here.
 *
 * Usage:
 *   npx wrangler d1 list --json | node scripts/check-d1-preflight.mjs
 *
 * Exit codes:
 *   0  the expected database is visible
 *   1  stdin was not JSON, or the expected database is missing / renamed
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Must match `database_name` / `database_id` of the [[d1_databases]] block in wrangler.toml;
 * tests/d1-preflight.test.js asserts that so the two cannot drift apart silently. The name is
 * also the argument the workflow passes to `wrangler d1 execute freebie-db`.
 */
export const EXPECTED_DATABASE_NAME = "freebie-db";
export const EXPECTED_DATABASE_UUID = "b95f4660-142c-4896-a71e-5ded41c64030";

/**
 * `wrangler d1 list --json` returns the rows as a top-level array; older builds wrapped them in
 * `{ result: [...] }`. Anything else is treated as an unusable response, not as an empty list.
 */
export function normalizeDatabaseList(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : payload !== null && typeof payload === "object" && Array.isArray(payload.result)
      ? payload.result
      : null;
  if (rows === null) {
    throw new Error(
      "could not read a database list from `wrangler d1 list --json`: expected a JSON array " +
        "(or an object with a `result` array)."
    );
  }
  return rows;
}

/** @throws {Error} with an operator-facing message when the target database is not usable. */
export function assertExpectedDatabase(rows) {
  const match = rows.find((row) => row !== null && typeof row === "object" && row.uuid === EXPECTED_DATABASE_UUID);
  if (match === undefined) {
    const names = rows
      .map((row) => (row !== null && typeof row === "object" ? row.name : null))
      .filter((name) => typeof name === "string" && name.length > 0);
    throw new Error(
      `D1 preflight failed: database ${EXPECTED_DATABASE_UUID} (${EXPECTED_DATABASE_NAME}) is not ` +
        `visible to the current credentials.\n` +
        `wrangler d1 list returned ${rows.length} database(s)` +
        `${names.length > 0 ? `: ${names.join(", ")}` : ""}.\n` +
        "Check that CLOUDFLARE_API_TOKEN is valid and has D1 access to the account pinned as " +
        "account_id in wrangler.toml — the account id is not read from GitHub secrets."
    );
  }
  if (match.name !== EXPECTED_DATABASE_NAME) {
    throw new Error(
      `D1 preflight failed: database ${EXPECTED_DATABASE_UUID} is named ${JSON.stringify(match.name)}, ` +
        `but this repository expects ${JSON.stringify(EXPECTED_DATABASE_NAME)}. ` +
        "The workflow applies SQL to freebie-db by name; fix wrangler.toml's database_name / database_id " +
        "or restore the database instead of writing to a different one."
    );
  }
  return match;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch (error) {
    process.stderr.write(
      `D1 preflight failed: could not parse \`wrangler d1 list --json\` output as JSON (${error.message}). ` +
        "The wrangler command likely failed before it printed anything; see its output above.\n"
    );
    return 1;
  }

  try {
    const database = assertExpectedDatabase(normalizeDatabaseList(payload));
    process.stdout.write(
      `D1 preflight OK: ${database.name} (${database.uuid}) is visible to the current credentials ` +
        `(account pinned by wrangler.toml account_id).\n`
    );
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  process.exitCode = main();
}

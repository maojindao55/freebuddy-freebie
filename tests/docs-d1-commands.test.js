/**
 * Documentation checks for the manual D1 operations (README, migrations/*.sql, and the header
 * of the generated sync SQL).
 *
 * `wrangler d1 execute --file` uploads the script to D1's /import endpoint, which answers
 * Cloudflare error 7003 for this database, so no copy-pasteable example may use it. The
 * replacement must use the equals form (`--command="$(< file)"`): every SQL file here starts
 * with a `--` comment banner, and wrangler's CLI parser treats a value starting with `-` as
 * another option, so the space-separated `--command "$(< file)"` fails with `Unknown argument`
 * (verified on wrangler 4.5.0 and 4.133.0). Windows PowerShell needs its own spelling: `npx`'s
 * .cmd shim truncates multi-line arguments at the first newline, and Windows PowerShell 5.1
 * drops embedded double quotes, so the README must keep the `Get-Content -Raw -Encoding UTF8`
 * plus `.Replace('"', '\"')` variant. Most checks are static assertions on the markdown text so
 * a later edit cannot quietly reintroduce the broken examples; the generator is also spawned so
 * its real output — and any stale `.wrangler/sync-providers.sql` copy — is checked too.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const SYNC_GENERATOR = fileURLToPath(new URL("../scripts/sync-providers.mjs", import.meta.url));
const MIGRATIONS = ["0001_providers_constraints.sql", "0002_providers_status_disabled.sql"].map((name) => ({
  name,
  text: readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
}));

/** Fenced ```lang ... ``` blocks of the README, in order. */
function fencedBlocks(markdown) {
  const blocks = [];
  const pattern = /```([^\n]*)\n([\s\S]*?)```/g;
  for (let match; (match = pattern.exec(markdown)) !== null; ) {
    blocks.push({ lang: match[1].trim(), body: match[2] });
  }
  return blocks;
}

const BLOCKS = fencedBlocks(README);
/** Only the lines PowerShell would actually run, so prose comments cannot mask a bad command. */
const EXECUTABLE_POWERSHELL = BLOCKS.filter((block) => block.lang === "powershell")
  .map((block) => block.body)
  .join("\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

test("no copy-pasteable example uses the failing --file import mode", () => {
  for (const block of BLOCKS) {
    assert.ok(
      !block.body.includes("--file"),
      `the README's ${block.lang || "text"} block must not contain --file; use --command="$(< file)" instead`
    );
  }
  assert.ok(!README.includes("--file="), "a --file= example must not reappear anywhere in the README");
  for (const migration of MIGRATIONS) {
    for (const line of migration.text.split("\n").filter((text) => text.includes("d1 execute"))) {
      assert.ok(!line.includes("--file"), `${migration.name} must not document a --file command: ${line.trim()}`);
    }
  }
});

test("file-reading D1 examples use the --command= equals form, never the space-separated form", () => {
  const fileCommands = [
    '--command="$(< schema.sql)"',
    '--command="$(< migrations/0001_providers_constraints.sql)"',
    '--command="$(< migrations/0002_providers_status_disabled.sql)"',
    '--command="$(< .wrangler/sync-providers.sql)"',
  ];
  for (const command of fileCommands) {
    assert.ok(README.includes(command), `README must keep the ${command} example`);
  }
  for (const block of BLOCKS) {
    assert.ok(
      !block.body.includes('--command "$(<'),
      `a value starting with "-" is parsed as another option; the ${block.lang || "text"} block needs the equals form`
    );
  }
  for (const migration of MIGRATIONS) {
    assert.ok(
      migration.text.includes(`--command="$(< migrations/${migration.name})"`),
      `${migration.name} must document its own --command= example`
    );
  }
});

test("the real sync SQL output never advertises the failing file mode", () => {
  const generator = spawnSync(process.execPath, [SYNC_GENERATOR], { encoding: "utf8" });
  assert.equal(generator.status, 0, `the sync generator must run cleanly: ${generator.stderr}`);
  assert.ok(
    generator.stdout.includes('--command="$(< <this file>)"'),
    "the header written into the real generated SQL must show the --command= form"
  );
  assert.ok(
    !generator.stdout.includes("--file"),
    "the real generated SQL must not advertise the /import file mode"
  );
  // .wrangler/sync-providers.sql is a gitignored build artifact (absent in a fresh checkout),
  // but it is exactly the copy someone runs by hand, so a stale one must not go unnoticed.
  const artifact = new URL("../.wrangler/sync-providers.sql", import.meta.url);
  if (existsSync(artifact)) {
    assert.ok(
      !readFileSync(artifact, "utf8").includes("--file"),
      "the local .wrangler/sync-providers.sql is stale; regenerate it with `node scripts/sync-providers.mjs --out .wrangler/sync-providers.sql`"
    );
  }
});

test("Windows PowerShell gets a verified spelling instead of a bash-only command", () => {
  assert.ok(
    BLOCKS.some((block) => block.lang === "powershell"),
    "README must document a PowerShell variant of the file-reading D1 commands"
  );
  assert.ok(
    EXECUTABLE_POWERSHELL.includes("Get-Content -Raw -Encoding UTF8"),
    "PowerShell must read the SQL as explicit UTF-8 text (the files have no BOM)"
  );
  assert.ok(
    EXECUTABLE_POWERSHELL.includes(".Replace('\"', '\\\"')"),
    "Windows PowerShell 5.1 drops embedded quotes, so the SQL must escape them before it is passed"
  );
  assert.ok(EXECUTABLE_POWERSHELL.includes("--command=$sql"), "PowerShell must use the equals form too");
  assert.ok(!EXECUTABLE_POWERSHELL.includes("$(<"), "bash-only file substitution does not exist in PowerShell");
  assert.ok(
    !/\bnpx\b/.test(EXECUTABLE_POWERSHELL),
    "npx's .cmd shim truncates multi-line arguments at the first newline; PowerShell must call wrangler directly"
  );
});

test("the README keeps the 7003 transport explanation and the do-not-touch-identity warning", () => {
  assert.ok(README.includes("7003"), "the 7003 symptom must stay documented");
  assert.ok(
    README.includes("/import") && README.includes("/query"),
    "the /import vs /query transport must stay explained"
  );
  assert.ok(
    /不要修改[\s\S]{0,64}CLOUDFLARE_ACCOUNT_ID/.test(README),
    "readers must be told not to change the account id / database name / D1 UUID when they hit 7003"
  );
  assert.ok(
    README.includes("npx wrangler d1 migrations apply freebie-db --remote"),
    "the manual migration path must stay documented; the workflow never applies 0001 / 0002"
  );
});

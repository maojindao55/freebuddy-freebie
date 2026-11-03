/**
 * LongCat declaration contract (submissions/providers/longcat.json).
 *
 * LongCat is Meituan's model platform. It is served from an OpenAI-compatible endpoint
 * (`https://api.longcat.chat/openai/v1`) and also speaks Anthropic Messages and the OpenAI
 * Responses API, so it is submitted as a normal runtime declaration, reported through the
 * invite link the reporter was given. Three properties are worth pinning on their own,
 * beyond the directory-wide checks in tests/historical-import.test.js:
 *  - the endpoint, env key and model id match the official docs (a wrong base URL or model
 *    id would import a preset that cannot work),
 *  - the invite link is the registration/console entry while `homepage` stays the plain
 *    official entry, and every URL stays inside the safe-https contract,
 *  - the free-tier wording defers the actual amounts to the promo page / console instead of
 *    promising a fixed token grant that the official docs do not state.
 * The declaration is also round-tripped through the real sync CLI and the Worker API,
 * because "merged declaration -> approved upsert" is the only write path into the catalog.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { isSafeHttpsUrl, validateDeclaration } from "../scripts/sync-providers.mjs";
import { requestProviders } from "./helpers/d1-stub.mjs";

const DECLARATION_PATH = fileURLToPath(new URL("../submissions/providers/longcat.json", import.meta.url));
const SYNC_SCRIPT = fileURLToPath(new URL("../scripts/sync-providers.mjs", import.meta.url));
const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const DECLARATION = JSON.parse(readFileSync(DECLARATION_PATH, "utf8"));

/** Comment the sync script writes for this declaration when it scans the real directory. */
const SQL_LABEL = "-- submissions/providers/longcat.json";
const INVITE_CODE = "6UAFA7H3";
const INVITE_URL = `https://longcat.chat/platform/product?inviteCode=${INVITE_CODE}`;
const BASE_URL = "https://api.longcat.chat/openai/v1";
/** Model id verified against longcat.chat/platform/docs (LongCat-2.5, 1M context, 128K output). */
const VERIFIED_MODEL_IDS = ["LongCat-2.5"];

test("the declaration is accepted by the sync validator as an approved cn OpenAI provider", () => {
  assert.equal(basename(DECLARATION_PATH), `${DECLARATION.id}.json`, "the file name must equal the id");
  assert.equal(DECLARATION.id, "longcat");
  assert.equal(DECLARATION.status, "approved");
  assert.equal(DECLARATION.region, "cn");
  assert.equal(DECLARATION.protocol, "openai-chat");
  assert.equal(DECLARATION.baseUrl, BASE_URL);
  assert.equal(DECLARATION.envKey, "LONGCAT_API_KEY");

  const { messages, row } = validateDeclaration(DECLARATION);
  assert.deepEqual(messages, [], "the sync script must accept the declaration untouched");
  assert.equal(row.id, "longcat");
  assert.equal(row.status, "approved");
  assert.equal(row.region, "cn");
  assert.equal(row.protocol, "openai-chat");
  assert.equal(row.base_url, BASE_URL);
  assert.equal(row.env_key, "LONGCAT_API_KEY");
  assert.equal(row.submitted_by, null, "no author is invented when the declaration does not name one");

  assert.deepEqual(
    JSON.parse(row.models).map((model) => model.id),
    VERIFIED_MODEL_IDS,
    "models must contain exactly the verified ids, LongCat-2.5 first as the default model"
  );
  const [model] = DECLARATION.models;
  assert.equal(model.contextWindow, 1048576, "the docs state a 1,048,576 token context window");
  assert.equal(model.supportsVision, true, "LongCat-2.5 accepts images and videos");
});

test("the protocols match the documented endpoints", () => {
  assert.deepEqual(
    DECLARATION.protocols.slice().sort(),
    ["anthropic", "openai-chat", "openai-responses"],
    "LongCat documents OpenAI Chat Completions, OpenAI Responses and Anthropic Messages"
  );
  assert.ok(
    DECLARATION.protocols.includes(DECLARATION.protocol),
    "the primary protocol must also be listed in protocols"
  );
});

test("URLs stay in the safe-https contract: invite console entry, invite-free homepage", () => {
  for (const field of ["homepage", "consoleUrl", "baseUrl"]) {
    assert.ok(isSafeHttpsUrl(DECLARATION[field]), `${field} must be a safe https URL`);
  }

  const homepage = new URL(DECLARATION.homepage);
  assert.equal(homepage.hostname, "longcat.chat");
  assert.equal(DECLARATION.homepage, "https://longcat.chat", "the homepage must stay the plain official entry");
  assert.equal(homepage.search, "", "no query string on the homepage");

  const consoleUrl = new URL(DECLARATION.consoleUrl);
  assert.equal(consoleUrl.hostname, "longcat.chat");
  assert.equal(DECLARATION.consoleUrl, INVITE_URL, "the reporter's invite link stays the console/registration entry");
  assert.equal(consoleUrl.searchParams.get("inviteCode"), INVITE_CODE);
});

test("the claim guide walks through invite signup, real-name verification and API key creation", () => {
  assert.deepEqual(Object.keys(DECLARATION.claimGuide).sort(), ["en", "zh-CN"]);
  for (const [locale, steps] of Object.entries(DECLARATION.claimGuide)) {
    assert.ok(Array.isArray(steps) && steps.length >= 3, `${locale}: the guide needs a few concrete steps`);
    assert.ok(steps.length <= 10, `${locale}: the schema caps the guide at 10 steps`);
    assert.equal(new Set(steps).size, steps.length, `${locale}: steps must not repeat`);
  }

  const zh = DECLARATION.claimGuide["zh-CN"].join("\n");
  assert.match(zh, /实名认证/, "the invite bonus requires real-name verification, so it must be a step");
  assert.match(zh, /1000 万/, "the guide must state the reward the verification unlocks");
  assert.match(zh, /30 个自然日/, "the guide must warn that the reward expires in 30 days");
  assert.match(zh, /API Key/i, "the guide must end with an API key");
  assert.match(zh, /api\.longcat\.chat\/openai\/v1/, "the guide must hand over the working endpoint");
  assert.ok(DECLARATION.claimGuide.en.some((step) => /api key/i.test(step)), "the en guide must mention the API key");
});

test("the free-tier summary quotes the official invite program figures", () => {
  assert.deepEqual(Object.keys(DECLARATION.freeTierSummary).sort(), ["en", "zh-CN"]);
  const zh = DECLARATION.freeTierSummary["zh-CN"];

  // Figures verified on the official campaign page
  // https://longcat.chat/platform/benefits/invite_reward (activity one: real-name reward,
  // activity two: group purchase rebate). They are quoted only because that page states them.
  assert.match(zh, /各得 1000 万 Tokens/, "the 10M token reward for both sides must be quoted");
  assert.match(zh, /最高可得 2000 万/, "the stack-up-to-20M figure must be quoted");
  assert.match(zh, /30 个自然日/, "the 30-day validity must be quoted");
  assert.match(zh, /最多邀请 50 个实名账号/, "the 50-invitee cap must be quoted");
  assert.match(zh, /5%/, "the 5% first-purchase rebate must be quoted");
  assert.match(zh, /10%/, "the 10% group-leader tier must be quoted");
  assert.match(zh, /50%/, "the 50% group-leader tier must be quoted");
  assert.match(zh, /以活动页为准/, "promo terms still defer to the campaign page");

  const en = DECLARATION.freeTierSummary.en;
  assert.match(en, /10M/, "the en summary must quote the same 10M figure");
  assert.match(en, /20M/, "the en summary must quote the same 20M figure");
  assert.match(en, /5%/, "the en summary must quote the same 5% rebate");
  assert.match(en, /campaign page/i, "the en summary must still defer to the campaign page");
});

test("the real sync run turns the declaration into an approved upsert that the API serves", async (t) => {
  const outDir = mkdtempSync(join(tmpdir(), "freebuddy-longcat-"));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  const out = join(outDir, "sync.sql");

  // No --dir: this is exactly the invocation the sync workflow uses on submissions/providers.
  const result = spawnSync(process.execPath, [SYNC_SCRIPT, "--out", out], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");

  const sql = readFileSync(out, "utf8");
  const start = sql.indexOf(SQL_LABEL);
  assert.ok(start !== -1, `the sync must emit a statement labelled ${SQL_LABEL}`);
  const end = sql.indexOf(";\n", start);
  const statement = sql.slice(start, end);

  assert.match(statement, /INSERT INTO providers \(/);
  assert.match(statement, /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.ok(statement.includes("'longcat'"), "the upsert must be keyed by the declaration id");
  assert.ok(statement.includes("'approved'"), "the upsert must carry status approved");
  assert.ok(statement.includes(`'${BASE_URL}'`));
  assert.ok(statement.includes(`'${INVITE_URL}'`));

  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  sqlite.exec(sql);

  const row = sqlite.prepare("SELECT status, submitted_by FROM providers WHERE id = 'longcat'").get();
  assert.equal(row.status, "approved");
  assert.equal(row.submitted_by, null);

  const { body } = await requestProviders(sqlite);
  const served = body.providers.find((provider) => provider.id === "longcat");
  assert.ok(served, "GET /api/providers must serve the new provider");
  assert.equal(served.status, undefined, "the public payload stays status-free like every other provider");
  assert.equal(served.baseUrl, BASE_URL);
  assert.equal(served.consoleUrl, INVITE_URL);
  assert.deepEqual(
    served.models.map((model) => model.id),
    VERIFIED_MODEL_IDS
  );
  assert.deepEqual(served.protocols.slice().sort(), ["anthropic", "openai-chat", "openai-responses"]);
});



/**
 * SenseAudio declaration contract (submissions/providers/senseaudio.json).
 *
 * SenseAudio is the SenseTime voice/API platform: the S2 chat models are served from an
 * OpenAI-compatible endpoint, so it is submitted as a normal runtime declaration, reported
 * through an invitation link. Two properties of that submission are worth pinning on their
 * own, beyond the directory-wide checks in tests/historical-import.test.js:
 *  - the invitation link is the registration/console entry while `homepage` and `baseUrl`
 *    stay invite-free, safe https URLs (the runtime and sync layers both enforce https,
 *    credential-free, public hosts — this keeps the submitted values inside that contract),
 *  - the free-tier wording points at the console instead of stating an unverified fixed
 *    amount / coupon figure.
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

const DECLARATION_PATH = fileURLToPath(new URL("../submissions/providers/senseaudio.json", import.meta.url));
const SYNC_SCRIPT = fileURLToPath(new URL("../scripts/sync-providers.mjs", import.meta.url));
const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const DECLARATION = JSON.parse(readFileSync(DECLARATION_PATH, "utf8"));

/** Comment the sync script writes for this declaration when it scans the real directory. */
const SQL_LABEL = "-- submissions/providers/senseaudio.json";
const INVITE_URL = "https://senseaudio.cn/login?inviteCode=6EX3VALX";

/** Model ids verified against docs.senseaudio.cn (S2 series, TTS and ASR endpoints). */
const VERIFIED_MODEL_IDS = [
  "senseaudio-s2",
  "senseaudio-s2-flash",
  "senseaudio-s2-lite",
  "senseaudio-tts-1.5-260319",
  "senseaudio-asr-lite-1.5-260319"
];

test("the declaration is accepted by the sync validator as an approved cn OpenAI provider", () => {
  assert.equal(basename(DECLARATION_PATH), `${DECLARATION.id}.json`, "the file name must equal the id");
  assert.equal(DECLARATION.id, "senseaudio");
  assert.equal(DECLARATION.status, "approved");
  assert.equal(DECLARATION.region, "cn");
  assert.equal(DECLARATION.protocol, "openai-chat");
  assert.equal(DECLARATION.baseUrl, "https://api.senseaudio.cn/v1");
  assert.equal(DECLARATION.envKey, "SENSEAUDIO_API_KEY", "the docs use SENSEAUDIO_API_KEY as the bearer key name");

  const { messages, row } = validateDeclaration(DECLARATION);
  assert.deepEqual(messages, [], "the sync script must accept the declaration untouched");
  assert.equal(row.id, "senseaudio");
  assert.equal(row.status, "approved");
  assert.equal(row.region, "cn");
  assert.equal(row.protocol, "openai-chat");
  assert.equal(row.base_url, "https://api.senseaudio.cn/v1");
  assert.equal(row.env_key, "SENSEAUDIO_API_KEY");
  assert.equal(row.submitted_by, null, "no author is invented when the declaration does not name one");

  assert.deepEqual(
    JSON.parse(row.models).map((model) => model.id),
    VERIFIED_MODEL_IDS,
    "models must contain exactly the verified ids, S2 first as the default model"
  );
  assert.deepEqual(
    DECLARATION.models.map((model) => Object.keys(model).sort()),
    VERIFIED_MODEL_IDS.map(() => ["id", "name"]),
    "no unverified model field (e.g. an invented contextWindow) may be added"
  );
});

test("URLs stay in the safe-https contract: invite console entry, invite-free homepage", () => {
  for (const field of ["homepage", "consoleUrl", "baseUrl"]) {
    assert.ok(isSafeHttpsUrl(DECLARATION[field]), `${field} must be a safe https URL`);
  }

  const homepage = new URL(DECLARATION.homepage);
  assert.equal(homepage.hostname, "senseaudio.cn");
  assert.equal(DECLARATION.homepage, "https://senseaudio.cn", "the homepage must stay the plain official entry");
  assert.equal(homepage.search, "", "no query string on the homepage");

  const consoleUrl = new URL(DECLARATION.consoleUrl);
  assert.equal(consoleUrl.hostname, "senseaudio.cn");
  assert.equal(DECLARATION.consoleUrl, INVITE_URL, "the reporter's invitation link stays the console/registration entry");
  assert.equal(consoleUrl.searchParams.get("inviteCode"), "6EX3VALX");
});

test("the free-tier summary points at the console instead of an unverified fixed amount", () => {
  assert.deepEqual(Object.keys(DECLARATION.freeTierSummary).sort(), ["en", "zh-CN"]);
  const text = Object.values(DECLARATION.freeTierSummary).join("\n");

  assert.ok(
    DECLARATION.freeTierSummary["zh-CN"].includes("以控制台为准"),
    "the zh-CN summary must defer the actual quota to the console"
  );
  assert.match(DECLARATION.freeTierSummary.en, /console/i, "the en summary must defer the actual quota to the console");
  assert.ok(
    !/\d+\s*(元|代金券|券)/.test(text),
    "no fixed credit/coupon amount may be promised while it is not verifiable in the official docs"
  );
});

test("the real sync run turns the declaration into an approved upsert that the API serves", async (t) => {
  const outDir = mkdtempSync(join(tmpdir(), "freebuddy-senseaudio-"));
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
  assert.ok(statement.includes("'senseaudio'"), "the upsert must be keyed by the declaration id");
  assert.ok(statement.includes("'approved'"), "the upsert must carry status approved");
  assert.ok(statement.includes("'https://api.senseaudio.cn/v1'"));
  assert.ok(statement.includes("'https://senseaudio.cn/login?inviteCode=6EX3VALX'"));

  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  sqlite.exec(sql);

  const row = sqlite.prepare("SELECT status, submitted_by FROM providers WHERE id = 'senseaudio'").get();
  assert.equal(row.status, "approved");
  assert.equal(row.submitted_by, null);

  const { body } = await requestProviders(sqlite);
  const served = body.providers.find((provider) => provider.id === "senseaudio");
  assert.ok(served, "GET /api/providers must serve the new provider");
  assert.equal(served.status, undefined, "the public payload stays status-free like every other provider");
  assert.equal(served.baseUrl, "https://api.senseaudio.cn/v1");
  assert.equal(served.consoleUrl, INVITE_URL);
  assert.deepEqual(
    served.models.map((model) => model.id),
    VERIFIED_MODEL_IDS
  );
});

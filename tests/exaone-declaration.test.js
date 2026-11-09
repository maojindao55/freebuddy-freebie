/**
 * EXAONE declaration contract (submissions/providers/exaone.json).
 *
 * LG AI Research opened the EXAONE API Platform on 2026-11-09 with K-EXAONE 2.5 served from
 * an OpenAI-compatible endpoint (`https://api.exaone.ai/v1`), so it is submitted as a normal
 * runtime declaration. Beyond the directory-wide checks in tests/historical-import.test.js,
 * four things are worth pinning because the reported facts are unusually easy to get wrong:
 *  - the model id is `k-exaone_v2.5` and the context is 524,288 tokens, exactly as the
 *    endpoint page states (input + max_tokens must fit in it),
 *  - the rate limits are per second / minute / day (1 / 60 / 86,400) and are NOT a total
 *    quota — the summary must not invent a total allowance or an end date,
 *  - the "currently free" claim is the platform's own wording, and the 30-day API key
 *    lifetime must be surfaced because it silently breaks working integrations,
 *  - the endpoint is text-only and the docs cover Korean/English, so nothing may promise
 *    Chinese support or multimodality.
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

const DECLARATION_PATH = fileURLToPath(new URL("../submissions/providers/exaone.json", import.meta.url));
const SYNC_SCRIPT = fileURLToPath(new URL("../scripts/sync-providers.mjs", import.meta.url));
const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const DECLARATION = JSON.parse(readFileSync(DECLARATION_PATH, "utf8"));

/** Comment the sync script writes for this declaration when it scans the real directory. */
const SQL_LABEL = "-- submissions/providers/exaone.json";
const BASE_URL = "https://api.exaone.ai/v1";
const HOMEPAGE = "https://docs.exaone.ai/en/docs/overview";
const CONSOLE_URL = "https://docs.exaone.ai/en/login";
/** Verified against https://docs.exaone.ai/en/docs/k-exaone-2.5 (model id) and /en/docs/models. */
const VERIFIED_MODEL_IDS = ["k-exaone_v2.5"];
const CONTEXT_WINDOW = 524288;

test("the declaration is accepted by the sync validator as an approved OpenAI provider", () => {
  assert.equal(basename(DECLARATION_PATH), `${DECLARATION.id}.json`, "the file name must equal the id");
  assert.equal(DECLARATION.id, "exaone");
  assert.equal(DECLARATION.status, "approved");
  assert.equal(DECLARATION.protocol, "openai-chat");
  assert.equal(DECLARATION.baseUrl, BASE_URL);
  assert.equal(DECLARATION.envKey, "EXAONE_API_KEY", "the docs read the key from EXAONE_API_KEY");

  const { messages, row } = validateDeclaration(DECLARATION);
  assert.deepEqual(messages, [], "the sync script must accept the declaration untouched");
  assert.equal(row.id, "exaone");
  assert.equal(row.status, "approved");
  assert.equal(row.protocol, "openai-chat");
  assert.equal(row.base_url, BASE_URL);
  assert.equal(row.env_key, "EXAONE_API_KEY");
  assert.equal(row.submitted_by, null, "no author is invented when the declaration does not name one");

  assert.deepEqual(
    JSON.parse(row.models).map((model) => model.id),
    VERIFIED_MODEL_IDS,
    "the model id must keep the official spelling k-exaone_v2.5"
  );
});

test("the model keeps the documented 512K context and promises no multimodality", () => {
  const [model] = DECLARATION.models;
  assert.equal(model.id, "k-exaone_v2.5");
  assert.equal(model.contextWindow, CONTEXT_WINDOW, "the endpoint page states 524,288 tokens");
  assert.equal(
    model.supportsVision,
    undefined,
    "K-EXAONE 2.5 is text-only, so supportsVision must not be set"
  );

  const text = Object.values(DECLARATION.freeTierSummary).join("\n");
  assert.match(text, /纯文本|text-only/i, "the summaries must state that it is text-only");
});

test("the rate limits match the official Rate Limits page and are not a total quota", () => {
  const zh = DECLARATION.freeTierSummary["zh-CN"];
  const en = DECLARATION.freeTierSummary.en;
  const guide = [...DECLARATION.claimGuide["zh-CN"], ...DECLARATION.claimGuide.en].join("\n");

  // https://docs.exaone.ai/en/docs/rate-limits documents x-second/x-minute/x-day headers; the
  // sample 429 response exposes 1 / 60 / 86400 as the window maxima.
  assert.match(zh, /QPS 1|每秒 1 次/, "the zh summary must state the 1 request/second limit");
  assert.match(zh, /60/, "the zh summary must state the 60 requests/minute limit");
  assert.match(zh, /86,400/, "the zh summary must state the 86,400 requests/day limit");
  assert.match(en, /1\/second/, "the en summary must state the per-second limit");
  assert.match(en, /60\/minute/, "the en summary must state the per-minute limit");
  assert.match(en, /86,400\/day/, "the en summary must state the per-day limit");
  assert.match(guide, /1 次\/秒/, "the guide must hand the concrete limits over");

  // The platform publishes request-rate windows only: no total allowance, no end date.
  // Saying that nothing was published is correct; inventing a figure is not.
  for (const invented of [/\d+\s*(次|万|tokens)\s*\/\s*月/i, /总额度(为|是)\s*\d/, /截止(日期|时间)为/i]) {
    assert.doesNotMatch(
      zh,
      invented,
      `no total quota or end date is published, so ${invented} must not be claimed`
    );
  }
  assert.match(zh, /未公布/, "the summary must state that no total quota or end date was published");
});

test("the free-tier wording is the platform's own 'currently free' claim, with the 30-day key lifetime surfaced", () => {
  // https://docs.exaone.ai/en/terms/faq : "All APIs on EXAONE API Platform are currently
  // available free of charge." and "API keys are valid for 30 days from the date of issue."
  const zh = DECLARATION.freeTierSummary["zh-CN"];
  const en = DECLARATION.freeTierSummary.en;

  assert.match(zh, /免费/, "the zh summary must state that the service is free");
  assert.match(en, /currently free/i, "the en summary must state that it is currently free");
  assert.match(zh, /30 天/, "the 30-day key lifetime must be surfaced in the summary");
  assert.match(en, /30 days/i, "the 30-day key lifetime must be surfaced in the summary");

  const guide = [...DECLARATION.claimGuide["zh-CN"], ...DECLARATION.claimGuide.en].join("\n");
  assert.match(guide, /30 天/, "the guide must warn that the key expires in 30 days");
  assert.match(guide, /k-exaone_v2\.5/, "the guide must name the exact model id to send");
  assert.ok(
    DECLARATION.claimGuide["zh-CN"].some((step) => /只能看到一次|仅显示一次|再也取不回/.test(step)),
    "the guide must warn that the secret is shown only once"
  );

  // The docs cover Korean and English only; Chinese support is unverified and must not be sold.
  assert.match(Object.values(DECLARATION.freeTierSummary).join("\n"), /韩语|Korean/i, "the docs' Korean support must be quoted");
  assert.doesNotMatch(zh, /支持中文|中文优化/, "no Chinese support may be claimed for this model");
});

test("the languages, terms and age floor are quoted from the official pages", () => {
  const zh = DECLARATION.freeTierSummary["zh-CN"];
  // Models page: "Languages Korean / English". Terms: non-commercial only, 19 years or older.
  assert.match(zh, /英语|English/i, "the docs' English support must be quoted");
  assert.match(zh, /非商业|non-commercial/i, "the terms restrict use to non-commercial purposes");
  assert.match(zh, /19/, "the terms require users to be 19 or older");
  assert.match(zh, /训练/, "the terms allow input/output to be used for training, which must be disclosed");
});

test("URLs stay in the safe-https contract and every quoted host resolves", () => {
  for (const field of ["homepage", "consoleUrl", "baseUrl"]) {
    assert.ok(isSafeHttpsUrl(DECLARATION[field]), `${field} must be a safe https URL`);
  }

  assert.equal(new URL(DECLARATION.homepage).hostname, "docs.exaone.ai");
  assert.equal(new URL(DECLARATION.consoleUrl).hostname, "docs.exaone.ai");
  assert.equal(DECLARATION.consoleUrl, CONSOLE_URL, "the console entry is the documented sign-in page");

  const baseUrl = new URL(DECLARATION.baseUrl);
  assert.equal(baseUrl.hostname, "api.exaone.ai");
  assert.equal(baseUrl.pathname, "/v1", "the OpenAI-compatible base path is /v1");
  assert.ok(!DECLARATION.baseUrl.endsWith("/"), "baseUrl must not end with a slash");
});

test("the claim guide walks through signup, key creation and the working endpoint", () => {
  assert.deepEqual(Object.keys(DECLARATION.claimGuide).sort(), ["en", "zh-CN"]);
  for (const [locale, steps] of Object.entries(DECLARATION.claimGuide)) {
    assert.ok(Array.isArray(steps) && steps.length >= 3, `${locale}: the guide needs a few concrete steps`);
    assert.ok(steps.length <= 10, `${locale}: the schema caps the guide at 10 steps`);
    assert.equal(new Set(steps).size, steps.length, `${locale}: steps must not repeat`);
  }

  const zh = DECLARATION.claimGuide["zh-CN"].join("\n");
  assert.match(zh, /docs\.exaone\.ai/, "the guide must link the official signup entry");
  assert.match(zh, /API key/i, "the guide must explain where the key is created");
  assert.match(zh, /api\.exaone\.ai\/v1/, "the guide must hand over the working base URL");
  assert.ok(DECLARATION.claimGuide.en.some((step) => /api key/i.test(step)), "the en guide must mention the API key");
});

test("the real sync run turns the declaration into an approved upsert that the API serves", async (t) => {
  const outDir = mkdtempSync(join(tmpdir(), "freebuddy-exaone-"));
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
  assert.ok(statement.includes("'exaone'"), "the upsert must be keyed by the declaration id");
  assert.ok(statement.includes("'approved'"), "the upsert must carry status approved");
  assert.ok(statement.includes(`'${BASE_URL}'`));

  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  sqlite.exec(sql);

  const row = sqlite.prepare("SELECT status, submitted_by FROM providers WHERE id = 'exaone'").get();
  assert.equal(row.status, "approved");
  assert.equal(row.submitted_by, null);

  const { body } = await requestProviders(sqlite);
  const served = body.providers.find((provider) => provider.id === "exaone");
  assert.ok(served, "GET /api/providers must serve the new provider");
  assert.equal(served.status, undefined, "the public payload stays status-free like every other provider");
  assert.equal(served.baseUrl, BASE_URL);
  assert.equal(served.consoleUrl, CONSOLE_URL);
  assert.equal(served.homepage, HOMEPAGE);
  assert.deepEqual(
    served.models.map((model) => model.id),
    VERIFIED_MODEL_IDS
  );
});

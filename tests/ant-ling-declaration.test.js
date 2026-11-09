/**
 * Ant Ling declaration contract (submissions/providers/ant-ling.json).
 *
 * Ant Ling (蚂蚁百灵) is Ant Group's open-source model family. It is served from an
 * OpenAI-compatible endpoint (`https://api.ant-ling.com/v1`) and also documents an
 * Anthropic Messages endpoint (`https://api.ant-ling.com/anthropic`), so it is submitted as
 * a normal runtime declaration. Three properties are worth pinning on their own, beyond the
 * directory-wide checks in tests/historical-import.test.js:
 *  - the endpoints, env key and model ids / context windows match the official docs
 *    (a wrong base URL or model id would import a preset that cannot work),
 *  - the console link is the documented token page while `homepage` stays the plain
 *    official entry, and every URL stays inside the safe-https contract,
 *  - the free-tier wording keeps the launch-limited offer honest: Ling-3.2-flash is free
 *    only for the first two weeks after its 2026-11-05 launch, the price after the promo
 *    is deferred to the official pricing page, and the daily free quota / QPS cap the docs
 *    state are quoted as-is.
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

const DECLARATION_PATH = fileURLToPath(new URL("../submissions/providers/ant-ling.json", import.meta.url));
const SYNC_SCRIPT = fileURLToPath(new URL("../scripts/sync-providers.mjs", import.meta.url));
const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const DECLARATION = JSON.parse(readFileSync(DECLARATION_PATH, "utf8"));

/** Comment the sync script writes for this declaration when it scans the real directory. */
const SQL_LABEL = "-- submissions/providers/ant-ling.json";
const BASE_URL = "https://api.ant-ling.com/v1";
const ANTHROPIC_URL = "https://api.ant-ling.com/anthropic";
const HOMEPAGE = "https://www.ant-ling.com";
const CONSOLE_URL = "https://chat.ant-ling.com/open";
/**
 * Model ids and context windows verified against
 * https://developer.ant-ling.com/zh-CN/docs/models/ling/ and the FAQ context table:
 * Ling-3.2-flash 1M (native multimodal), Ling-3.1-flash 1M, Ling-3.0-flash-VL 256K,
 * Ling-3.0-flash 256K.
 */
const VERIFIED_MODELS = [
  { id: "Ling-3.2-flash", contextWindow: 1048576, supportsVision: true },
  { id: "Ling-3.1-flash", contextWindow: 1048576 },
  { id: "Ling-3.0-flash-VL", contextWindow: 262144, supportsVision: true },
  { id: "Ling-3.0-flash", contextWindow: 262144 }
];

test("the declaration is accepted by the sync validator as an approved cn OpenAI provider", () => {
  assert.equal(basename(DECLARATION_PATH), `${DECLARATION.id}.json`, "the file name must equal the id");
  assert.equal(DECLARATION.id, "ant-ling");
  assert.equal(DECLARATION.status, "approved");
  assert.equal(DECLARATION.region, "cn");
  assert.equal(DECLARATION.protocol, "openai-chat");
  assert.equal(DECLARATION.baseUrl, BASE_URL);
  assert.equal(DECLARATION.envKey, "ANT_LING_API_KEY");

  const { messages, row } = validateDeclaration(DECLARATION);
  assert.deepEqual(messages, [], "the sync script must accept the declaration untouched");
  assert.equal(row.id, "ant-ling");
  assert.equal(row.status, "approved");
  assert.equal(row.region, "cn");
  assert.equal(row.protocol, "openai-chat");
  assert.equal(row.base_url, BASE_URL);
  assert.equal(row.env_key, "ANT_LING_API_KEY");
  assert.equal(row.submitted_by, null, "no author is invented when the declaration does not name one");

  assert.deepEqual(
    JSON.parse(row.models).map((model) => model.id),
    VERIFIED_MODELS.map((model) => model.id),
    "models must contain exactly the verified ids, Ling-3.2-flash first as the default model"
  );
});

test("the model contexts and multimodal flags match the official model docs", () => {
  assert.deepEqual(
    DECLARATION.models.map((model) => ({
      id: model.id,
      contextWindow: model.contextWindow,
      ...(model.supportsVision ? { supportsVision: true } : {})
    })),
    VERIFIED_MODELS,
    "context windows and vision support must stay exactly as documented"
  );
});

test("the protocols match the documented endpoints", () => {
  assert.deepEqual(
    DECLARATION.protocols.slice().sort(),
    ["anthropic", "openai-chat"],
    "Ant Ling documents OpenAI-compatible and Anthropic Messages endpoints"
  );
  assert.ok(
    DECLARATION.protocols.includes(DECLARATION.protocol),
    "the primary protocol must also be listed in protocols"
  );
  assert.ok(
    DECLARATION.claimGuide["zh-CN"].some((step) => step.includes(ANTHROPIC_URL)),
    "the guide must hand over the Anthropic endpoint for Anthropic-protocol clients"
  );
});


test("URLs stay in the safe-https contract: plain homepage, documented console entry", () => {
  for (const field of ["homepage", "consoleUrl", "baseUrl"]) {
    assert.ok(isSafeHttpsUrl(DECLARATION[field]), `${field} must be a safe https URL`);
  }

  const homepage = new URL(DECLARATION.homepage);
  assert.equal(homepage.hostname, "www.ant-ling.com");
  assert.equal(DECLARATION.homepage, HOMEPAGE, "the homepage must stay the plain official entry");
  assert.equal(homepage.search, "", "no query string on the homepage");

  assert.equal(DECLARATION.consoleUrl, CONSOLE_URL, "the console link is the API console the docs link to");
  assert.equal(
    new URL(DECLARATION.consoleUrl).search,
    "",
    "the console entry carries no invite or tracking parameters"
  );

  const baseUrl = new URL(DECLARATION.baseUrl);
  assert.equal(baseUrl.hostname, "api.ant-ling.com");
  assert.equal(baseUrl.pathname, "/v1", "the OpenAI-compatible endpoint ends at /v1");
  assert.ok(!DECLARATION.baseUrl.endsWith("/"), "baseUrl must not end with a slash");
});

test("the claim guide walks through signup, token creation and the working endpoint", () => {
  assert.deepEqual(Object.keys(DECLARATION.claimGuide).sort(), ["en", "zh-CN"]);
  for (const [locale, steps] of Object.entries(DECLARATION.claimGuide)) {
    assert.ok(Array.isArray(steps) && steps.length >= 3, `${locale}: the guide needs a few concrete steps`);
    assert.ok(steps.length <= 10, `${locale}: the schema caps the guide at 10 steps`);
    assert.equal(new Set(steps).size, steps.length, `${locale}: steps must not repeat`);
  }

  const zh = DECLARATION.claimGuide["zh-CN"].join("\n");
  assert.match(zh, /支付宝/, "the docs require linking Alipay, so it must be a step");
  assert.match(zh, /创建令牌/, "the token creation step is how the key is obtained");
  assert.match(zh, /api\.ant-ling\.com\/v1/, "the guide must hand over the working endpoint");
  assert.match(zh, /Ling-3\.2-flash/, "the guide must name the model to call");
  assert.match(zh, /限时免费/, "the guide must state that the launch offer is limited-time");
  assert.ok(DECLARATION.claimGuide.en.some((step) => /api key/i.test(step)), "the en guide must mention the API key");
});

test("the free-tier summary follows the post-upgrade monthly credit model", () => {
  assert.deepEqual(Object.keys(DECLARATION.freeTierSummary).sort(), ["en", "zh-CN"]);
  const zh = DECLARATION.freeTierSummary["zh-CN"];

  // Verified on https://developer.ant-ling.com/zh-CN/docs/getting-started/changelog/billing-upgrade/
  // (billing upgrade, unified switch 2026-10-31 23:59:59 Beijing time) and the pricing page.
  assert.match(zh, /Ling-3\.2-flash/, "the summary must name the promoted model");
  assert.match(zh, /2 周限时免费/, "the two-week free window must be quoted");
  assert.match(zh, /恢复按量计费|恢复原价/, "the summary must warn that billing resumes after the promo");
  assert.match(zh, /以官网定价页为准/, "the restored price must defer to the official pricing page");
  assert.match(zh, /20 元/, "the 20 CNY signup voucher stated by the upgrade notice must be quoted");
  assert.match(zh, /每月 1 日/, "the monthly voucher issue date must be quoted");
  assert.match(zh, /10 元/, "the 10 CNY monthly voucher must be quoted");
  assert.match(zh, /QPS 限 2/, "the documented QPS cap must be quoted");

  // The daily per-token grant was explicitly discontinued by the same notice. Mentioning that
  // it ended is fine (and useful); presenting it as a current benefit is not.
  const text = Object.values(DECLARATION.freeTierSummary).join("\n");
  assert.doesNotMatch(
    text,
    /每日\s*50\s*万\s*tokens\s*免费额度|grants?\s+500K free tokens per day/i,
    "the discontinued daily 500K-token grant must not be advertised as a current benefit"
  );
  assert.match(
    DECLARATION.freeTierSummary["zh-CN"],
    /已停止按日发放/,
    "the retired daily grant must be explicitly marked as ended"
  );

  const en = DECLARATION.freeTierSummary.en;
  assert.match(en, /free for two weeks|two-week free period/i, "the en summary must quote the same free window");
  assert.match(en, /then billed|billing resumes/i, "the en summary must warn that billing resumes");
  assert.match(en, /pricing page/i, "the en summary must defer the restored price to the pricing page");
  assert.match(en, /20 CNY/i, "the en summary must quote the same signup voucher");
  assert.match(en, /10 CNY/i, "the en summary must quote the same monthly voucher");
  assert.match(en, /QPS is capped at 2/i, "the en summary must quote the same QPS cap");
});

test("the rate-limit wording matches the official Rate Limits page", () => {
  // https://developer.ant-ling.com/zh-CN/docs/api-reference/api-guide/queries-per-second/
  // states a GLOBAL cap of 2 requests per second (no per-model, no RPM/TPM, no concurrency
  // figure) plus a 90s timeout on synchronous calls; 429 is the documented over-limit error.
  const zh = DECLARATION.freeTierSummary["zh-CN"];
  const en = DECLARATION.freeTierSummary.en;
  const guide = [...DECLARATION.claimGuide["zh-CN"], ...DECLARATION.claimGuide.en].join("\n");

  assert.match(zh, /QPS 限 2/, "the zh summary must state the 2 QPS cap");
  assert.match(zh, /90s 超时|90 秒超时/, "the zh summary must state the 90s sync timeout");
  assert.match(zh, /429/, "the zh summary must name the documented over-limit error");
  assert.match(en, /QPS is capped at 2/i, "the en summary must state the same cap");
  assert.match(guide, /QPS 为 2/, "the claim guide must warn about the QPS cap");
  assert.match(guide, /90 秒超时/, "the claim guide must warn about the sync timeout");

  // Never invent figures the docs do not publish.
  for (const unsupported of [/RPM/i, /TPM/i, /\d+\s*次\/分钟/]) {
    assert.doesNotMatch(
      Object.values(DECLARATION.freeTierSummary).join("\n"),
      unsupported,
      `no RPM/TPM figure is published, so ${unsupported} must not appear`
    );
  }
});

test("the real sync run turns the declaration into an approved upsert that the API serves", async (t) => {
  const outDir = mkdtempSync(join(tmpdir(), "freebuddy-ant-ling-"));
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
  assert.ok(statement.includes("'ant-ling'"), "the upsert must be keyed by the declaration id");
  assert.ok(statement.includes("'approved'"), "the upsert must carry status approved");
  assert.ok(statement.includes(`'${BASE_URL}'`));
  assert.ok(statement.includes(`'${CONSOLE_URL}'`));

  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  sqlite.exec(sql);

  const row = sqlite.prepare("SELECT status, submitted_by FROM providers WHERE id = 'ant-ling'").get();
  assert.equal(row.status, "approved");
  assert.equal(row.submitted_by, null);

  const { body } = await requestProviders(sqlite);
  const served = body.providers.find((provider) => provider.id === "ant-ling");
  assert.ok(served, "GET /api/providers must serve the new provider");
  assert.equal(served.status, undefined, "the public payload stays status-free like every other provider");
  assert.equal(served.baseUrl, BASE_URL);
  assert.equal(served.consoleUrl, CONSOLE_URL);
  assert.equal(served.homepage, HOMEPAGE);
  assert.deepEqual(
    served.models.map((model) => model.id),
    VERIFIED_MODELS.map((model) => model.id)
  );
  assert.deepEqual(served.protocols.slice().sort(), ["anthropic", "openai-chat"]);
});

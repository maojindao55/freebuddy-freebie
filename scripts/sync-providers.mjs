#!/usr/bin/env node
/**
 * Sync reviewed provider declarations (submissions/providers/<id>.json) into the D1
 * `providers` table that backs GET /api/providers.
 *
 * Design notes
 * ------------
 * - GitHub is the review gate. Declarations are added/changed through a PR, and merging
 *   into `main` runs this script (.github/workflows/sync-providers.yml) and applies the
 *   generated SQL with `wrangler d1 execute --remote --file`.
 * - Every declaration is validated before a single byte of SQL is produced, so one bad
 *   file can never cause a partial sync (D1 is left completely untouched on failure).
 * - The output is deterministic: files are sorted, duplicate ids and file/id mismatches
 *   are rejected, JSON payloads are canonicalized, and timestamps are evaluated by
 *   SQLite at execution time (`strftime('%s','now')`) rather than baked in.
 * - Emitted values are quoted SQL string literals with `'` doubled, and every field is
 *   validated first, so a declaration cannot inject SQL.
 * - Every status (pending / approved / disabled / rejected) is written, which is what
 *   makes `"status": "disabled"` take a provider offline and flipping it back to
 *   `"approved"` restore it.
 * - Deleting a declaration file is deliberately NOT mapped to a delete or an implicit
 *   disable: the sync only writes ids that still have a declaration. Take a provider
 *   offline with an explicit `"status": "disabled"`.
 *
 * Usage:
 *   node scripts/sync-providers.mjs [--dir <path>] [--out <file>] [--help]
 *
 *   --dir   declaration directory (default: submissions/providers)
 *   --out   write the SQL to this file instead of stdout
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** Repository root, derived from this file's location so the CLI works from any cwd. */
export const REPO_ROOT = resolve(MODULE_DIR, "..");
export const DEFAULT_DECLARATION_DIR = join(REPO_ROOT, "submissions", "providers");

export const PROVIDER_STATUSES = ["pending", "approved", "disabled", "rejected"];
export const PROVIDER_PROTOCOLS = ["openai-chat", "openai-responses", "anthropic", "deepseek"];

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const ICON_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SUMMARY_LANG_PATTERN = /^[A-Za-z0-9_-]{1,35}$/;
// Control characters would either break the generated SQL payload or the JSON columns;
// \t \n \r are allowed because they are legal inside JSON strings.
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 80;
const MAX_URL_LENGTH = 2048;
const MAX_MODELS = 50;
const MAX_SUMMARY_LENGTH = 400;
const MAX_OFFLINE_REASON_LENGTH = 400;
const MAX_SUBMITTED_BY_LENGTH = 39;

/** Fields a declaration may carry; mirrors submissions/providers.schema.json. */
const ALLOWED_FIELDS = new Set([
  "$schema",
  "id",
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
  "contextWindow",
  "verifiedAt",
  "status",
  "submittedBy",
  "offlineReason",
  "offlineAt"
]);

const MODEL_FIELDS = new Set(["id", "name", "contextWindow", "supportsVision"]);

/** Columns written by the upsert — must exist in schema.sql / migration 0002. */
const ROW_COLUMNS = [
  "id",
  "name",
  "icon",
  "region",
  "homepage",
  "console_url",
  "free_tier_summary",
  "protocol",
  "protocols",
  "base_url",
  "env_key",
  "models",
  "context_window",
  "verified_at",
  "status",
  "submitted_by"
];

/**
 * Columns refreshed on conflict: everything except `id` (the conflict target), `created_at`
 * (kept from the first insert, so a row remembers when it was first merged) and
 * `submitted_by` (assigned separately so an omitted author never erases the stored one).
 */
const CONFLICT_UPDATE_COLUMNS = ROW_COLUMNS.filter(
  (column) => column !== "id" && column !== "submitted_by"
);

/** Evaluated by SQLite when the script runs, so the SQL text stays reproducible. */
const SYNC_TIMESTAMP = "CAST(strftime('%s', 'now') AS INTEGER) * 1000";

export function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasControlChars(value) {
  return CONTROL_CHARS.test(value);
}

/**
 * A provider URL must be https, credential-free and point at a real domain. Mirrors (and
 * tightens) worker.js isSafeHttpsUrl(): the runtime API is the last line of defence, this
 * is the review-time one.
 */
export function isSafeHttpsUrl(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return false;
  if (hasControlChars(trimmed)) return false;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  // `https://host` / `https://localhost` are unusable as public endpoints.
  return Boolean(url.hostname) && url.hostname.includes(".");
}

/** Icons are lobehub slugs or https URLs, exactly like the runtime API accepts. */
function isSafeIcon(value) {
  return typeof value === "string" && (isSafeHttpsUrl(value) || ICON_SLUG_PATTERN.test(value));
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Quote a value as a SQL string literal. Callers must have validated the value first;
 * this is the second layer that makes SQL injection impossible.
 */
export function sqlText(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlValue(value) {
  return value === null || value === undefined ? "NULL" : sqlText(value);
}

function requireTrimmedText(value, field, messages, { maxLength, pattern, description }) {
  if (typeof value !== "string") {
    messages.push(`${field}: must be a string`);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    messages.push(`${field}: must not be empty`);
    return null;
  }
  if (maxLength !== undefined && trimmed.length > maxLength) {
    messages.push(`${field}: must be at most ${maxLength} characters`);
    return null;
  }
  if (hasControlChars(trimmed)) {
    messages.push(`${field}: must not contain control characters`);
    return null;
  }
  if (pattern && !pattern.test(trimmed)) {
    messages.push(`${field}: must match ${description}`);
    return null;
  }
  return trimmed;
}

function optionalTrimmedText(value, field, messages, options) {
  if (value === undefined) return null;
  return requireTrimmedText(value, field, messages, options);
}

function optionalUrl(value, field, messages) {
  if (value === undefined) return null;
  const trimmed = typeof value === "string" ? value.trim() : null;
  if (trimmed === null || !isSafeHttpsUrl(trimmed)) {
    messages.push(`${field}: must be an https:// URL`);
    return null;
  }
  return trimmed;
}

function parseModels(value, messages) {
  if (!Array.isArray(value) || value.length === 0) {
    messages.push("models: must be a non-empty array");
    return null;
  }
  if (value.length > MAX_MODELS) {
    messages.push(`models: must contain at most ${MAX_MODELS} entries`);
    return null;
  }

  const models = [];
  const seen = new Set();
  value.forEach((model, index) => {
    const label = `models[${index}]`;
    if (!isPlainObject(model)) {
      messages.push(`${label}: must be an object`);
      return;
    }
    for (const key of Object.keys(model)) {
      if (!MODEL_FIELDS.has(key)) messages.push(`${label}: unknown field "${key}"`);
    }
    const id = requireTrimmedText(model.id, `${label}.id`, messages, { maxLength: 200 });
    if (id === null) return;
    if (seen.has(id)) {
      messages.push(`${label}.id: duplicate model id "${id}"`);
      return;
    }
    seen.add(id);

    // Field order is fixed here so the JSON column is byte-identical for equal input.
    const clean = { id };
    if (model.name !== undefined) {
      const name = requireTrimmedText(model.name, `${label}.name`, messages, { maxLength: MAX_NAME_LENGTH });
      if (name !== null) clean.name = name;
    }
    if (model.contextWindow !== undefined) {
      if (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0) {
        messages.push(`${label}.contextWindow: must be a positive integer`);
      } else {
        clean.contextWindow = model.contextWindow;
      }
    }
    if (model.supportsVision !== undefined) {
      if (typeof model.supportsVision !== "boolean") {
        messages.push(`${label}.supportsVision: must be a boolean`);
      } else if (model.supportsVision) {
        clean.supportsVision = true;
      }
    }
    models.push(clean);
  });

  return models.length === 0 ? null : models;
}

function parseFreeTierSummary(value, messages) {
  if (value === undefined) return null;
  if (!isPlainObject(value)) {
    messages.push("freeTierSummary: must be an object of language code -> text");
    return null;
  }
  const entries = Object.keys(value).sort();
  if (entries.length === 0) {
    messages.push("freeTierSummary: must contain at least one language entry");
    return null;
  }
  const summary = {};
  for (const lang of entries) {
    if (!SUMMARY_LANG_PATTERN.test(lang)) {
      messages.push(`freeTierSummary: invalid language key ${JSON.stringify(lang)}`);
      continue;
    }
    const text = requireTrimmedText(value[lang], `freeTierSummary.${lang}`, messages, {
      maxLength: MAX_SUMMARY_LENGTH
    });
    if (text !== null) summary[lang] = text;
  }
  return Object.keys(summary).length > 0 ? summary : null;
}

function parseProtocols(value, messages) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0) {
    messages.push("protocols: must be a non-empty array");
    return null;
  }
  const invalid = value.filter((protocol) => !PROVIDER_PROTOCOLS.includes(protocol));
  if (invalid.length > 0) {
    messages.push(`protocols: unsupported value(s) ${invalid.map((p) => JSON.stringify(p)).join(", ")}`);
    return null;
  }
  return [...new Set(value)];
}

/**
 * Validate one declaration object and map it onto D1 columns.
 *
 * @returns {{ messages: string[], row: object|null }}
 */
export function validateDeclaration(raw, messages = []) {
  if (!isPlainObject(raw)) {
    messages.push("top level must be a single JSON object (one provider per file)");
    return { messages, row: null };
  }

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_FIELDS.has(key)) {
      messages.push(`unknown field "${key}" (see submissions/providers.schema.json)`);
    }
  }

  const id = requireTrimmedText(raw.id, "id", messages, {
    maxLength: MAX_ID_LENGTH,
    pattern: ID_PATTERN,
    description: "^[a-z0-9][a-z0-9_-]{0,63}$"
  });
  const name = requireTrimmedText(raw.name, "name", messages, { maxLength: MAX_NAME_LENGTH });
  const baseUrl = optionalUrl(raw.baseUrl, "baseUrl", messages);
  if (raw.baseUrl === undefined) messages.push("baseUrl: is required");

  let icon = null;
  if (raw.icon !== undefined) {
    const trimmed = typeof raw.icon === "string" ? raw.icon.trim() : null;
    if (trimmed === null || !isSafeIcon(trimmed)) {
      messages.push("icon: must be an https:// URL or a lobehub icon slug");
    } else {
      icon = trimmed;
    }
  }

  let region = null;
  if (raw.region !== undefined) {
    if (raw.region !== "cn" && raw.region !== "global") {
      messages.push('region: must be "cn" or "global"');
    } else {
      region = raw.region;
    }
  }

  const homepage = optionalUrl(raw.homepage, "homepage", messages);
  const consoleUrl = optionalUrl(raw.consoleUrl, "consoleUrl", messages);
  const freeTierSummary = parseFreeTierSummary(raw.freeTierSummary, messages);

  let protocol = null;
  if (raw.protocol === undefined) {
    messages.push("protocol: is required");
  } else if (!PROVIDER_PROTOCOLS.includes(raw.protocol)) {
    messages.push(`protocol: must be one of ${PROVIDER_PROTOCOLS.join(", ")}`);
  } else {
    protocol = raw.protocol;
  }
  const protocols = parseProtocols(raw.protocols, messages);

  let envKey = null;
  if (raw.envKey !== undefined) {
    envKey = requireTrimmedText(raw.envKey, "envKey", messages, {
      maxLength: 64,
      pattern: ENV_KEY_PATTERN,
      description: "^[A-Z][A-Z0-9_]{1,63}$"
    });
  }

  const models = parseModels(raw.models, messages);

  let contextWindow = null;
  if (raw.contextWindow !== undefined) {
    if (!Number.isInteger(raw.contextWindow) || raw.contextWindow <= 0) {
      messages.push("contextWindow: must be a positive integer");
    } else {
      contextWindow = raw.contextWindow;
    }
  }

  let verifiedAt = null;
  if (raw.verifiedAt !== undefined) {
    if (!isIsoDate(raw.verifiedAt)) {
      messages.push("verifiedAt: must be a real YYYY-MM-DD date");
    } else {
      verifiedAt = raw.verifiedAt;
    }
  }

  let status = null;
  if (!PROVIDER_STATUSES.includes(raw.status)) {
    messages.push(`status: must be one of ${PROVIDER_STATUSES.join(", ")}`);
  } else {
    status = raw.status;
  }

  const submittedBy = optionalTrimmedText(raw.submittedBy, "submittedBy", messages, {
    maxLength: MAX_SUBMITTED_BY_LENGTH,
    pattern: GITHUB_LOGIN_PATTERN,
    description: "a GitHub login"
  });

  // Decommissioning is only meaningful with an auditable reason and date, and a
  // non-disabled declaration must not keep stale offline metadata around. Both fields are
  // validated but deliberately not written to D1: the runtime API never serves a disabled
  // row, and the declaration file (with its PR and git history) is the audit record for
  // why a provider went offline.
  if (raw.offlineReason !== undefined) {
    requireTrimmedText(raw.offlineReason, "offlineReason", messages, { maxLength: MAX_OFFLINE_REASON_LENGTH });
  }
  if (raw.offlineAt !== undefined && !isIsoDate(raw.offlineAt)) {
    messages.push("offlineAt: must be a real YYYY-MM-DD date");
  }
  if (status === "disabled") {
    if (raw.offlineReason === undefined) messages.push('offlineReason: is required when status is "disabled"');
    if (raw.offlineAt === undefined) messages.push('offlineAt: is required when status is "disabled"');
  } else if (status !== null && (raw.offlineReason !== undefined || raw.offlineAt !== undefined)) {
    messages.push('offlineReason / offlineAt: only allowed when status is "disabled"');
  }

  if (messages.length > 0) return { messages, row: null };

  return {
    messages,
    row: {
      id,
      name,
      icon,
      region,
      homepage,
      console_url: consoleUrl,
      free_tier_summary: freeTierSummary === null ? null : JSON.stringify(freeTierSummary),
      protocol,
      protocols: protocols === null ? null : JSON.stringify(protocols),
      base_url: baseUrl,
      env_key: envKey,
      models: JSON.stringify(models),
      context_window: contextWindow,
      verified_at: verifiedAt,
      status,
      submitted_by: submittedBy
    }
  };
}

function sourceLabel(filePath) {
  const relativePath = relative(REPO_ROOT, filePath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return basename(filePath);
  }
  return relativePath.split("\\").join("/");
}

function listDeclarationFiles(declarationDir) {
  let entries;
  try {
    entries = readdirSync(declarationDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `declaration directory not found: ${declarationDir}\n` +
          `create submissions/providers/ or point --dir at the correct directory`
      );
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Read and fully validate every declaration in a directory.
 *
 * Nothing here touches D1: the caller only generates SQL when `errors` is empty.
 *
 * @returns {{ declarations: object[], errors: {source: string, messages: string[]}[], fileCount: number }}
 */
export function loadDeclarations(declarationDir) {
  const names = listDeclarationFiles(declarationDir);
  const declarations = [];
  const errors = [];

  for (const name of names) {
    const filePath = join(declarationDir, name);
    const source = sourceLabel(filePath);
    const messages = [];

    let raw;
    try {
      raw = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (error) {
      errors.push({ source, messages: [`not valid JSON: ${error.message}`] });
      continue;
    }

    // One file per provider and file name === id, so an id can never be declared twice
    // (two files would have to share a name) and a stale/renamed file cannot silently
    // update someone else's row.
    const expectedId = name.slice(0, -".json".length);
    if (isPlainObject(raw) && raw.id !== expectedId) {
      messages.push(`id: must equal the file name — expected ${JSON.stringify(expectedId)}, found ${JSON.stringify(raw.id)}`);
    }

    const { row } = validateDeclaration(raw, messages);

    if (messages.length > 0) {
      errors.push({ source, messages });
      continue;
    }

    declarations.push({ source, row });
  }

  // Deterministic statement order regardless of directory enumeration order.
  declarations.sort((a, b) => (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0));

  return { declarations, errors, fileCount: names.length };
}

function renderStatement({ source, row }) {
  const insertColumns = [...ROW_COLUMNS, "created_at", "updated_at"];
  const values = ROW_COLUMNS.map((column) => sqlValue(row[column]));
  // `created_at` is only used by the insert path (it is not in the UPDATE SET list), so an
  // existing row keeps the timestamp of the merge that created it.
  values.push(SYNC_TIMESTAMP, SYNC_TIMESTAMP);

  const assignments = CONFLICT_UPDATE_COLUMNS.map((column) => `  ${column} = excluded.${column}`);
  // submitted_by is only overwritten when the declaration names an author, so a later
  // declaration without `submittedBy` never erases who originally submitted the row.
  assignments.push("  submitted_by = COALESCE(excluded.submitted_by, providers.submitted_by)");
  assignments.push("  updated_at = excluded.updated_at");

  return [
    `-- ${source}`,
    `INSERT INTO providers (${insertColumns.join(", ")})`,
    `VALUES (${values.join(", ")})`,
    "ON CONFLICT(id) DO UPDATE SET",
    `${assignments.join(",\n")};`
  ].join("\n");
}

const HEADER = (fileCount, declarationCount) => `-- ---------------------------------------------------------------------------
-- AUTO-GENERATED FILE — do not edit by hand.
-- Generated by scripts/sync-providers.mjs from submissions/providers
-- (${declarationCount} of ${fileCount} declaration file(s) produced statements).
-- Applied by .github/workflows/sync-providers.yml:
--   npx wrangler d1 execute freebie-db --remote --file=<this file>
--
-- Every statement is an idempotent upsert on providers.id and writes whatever status the
-- declaration carries (pending / approved / disabled / rejected), so flipping a
-- declaration to "disabled" takes the provider offline on the next merge and flipping it
-- back to "approved" restores it. created_at is preserved on update and an omitted
-- submittedBy keeps the stored value.
--
-- Deleting a declaration file does NOT delete or disable the D1 row: this script only
-- writes ids that still have a declaration. Decommission a provider explicitly with
-- "status": "disabled" plus offlineReason / offlineAt.
-- ---------------------------------------------------------------------------
`;

/**
 * Render the complete sync script. Idempotent and deterministic for a given input set.
 */
export function renderSyncSql(declarations, { fileCount = declarations.length } = {}) {
  const parts = [HEADER(fileCount, declarations.length)];
  if (declarations.length === 0) {
    parts.push("-- No provider declarations found — this file intentionally contains no statement.\n");
  } else {
    for (const declaration of declarations) {
      parts.push(`${renderStatement(declaration)}\n`);
    }
  }

  const sql = parts.join("\n");
  if (sql.includes("\u0000")) {
    throw new Error("refusing to emit SQL containing a NUL byte");
  }
  return sql;
}

const USAGE = `Sync provider declarations into D1 as idempotent upserts.

Usage:
  node scripts/sync-providers.mjs [--dir <path>] [--out <file>]

Options:
  --dir <path>   declaration directory (default: submissions/providers)
  --out <file>   write the SQL here instead of stdout
  -h, --help     show this help

Exit codes:
  0  every declaration is valid (SQL written)
  1  at least one declaration is invalid (no SQL written, D1 untouched)
`;

export function parseArgs(argv) {
  const args = { dir: null, out: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg === "--dir" || arg === "--out") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      args[arg === "--dir" ? "dir" : "out"] = value;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n\n${USAGE}`);
    return 1;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const declarationDir = args.dir ? resolve(args.dir) : DEFAULT_DECLARATION_DIR;

  let loaded;
  try {
    loaded = loadDeclarations(declarationDir);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    return 1;
  }

  const { declarations, errors, fileCount } = loaded;

  if (errors.length > 0) {
    for (const { source, messages } of errors) {
      process.stderr.write(`error: ${source}\n`);
      for (const message of messages) process.stderr.write(`  - ${message}\n`);
    }
    process.stderr.write(
      `\n${errors.length} of ${fileCount} declaration file(s) are invalid — no SQL was generated and D1 was not modified.\n`
    );
    return 1;
  }

  const sql = renderSyncSql(declarations, { fileCount });

  if (args.out) {
    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, sql, "utf8");
    process.stdout.write(
      `Wrote ${declarations.length} upsert statement(s) from ${fileCount} declaration file(s) to ${outPath}\n`
    );
  } else {
    process.stdout.write(sql);
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}

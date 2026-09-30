/**
 * Migration 0004 (status accepts 'disabled', claim_guide preserved).
 * Starts from the exact production table shape observed on freebie-db: status CHECK without
 * 'disabled', claim_guide already added by 0003.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

const MIGRATION_0004 = readFileSync(new URL('../migrations/0004_providers_status_disabled_v2.sql', import.meta.url), 'utf8');
const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

const PROD_TABLE_SQL = `CREATE TABLE providers (
  id TEXT PRIMARY KEY CHECK (id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9_-]*' AND length(id) <= 64),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 80),
  icon TEXT CHECK (icon IS NULL OR icon GLOB 'https://*' OR (icon NOT GLOB '*[^A-Za-z0-9._/-]*' AND icon NOT GLOB '//*')),
  region TEXT CHECK (region IS NULL OR region IN ('cn', 'global')),
  homepage TEXT CHECK (homepage IS NULL OR homepage GLOB 'https://*'),
  console_url TEXT CHECK (console_url IS NULL OR console_url GLOB 'https://*'),
  free_tier_summary TEXT CHECK (free_tier_summary IS NULL OR (json_valid(free_tier_summary) AND json_type(free_tier_summary) = 'object')),
  protocol TEXT NOT NULL CHECK (protocol IN ('openai-chat', 'openai-responses', 'anthropic', 'deepseek')),
  protocols TEXT CHECK (protocols IS NULL OR (json_valid(protocols) AND json_type(protocols) = 'array')),
  base_url TEXT NOT NULL CHECK (base_url GLOB 'https://*'),
  env_key TEXT,
  models TEXT NOT NULL CHECK (json_valid(models) AND json_type(models) = 'array' AND json_array_length(models) >= 1),
  context_window INTEGER CHECK (context_window IS NULL OR context_window > 0),
  verified_at TEXT CHECK (verified_at IS NULL OR verified_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, claim_guide TEXT CHECK (claim_guide IS NULL OR (json_valid(claim_guide) AND json_type(claim_guide) = 'object')))`;

function insertRow(sqlite, id, overrides = {}) {
  const row = {
    id,
    name: `Provider ${id}`,
    protocol: 'openai-chat',
    base_url: `https://api.${id}.example.com/v1`,
    models: JSON.stringify(['m1']),
    status: 'approved',
    created_at: 1,
    updated_at: 2,
    claim_guide: null,
    ...overrides
  };
  const columns = Object.keys(row);
  sqlite
    .prepare(`INSERT INTO providers (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .run(...columns.map((column) => row[column]));
}

function prodLikeDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(PROD_TABLE_SQL);
  sqlite.exec('CREATE INDEX idx_providers_status ON providers(status, updated_at DESC)');
  for (let i = 0; i < 20; i += 1) {
    insertRow(sqlite, `p${i}`, {
      claim_guide: i % 2 === 0 ? JSON.stringify({ en: [`step ${i}`] }) : null
    });
  }
  return sqlite;
}

const columnNames = (sqlite) =>
  sqlite.prepare('PRAGMA table_info(providers)').all().map((column) => column.name).sort();

test('the production shape rejects disabled before 0004 (sanity check of the fixture)', () => {
  const sqlite = prodLikeDatabase();
  assert.throws(() => insertRow(sqlite, 'off', { status: 'disabled' }), /CHECK constraint failed/);
});

test('0004 keeps every row and every claim_guide value', () => {
  const sqlite = prodLikeDatabase();
  const before = sqlite.prepare('SELECT id, claim_guide, status, updated_at FROM providers ORDER BY id').all();

  sqlite.exec(MIGRATION_0004);

  const after = sqlite.prepare('SELECT id, claim_guide, status, updated_at FROM providers ORDER BY id').all();
  assert.equal(after.length, 20);
  assert.deepEqual(after, before);
  assert.ok(columnNames(sqlite).includes('claim_guide'), 'claim_guide must survive the rebuild');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM providers_quarantine').get().n, 0);
});

test('0004 makes status accept disabled and still rejects unknown values', () => {
  const sqlite = prodLikeDatabase();
  sqlite.exec(MIGRATION_0004);

  insertRow(sqlite, 'off', { status: 'disabled' });
  sqlite.prepare("UPDATE providers SET status = 'disabled' WHERE id = 'p0'").run();
  assert.equal(sqlite.prepare("SELECT status FROM providers WHERE id = 'p0'").get().status, 'disabled');
  assert.throws(() => insertRow(sqlite, 'bad', { status: 'archived' }), /CHECK constraint failed/);
  assert.throws(() => insertRow(sqlite, 'badguide', { claim_guide: 'not json' }), /CHECK constraint failed/);
});

test('the migrated table has the same columns as schema.sql and keeps its status index', () => {
  const migrated = prodLikeDatabase();
  migrated.exec(MIGRATION_0004);

  const fresh = new DatabaseSync(':memory:');
  fresh.exec(SCHEMA);

  assert.deepEqual(columnNames(migrated), columnNames(fresh));
  const indexes = migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'providers'").all().map((r) => r.name);
  assert.ok(indexes.includes('idx_providers_status'));
  const leftovers = migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('providers_new', 'providers_migration_stage', 'providers_migration_run', 'providers_migration_guard')").all();
  assert.deepEqual(leftovers, []);
});

test('0004 can be applied twice without losing data', () => {
  const sqlite = prodLikeDatabase();
  sqlite.exec(MIGRATION_0004);
  insertRow(sqlite, 'off', { status: 'disabled', claim_guide: JSON.stringify({ en: ['x'] }) });
  sqlite.exec(MIGRATION_0004);

  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM providers').get().n, 21);
  assert.equal(sqlite.prepare("SELECT claim_guide FROM providers WHERE id = 'off'").get().claim_guide, JSON.stringify({ en: ['x'] }));
});

test('without 0003 the migration fails loudly and leaves the old table untouched', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(PROD_TABLE_SQL.replace(/\n, claim_guide TEXT CHECK[^\n]*\)\)$/, '\n)'));
  assert.ok(!columnNames(sqlite).includes('claim_guide'), 'fixture must lack claim_guide');
  sqlite
    .prepare("INSERT INTO providers (id, name, protocol, base_url, models, status, created_at, updated_at) VALUES ('keep', 'Keep', 'openai-chat', 'https://api.keep.example.com/v1', '[\"m1\"]', 'approved', 1, 2)")
    .run();

  assert.throws(() => sqlite.exec(MIGRATION_0004), /claim_guide/);

  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM providers').get().n, 1);
  assert.ok(!columnNames(sqlite).includes('claim_guide'));
});

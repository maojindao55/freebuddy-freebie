-- FreeBuddy Freebie Database Schema
-- Reviews table: one review per device per provider (re-submission updates the review)
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  author TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_provider ON reviews(provider_id, created_at DESC);

-- Providers table: runtime catalog of reviewed providers.
-- Submissions are still reviewed via GitHub PR; only rows with status='approved'
-- are exposed by the public GET /api/providers endpoint.
--
-- `status` lifecycle:
--   pending  — declared, not reviewed yet (never served)
--   approved — reviewed, served by GET /api/providers
--   disabled — explicitly taken offline by a merged declaration
--              (submissions/providers/<id>.json with status="disabled"); the row is
--              kept so the provider can be restored by flipping the declaration back
--              to "approved", and so re-running the sync stays idempotent
--   rejected — reviewed and refused (kept only as an audit record)
-- The D1 sync (scripts/sync-providers.mjs, driven by
-- .github/workflows/sync-providers.yml) upserts every status, so 'disabled' must be
-- accepted by the database or decommissioning would fail.
--
-- The CHECK constraints below are a backstop, not a replacement for
-- providers.schema.json: the Worker validates every row again before it is served
-- (URLs must be https:, models must be non-empty, ...). Keep them simple — SQLite
-- cannot parse URLs, so `GLOB 'https://*'` is the strongest reliable check here.
-- NOTE: these constraints only apply to newly created tables. An existing D1
-- database that already has a loose `providers` table must run
-- migrations/0001_providers_constraints.sql instead of recreating the table: it
-- copies every conforming row (approved included), quarantines the rows that
-- cannot satisfy the new constraints into `providers_quarantine`, verifies that
-- nothing was dropped, and only then replaces the old table. A database that has
-- already been through 0001 still has the older status set, so
-- migrations/0002_providers_status_disabled.sql rebuilds the table once more to
-- accept 'disabled' (same data-preserving design) — run
-- `npx wrangler d1 migrations apply freebie-db --remote` and both are applied in order.
CREATE TABLE IF NOT EXISTS providers (
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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'disabled', 'rejected')),
  submitted_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_providers_status ON providers(status, updated_at DESC);

-- Votes table: one vote per device per provider per day ('working' or 'failed')
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  vote_type TEXT NOT NULL CHECK(vote_type IN ('working', 'failed')),
  vote_date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(provider_id, device_id, vote_date)
);

CREATE INDEX IF NOT EXISTS idx_votes_provider ON votes(provider_id, vote_date);

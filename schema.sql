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

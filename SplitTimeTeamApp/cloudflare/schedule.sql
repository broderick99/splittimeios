CREATE TABLE IF NOT EXISTS schedule_events (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  location TEXT,
  location_latitude REAL,
  location_longitude REAL,
  notes TEXT,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_days TEXT NOT NULL DEFAULT '',
  recurrence_ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_events_team_start
ON schedule_events(team_id, starts_at ASC);

CREATE TABLE IF NOT EXISTS schedule_event_overrides (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  occurrence_starts_at INTEGER NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  location TEXT,
  location_latitude REAL,
  location_longitude REAL,
  notes TEXT,
  is_cancelled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_overrides_occurrence
ON schedule_event_overrides(event_id, occurrence_starts_at);

CREATE INDEX IF NOT EXISTS idx_schedule_overrides_team_occurrence
ON schedule_event_overrides(team_id, occurrence_starts_at ASC);

CREATE TABLE IF NOT EXISTS integration_oauth_states (
  id TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  user_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_provider_expires
ON integration_oauth_states(provider, expires_at ASC);

CREATE TABLE IF NOT EXISTS strava_connections (
  user_id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  strava_athlete_id TEXT,
  athlete_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  scope TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_strava_connections_team
ON strava_connections(team_id);

CREATE TABLE IF NOT EXISTS activity_feed_items (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  activity_type TEXT,
  start_at TEXT NOT NULL,
  distance_m REAL,
  moving_seconds INTEGER,
  elapsed_seconds INTEGER,
  elevation_gain_m REAL,
  average_speed_mps REAL,
  polyline TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_feed_user_source_external
ON activity_feed_items(user_id, source, external_id);

CREATE INDEX IF NOT EXISTS idx_activity_feed_team_start
ON activity_feed_items(team_id, start_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_feed_user_start
ON activity_feed_items(user_id, start_at DESC);

CREATE TABLE IF NOT EXISTS activity_comments (
  id TEXT PRIMARY KEY NOT NULL,
  activity_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_comments_activity_created
ON activity_comments(activity_id, created_at ASC);

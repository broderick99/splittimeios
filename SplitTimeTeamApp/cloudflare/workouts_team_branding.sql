-- Team branding + completed workout persistence.
-- Note: If `teams.logo_base64` already exists, the ALTER TABLE line may return
-- `duplicate column name: logo_base64`. That is safe to ignore.

ALTER TABLE teams ADD COLUMN logo_base64 TEXT;

CREATE TABLE IF NOT EXISTS team_workouts (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  workout_at TEXT NOT NULL,
  template_id TEXT,
  source TEXT NOT NULL DEFAULT 'timer',
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_workouts_team_date
ON team_workouts(team_id, workout_at DESC);

CREATE TABLE IF NOT EXISTS team_workout_results (
  id TEXT PRIMARY KEY NOT NULL,
  workout_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  athlete_local_id TEXT,
  athlete_user_id TEXT,
  athlete_name TEXT NOT NULL,
  group_id TEXT,
  group_name TEXT,
  group_color_hex TEXT,
  started_at TEXT,
  stopped_at TEXT,
  total_elapsed_ms INTEGER,
  split_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_workout_results_workout
ON team_workout_results(workout_id, athlete_name ASC);

CREATE INDEX IF NOT EXISTS idx_team_workout_results_team_athlete_user
ON team_workout_results(team_id, athlete_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS team_workout_splits (
  id TEXT PRIMARY KEY NOT NULL,
  workout_result_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  split_number INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  is_final INTEGER NOT NULL DEFAULT 0,
  step_type TEXT,
  step_distance_value REAL,
  step_distance_unit TEXT,
  step_label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_workout_splits_result
ON team_workout_splits(workout_result_id, split_number ASC);

CREATE INDEX IF NOT EXISTS idx_team_workout_splits_team_created
ON team_workout_splits(team_id, created_at DESC);

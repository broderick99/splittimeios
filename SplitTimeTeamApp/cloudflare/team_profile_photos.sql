CREATE TABLE IF NOT EXISTS team_user_profiles (
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  photo_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_user_profiles_team_user
ON team_user_profiles(team_id, user_id);

-- Cloud template library sync for workouts built in the app.

CREATE TABLE IF NOT EXISTS team_templates (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_templates_team_updated
ON team_templates(team_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS team_template_repeat_groups (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  repeat_count INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_template_repeat_groups_template
ON team_template_repeat_groups(team_id, template_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS team_template_steps (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  distance_value REAL,
  distance_unit TEXT,
  duration_ms INTEGER,
  splits_per_step INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL DEFAULT '',
  repeat_group_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_template_steps_template
ON team_template_steps(team_id, template_id, sort_order ASC);

CREATE INDEX IF NOT EXISTS idx_team_template_steps_repeat_group
ON team_template_steps(team_id, repeat_group_id, sort_order ASC);

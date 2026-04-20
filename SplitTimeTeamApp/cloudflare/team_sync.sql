-- Team sync schema for groups, coach-managed athletes, and announcement comments.
-- Note: If `team_members.group_id` already exists, the ALTER TABLE line may return
-- `duplicate column name: group_id`. That is safe to ignore.

ALTER TABLE team_members ADD COLUMN group_id TEXT;

CREATE INDEX IF NOT EXISTS idx_team_members_team_group
ON team_members(team_id, group_id);

CREATE TABLE IF NOT EXISTS team_groups (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '3B82F6',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_groups_team_sort
ON team_groups(team_id, sort_order ASC, name ASC);

CREATE TABLE IF NOT EXISTS team_athletes (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  age INTEGER,
  grade TEXT,
  group_id TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_athletes_team_name
ON team_athletes(team_id, name ASC);

CREATE INDEX IF NOT EXISTS idx_team_athletes_team_group
ON team_athletes(team_id, group_id);

CREATE TABLE IF NOT EXISTS announcement_comments (
  id TEXT PRIMARY KEY NOT NULL,
  announcement_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_announcement_comments_team_announcement_created
ON announcement_comments(team_id, announcement_id, created_at ASC);

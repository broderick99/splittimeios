CREATE TABLE IF NOT EXISTS direct_message_threads (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  user_one_id TEXT NOT NULL,
  user_two_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, user_one_id, user_two_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_threads_team_users
ON direct_message_threads(team_id, user_one_id, user_two_id);

CREATE INDEX IF NOT EXISTS idx_dm_threads_team_updated
ON direct_message_threads(team_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS direct_message_messages (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  body TEXT NOT NULL,
  image_key TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_thread_created
ON direct_message_messages(thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_dm_messages_team_created
ON direct_message_messages(team_id, created_at ASC);

CREATE TABLE IF NOT EXISTS direct_message_reads (
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_reads_user
ON direct_message_reads(user_id, updated_at DESC);

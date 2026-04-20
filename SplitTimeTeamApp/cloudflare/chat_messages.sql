CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  body TEXT NOT NULL,
  image_key TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_team_created
ON chat_messages(team_id, created_at ASC);

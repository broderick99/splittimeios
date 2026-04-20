CREATE TABLE IF NOT EXISTS auth_social_results (
  state TEXT PRIMARY KEY NOT NULL,
  exchange_code TEXT,
  error_message TEXT,
  expires_at INTEGER NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_social_results_expires
ON auth_social_results(expires_at ASC);

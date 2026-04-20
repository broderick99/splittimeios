CREATE TABLE IF NOT EXISTS auth_oauth_states (
  id TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_oauth_states_provider_expires
ON auth_oauth_states(provider, expires_at ASC);

CREATE TABLE IF NOT EXISTS user_social_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_social_provider_user
ON user_social_accounts(provider, provider_user_id);

CREATE INDEX IF NOT EXISTS idx_user_social_user
ON user_social_accounts(user_id);

CREATE TABLE IF NOT EXISTS auth_exchange_codes (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_exchange_expires
ON auth_exchange_codes(expires_at ASC);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user_created
ON password_reset_codes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_expires
ON password_reset_codes(expires_at ASC);

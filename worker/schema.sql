CREATE TABLE IF NOT EXISTS accounts (
  discord_id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_hash TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_last_login ON accounts(last_login_at);

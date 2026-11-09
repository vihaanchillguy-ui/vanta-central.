
CREATE TABLE IF NOT EXISTS command_logs (
  id TEXT PRIMARY KEY NOT NULL,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  command_name TEXT NOT NULL,
  subcommand TEXT NOT NULL DEFAULT '',
  guild_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_command_logs_created ON command_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_command_logs_actor ON command_logs(discord_id,created_at);

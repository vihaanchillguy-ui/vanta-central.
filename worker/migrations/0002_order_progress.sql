CREATE TABLE IF NOT EXISTS order_assignments (
 order_id TEXT NOT NULL, discord_id TEXT NOT NULL, assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL,
 PRIMARY KEY(order_id,discord_id), FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 FOREIGN KEY(discord_id) REFERENCES accounts(discord_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_order_assignments_order ON order_assignments(order_id);
CREATE TABLE IF NOT EXISTS order_progress (
 id TEXT PRIMARY KEY NOT NULL, order_id TEXT NOT NULL, actor_discord_id TEXT NOT NULL,
 message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_order_progress_order ON order_progress(order_id,created_at);
CREATE TABLE IF NOT EXISTS order_progress_images (
 id TEXT PRIMARY KEY NOT NULL, progress_id TEXT NOT NULL, order_id TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, content_type TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(progress_id) REFERENCES order_progress(id) ON DELETE CASCADE,
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounts (
  discord_id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_hash TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_last_login ON accounts(last_login_at);

CREATE TABLE IF NOT EXISTS vanta_roles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#8794a8',
  permissions_json TEXT NOT NULL DEFAULT '[]',
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account_vanta_roles (
  discord_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY(discord_id, role_id),
  FOREIGN KEY(discord_id) REFERENCES accounts(discord_id) ON DELETE CASCADE,
  FOREIGN KEY(role_id) REFERENCES vanta_roles(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY NOT NULL,
  customer_discord_id TEXT NOT NULL,
  title TEXT NOT NULL,
  service TEXT NOT NULL DEFAULT 'Other',
  package TEXT NOT NULL DEFAULT 'Custom',
  quantity INTEGER NOT NULL DEFAULT 1,
  price_robux INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Awaiting Payment',
  assigned_to TEXT NOT NULL DEFAULT '',
  requirements TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'Unpaid',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(customer_discord_id) REFERENCES accounts(discord_id)
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_discord_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  actor_discord_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id,created_at);
INSERT OR IGNORE INTO vanta_roles(id,name,color,permissions_json,is_system,created_at,updated_at) VALUES
('role-owner','Owner','#e7b85c','["*"]',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('role-executive','Executive','#b88cff','["management","orders:view","orders:create","orders:update","orders:assign","customers:view","customers:manage","roles:view","roles:manage","support:manage","sales","creative","operations"]',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('role-management','Management','#8b9cff','["management","orders:view","orders:create","orders:update","orders:assign","customers:view","customers:manage","roles:view","support:manage","sales","creative","operations"]',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('role-operations','Operations','#56b6d9','["operations","orders:view","orders:update","orders:assign","customers:view"]',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('role-sales','Sales','#5dc99b','["sales","orders:view","orders:create","customers:view"]',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('role-support','Support','#e3a45e','["support:manage","orders:view","customers:view"]',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('role-designer','Designer','#bd8ee8','["creative","orders:view","orders:update"]',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('role-customer','Customer','#8794a8','["customer"]',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

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

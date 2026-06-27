CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  country TEXT DEFAULT 'INT',
  logo_url TEXT,
  stream_url TEXT NOT NULL,
  backup_url TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT DEFAULT 'manual',
  external_id TEXT,
  quality TEXT,
  referrer TEXT,
  user_agent TEXT,
  lang_group TEXT
);

CREATE INDEX IF NOT EXISTS idx_channels_source ON channels(source);
CREATE INDEX IF NOT EXISTS idx_channels_external ON channels(external_id);
CREATE INDEX IF NOT EXISTS idx_channels_country ON channels(country);
CREATE INDEX IF NOT EXISTS idx_channels_active ON channels(is_active);

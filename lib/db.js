const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'livetv.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const migrations = [
  'ALTER TABLE channels ADD COLUMN source TEXT DEFAULT \'manual\'',
  'ALTER TABLE channels ADD COLUMN external_id TEXT',
  'ALTER TABLE channels ADD COLUMN quality TEXT',
  'ALTER TABLE channels ADD COLUMN referrer TEXT',
  'ALTER TABLE channels ADD COLUMN user_agent TEXT',
  'ALTER TABLE channels ADD COLUMN lang_group TEXT',
];

const existingCols = new Set(
  db.prepare('PRAGMA table_info(channels)').all().map((c) => c.name)
);
for (const sql of migrations) {
  const col = sql.match(/ADD COLUMN (\w+)/)?.[1];
  if (col && !existingCols.has(col)) {
    db.exec(sql);
    existingCols.add(col);
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_channels_source ON channels(source);
  CREATE INDEX IF NOT EXISTS idx_channels_external ON channels(external_id);
  CREATE INDEX IF NOT EXISTS idx_channels_country ON channels(country);
`);

function upsertChannels(rows, source, replace = true) {
  if (replace) {
    db.prepare('UPDATE channels SET is_active = 0 WHERE source = ?').run(source);
  }

  const insert = db.prepare(`
    INSERT INTO channels (
      name, category, country, logo_url, stream_url, backup_url,
      description, sort_order, source, external_id, quality, referrer, user_agent, lang_group
    ) VALUES (
      @name, @category, @country, @logo_url, @stream_url, @backup_url,
      @description, @sort_order, @source, @external_id, @quality, @referrer, @user_agent, @lang_group
    )
  `);

  const update = db.prepare(`
    UPDATE channels SET
      name=@name, category=@category, country=@country, logo_url=@logo_url,
      stream_url=@stream_url, backup_url=@backup_url, description=@description,
      sort_order=@sort_order, quality=@quality, referrer=@referrer,
      user_agent=@user_agent, lang_group=@lang_group, is_active=1
    WHERE external_id=@external_id
  `);

  const find = db.prepare('SELECT id FROM channels WHERE external_id = ?');

  const tx = db.transaction((items) => {
    let inserted = 0;
    let updated = 0;
    for (const row of items) {
      const data = {
        name: row.name,
        category: row.category || 'General',
        country: row.country || 'INT',
        logo_url: row.logo_url || null,
        stream_url: row.stream_url,
        backup_url: row.backup_url || null,
        description: row.description || null,
        sort_order: row.sort_order || 0,
        source: row.source || source,
        external_id: row.external_id || `${source}:${row.name}`,
        quality: row.quality || null,
        referrer: row.referrer || null,
        user_agent: row.user_agent || null,
        lang_group: row.lang_group || null,
      };
      const ex = find.get(data.external_id);
      if (ex) {
        update.run(data);
        updated += 1;
      } else {
        insert.run(data);
        inserted += 1;
      }
    }
    return { inserted, updated };
  });

  return tx(rows);
}

module.exports = { db, upsertChannels };

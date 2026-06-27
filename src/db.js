export async function countActiveChannels(db) {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM channels WHERE is_active = 1').first();
  return row?.n ?? 0;
}

export async function upsertChannels(db, rows, source, replace = true) {
  const stmts = [];

  if (replace) {
    stmts.push(db.prepare('UPDATE channels SET is_active = 0 WHERE source = ?').bind(source));
  }

  const insert = db.prepare(`
    INSERT INTO channels (
      name, category, country, logo_url, stream_url, backup_url,
      description, sort_order, source, external_id, quality, referrer, user_agent, lang_group
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const update = db.prepare(`
    UPDATE channels SET
      name=?, category=?, country=?, logo_url=?,
      stream_url=?, backup_url=?, description=?,
      sort_order=?, quality=?, referrer=?,
      user_agent=?, lang_group=?, is_active=1
    WHERE external_id=?
  `);

  const find = db.prepare('SELECT id FROM channels WHERE external_id = ?');

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
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

    const ex = await find.bind(data.external_id).first();
    if (ex) {
      stmts.push(
        update.bind(
          data.name,
          data.category,
          data.country,
          data.logo_url,
          data.stream_url,
          data.backup_url,
          data.description,
          data.sort_order,
          data.quality,
          data.referrer,
          data.user_agent,
          data.lang_group,
          data.external_id
        )
      );
      updated += 1;
    } else {
      stmts.push(
        insert.bind(
          data.name,
          data.category,
          data.country,
          data.logo_url,
          data.stream_url,
          data.backup_url,
          data.description,
          data.sort_order,
          data.source,
          data.external_id,
          data.quality,
          data.referrer,
          data.user_agent,
          data.lang_group
        )
      );
      inserted += 1;
    }
  }

  if (stmts.length) await db.batch(stmts);
  return { inserted, updated };
}

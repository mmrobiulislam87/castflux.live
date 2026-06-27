const express = require('express');
const cors = require('cors');
const path = require('path');
const { Readable } = require('stream');
const { db, upsertChannels } = require('./lib/db');
const { syncIptvOrg, syncFreeTv } = require('./lib/iptv-sync');
const featuredSports = require('./lib/sports-channels');
const cricketChannels = require('./lib/cricket-channels');
const banglaChannels = require('./lib/bangla-channels');
const { requireAdmin } = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isManifest(url, contentType) {
  return (
    url.includes('.m3u8') ||
    (contentType && (contentType.includes('mpegurl') || contentType.includes('m3u8')))
  );
}

// --- Channel API ---

app.get('/api/channels', (req, res) => {
  const { category, search, country, source } = req.query;
  let sql = 'SELECT * FROM channels WHERE is_active = 1';
  const params = [];

  if (category && category !== 'All') {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (country && country !== 'All') {
    sql += ' AND country = ?';
    params.push(country);
  }
  if (source && source !== 'All') {
    sql += ' AND source = ?';
    params.push(source);
  }
  if (search) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY sort_order ASC, name ASC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/categories', (_req, res) => {
  res.json(
    db.prepare(`
      SELECT category, COUNT(*) AS count
      FROM channels WHERE is_active = 1
      GROUP BY category ORDER BY category
    `).all()
  );
});

app.get('/api/countries', (_req, res) => {
  res.json(
    db.prepare(`
      SELECT country, COUNT(*) AS count
      FROM channels WHERE is_active = 1 AND country IS NOT NULL
      GROUP BY country ORDER BY count DESC, country
    `).all()
  );
});

app.get('/api/sports', (_req, res) => {
  const featured = db.prepare(`
    SELECT * FROM channels WHERE is_active = 1 AND source = 'featured'
    ORDER BY sort_order ASC
  `).all();

  const cricket = db.prepare(`
    SELECT * FROM channels WHERE is_active = 1 AND source = 'cricket'
    ORDER BY sort_order ASC
  `).all();

  const sports = db.prepare(`
    SELECT * FROM channels WHERE is_active = 1 AND category = 'Sports' AND source != 'featured'
    ORDER BY
      CASE quality WHEN '1080p' THEN 1 WHEN '720p' THEN 2 WHEN '480p' THEN 3 ELSE 4 END,
      name ASC
    LIMIT 80
  `).all();

  const football = db.prepare(`
    SELECT * FROM channels WHERE is_active = 1
      AND (LOWER(name) LIKE '%football%' OR LOWER(name) LIKE '%fifa%'
           OR LOWER(name) LIKE '%sport%' OR LOWER(name) LIKE '%bein%'
           OR LOWER(name) LIKE '%espn%' OR LOWER(description) LIKE '%football%')
      AND id NOT IN (SELECT id FROM channels WHERE source = 'featured' AND is_active = 1)
    ORDER BY name ASC
    LIMIT 40
  `).all();

  const seen = new Set();
  const merged = [];
  for (const ch of [...featured, ...cricket, ...sports, ...football]) {
    if (!seen.has(ch.id)) {
      seen.add(ch.id);
      merged.push(ch);
    }
  }
  res.json(merged);
});

app.get('/api/channels/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM channels WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Channel not found' });
  res.json(row);
});

app.post('/api/channels', requireAdmin, (req, res) => {
  const { name, category, country, logo_url, stream_url, backup_url, description, lang_group } = req.body;
  if (!name || !stream_url) {
    return res.status(400).json({ error: 'name and stream_url are required' });
  }
  const result = db.prepare(`
    INSERT INTO channels (name, category, country, logo_url, stream_url, backup_url, description, source, lang_group)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)
  `).run(
    name,
    category || 'General',
    country || 'INT',
    logo_url || null,
    stream_url,
    backup_url || null,
    description || null,
    lang_group || 'Bangla'
  );
  res.status(201).json(db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid));
});

app.delete('/api/channels/:id', requireAdmin, (req, res) => {
  const result = db.prepare('UPDATE channels SET is_active = 0 WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Channel not found' });
  res.json({ ok: true });
});

// --- GitHub sync (iptv-org + Free-TV) ---

app.post('/api/sync/iptv-org', requireAdmin, async (req, res) => {
  try {
    const { country, limit } = req.body || {};
    const result = await syncIptvOrg({
      country: country || undefined,
      limit: limit ? Number(limit) : 300,
    });
    const stats = upsertChannels(result.channels, 'iptv-org', true);
    res.json({
      ok: true,
      source: 'iptv-org',
      fetched: result.imported,
      ...stats,
      message: `${result.imported} চ্যানেল iptv-org GitHub API থেকে যোগ হয়েছে`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed', detail: err.message });
  }
});

app.post('/api/sync/free-tv', requireAdmin, async (req, res) => {
  try {
    const { limit } = req.body || {};
    const result = await syncFreeTv({ limit: limit ? Number(limit) : 250 });
    const stats = upsertChannels(result.channels, 'free-tv', true);
    res.json({
      ok: true,
      source: 'free-tv',
      fetched: result.imported,
      ...stats,
      message: `${result.imported} চ্যানেল Free-TV GitHub থেকে যোগ হয়েছে`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed', detail: err.message });
  }
});

app.post('/api/sync/all', requireAdmin, async (_req, res) => {
  try {
    const [freeTv, iptvOrg] = await Promise.all([
      syncFreeTv({ limit: 200 }),
      syncIptvOrg({ limit: 300 }),
    ]);
    const s1 = upsertChannels(freeTv.channels, 'free-tv', true);
    const s2 = upsertChannels(iptvOrg.channels, 'iptv-org', true);
    res.json({
      ok: true,
      freeTv: { fetched: freeTv.imported, ...s1 },
      iptvOrg: { fetched: iptvOrg.imported, ...s2 },
      message: `মোট ${freeTv.imported + iptvOrg.imported} চ্যানেল GitHub থেকে লোড হয়েছে`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed', detail: err.message });
  }
});

// --- Smart proxy: manifest only rewrites to DIRECT segment URLs (no segment proxying) ---

app.get('/api/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'url required' });

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https' });
  }

  const headers = {
    'User-Agent': req.query.ua || DEFAULT_UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (req.query.ref) headers.Referer = req.query.ref;

  try {
    const upstream = await fetch(target, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(45000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    }

    const contentType = upstream.headers.get('content-type') || '';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');

    if (isManifest(target, contentType)) {
      const body = await upstream.text();
      const base = new URL(target);
      const rewritten = body
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return line;
          try {
            return new URL(trimmed, base).href;
          } catch {
            return line;
          }
        })
        .join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(rewritten);
    }

    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    if (upstream.body) {
      const stream = Readable.fromWeb(upstream.body);
      stream.on('error', () => {
        if (!res.headersSent) res.status(502).end();
        else res.destroy();
      });
      res.on('error', () => stream.destroy());
      req.on('close', () => stream.destroy());
      return stream.pipe(res);
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Proxy failed', detail: err.message });
    }
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function bootstrap() {
  upsertChannels(featuredSports, 'featured', false);
  upsertChannels(cricketChannels, 'cricket', false);
  upsertChannels(banglaChannels, 'bangla', false);

  const total = db.prepare('SELECT COUNT(*) AS n FROM channels WHERE is_active = 1').get().n;
  if (total < 30) {
    console.log('Syncing channels from GitHub APIs (iptv-org + Free-TV)...');
    try {
      const [freeTv, iptvOrg, iptvBd] = await Promise.all([
        syncFreeTv({ limit: 150 }),
        syncIptvOrg({ limit: 300 }),
        syncIptvOrg({ country: 'BD', limit: 80 }),
      ]);
      upsertChannels(freeTv.channels, 'free-tv', true);
      upsertChannels(iptvOrg.channels, 'iptv-org', true);
      upsertChannels(iptvBd.channels, 'iptv-org', false);
      const after = db.prepare('SELECT COUNT(*) AS n FROM channels WHERE is_active = 1').get().n;
      console.log(`Loaded ${after} channels from GitHub.`);
    } catch (err) {
      console.warn('GitHub sync failed:', err.message);
      console.warn('Click "GitHub Sync" in the app after server starts.');
    }
  }
}

app.listen(PORT, async () => {
  await bootstrap();
  const total = db.prepare('SELECT COUNT(*) AS n FROM channels WHERE is_active = 1').get().n;
  console.log('');
  console.log('  Live TV — Localhost (Optimized)');
  console.log('  --------------------------------');
  console.log(`  Open:  http://localhost:${PORT}`);
  console.log(`  Channels loaded: ${total}`);
  console.log('');
});

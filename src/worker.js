import { countActiveChannels, upsertChannels } from './db.js';
import { syncFreeTv, syncIptvOrg } from './lib/iptv-sync.js';
import featuredSports from './lib/sports-channels.js';
import banglaChannels from './lib/bangla-channels.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let bootstrapPromise = null;

function json(data, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

function isManifest(url, contentType) {
  return (
    url.includes('.m3u8') ||
    (contentType && (contentType.includes('mpegurl') || contentType.includes('m3u8')))
  );
}

async function ensureBootstrap(env) {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap(env).catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

async function bootstrap(env) {
  await upsertChannels(env.DB, featuredSports, 'featured', false);
  await upsertChannels(env.DB, banglaChannels, 'bangla', false);

  const total = await countActiveChannels(env.DB);
  if (total >= 30) return;

  const [freeTv, iptvOrg, iptvBd] = await Promise.all([
    syncFreeTv({ limit: 150 }),
    syncIptvOrg({ limit: 300 }),
    syncIptvOrg({ country: 'BD', limit: 80 }),
  ]);
  await upsertChannels(env.DB, freeTv.channels, 'free-tv', true);
  await upsertChannels(env.DB, iptvOrg.channels, 'iptv-org', true);
  await upsertChannels(env.DB, iptvBd.channels, 'iptv-org', false);
}

async function handleChannels(req, env) {
  await ensureBootstrap(env);
  const url = new URL(req.url);
  const { category, search, country, source } = Object.fromEntries(url.searchParams);

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
  const stmt = env.DB.prepare(sql);
  const rows = params.length ? await stmt.bind(...params).all() : await stmt.all();
  return json(rows.results ?? rows);
}

async function handleCategories(env) {
  await ensureBootstrap(env);
  const rows = await env.DB.prepare(`
    SELECT category, COUNT(*) AS count
    FROM channels WHERE is_active = 1
    GROUP BY category ORDER BY category
  `).all();
  return json(rows.results ?? rows);
}

async function handleCountries(env) {
  await ensureBootstrap(env);
  const rows = await env.DB.prepare(`
    SELECT country, COUNT(*) AS count
    FROM channels WHERE is_active = 1 AND country IS NOT NULL
    GROUP BY country ORDER BY count DESC, country
  `).all();
  return json(rows.results ?? rows);
}

async function handleSports(env) {
  await ensureBootstrap(env);

  const featured = await env.DB.prepare(`
    SELECT * FROM channels WHERE is_active = 1 AND source = 'featured'
    ORDER BY sort_order ASC
  `).all();

  const sports = await env.DB.prepare(`
    SELECT * FROM channels WHERE is_active = 1 AND category = 'Sports' AND source != 'featured'
    ORDER BY
      CASE quality WHEN '1080p' THEN 1 WHEN '720p' THEN 2 WHEN '480p' THEN 3 ELSE 4 END,
      name ASC
    LIMIT 80
  `).all();

  const football = await env.DB.prepare(`
    SELECT * FROM channels WHERE is_active = 1
      AND (LOWER(name) LIKE '%football%' OR LOWER(name) LIKE '%fifa%'
           OR LOWER(name) LIKE '%sport%' OR LOWER(name) LIKE '%bein%'
           OR LOWER(description) LIKE '%football%')
      AND id NOT IN (SELECT id FROM channels WHERE source = 'featured' AND is_active = 1)
    ORDER BY name ASC
    LIMIT 40
  `).all();

  const seen = new Set();
  const merged = [];
  const lists = [
    featured.results ?? featured,
    sports.results ?? sports,
    football.results ?? football,
  ];
  for (const list of lists) {
    for (const ch of list) {
      if (!seen.has(ch.id)) {
        seen.add(ch.id);
        merged.push(ch);
      }
    }
  }
  return json(merged);
}

async function handleChannelById(id, env) {
  await ensureBootstrap(env);
  const row = await env.DB.prepare('SELECT * FROM channels WHERE id = ? AND is_active = 1')
    .bind(Number(id)).first();
  if (!row) return json({ error: 'Channel not found' }, 404);
  return json(row);
}

async function handleCreateChannel(req, env) {
  const body = await req.json();
  const { name, category, country, logo_url, stream_url, backup_url, description, lang_group } = body;
  if (!name || !stream_url) return json({ error: 'name and stream_url are required' }, 400);

  const result = await env.DB.prepare(`
    INSERT INTO channels (name, category, country, logo_url, stream_url, backup_url, description, source, lang_group)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)
  `).bind(
    name,
    category || 'General',
    country || 'INT',
    logo_url || null,
    stream_url,
    backup_url || null,
    description || null,
    lang_group || 'Bangla'
  ).run();

  const row = await env.DB.prepare('SELECT * FROM channels WHERE id = ?')
    .bind(result.meta.last_row_id).first();
  return json(row, 201);
}

async function handleDeleteChannel(id, env) {
  const result = await env.DB.prepare('UPDATE channels SET is_active = 0 WHERE id = ?')
    .bind(Number(id)).run();
  if (!result.meta.changes) return json({ error: 'Channel not found' }, 404);
  return json({ ok: true });
}

async function handleSyncIptvOrg(req, env) {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const result = await syncIptvOrg({
    country: body.country || undefined,
    limit: body.limit ? Number(body.limit) : 300,
  });
  const stats = await upsertChannels(env.DB, result.channels, 'iptv-org', true);
  return json({
    ok: true,
    source: 'iptv-org',
    fetched: result.imported,
    ...stats,
    message: `${result.imported} চ্যানেল iptv-org GitHub API থেকে যোগ হয়েছে`,
  });
}

async function handleSyncFreeTv(req, env) {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const result = await syncFreeTv({ limit: body.limit ? Number(body.limit) : 250 });
  const stats = await upsertChannels(env.DB, result.channels, 'free-tv', true);
  return json({
    ok: true,
    source: 'free-tv',
    fetched: result.imported,
    ...stats,
    message: `${result.imported} চ্যানেল Free-TV GitHub থেকে যোগ হয়েছে`,
  });
}

async function handleSyncAll(env) {
  const [freeTv, iptvOrg] = await Promise.all([
    syncFreeTv({ limit: 200 }),
    syncIptvOrg({ limit: 300 }),
  ]);
  const s1 = await upsertChannels(env.DB, freeTv.channels, 'free-tv', true);
  const s2 = await upsertChannels(env.DB, iptvOrg.channels, 'iptv-org', true);
  return json({
    ok: true,
    freeTv: { fetched: freeTv.imported, ...s1 },
    iptvOrg: { fetched: iptvOrg.imported, ...s2 },
    message: `মোট ${freeTv.imported + iptvOrg.imported} চ্যানেল GitHub থেকে লোড হয়েছে`,
  });
}

async function handleProxy(req) {
  const url = new URL(req.url);
  const target = url.searchParams.get('url');
  if (!target) return json({ error: 'url required' }, 400);

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return json({ error: 'Invalid URL' }, 400);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return json({ error: 'Only http/https' }, 400);
  }

  const headers = {
    'User-Agent': url.searchParams.get('ua') || DEFAULT_UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  const ref = url.searchParams.get('ref');
  if (ref) headers.Referer = ref;

  try {
    const upstream = await fetch(target, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(45000),
    });

    if (!upstream.ok) {
      return json({ error: `Upstream ${upstream.status}` }, upstream.status);
    }

    const contentType = upstream.headers.get('content-type') || '';

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

      return new Response(rewritten, {
        headers: {
          ...CORS,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return new Response(upstream.body, {
      headers: {
        ...CORS,
        'Content-Type': contentType || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return json({ error: 'Proxy failed', detail: err.message }, 502);
  }
}

async function handleApi(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    if (path === '/api/channels' && req.method === 'GET') return handleChannels(req, env);
    if (path === '/api/channels' && req.method === 'POST') return handleCreateChannel(req, env);
    if (path === '/api/categories' && req.method === 'GET') return handleCategories(env);
    if (path === '/api/countries' && req.method === 'GET') return handleCountries(env);
    if (path === '/api/sports' && req.method === 'GET') return handleSports(env);
    if (path === '/api/proxy' && req.method === 'GET') return handleProxy(req);
    if (path === '/api/sync/iptv-org' && req.method === 'POST') return handleSyncIptvOrg(req, env);
    if (path === '/api/sync/free-tv' && req.method === 'POST') return handleSyncFreeTv(req, env);
    if (path === '/api/sync/all' && req.method === 'POST') return handleSyncAll(env);

    const channelMatch = path.match(/^\/api\/channels\/(\d+)$/);
    if (channelMatch && req.method === 'GET') return handleChannelById(channelMatch[1], env);
    if (channelMatch && req.method === 'DELETE') return handleDeleteChannel(channelMatch[1], env);

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    return json({ error: err.message || 'Server error' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env) {
    try {
      await handleSyncAll(env);
    } catch {
      /* cron sync is best-effort */
    }
  },
};

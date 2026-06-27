const IPTV_ORG = {
  streams: 'https://iptv-org.github.io/api/streams.json',
  channels: 'https://iptv-org.github.io/api/channels.json',
  logos: 'https://iptv-org.github.io/api/logos.json',
};

const FREE_TV = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';

const QUALITY_RANK = { '360p': 1, '480p': 2, '720p': 3, '1080p': 4, '2160p': 5 };

function isHlsUrl(url) {
  return typeof url === 'string' && /^https:\/\/.+\.m3u8(\?|$)/i.test(url);
}

function isReliableStream(stream) {
  if (!stream?.url || !isHlsUrl(stream.url)) return false;
  const label = (stream.label || '').toLowerCase();
  if (label.includes('geo-blocked')) return false;
  if (label.includes('vpn')) return false;
  if (label.includes('dead')) return false;
  return true;
}

function mapCategory(categories, channel) {
  if (!channel?.categories?.length) return 'General';
  const id = channel.categories[0];
  const cat = categories.find((c) => c.id === id);
  if (!cat) return 'General';
  const name = cat.name;
  const map = {
    News: 'News',
    Sports: 'Sports',
    Music: 'Music',
    Kids: 'Kids',
    Education: 'Education',
    Business: 'Business',
    Entertainment: 'Entertainment',
    Documentary: 'Documentary',
    Religious: 'Religious',
    Shop: 'Shop',
  };
  return map[name] || name || 'General';
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CastFlux-Live/1.0' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.json();
}

export async function syncIptvOrg(options = {}) {
  const { country, limit = 250 } = options;

  const [streams, channels, logos, categoryList] = await Promise.all([
    fetchJSON(IPTV_ORG.streams),
    fetchJSON(IPTV_ORG.channels),
    fetchJSON(IPTV_ORG.logos),
    fetchJSON('https://iptv-org.github.io/api/categories.json'),
  ]);

  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const logoMap = new Map();
  for (const logo of logos) {
    if (logo.channel && logo.url && !logoMap.has(logo.channel)) {
      logoMap.set(logo.channel, logo.url);
    }
  }

  const grouped = new Map();

  for (const stream of streams) {
    if (!isReliableStream(stream)) continue;

    const ch = stream.channel ? channelMap.get(stream.channel) : null;
    if (country && ch && ch.country !== country) continue;

    const key = stream.channel || stream.title;
    const quality = stream.quality || '720p';
    const rank = QUALITY_RANK[quality] || 2;

    const entry = {
      external_id: `iptv-org:${key}:${stream.feed || 'default'}`,
      name: ch?.name || stream.title,
      category: mapCategory(categoryList, ch),
      country: ch?.country || 'INT',
      logo_url: ch ? logoMap.get(ch.id) || null : null,
      stream_url: stream.url,
      backup_url: null,
      description: [quality, stream.label, ch?.network].filter(Boolean).join(' · ') || null,
      quality,
      referrer: stream.referrer || null,
      user_agent: stream.user_agent || null,
      source: 'iptv-org',
      sort_order: rank,
      _rank: rank,
    };

    const existing = grouped.get(key);
    if (!existing || rank < existing._rank) {
      if (existing) entry.backup_url = existing.stream_url;
      grouped.set(key, entry);
    } else if (!existing.backup_url) {
      existing.backup_url = stream.url;
    }
  }

  let result = [...grouped.values()].map(({ _rank, ...rest }) => rest);
  result.sort((a, b) => a.name.localeCompare(b.name));
  if (limit > 0) result = result.slice(0, limit);

  return { imported: result.length, channels: result, source: 'iptv-org' };
}

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF:')) {
      const nameMatch = trimmed.match(/,(.+)$/);
      const tvgName = trimmed.match(/tvg-name="([^"]*)"/);
      const tvgLogo = trimmed.match(/tvg-logo="([^"]*)"/);
      const group = trimmed.match(/group-title="([^"]*)"/);
      current = {
        name: (nameMatch?.[1] || tvgName?.[1] || 'Unknown').trim(),
        logo_url: tvgLogo?.[1] || null,
        category: group?.[1] || 'General',
        country: 'INT',
      };
    } else if (current && trimmed && !trimmed.startsWith('#')) {
      if (isHlsUrl(trimmed) || /^https:\/\/.+\.(m3u8|mp4)/i.test(trimmed)) {
        items.push({
          ...current,
          external_id: `free-tv:${current.name}`,
          stream_url: trimmed,
          backup_url: null,
          description: 'Free-TV/IPTV (GitHub curated free channels)',
          quality: '720p',
          referrer: null,
          user_agent: null,
          source: 'free-tv',
          sort_order: 0,
        });
      }
      current = null;
    }
  }
  return items;
}

export async function syncFreeTv(options = {}) {
  const { limit = 200 } = options;
  const res = await fetch(FREE_TV, {
    headers: { 'User-Agent': 'CastFlux-Live/1.0' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Free-TV fetch failed (${res.status})`);
  const text = await res.text();
  let channels = parseM3U(text).filter((c) => isHlsUrl(c.stream_url));
  if (limit > 0) channels = channels.slice(0, limit);
  return { imported: channels.length, channels, source: 'free-tv' };
}

export { IPTV_ORG, FREE_TV };

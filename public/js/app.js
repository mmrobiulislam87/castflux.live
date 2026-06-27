(() => {
  'use strict';

  const MAX_FULL_RELOAD = 3;
  const RETRY_DELAY_MS = 1500;
  const PRELOAD_MAX = 20;
  const PRELOAD_CONCURRENCY = 5;

  /** Menu order — special categories first */
  const PRIORITY_GROUPS = [
    { value: 'Football', label: '⚽ Football' },
    { value: 'Cricket', label: '🏏 Cricket' },
    { value: 'Sports', label: 'Sports' },
    { value: 'Kids', label: 'Kids' },
    { value: 'Bangla', label: 'Bangla' },
    { value: 'English', label: 'English' },
    { value: 'Hindi', label: 'Hindi' },
    { value: 'Islamic', label: 'Islamic' },
  ];

  /** Buckets that must not appear in country/category tabs (English-only there) */
  const COUNTRY_LABELS = {
    BD: 'Bangladesh', IN: 'India', US: 'USA', GB: 'UK', DE: 'Germany', FR: 'France',
    TR: 'Turkey', PK: 'Pakistan', AE: 'UAE', SA: 'Saudi', CA: 'Canada', AU: 'Australia',
    IT: 'Italy', ES: 'Spain', BR: 'Brazil', MX: 'Mexico', JP: 'Japan', KR: 'Korea',
    CN: 'China', RU: 'Russia', NL: 'Netherlands', PL: 'Poland', EG: 'Egypt',
    QA: 'Qatar', IR: 'Iran', ID: 'Indonesia', MY: 'Malaysia', TH: 'Thailand',
    PH: 'Philippines', NG: 'Nigeria', ZA: 'South Africa', AR: 'Argentina',
    AL: 'Albania', GR: 'Greece', PT: 'Portugal', SE: 'Sweden', NO: 'Norway',
    AT: 'Austria', CH: 'Switzerland', BE: 'Belgium', INT: 'International',
  };

  let allChannels = [];
  let countries = [];
  let categories = [];
  let activeFilter = { type: 'group', value: 'Football' };
  let currentChannel = null;
  let hlsInstance = null;
  let fullReloadCount = 0;
  let networkRecoverCount = 0;
  let streamIndex = 0;
  let proxyMode = false;
  let bandwidthMode = 'auto';
  let statusTimer = null;
  let stallTimer = null;
  let lastProgressTime = 0;
  let playbackStarted = false;

  const els = {
    channelList: document.getElementById('channelList'),
    guideTabs: document.getElementById('guideTabs'),
    video: document.getElementById('videoPlayer'),
    overlay: document.getElementById('playerOverlay'),
    status: document.getElementById('playerStatus'),
    qualityBadge: document.getElementById('qualityBadge'),
    channelName: document.getElementById('channelName'),
    channelDesc: document.getElementById('channelDesc'),
    railCount: document.getElementById('railCount'),
    searchInput: document.getElementById('searchInput'),
    syncBtn: document.getElementById('syncBtn'),
    bandwidthMode: document.getElementById('bandwidthMode'),
    carouselPrev: document.getElementById('carouselPrev'),
    carouselNext: document.getElementById('carouselNext'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsPanel: document.getElementById('settingsPanel'),
    adminToggle: document.getElementById('adminToggle'),
    addModal: document.getElementById('addChannelModal'),
    addForm: document.getElementById('addChannelForm'),
    cancelAdd: document.getElementById('cancelAdd'),
  };

  const preloadPool = new Map();
  const preloadQueue = [];
  let preloadRunning = 0;
  let loadingTimer = null;
  let mainHlsHandlers = null;
  let resortTimer = null;

  // ── Turbo HLS: minimum buffer = instant first frame ──

  function getHlsConfig() {
    const saver = bandwidthMode === 'low';
    if (saver) {
      return {
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: 0,
        startFragPrefetch: true,
        testBandwidth: true,
        liveSyncDurationCount: 2,
      };
    }
    return {
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 3,
      maxBufferLength: 4,
      maxMaxBufferLength: 10,
      maxBufferSize: 12 * 1000 * 1000,
      maxBufferHole: 0.3,
      highBufferWatchdogPeriod: 1,
      nudgeOffset: 0.05,
      nudgeMaxRetry: 12,
      startFragPrefetch: true,
      testBandwidth: false,
      startLevel: 0,
      capLevelToPlayerSize: true,
      abrEwmaDefaultEstimate: 5000000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      initialLiveManifestSize: 1,
      liveSyncDurationCount: 1,
      liveMaxLatencyDurationCount: 3,
      liveDurationInfinity: true,
      maxLiveSyncPlaybackRate: 1.3,
      manifestLoadingTimeOut: 6000,
      manifestLoadingMaxRetry: 4,
      levelLoadingTimeOut: 6000,
      fragLoadingTimeOut: 8000,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 400,
    };
  }

  // ── Channel buckets, dedupe & sort ──

  function channelText(ch) {
    return `${ch.name} ${ch.description || ''} ${ch.category || ''}`.toLowerCase();
  }

  function normalizeStreamUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`.replace(/\/$/, '');
    } catch {
      return url.trim();
    }
  }

  /** Each channel belongs to exactly ONE bucket — no duplicates across tabs */
  function assignBucket(ch) {
    if (ch.lang_group === 'Football') return 'Football';
    if (ch.lang_group === 'Cricket') return 'Cricket';
    const t = channelText(ch);

    if (/cricket|ipl\b|bcci|willow|sony sports|star sports|espn cric|cricinfo|cricbuzz|ptv sports/.test(t)) {
      return 'Cricket';
    }
    if (/football|soccer|fifa|bein|premier league|uefa|laliga|bundesliga|world cup|\bepl\b|\bmls\b|red bull tv|trace sport/.test(t)) {
      return 'Football';
    }
    if (ch.lang_group === 'Sports' || ch.category?.toLowerCase() === 'sports' || ch.source === 'featured' || /\bsport|espn\b/.test(t)) {
      return 'Sports';
    }
    if (ch.lang_group === 'Kids' || ch.category?.toLowerCase() === 'kids' || /cartoon|cbbc|nickelodeon|nick jr|baby tv|kids/.test(t)) {
      return 'Kids';
    }
    if (ch.lang_group === 'Bangla' || ch.source === 'bangla' || ch.country === 'BD' || /bangla|bijoy|atn|somoy|independent|ntv|rtv|channel 24|jamuna|dbc|boishakhi/.test(t)) {
      return 'Bangla';
    }
    if (ch.lang_group === 'Islamic' || ch.category?.toLowerCase() === 'religious' || /islam|peace tv|quran|madani|paigam|iqra|sunnah|deen|makkah/.test(t)) {
      return 'Islamic';
    }
    if (ch.lang_group === 'Hindi' || ch.country === 'IN' || /hindi|sony sab|colors|star plus|zee tv|zee cinema|&tv|sab tv|star gold|aaj tak/.test(t)) {
      return 'Hindi';
    }
    return 'English';
  }

  function dedupeAndBucket(raw) {
    const seen = new Set();
    const out = [];
    for (const ch of raw) {
      const key = normalizeStreamUrl(ch.stream_url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      ch._bucket = assignBucket(ch);
      out.push(ch);
    }
    return out;
  }

  function countByBucket(bucket) {
    return allChannels.filter((c) => c._bucket === bucket).length;
  }

  function countByCountry(code) {
    return allChannels.filter((c) => c.country === code && c._bucket === 'English').length;
  }

  function countByCategory(cat) {
    return allChannels.filter((c) => c.category === cat && c._bucket === 'English').length;
  }

  function buildMenuItems() {
    const items = [];

    for (const { value, label } of PRIORITY_GROUPS) {
      const count = countByBucket(value);
      if (count > 0) items.push({ type: 'group', value, label, count });
    }

    for (const { country } of countries) {
      const count = countByCountry(country);
      if (count < 2) continue;
      items.push({
        type: 'country',
        value: country,
        label: COUNTRY_LABELS[country] || country,
        count,
      });
    }

    const skipCats = new Set(['General', 'Undefined', 'Shop', 'Sports', 'Kids', 'Religious']);
    for (const { category } of categories) {
      const count = countByCategory(category);
      if (count < 2 || skipCats.has(category)) continue;
      items.push({ type: 'category', value: category, label: category, count });
    }

    return items;
  }

  function filterKey(f) {
    return `${f.type}:${f.value}`;
  }

  function isPreloaded(ch) {
    return !!preloadPool.get(ch.id)?.readyFlag;
  }

  /** ⚡ ready first → featured → name */
  function sortChannels(list) {
    return [...list].sort((a, b) => {
      const ar = isPreloaded(a) ? 1 : 0;
      const br = isPreloaded(b) ? 1 : 0;
      if (br !== ar) return br - ar;

      const af = a.source === 'featured' || a.source === 'bangla' ? 1 : 0;
      const bf = b.source === 'featured' || b.source === 'bangla' ? 1 : 0;
      if (bf !== af) return bf - af;

      return a.name.localeCompare(b.name);
    });
  }

  function getFilteredChannels() {
    const { type, value } = activeFilter;
    let pool;

    if (type === 'group') {
      pool = allChannels.filter((c) => c._bucket === value);
    } else if (type === 'country') {
      pool = allChannels.filter((c) => c.country === value && c._bucket === 'English');
    } else if (type === 'category') {
      pool = allChannels.filter((c) => c.category === value && c._bucket === 'English');
    } else {
      pool = allChannels;
    }

    const q = els.searchInput?.value.trim().toLowerCase();
    if (q) pool = pool.filter((c) => c.name.toLowerCase().includes(q));

    return sortChannels(pool);
  }

  function resortGridOrder() {
    if (!els.channelList) return;
    const sorted = getFilteredChannels();
    const parent = els.channelList;
    for (const ch of sorted) {
      const tile = parent.querySelector(`.channel-tile[data-id="${ch.id}"]`);
      if (tile) parent.appendChild(tile);
    }
    if (els.railCount) {
      const ready = sorted.filter(isPreloaded).length;
      els.railCount.textContent = ready
        ? `${sorted.length} channels · ⚡ ${ready} instant`
        : `${sorted.length} channels`;
    }
  }

  function computeCountryCounts() {
    const map = new Map();
    for (const ch of allChannels) {
      if (ch._bucket !== 'English' || !ch.country) continue;
      map.set(ch.country, (map.get(ch.country) || 0) + 1);
    }
    return [...map.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);
  }

  function computeCategoryCounts() {
    const map = new Map();
    for (const ch of allChannels) {
      if (ch._bucket !== 'English' || !ch.category) continue;
      map.set(ch.category, (map.get(ch.category) || 0) + 1);
    }
    return [...map.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  // ── Stream helpers ──
  function getStreamCandidates(ch) {
    return [...new Set([ch.stream_url, ch.backup_url].filter(Boolean))];
  }

  function buildProxyUrl(url, ch) {
    const p = new URLSearchParams({ url });
    if (ch.referrer) p.set('ref', ch.referrer);
    if (ch.user_agent) p.set('ua', ch.user_agent);
    return `/api/proxy?${p}`;
  }

  function getPlaybackUrl(ch, idx, useProxy) {
    const raw = getStreamCandidates(ch)[idx] || ch.stream_url;
    return useProxy ? buildProxyUrl(raw, ch) : raw;
  }

  function buildXhrSetup(ch) {
    return (xhr) => {
      xhr.timeout = 20000;
      if (ch.referrer) xhr.setRequestHeader('Referer', ch.referrer);
      if (ch.user_agent) xhr.setRequestHeader('User-Agent', ch.user_agent);
    };
  }

  function warmStream(url) {
    try {
      const host = new URL(url).origin;
      if (!document.querySelector(`link[data-preconnect="${host}"]`)) {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = host;
        link.dataset.preconnect = host;
        document.head.appendChild(link);
      }
    } catch { /* ignore */ }
  }

  // ── Aggressive preload engine ──

  function markTileReady(id) {
    document.querySelector(`.channel-tile[data-id="${id}"]`)?.classList.add('preloaded');
    clearTimeout(resortTimer);
    resortTimer = setTimeout(resortGridOrder, 80);
  }

  function createPreloadEntry(ch, url) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.className = 'preload-video';
    document.body.appendChild(video);

    const hls = new Hls({ ...getHlsConfig(), xhrSetup: buildXhrSetup(ch) });
    const entry = {
      hls,
      video,
      channelId: ch.id,
      readyFlag: false,
      url,
      destroy() {
        hls.destroy();
        video.remove();
      },
    };

    const onReady = () => {
      if (entry.readyFlag) return;
      entry.readyFlag = true;
      markTileReady(ch.id);
      video.play().catch(() => {});
    };

    hls.on(Hls.Events.FRAG_BUFFERED, onReady);
    hls.on(Hls.Events.FRAG_LOADED, onReady);
    hls.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) entry.destroy(); });

    hls.loadSource(url);
    hls.attachMedia(video);
    return entry;
  }

  function evictPreloadIfFull() {
    if (preloadPool.size < PRELOAD_MAX) return;
    for (const [id, entry] of preloadPool) {
      if (id === currentChannel?.id) continue;
      entry.destroy();
      preloadPool.delete(id);
      break;
    }
  }

  function doPrefetch(ch) {
    if (!ch || preloadPool.has(ch.id) || ch.id === currentChannel?.id || !Hls.isSupported()) {
      return Promise.resolve();
    }
    evictPreloadIfFull();
    warmStream(ch.stream_url);
    const url = getPlaybackUrl(ch, 0, false);
    const entry = createPreloadEntry(ch, url);
    preloadPool.set(ch.id, entry);
    return new Promise((resolve) => {
      const finish = () => {
        entry.hls.off(Hls.Events.FRAG_BUFFERED, finish);
        entry.hls.off(Hls.Events.ERROR, onErr);
        resolve();
      };
      const onErr = () => finish();
      entry.hls.on(Hls.Events.FRAG_BUFFERED, finish);
      entry.hls.on(Hls.Events.ERROR, onErr);
      setTimeout(finish, 12000);
    });
  }

  function schedulePreload(ch) {
    if (!ch || preloadPool.has(ch.id)) return;
    if (!preloadQueue.find((c) => c.id === ch.id)) preloadQueue.push(ch);
    drainPreloadQueue();
  }

  function drainPreloadQueue() {
    while (preloadRunning < PRELOAD_CONCURRENCY && preloadQueue.length) {
      const ch = preloadQueue.shift();
      if (!ch || preloadPool.has(ch.id)) continue;
      preloadRunning += 1;
      doPrefetch(ch).finally(() => {
        preloadRunning -= 1;
        drainPreloadQueue();
      });
    }
  }

  function preloadAllVisible() {
    getFilteredChannels().slice(0, PRELOAD_MAX).forEach((ch) => schedulePreload(ch));
  }

  function prefetchUrgent(ch) {
    if (!ch) return;
    preloadQueue.unshift(ch);
    drainPreloadQueue();
  }

  // ── UI ──

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function showStatus(msg, type = 'loading') {
    clearTimeout(statusTimer);
    clearTimeout(loadingTimer);
    els.status.textContent = msg;
    els.status.className = `player-status visible ${type}`;
    if (type === 'ok') statusTimer = setTimeout(() => els.status.classList.remove('visible'), 1200);
  }

  function showLoadingDelayed() {
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => {
      if (!playbackStarted) showStatus('Connecting...', 'loading');
    }, 600);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function tileInitials(name) {
    return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase().slice(0, 3);
  }

  function renderGrid() {
    const list = getFilteredChannels();
    if (els.railCount) {
      const ready = list.filter(isPreloaded).length;
      els.railCount.textContent = ready
        ? `${list.length} channels · ⚡ ${ready} instant`
        : `${list.length} channels`;
    }

    if (!list.length) {
      els.channelList.innerHTML = '<div class="empty-state">কোনো চ্যানেল নেই — ⟳ Sync চাপুন</div>';
      return;
    }

    els.channelList.innerHTML = list.map((ch) => {
      const active = currentChannel?.id === ch.id ? ' active' : '';
      const preloaded = preloadPool.get(ch.id)?.readyFlag ? ' preloaded' : '';
      const initials = escapeHtml(tileInitials(ch.name));
      const logoInner = ch.logo_url
        ? `<img src="${escapeHtml(ch.logo_url)}" alt="" loading="lazy" decoding="async" /><span class="fallback is-hidden">${initials}</span>`
        : `<span class="fallback">${initials}</span>`;
      return `<div class="channel-tile${active}${preloaded}" data-id="${ch.id}" title="${escapeHtml(ch.name)}">
        <div class="tile-logo">${logoInner}</div>
        <span class="tile-name">${escapeHtml(ch.name)}</span>
      </div>`;
    }).join('');

    els.channelList.querySelectorAll('.tile-logo img').forEach((img) => {
      img.addEventListener('error', () => {
        img.classList.add('is-hidden');
        img.nextElementSibling?.classList.remove('is-hidden');
      }, { once: true });
    });

    els.channelList.querySelectorAll('.channel-tile').forEach((tile) => {
      const ch = list.find((c) => c.id === Number(tile.dataset.id));
      tile.addEventListener('mouseenter', () => prefetchUrgent(ch));
      tile.addEventListener('mousedown', () => prefetchUrgent(ch));
      tile.addEventListener('touchstart', () => prefetchUrgent(ch), { passive: true });
      tile.addEventListener('click', () => playChannel(ch));
    });

    preloadAllVisible();
  }

  function renderCarousel() {
    if (!els.guideTabs) return;
    const items = buildMenuItems();
    const activeKey = filterKey(activeFilter);

    els.guideTabs.innerHTML = items.map((item) => {
      const key = filterKey(item);
      const active = key === activeKey ? ' active' : '';
      const extra = item.type === 'country' ? ' tab-country' : '';
      return `<button type="button" class="guide-tab${active}${extra}" data-type="${item.type}" data-value="${escapeHtml(item.value)}">
        ${escapeHtml(item.label)}<span class="tab-count">${item.count}</span>
      </button>`;
    }).join('');

    els.guideTabs.querySelectorAll('.guide-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        setActiveFilter({ type: tab.dataset.type, value: tab.dataset.value });
      });
    });

    scrollActiveTabIntoView();
  }

  function scrollActiveTabIntoView() {
    requestAnimationFrame(() => {
      els.guideTabs?.querySelector('.guide-tab.active')?.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    });
  }

  function setActiveFilter(filter) {
    activeFilter = filter;
    els.guideTabs?.querySelectorAll('.guide-tab').forEach((t) => {
      const match = t.dataset.type === filter.type && t.dataset.value === filter.value;
      t.classList.toggle('active', match);
    });
    scrollActiveTabIntoView();
    renderGrid();
    preloadAllVisible();
  }

  function updateNowPlaying(ch) {
    els.channelName.textContent = ch.name;
    els.channelDesc.textContent = ch.description || `${ch._bucket || 'English'} · ${ch.country || 'INT'}`;
    els.overlay?.classList.add('hidden');
  }

  function updateQualityBadge() {
    if (!els.qualityBadge || !hlsInstance) return;
    const lv = hlsInstance.currentLevel;
    const levels = hlsInstance.levels;
    if (lv >= 0 && levels[lv]?.height) {
      els.qualityBadge.textContent = `${levels[lv].height}p`;
      els.qualityBadge.classList.add('visible');
    }
  }

  // ── Player ──

  function detachMainHlsEvents(hls) {
    if (!hls || !mainHlsHandlers) return;
    for (const [evt, fn] of mainHlsHandlers) hls.off(evt, fn);
    mainHlsHandlers = null;
  }

  function attachHlsEvents(hls) {
    detachMainHlsEvents(hls);
    const handlers = [];

    const onBuffered = () => {
      lastProgressTime = Date.now();
      clearTimeout(loadingTimer);
      if (!playbackStarted) {
        playbackStarted = true;
        els.video.muted = false;
        els.overlay?.classList.add('hidden');
        els.video.play().catch(() => {});
        showStatus('LIVE', 'ok');
        updateQualityBadge();
      }
    };

    const onParsed = () => {
      els.video.play().catch(() => {});
      hls.startLoad(-1);
    };

    const onLevel = () => updateQualityBadge();
    const onError = (_e, data) => { if (data.fatal) handleFatal(data); };
    const onFrag = () => { lastProgressTime = Date.now(); };

    hls.on(Hls.Events.FRAG_BUFFERED, onBuffered);
    hls.on(Hls.Events.FRAG_LOADED, onFrag);
    hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
    hls.on(Hls.Events.LEVEL_SWITCHED, onLevel);
    hls.on(Hls.Events.ERROR, onError);

    mainHlsHandlers = [
      [Hls.Events.FRAG_BUFFERED, onBuffered],
      [Hls.Events.FRAG_LOADED, onFrag],
      [Hls.Events.MANIFEST_PARSED, onParsed],
      [Hls.Events.LEVEL_SWITCHED, onLevel],
      [Hls.Events.ERROR, onError],
    ];
  }

  function handleFatal(data) {
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsInstance) { hlsInstance.recoverMediaError(); return; }
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsInstance && networkRecoverCount < 2) {
      networkRecoverCount += 1;
      hlsInstance.startLoad(-1);
      return;
    }
    tryNext();
  }

  function tryNext() {
    if (!proxyMode) { proxyMode = true; setTimeout(startPlayback, 400); return; }
    const cands = getStreamCandidates(currentChannel);
    if (streamIndex < cands.length - 1) { streamIndex++; setTimeout(startPlayback, 400); return; }
    if (++fullReloadCount <= MAX_FULL_RELOAD) { streamIndex = 0; setTimeout(startPlayback, RETRY_DELAY_MS); return; }
    showStatus('Unavailable', 'error');
  }

  function destroyHls(hls = hlsInstance) {
    if (hls) {
      detachMainHlsEvents(hls);
      hls.destroy();
      if (hls === hlsInstance) hlsInstance = null;
    }
  }

  function swapToPreloaded(cached) {
    const resumeAt = cached.video.currentTime;
    destroyHls();
    cached.video.remove();
    preloadPool.delete(cached.channelId);

    hlsInstance = cached.hls;
    hlsInstance.detachMedia();
    hlsInstance.attachMedia(els.video);
    attachHlsEvents(hlsInstance);

    if (resumeAt > 0.1) els.video.currentTime = resumeAt;
    els.video.muted = false;
    playbackStarted = true;
    els.overlay?.classList.add('hidden');
    els.video.play().catch(() => {});
    showStatus('INSTANT', 'ok');
    updateQualityBadge();
    lastProgressTime = Date.now();
  }

  async function playChannel(ch) {
    if (currentChannel?.id === ch.id && playbackStarted && !els.video.paused) return;

    currentChannel = ch;
    fullReloadCount = 0;
    networkRecoverCount = 0;
    streamIndex = 0;
    proxyMode = false;
    playbackStarted = false;

    updateNowPlaying(ch);
    renderGrid();

    const cached = preloadPool.get(ch.id);
    if (cached?.readyFlag) {
      swapToPreloaded(cached);
      preloadAllVisible();
      return;
    }

    if (cached && !cached.readyFlag) {
      showLoadingDelayed();
      await new Promise((resolve) => {
        const finish = () => {
          cached.hls.off(Hls.Events.FRAG_BUFFERED, finish);
          resolve();
        };
        cached.hls.on(Hls.Events.FRAG_BUFFERED, finish);
        setTimeout(finish, 4000);
      });
      const ready = preloadPool.get(ch.id);
      if (ready?.readyFlag) {
        swapToPreloaded(ready);
        preloadAllVisible();
        return;
      }
    }

    destroyHls();
    els.video.removeAttribute('src');
    warmStream(ch.stream_url);
    startPlayback();
    preloadAllVisible();
  }

  function startPlayback() {
    if (!currentChannel) return;
    const url = getPlaybackUrl(currentChannel, streamIndex, proxyMode);
    showLoadingDelayed();

    if (Hls.isSupported()) {
      hlsInstance = new Hls({ ...getHlsConfig(), xhrSetup: buildXhrSetup(currentChannel) });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(els.video);
      attachHlsEvents(hlsInstance);
      els.video.play().catch(() => {});

      clearInterval(stallTimer);
      stallTimer = setInterval(() => {
        if (!currentChannel || els.video.paused || !hlsInstance) return;
        if (Date.now() - lastProgressTime > 8000) {
          hlsInstance.recoverMediaError();
          hlsInstance.startLoad(-1);
          lastProgressTime = Date.now();
        }
      }, 3000);
    } else if (els.video.canPlayType('application/vnd.apple.mpegurl')) {
      els.video.src = url;
      els.video.onloadedmetadata = () => {
        playbackStarted = true;
        els.video.muted = false;
        els.video.play().catch(() => {});
        showStatus('LIVE', 'ok');
      };
    }
  }

  // ── Data ──

  async function loadAll() {
    const [all, sports] = await Promise.all([
      fetchJSON('/api/channels'),
      fetchJSON('/api/sports'),
    ]);
    allChannels = dedupeAndBucket([...sports, ...all]);
    countries = computeCountryCounts();
    categories = computeCategoryCounts();
    renderCarousel();
  }

  async function syncAll() {
    els.syncBtn.disabled = true;
    try {
      await fetchJSON('/api/sync/all', { method: 'POST' });
      await loadAll();
      renderGrid();
      preloadAllVisible();
      showStatus('Synced', 'ok');
    } catch { showStatus('Sync failed', 'error'); }
    finally { els.syncBtn.disabled = false; }
  }

  // ── Events ──

  els.carouselPrev?.addEventListener('click', () => {
    els.guideTabs?.scrollBy({ left: -120, behavior: 'smooth' });
  });
  els.carouselNext?.addEventListener('click', () => {
    els.guideTabs?.scrollBy({ left: 120, behavior: 'smooth' });
  });

  els.guideTabs?.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      els.guideTabs.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  els.syncBtn?.addEventListener('click', syncAll);
  els.settingsBtn?.addEventListener('click', () => els.settingsPanel?.classList.toggle('open'));
  els.bandwidthMode?.addEventListener('change', () => {
    bandwidthMode = els.bandwidthMode.value;
    if (currentChannel) playChannel(currentChannel);
  });

  let searchT;
  els.searchInput?.addEventListener('input', () => {
    clearTimeout(searchT);
    searchT = setTimeout(renderGrid, 200);
  });

  els.adminToggle?.addEventListener('click', () => els.addModal.showModal());
  els.cancelAdd?.addEventListener('click', () => els.addModal.close());
  els.addForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(els.addForm).entries());
    body.category = body.lang_group || 'General';
    try {
      const res = await fetch('/api/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      els.addModal.close();
      els.addForm.reset();
      await loadAll();
      renderGrid();
    } catch { alert('Save failed'); }
  });

  async function init() {
    try {
      await loadAll();
      const preferred = ['Football', 'Cricket', 'Sports', 'Bangla'];
      let startFilter = { type: 'group', value: 'Football' };
      for (const value of preferred) {
        if (countByBucket(value) > 0) {
          startFilter = { type: 'group', value };
          break;
        }
      }
      setActiveFilter(startFilter);
      const first = getFilteredChannels()[0];
      if (first) {
        await doPrefetch(first);
        preloadAllVisible();
        playChannel(first);
      }
    } catch {
      els.channelList.innerHTML = '<div class="empty-state">npm start চালান</div>';
    }
  }

  init();
})();

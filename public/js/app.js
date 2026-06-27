(() => {
  'use strict';

  const MAX_FULL_RELOAD = 3;
  const RETRY_DELAY_MS = 1500;
  const PRELOAD_MAX = 8;
  const PRELOAD_CONCURRENCY = 2;
  const WELCOME_PREFETCH = 3;
  const WELCOME_WAIT_MS = 8000;
  const LS_FAV = 'castflux_favorites';
  const LS_RECENT = 'castflux_recent';
  const LS_PREFS = 'castflux_prefs';
  const MAX_RECENT = 20;

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
  let welcomeAutoplay = false;
  let favoriteIds = [];
  let recentIds = [];
  let audioOnlyMode = false;
  let ambientEnabled = true;
  let manualQuality = -1;
  let ambientRaf = null;
  let gestureTouch = null;
  let adminToken = '';

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
    adminTokenInput: document.getElementById('adminTokenInput'),
    addModal: document.getElementById('addChannelModal'),
    addForm: document.getElementById('addChannelForm'),
    cancelAdd: document.getElementById('cancelAdd'),
    playerFrame: document.getElementById('playerFrame'),
    ambientGlow: document.getElementById('ambientGlow'),
    bgBlur: document.getElementById('bgBlur'),
    favoriteBtn: document.getElementById('favoriteBtn'),
    audioOnlyBtn: document.getElementById('audioOnlyBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    gestureHint: document.getElementById('gestureHint'),
    surpriseBtn: document.getElementById('surpriseBtn'),
    favoritesTabBtn: document.getElementById('favoritesTabBtn'),
    manualQuality: document.getElementById('manualQuality'),
    ambientToggle: document.getElementById('ambientToggle'),
    audioOnlyToggle: document.getElementById('audioOnlyToggle'),
  };

  const preloadPool = new Map();
  const preloadQueue = [];
  let preloadRunning = 0;
  let loadingTimer = null;
  let mainHlsHandlers = null;
  let bufferHealthTimer = null;
  let preloadResumeTimer = null;

  // ── HLS: smooth sustained playback (no 1-min stutter) ──

  const HLS_SHARED = {
    enableWorker: true,
    lowLatencyMode: false,
    startFragPrefetch: true,
    capLevelToPlayerSize: true,
    manifestLoadingTimeOut: 12000,
    manifestLoadingMaxRetry: 6,
    levelLoadingTimeOut: 12000,
    fragLoadingTimeOut: 18000,
    fragLoadingMaxRetry: 10,
    fragLoadingRetryDelay: 600,
  };

  function getHlsConfig(purpose = 'main') {
    if (purpose === 'preload') {
      return {
        ...HLS_SHARED,
        maxBufferLength: 6,
        maxMaxBufferLength: 12,
        backBufferLength: 0,
        liveSyncDurationCount: 2,
        startLevel: 0,
        testBandwidth: false,
      };
    }

    if (bandwidthMode === 'low') {
      return {
        ...HLS_SHARED,
        maxBufferLength: 25,
        maxMaxBufferLength: 50,
        backBufferLength: 15,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
        maxLiveSyncPlaybackRate: 1.0,
        startLevel: 0,
        testBandwidth: true,
      };
    }

    if (bandwidthMode === 'medium') {
      return {
        ...HLS_SHARED,
        maxBufferLength: 40,
        maxMaxBufferLength: 80,
        backBufferLength: 25,
        maxBufferSize: 45 * 1000 * 1000,
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 12,
        maxLiveSyncPlaybackRate: 1.0,
        startLevel: -1,
        testBandwidth: true,
        abrBandWidthUpFactor: 0.55,
      };
    }

    return {
      ...HLS_SHARED,
      maxBufferLength: 50,
      maxMaxBufferLength: 120,
      backBufferLength: 30,
      maxBufferSize: 70 * 1000 * 1000,
      maxBufferHole: 0.5,
      liveSyncDurationCount: 4,
      liveMaxLatencyDurationCount: 16,
      liveDurationInfinity: true,
      maxLiveSyncPlaybackRate: 1.0,
      startLevel: -1,
      testBandwidth: true,
      abrEwmaDefaultEstimate: 4000000,
      abrBandWidthFactor: 0.92,
      abrBandWidthUpFactor: 0.45,
    };
  }

  function applySmoothBufferMode(hls) {
    if (!hls) return;
    const cfg = getHlsConfig('main');
    Object.assign(hls.config, {
      maxBufferLength: cfg.maxBufferLength,
      maxMaxBufferLength: cfg.maxMaxBufferLength,
      backBufferLength: cfg.backBufferLength,
      liveSyncDurationCount: cfg.liveSyncDurationCount,
      liveMaxLatencyDurationCount: cfg.liveMaxLatencyDurationCount,
      maxLiveSyncPlaybackRate: 1.0,
      lowLatencyMode: false,
    });
    hls.startLoad(-1);
  }

  function getBufferAhead() {
    const v = els.video;
    if (!v?.buffered?.length) return 0;
    try {
      return v.buffered.end(v.buffered.length - 1) - v.currentTime;
    } catch {
      return 0;
    }
  }

  function freezeBackgroundPreloads(activeId) {
    for (const [id, entry] of preloadPool) {
      if (id !== activeId) {
        try { entry.hls.stopLoad(); } catch { /* ignore */ }
      }
    }
  }

  function tryUnmute() {
    if (!els.video?.muted) return;
    els.video.muted = false;
    els.video.play().catch(() => { els.video.muted = true; });
  }

  /** Featured / fast channels for first-visit instant play */
  function getWelcomeCandidates() {
    const featured = allChannels
      .filter((c) => c.source === 'featured' || c.source === 'cricket')
      .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
    if (featured.length) return featured.slice(0, WELCOME_PREFETCH);

    for (const bucket of ['Football', 'Cricket', 'Sports', 'Bangla']) {
      const list = allChannels.filter((c) => c._bucket === bucket);
      if (!list.length) continue;
      const prefer = list.find((c) => c.source === 'bangla') || list[0];
      const rest = list.filter((c) => c.id !== prefer.id);
      return [prefer, ...rest].slice(0, WELCOME_PREFETCH);
    }
    return allChannels.slice(0, WELCOME_PREFETCH);
  }

  async function prefetchWelcomeChannels(candidates) {
    if (!Hls.isSupported() || !candidates.length) return;
    await Promise.all(candidates.map((ch) => doPrefetch(ch).catch(() => {})));
  }

  function pickFastestWelcome(candidates) {
    const ready = candidates.find((c) => preloadPool.get(c.id)?.readyFlag);
    if (ready) return Promise.resolve(ready);

    return new Promise((resolve) => {
      const deadline = Date.now() + WELCOME_WAIT_MS;
      const tick = () => {
        const found = candidates.find((c) => preloadPool.get(c.id)?.readyFlag);
        if (found) return resolve(found);
        if (Date.now() >= deadline) return resolve(candidates[0]);
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  async function startWelcomePlayback() {
    const candidates = getWelcomeCandidates();
    if (!candidates.length) return;

    welcomeAutoplay = true;
    els.video.muted = true;
    els.channelName.textContent = candidates[0].name;
    els.channelDesc.textContent = '⚡ লাইভ চ্যানেল চালু হচ্ছে...';
    showStatus('Connecting...', 'loading');

    await prefetchWelcomeChannels(candidates);
    const best = await pickFastestWelcome(candidates);
    if (best) playChannel(best);
  }

  function canRunBackgroundPreload() {
    if (!playbackStarted || els.video.paused || !currentChannel) return true;
    return getBufferAhead() > 18;
  }

  function schedulePreloadResume() {
    clearTimeout(preloadResumeTimer);
    preloadResumeTimer = setTimeout(() => {
      if (canRunBackgroundPreload()) {
        preloadAllVisible();
        preloadAllCategoryHeads();
      }
    }, 25000);
  }

  function startBufferHealthWatch() {
    clearInterval(bufferHealthTimer);
    bufferHealthTimer = setInterval(() => {
      if (!hlsInstance || !playbackStarted || els.video.paused) return;

      const ahead = getBufferAhead();

      if (ahead < 5) {
        freezeBackgroundPreloads(currentChannel?.id);
        hlsInstance.startLoad(-1);
        if (ahead < 2 && hlsInstance.autoLevelEnabled && hlsInstance.currentLevel > 0) {
          hlsInstance.nextLevel = Math.max(0, hlsInstance.currentLevel - 1);
        }
        if (ahead < 3) showStatus('Buffering...', 'loading');
      } else if (ahead > 12) {
        showStatus('LIVE', 'ok');
        schedulePreloadResume();
      }
    }, 2000);
  }

  function stopBufferHealthWatch() {
    clearInterval(bufferHealthTimer);
    bufferHealthTimer = null;
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

    const favCount = getFavoriteChannels().length;
    if (favCount > 0) {
      items.push({ type: 'favorites', value: 'all', label: '★ Favorites', count: favCount });
    }

    const recentCount = getRecentChannels().length;
    if (recentCount > 0) {
      items.push({ type: 'recent', value: 'all', label: '🕐 Recent', count: recentCount });
    }

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

  function isFastChannel(ch) {
    return ch.source === 'featured' || ch.source === 'bangla' || ch.source === 'cricket';
  }

  function isPreloaded(ch) {
    return !!preloadPool.get(ch.id)?.readyFlag;
  }

  /** Fast channels always render at top — no DOM reorder after load */
  function sortChannels(list) {
    return [...list].sort((a, b) => {
      const rank = (c) => {
        if (isPreloaded(c)) return 3;
        if (isFastChannel(c)) return 2;
        if ((c.sort_order || 99) <= 10) return 1;
        return 0;
      };
      const dr = rank(b) - rank(a);
      if (dr !== 0) return dr;

      const ao = a.sort_order || 99;
      const bo = b.sort_order || 99;
      if (ao !== bo) return ao - bo;

      return a.name.localeCompare(b.name);
    });
  }

  function getChannelsForFilter(filter) {
    const { type, value } = filter;
    let pool;

    if (type === 'favorites') {
      pool = getFavoriteChannels();
    } else if (type === 'recent') {
      pool = getRecentChannels();
    } else if (type === 'group') {
      pool = allChannels.filter((c) => c._bucket === value);
    } else if (type === 'country') {
      pool = allChannels.filter((c) => c.country === value && c._bucket === 'English');
    } else if (type === 'category') {
      pool = allChannels.filter((c) => c.category === value && c._bucket === 'English');
    } else {
      pool = allChannels;
    }

    if (type === 'favorites' || type === 'recent') return pool;
    return sortChannels(pool);
  }

  function getFilteredChannels() {
    const q = els.searchInput?.value.trim().toLowerCase();
    let pool = getChannelsForFilter(activeFilter);
    if (q) pool = pool.filter((c) => c.name.toLowerCase().includes(q));
    return pool;
  }

  function updateRailCount() {
    if (!els.railCount) return;
    const list = getFilteredChannels();
    const ready = list.filter(isPreloaded).length;
    els.railCount.textContent = ready
      ? `${list.length} channels · ⚡ ${ready} instant`
      : `${list.length} channels`;
  }

  function preloadFilterTop(filter, limit = PRELOAD_MAX) {
    if (!canRunBackgroundPreload()) return;
    getChannelsForFilter(filter).slice(0, limit).forEach((ch) => schedulePreload(ch));
  }

  function preloadAllCategoryHeads() {
    if (!canRunBackgroundPreload()) return;
    for (const { value } of PRIORITY_GROUPS) {
      if (countByBucket(value) > 0) {
        preloadFilterTop({ type: 'group', value }, 2);
      }
    }
  }

  // ── Favorites, recent & user prefs (localStorage) ──

  function loadUserData() {
    try {
      favoriteIds = JSON.parse(localStorage.getItem(LS_FAV) || '[]');
      recentIds = JSON.parse(localStorage.getItem(LS_RECENT) || '[]');
      const prefs = JSON.parse(localStorage.getItem(LS_PREFS) || '{}');
      audioOnlyMode = !!prefs.audioOnly;
      ambientEnabled = prefs.ambient !== false;
      manualQuality = prefs.manualQuality ?? -1;
      adminToken = prefs.adminToken || '';
      if (els.ambientToggle) els.ambientToggle.checked = ambientEnabled;
      if (els.audioOnlyToggle) els.audioOnlyToggle.checked = audioOnlyMode;
      if (els.adminTokenInput) els.adminTokenInput.value = adminToken;
      if (els.manualQuality && manualQuality >= 0) {
        els.manualQuality.value = String(manualQuality);
      }
    } catch {
      favoriteIds = [];
      recentIds = [];
    }
    applyAudioOnlyUi();
    applyAmbientUi();
  }

  function savePrefs() {
    localStorage.setItem(LS_PREFS, JSON.stringify({
      audioOnly: audioOnlyMode,
      ambient: ambientEnabled,
      manualQuality,
      adminToken,
    }));
  }

  function adminHeaders(extra = {}) {
    if (!adminToken) return extra;
    return {
      ...extra,
      'X-Admin-Token': adminToken,
      Authorization: `Bearer ${adminToken}`,
    };
  }

  function saveFavorites() {
    localStorage.setItem(LS_FAV, JSON.stringify(favoriteIds));
  }

  function isFavorite(id) {
    return favoriteIds.includes(Number(id));
  }

  function toggleFavorite(id) {
    const nid = Number(id);
    const idx = favoriteIds.indexOf(nid);
    if (idx >= 0) favoriteIds.splice(idx, 1);
    else favoriteIds.unshift(nid);
    saveFavorites();
    updateFavoriteBtn();
    renderCarousel();
    if (activeFilter.type === 'favorites') renderGrid();
    else document.querySelectorAll(`.tile-fav[data-fav-id="${nid}"]`).forEach((btn) => {
      btn.classList.toggle('on', isFavorite(nid));
    });
    showStatus(isFavorite(nid) ? '★ Saved to Favorites' : 'Removed from Favorites', 'ok');
  }

  function addRecent(id) {
    const nid = Number(id);
    recentIds = recentIds.filter((x) => x !== nid);
    recentIds.unshift(nid);
    if (recentIds.length > 24) recentIds = recentIds.slice(0, 24);
    localStorage.setItem(LS_RECENT, JSON.stringify(recentIds));
  }

  function channelsByIds(ids) {
    const map = new Map(allChannels.map((c) => [c.id, c]));
    return ids.map((id) => map.get(id)).filter(Boolean);
  }

  function getFavoriteChannels() {
    return channelsByIds(favoriteIds);
  }

  function getRecentChannels() {
    return channelsByIds(recentIds);
  }

  function updateFavoriteBtn() {
    if (!els.favoriteBtn || !currentChannel) return;
    const on = isFavorite(currentChannel.id);
    els.favoriteBtn.textContent = on ? '★' : '☆';
    els.favoriteBtn.classList.toggle('active', on);
    els.favoriteBtn.title = on ? 'Remove favorite (S)' : 'Add to favorites (S)';
  }

  function showChannelSkeleton() {
    if (!els.channelList) return;
    els.channelList.innerHTML = `<div class="skeleton-grid">${Array.from({ length: 12 }, () => '<div class="skeleton-tile"></div>').join('')}</div>`;
  }

  function applyAudioOnlyUi() {
    els.playerFrame?.classList.toggle('audio-only', audioOnlyMode);
    els.audioOnlyBtn?.classList.toggle('active', audioOnlyMode);
    if (audioOnlyMode && hlsInstance?.levels?.length) {
      hlsInstance.currentLevel = 0;
    }
  }

  function applyAmbientUi() {
    els.playerFrame?.classList.toggle('ambient-on', ambientEnabled);
    if (ambientEnabled && playbackStarted) startAmbientLoop();
    else stopAmbientLoop();
  }

  function applyManualQuality(hls) {
    if (!hls?.levels?.length || manualQuality < 0) return;
    const max = hls.levels.length - 1;
    hls.currentLevel = Math.min(manualQuality, max);
  }

  function populateQualitySelect(hls) {
    if (!els.manualQuality || !hls?.levels?.length) return;
    const cur = manualQuality;
    els.manualQuality.innerHTML = '<option value="-1">Auto</option>';
    hls.levels.forEach((lv, i) => {
      const label = lv.height ? `${lv.height}p` : `Level ${i + 1}`;
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = label;
      els.manualQuality.appendChild(opt);
    });
    els.manualQuality.value = String(cur >= 0 ? Math.min(cur, hls.levels.length - 1) : -1);
  }

  function startAmbientLoop() {
    stopAmbientLoop();
    if (!ambientEnabled || !els.video) return;
    const sample = () => {
      if (!ambientEnabled || !playbackStarted || els.video.paused) {
        ambientRaf = requestAnimationFrame(sample);
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(els.video, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0; let g = 0; let b = 0; let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n += 1;
        }
        const color = `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
        els.playerFrame?.style.setProperty('--ambient-color', color);
        els.bgBlur?.style.setProperty('--ambient-color', color);
      } catch { /* CORS tainted canvas */ }
      ambientRaf = requestAnimationFrame(sample);
    };
    ambientRaf = requestAnimationFrame(sample);
  }

  function stopAmbientLoop() {
    if (ambientRaf) cancelAnimationFrame(ambientRaf);
    ambientRaf = null;
  }

  function showGestureHint(text, side = 'vol') {
    if (!els.gestureHint) return;
    els.gestureHint.textContent = text;
    els.gestureHint.className = `gesture-hint visible ${side}`;
    clearTimeout(els.gestureHint._t);
    els.gestureHint._t = setTimeout(() => {
      els.gestureHint.classList.remove('visible');
    }, 900);
  }

  function surpriseMe() {
    const pool = allChannels.filter((c) => isFastChannel(c) || isPreloaded(c));
    const pick = pool[Math.floor(Math.random() * pool.length)]
      || allChannels[Math.floor(Math.random() * allChannels.length)];
    if (pick) {
      welcomeAutoplay = false;
      tryUnmute();
      playChannel(pick);
      showStatus(`🎲 ${pick.name}`, 'ok');
    }
  }

  function hopChannel(dir) {
    const list = getFilteredChannels();
    if (!list.length || !currentChannel) return;
    const idx = list.findIndex((c) => c.id === currentChannel.id);
    const next = list[(idx + dir + list.length) % list.length];
    if (next) {
      welcomeAutoplay = false;
      tryUnmute();
      playChannel(next);
    }
  }

  function isFullscreenActive() {
    return !!(document.fullscreenElement || els.video?.webkitDisplayingFullscreen);
  }

  function enterFullscreen() {
    const v = els.video;
    if (!v) return;

    /* iPhone/iPad Safari — only webkitEnterFullscreen works on <video> */
    if (typeof v.webkitEnterFullscreen === 'function') {
      try {
        v.webkitEnterFullscreen();
      } catch {
        showStatus('Tap ⛶ for fullscreen', 'ok');
      }
      return;
    }

    if (typeof v.webkitSetPresentationMode === 'function') {
      v.webkitSetPresentationMode('fullscreen');
      return;
    }

    if (v.requestFullscreen) {
      v.requestFullscreen().catch(() => {
        els.playerFrame?.requestFullscreen?.().catch(() => {});
      });
      return;
    }

    els.playerFrame?.requestFullscreen?.().catch(() => {});
  }

  function exitFullscreen() {
    const v = els.video;
    if (v?.webkitDisplayingFullscreen && typeof v.webkitExitFullscreen === 'function') {
      v.webkitExitFullscreen();
      return;
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function toggleFullscreen() {
    if (isFullscreenActive()) exitFullscreen();
    else enterFullscreen();
  }

  function setupPlayerGestures() {
    const frame = els.playerFrame;
    if (!frame) return;

    frame.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const rect = frame.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      gestureTouch = {
        x,
        y: e.touches[0].clientY,
        side: x > rect.width / 2 ? 'vol' : 'bright',
        startVol: els.video.volume,
      };
    }, { passive: true });

    frame.addEventListener('touchmove', (e) => {
      if (!gestureTouch || e.touches.length !== 1) return;
      const dy = gestureTouch.y - e.touches[0].clientY;
      if (gestureTouch.side === 'vol') {
        const v = Math.min(1, Math.max(0, gestureTouch.startVol + dy / 200));
        els.video.volume = v;
        showGestureHint(`🔊 ${Math.round(v * 100)}%`, 'vol');
      } else {
        showGestureHint(`☀ ${Math.min(100, Math.max(0, 50 + dy / 3))}%`, 'bright');
      }
    }, { passive: true });

    frame.addEventListener('touchend', () => { gestureTouch = null; }, { passive: true });
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select, button')) {
        if (e.target.id !== 'videoPlayer') return;
      }
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          els.video.volume = Math.min(1, els.video.volume + 0.08);
          showGestureHint(`🔊 ${Math.round(els.video.volume * 100)}%`, 'vol');
          break;
        case 'ArrowDown':
          e.preventDefault();
          els.video.volume = Math.max(0, els.video.volume - 0.08);
          showGestureHint(`🔊 ${Math.round(els.video.volume * 100)}%`, 'vol');
          break;
        case 'ArrowRight':
          e.preventDefault();
          hopChannel(1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          hopChannel(-1);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          els.video.muted = !els.video.muted;
          showStatus(els.video.muted ? 'Muted' : 'Unmuted', 'ok');
          break;
        case 's':
        case 'S':
          if (currentChannel) {
            e.preventDefault();
            toggleFavorite(currentChannel.id);
          }
          break;
        default:
          break;
      }
    });
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
    updateRailCount();
  }

  function createPreloadEntry(ch, url) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.className = 'preload-video';
    document.body.appendChild(video);

    const hls = new Hls({ ...getHlsConfig('preload'), xhrSetup: buildXhrSetup(ch) });
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
    if (!canRunBackgroundPreload()) return;
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
    if (!canRunBackgroundPreload()) return;
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
    updateRailCount();

    if (!list.length) {
      const msg = activeFilter.type === 'favorites'
        ? '★ কোনো favorite নেই — চ্যানেলে ☆ চাপুন'
        : activeFilter.type === 'recent'
          ? 'এখনো কোনো চ্যানেল দেখেননি'
          : 'কোনো চ্যানেল নেই — ⟳ Sync চাপুন';
      els.channelList.innerHTML = `<div class="empty-state">${msg}</div>`;
      return;
    }

    els.channelList.innerHTML = list.map((ch) => {
      const active = currentChannel?.id === ch.id ? ' active' : '';
      const preloaded = preloadPool.get(ch.id)?.readyFlag ? ' preloaded' : '';
      const favOn = isFavorite(ch.id) ? ' on' : '';
      const initials = escapeHtml(tileInitials(ch.name));
      const logoInner = ch.logo_url
        ? `<img src="${escapeHtml(ch.logo_url)}" alt="" loading="lazy" decoding="async" /><span class="fallback is-hidden">${initials}</span>`
        : `<span class="fallback">${initials}</span>`;
      return `<div class="channel-tile${active}${preloaded}" data-id="${ch.id}" title="${escapeHtml(ch.name)}">
        <button type="button" class="tile-fav${favOn}" data-fav-id="${ch.id}" aria-label="Favorite">★</button>
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
      tile.querySelector('.tile-fav')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(ch.id);
      });
      tile.addEventListener('mouseenter', () => prefetchUrgent(ch));
      tile.addEventListener('mousedown', () => prefetchUrgent(ch));
      tile.addEventListener('touchstart', () => prefetchUrgent(ch), { passive: true });
      tile.addEventListener('click', () => {
        welcomeAutoplay = false;
        tryUnmute();
        playChannel(ch);
      });
    });

    els.channelList.scrollTop = 0;
    preloadAllVisible();
  }

  function renderCarousel() {
    if (!els.guideTabs) return;
    const items = buildMenuItems();
    const activeKey = filterKey(activeFilter);

    els.guideTabs.innerHTML = items.map((item) => {
      const key = filterKey(item);
      const active = key === activeKey ? ' active' : '';
      const extra = item.type === 'country' ? ' tab-country'
        : item.type === 'favorites' ? ' tab-favorites' : '';
      return `<button type="button" class="guide-tab${active}${extra}" data-type="${item.type}" data-value="${escapeHtml(item.value)}">
        ${escapeHtml(item.label)}<span class="tab-count">${item.count}</span>
      </button>`;
    }).join('');

    els.guideTabs.querySelectorAll('.guide-tab').forEach((tab) => {
      tab.addEventListener('mouseenter', () => {
        preloadFilterTop({ type: tab.dataset.type, value: tab.dataset.value }, 4);
      });
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

  function setActiveFilter(filter, { skipPreload = false } = {}) {
    activeFilter = filter;
    els.guideTabs?.querySelectorAll('.guide-tab').forEach((t) => {
      const match = t.dataset.type === filter.type && t.dataset.value === filter.value;
      t.classList.toggle('active', match);
    });
    scrollActiveTabIntoView();
    if (!skipPreload) preloadFilterTop(filter, PRELOAD_MAX);
    renderGrid();
    if (!skipPreload) preloadAllVisible();
  }

  function updateNowPlaying(ch) {
    els.channelName.textContent = ch.name;
    els.channelDesc.textContent = ch.description || `${ch._bucket || 'English'} · ${ch.country || 'INT'}`;
    els.overlay?.classList.add('hidden');
    updateFavoriteBtn();
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
        applySmoothBufferMode(hls);
        freezeBackgroundPreloads(currentChannel?.id);
        els.overlay?.classList.add('hidden');
        els.video.play().catch(() => {});
        if (welcomeAutoplay) {
          showStatus('LIVE — 🔊 শব্দের জন্য ক্লিক করুন', 'ok');
        } else {
          els.video.muted = false;
          showStatus('LIVE', 'ok');
        }
        updateQualityBadge();
        startBufferHealthWatch();
        if (ambientEnabled) startAmbientLoop();
        applyAudioOnlyUi();
        setTimeout(preloadAllCategoryHeads, 5000);
      }
    };

    const onParsed = () => {
      populateQualitySelect(hls);
      applyManualQuality(hls);
      if (audioOnlyMode && hls.levels?.length) hls.currentLevel = 0;
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
    stopBufferHealthWatch();
    stopAmbientLoop();
  }

  function swapToPreloaded(cached) {
    const resumeAt = cached.video.currentTime;
    destroyHls();
    cached.video.remove();
    preloadPool.delete(cached.channelId);

    hlsInstance = cached.hls;
    hlsInstance.detachMedia();
    hlsInstance.attachMedia(els.video);
    applySmoothBufferMode(hlsInstance);
    attachHlsEvents(hlsInstance);

    if (resumeAt > 0.1) els.video.currentTime = resumeAt;
    if (!welcomeAutoplay) els.video.muted = false;
    playbackStarted = true;
    freezeBackgroundPreloads(currentChannel?.id);
    els.overlay?.classList.add('hidden');
    els.video.play().catch(() => {});
    showStatus(welcomeAutoplay ? 'LIVE — 🔊 শব্দের জন্য ক্লিক করুন' : 'LIVE', 'ok');
    updateQualityBadge();
    lastProgressTime = Date.now();
    startBufferHealthWatch();
    schedulePreloadResume();
    if (ambientEnabled) startAmbientLoop();
    applyAudioOnlyUi();
  }

  async function playChannel(ch) {
    if (currentChannel?.id === ch.id && playbackStarted && !els.video.paused) return;

    currentChannel = ch;
    fullReloadCount = 0;
    networkRecoverCount = 0;
    streamIndex = 0;
    proxyMode = false;
    playbackStarted = false;
    addRecent(ch.id);

    updateNowPlaying(ch);
    renderGrid();
    freezeBackgroundPreloads(ch.id);
    stopBufferHealthWatch();

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
      hlsInstance = new Hls({ ...getHlsConfig('main'), xhrSetup: buildXhrSetup(currentChannel) });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(els.video);
      attachHlsEvents(hlsInstance);
      els.video.play().catch(() => {});

      clearInterval(stallTimer);
      stallTimer = setInterval(() => {
        if (!currentChannel || els.video.paused || !hlsInstance) return;
        const ahead = getBufferAhead();
        if (Date.now() - lastProgressTime > 6000 || ahead < 2) {
          freezeBackgroundPreloads(currentChannel?.id);
          hlsInstance.startLoad(-1);
          if (ahead < 2 && hlsInstance.autoLevelEnabled && hlsInstance.currentLevel > 0) {
            hlsInstance.nextLevel = hlsInstance.currentLevel - 1;
          }
          lastProgressTime = Date.now();
        }
      }, 2500);
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
    showChannelSkeleton();
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
    if (!adminToken) {
      showStatus('Admin token required', 'error');
      els.settingsPanel?.classList.add('open');
      return;
    }
    els.syncBtn.disabled = true;
    try {
      await fetchJSON('/api/sync/all', { method: 'POST', headers: adminHeaders({ 'Content-Type': 'application/json' }) });
      await loadAll();
      renderGrid();
      preloadAllVisible();
      showStatus('Synced', 'ok');
    } catch { showStatus('Sync failed — check token', 'error'); }
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

  els.adminTokenInput?.addEventListener('change', () => {
    adminToken = els.adminTokenInput.value.trim();
    savePrefs();
  });

  els.syncBtn?.addEventListener('click', syncAll);
  els.settingsBtn?.addEventListener('click', () => els.settingsPanel?.classList.toggle('open'));
  els.bandwidthMode?.addEventListener('change', () => {
    bandwidthMode = els.bandwidthMode.value;
    if (currentChannel) playChannel(currentChannel);
  });

  els.favoriteBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentChannel) toggleFavorite(currentChannel.id);
  });

  els.surpriseBtn?.addEventListener('click', () => surpriseMe());

  els.favoritesTabBtn?.addEventListener('click', () => {
    if (getFavoriteChannels().length) {
      setActiveFilter({ type: 'favorites', value: 'all' });
    } else {
      showStatus('★ প্রথমে চ্যানেল favorite করুন', 'ok');
    }
  });

  els.fullscreenBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFullscreen();
  });

  /* Double-tap video → fullscreen on mobile */
  let lastVideoTap = 0;
  els.video?.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastVideoTap < 320) {
      e.preventDefault();
      enterFullscreen();
    }
    lastVideoTap = now;
  });

  els.audioOnlyBtn?.addEventListener('click', () => {
    audioOnlyMode = !audioOnlyMode;
    if (els.audioOnlyToggle) els.audioOnlyToggle.checked = audioOnlyMode;
    savePrefs();
    applyAudioOnlyUi();
    showStatus(audioOnlyMode ? '🎧 Audio only' : 'Video restored', 'ok');
  });

  els.audioOnlyToggle?.addEventListener('change', () => {
    audioOnlyMode = els.audioOnlyToggle.checked;
    savePrefs();
    applyAudioOnlyUi();
  });

  els.ambientToggle?.addEventListener('change', () => {
    ambientEnabled = els.ambientToggle.checked;
    savePrefs();
    applyAmbientUi();
  });

  els.manualQuality?.addEventListener('change', () => {
    manualQuality = Number(els.manualQuality.value);
    savePrefs();
    if (hlsInstance) applyManualQuality(hlsInstance);
  });

  setupKeyboardShortcuts();
  setupPlayerGestures();

  els.video?.addEventListener('waiting', () => {
    if (!playbackStarted) return;
    freezeBackgroundPreloads(currentChannel?.id);
    hlsInstance?.startLoad(-1);
    showStatus('Buffering...', 'loading');
  });

  els.video?.addEventListener('playing', () => {
    if (playbackStarted && getBufferAhead() > 5 && !welcomeAutoplay) showStatus('LIVE', 'ok');
  });

  document.addEventListener('click', () => {
    if (welcomeAutoplay && playbackStarted) {
      welcomeAutoplay = false;
      tryUnmute();
      showStatus('LIVE', 'ok');
    }
  }, { once: true });

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
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (res.status === 401) throw new Error('unauthorized');
      if (!res.ok) throw new Error('failed');
      els.addModal.close();
      els.addForm.reset();
      await loadAll();
      renderGrid();
    } catch { alert('Save failed — check admin token in Settings'); }
  });

  async function init() {
    loadUserData();
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
      setActiveFilter(startFilter, { skipPreload: true });
      await startWelcomePlayback();
    } catch {
      els.channelList.innerHTML = '<div class="empty-state">npm start চালান</div>';
    }
  }

  init();
})();

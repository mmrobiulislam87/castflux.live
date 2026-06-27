# CastFlux Live — Product Roadmap

> **Vision:** বিশ্বের যেকোনো visitor CastFlux Live-এ এসে সাথে সাথে smooth live TV দেখবে — zero confusion, zero buffering, professional experience.

**Live:** https://castflux-live.m-m-robiulislam87.workers.dev  
**Repo:** https://github.com/mmrobiulislam87/castflux.live  
**Target domain:** castflux.live

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Done |
| 🔄 | In progress |
| 📋 | Planned |
| 💡 | Future idea |

---

## Progress Overview

```
Phase 0  ████████████████████  100%  Foundation
Phase 1  ████████████████████  100%  Core viewer UX
Phase 2  ████████████████░░░░   80%  Brand + launch polish
Phase 2b ████████████████████  100%  Player UX features
Phase 3  ░░░░░░░░░░░░░░░░░░░░    0%  Smart channel engine
Phase 4  ██░░░░░░░░░░░░░░░░░░   10%  Scale (edge cache done)
Phase 5  ░░░░░░░░░░░░░░░░░░░░    0%  Platform features
Phase 6  ░░░░░░░░░░░░░░░░░░░░    0%  Mobile / TV apps
```

---

## Phase 0 — Foundation ✅

| Item | Status |
|------|--------|
| Express localhost + SQLite | ✅ |
| Cloudflare Workers + D1 | ✅ |
| GitHub sync (iptv-org + Free-TV) | ✅ |
| HLS.js player + smart proxy | ✅ |
| Split UI (player + guide) | ✅ |
| Responsive design | ✅ |
| GitHub CI deploy | ✅ |
| Daily cron sync (06:00 UTC) | ✅ |

---

## Phase 1 — Viewer Experience ✅

| Item | Status |
|------|--------|
| Football / Cricket / Sports buckets | ✅ |
| Duplicate channel removal | ✅ |
| Smooth HLS buffer | ✅ |
| Welcome auto-play | ✅ |
| ⚡ Fast channels fixed at grid top | ✅ |
| Tab hover preload | ✅ |
| API edge cache | ✅ |
| Muted autoplay + click unmute | ✅ |

---

## Phase 2 — Brand & Launch 📋 (~65% done)

| Item | Priority | Status |
|------|----------|--------|
| Custom domain `castflux.live` | 🔴 | 📋 |
| Favicon + OG meta | 🔴 | ✅ |
| Legal footer (disclaimer) | 🔴 | ✅ |
| PWA manifest + install | 🟡 | 📋 |
| Error page + offline fallback | 🟡 | 📋 |
| Cloudflare Web Analytics | 🟡 | 📋 |
| Bengali / English UI toggle | 🟢 | 📋 |
| Loading skeleton | 🟡 | ✅ |
| iPhone Safari fullscreen | 🔴 | ✅ |

---

## Phase 2b — Player UX ✅

| Item | Status |
|------|--------|
| ★ Favorites (localStorage) | ✅ |
| 🕐 Recent channels | ✅ |
| 🎲 Surprise Me | ✅ |
| Keyboard shortcuts (↑↓←→ F M S) | ✅ |
| Manual quality picker | ✅ |
| Audio-only mode | ✅ |
| Ambient glow (fixed — no video haze) | ✅ |
| Mobile swipe volume | ✅ |
| iOS `webkitEnterFullscreen` | ✅ |
| Double-tap video → fullscreen | ✅ |

---

## Phase 3 — Smart Channel Engine 📋 (Next)

| Item | Priority | Notes |
|------|----------|-------|
| Channel health checker (cron) | 🔴 | Dead streams auto-disable |
| Stream quality score (uptime %) | 🔴 | Best streams float to top |
| More BD channels curated | 🔴 | Bangla tab strength |
| EPG / program guide | 🟡 | iptv-org API |
| Fuzzy search | 🟡 | Better findability |
| World Cup / event banner | 🟡 | Featured sports mode |
| Favorites cloud sync | 🟡 | Needs accounts (Phase 5) |

---

## Phase 4 — Performance & Scale 📋

| Item | Priority | Status |
|------|----------|--------|
| API edge cache | — | ✅ |
| Rate limit on `/api/sync` | 🔴 | ✅ SYNC_SECRET auth |
| KV channel list cache | 🟡 | 📋 |
| R2 logo cache | 🟢 | 📋 |
| Load test (10k concurrent) | 🟡 | 📋 |
| Selective geo proxy | 🟡 | 📋 |
| Hover preview (desktop) | 🟢 | 📋 ⚠️ throttle |

---

## Phase 5 — Platform 💡

| Item | Notes |
|------|-------|
| User accounts | Favorites sync across devices |
| Live reactions 🔥🎉 | Durable Objects WebSocket |
| Picture-in-Picture | Mobile multitask |
| Chromecast / AirPlay | TV casting |
| Admin dashboard | Channel CRUD |
| Channel report | Crowd-sourced health |
| Telegram / Discord alerts | Match notifications |

---

## Phase 6 — Mobile & TV Apps 💡

| Item | Notes |
|------|-------|
| Capacitor / React Native app | App store |
| Android TV / Fire TV UI | 10-foot layout |
| Samsung / LG Smart TV | webOS / Tizen |
| Push notifications | Match start alerts |
| Native brightness swipe | Full MX Player feel |

---

## Recommended Next Steps

```
1. castflux.live custom domain     ← Phase 2 (launch)
2. Legal footer + disclaimer       ← Phase 2
3. Channel health checker (cron)   ← Phase 3
4. PWA install prompt              ← Phase 2
5. World Cup event banner          ← Phase 3
```

---

## KPI Targets

| Metric | Target | Current |
|--------|--------|---------|
| Time to first frame | < 3 sec | ✅ ~2 sec |
| Buffer events / hour | < 1 | ✅ Fixed |
| Channel switch (⚡) | < 1 sec | ✅ |
| Worker uptime | 99.9% | ✅ Cloudflare |
| Healthy channels | 400+ | ✅ ~500 |
| Daily sync success | 99% | ✅ Cron active |

---

## Architecture Principle

```
Visitor → Video/HLS  →  Direct CDN (NOT through Worker)
       → Static/API  →  Cloudflare Edge + D1 cache
       → Live reactions → Durable Objects (Phase 5)
```

Video Worker দিয়ে যায় না — global scale safe.

---

## Changelog

| Date | Change |
|------|--------|
| 2025-06-27 | Phase 0–1 complete, initial roadmap |
| 2025-06-27 | Phase 2b shipped: favorites, keyboard, ambient, surprise |
| 2025-06-27 | iOS fullscreen + ambient haze fix |
| 2025-06-27 | Roadmap progress update |

---

*Last updated: June 2025*

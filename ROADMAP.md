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

## Phase 0 — Foundation ✅ (Completed)

Core platform যা ইতিমধ্যে live:

| Item | Status |
|------|--------|
| Express localhost server + SQLite | ✅ |
| Cloudflare Workers + D1 deploy | ✅ |
| GitHub sync (iptv-org + Free-TV) | ✅ |
| HLS.js player + smart proxy | ✅ |
| Split UI (player left, guide right) | ✅ |
| Responsive design (mobile / tablet / desktop) | ✅ |
| GitHub CI deploy (`npm run deploy`) | ✅ |
| Daily cron sync (06:00 UTC) | ✅ |

---

## Phase 1 — Viewer Experience ✅ (Completed)

Visitor প্রথম impression + playback quality:

| Item | Status |
|------|--------|
| Football / Cricket / Sports category buckets | ✅ |
| Duplicate channel removal (one bucket per channel) | ✅ |
| Smooth HLS buffer (no 1-min stutter) | ✅ |
| Welcome auto-play (featured fast channel) | ✅ |
| ⚡ Fast channels fixed at grid top (no jump reorder) | ✅ |
| Tab hover preload + background category heads | ✅ |
| API edge cache (global scale) | ✅ |
| Muted autoplay + click to unmute | ✅ |

---

## Phase 2 — Brand & Launch 📋 (Next 2–4 weeks)

Public launch-ready polish:

| Item | Priority | Notes |
|------|----------|-------|
| Custom domain `castflux.live` | 🔴 High | Cloudflare DNS + SSL |
| Favicon + OG meta (social share preview) | 🔴 High | Facebook / WhatsApp link preview |
| PWA manifest + install prompt | 🟡 Medium | Mobile home screen add |
| Loading skeleton (grid + player) | 🟡 Medium | Perceived speed |
| Error page + offline fallback | 🟡 Medium | Network drop handling |
| Analytics (Cloudflare Web Analytics) | 🟡 Medium | Visitor count, no cookie banner |
| Bengali / English UI toggle | 🟢 Low | i18n foundation |
| Legal footer (disclaimer, sources) | 🔴 High | Free IPTV attribution |
| **Ambient mode** (video-matched glow) | 🟡 Medium | Frontend only — Canvas/CSS, zero Worker cost |
| **Keyboard shortcuts** (↑↓ vol, ←→ channel, F, M) | 🟡 Medium | Frontend only — desktop power users |
| **Favorites tab** (localStorage) | 🔴 High | ★ save channels — no backend |
| **Recent channels tab** | 🟡 Medium | localStorage, last 24 watched |
| **Surprise Me** random play | 🟡 Medium | Frontend only |
| **Manual quality + audio-only** | 🟡 Medium | Settings + player toolbar |
| **Ambient glow** | 🟢 Low | Canvas sample, client only |
| **Mobile swipe volume** | 🟡 Medium | Right-edge touch gesture |

---

## Phase 2b — Player UX (Frontend-only) 📋

> Worker memory / D1 / edge cache-এ **কোনো প্রভাব নেই** — শুধু `public/js/app.js` + CSS।

| Item | Priority | Architecture fit | Notes |
|------|----------|------------------|-------|
| Desktop keyboard shortcuts | 🟡 Medium | ✅ Pure client | ↑↓ volume, ←→ channel hop, `F` fullscreen, `M` mute |
| Mobile swipe gestures | 🟡 Medium | ✅ Pure client | Right edge = volume; brightness needs Screen Brightness API (limited on iOS) |
| Manual quality picker (⚙️ 1080p→360p) | 🔴 High | ✅ HLS.js levels | Extends existing Smooth / Standard / Data Saver |
| Audio-only mode toggle | 🟡 Medium | ✅ Pure client | Hide video track / lowest bitrate — ~90% data save |
| Ambient mode (theater glow) | 🟢 Low | ✅ Canvas sample | YouTube-style; client CPU only |

---

## Phase 3 — Smart Channel Engine 📋 (1–2 months)

Channel quality + discovery:

| Item | Priority | Notes |
|------|----------|-------|
| Channel health checker (cron) | 🔴 High | Dead streams auto-disable |
| Stream quality score (uptime %) | 🔴 High | Best streams float to top |
| EPG / program guide (iptv-org) | 🟡 Medium | "What's on now" |
| Search: fuzzy + category filter | 🟡 Medium | Better findability |
| Favorites (localStorage / account) | 🟡 Medium | Return visitors |
| Recently watched strip | 🟡 Medium | Quick re-open |
| World Cup / event mode banner | 🟡 Medium | Featured event channels |
| More BD channels curated list | 🔴 High | Bangla tab strength |
| **"Surprise Me"** random channel button | 🟡 Medium | ✅ D1 + client | Pick from health-scored active pool only |
| Sports / event live banner | 🟡 Medium | ✅ D1 flag | Links to Football/Cricket tabs |

---

## Phase 4 — Performance & Scale 📋 (Ongoing)

Millions of concurrent visitors:

| Item | Priority | Notes |
|------|----------|-------|
| D1 read replicas / KV channel cache | 🟡 Medium | Reduce DB hits |
| R2 cache for channel logos | 🟢 Low | Faster tile load |
| Workers Smart Placement | 🟢 Low | If backend grows |
| CDN cache rules for `/api/*` | 🟡 Medium | Fine-tune TTL per endpoint |
| Rate limit on `/api/sync` | 🔴 High | Abuse prevention |
| Segment proxy fallback (geo-block) | 🟡 Medium | Selective proxy only |
| Load test (k6 / Artillery) | 🟡 Medium | 10k concurrent baseline |
| **Hover preview** (desktop grid) | 🟢 Low | ⚠️ Bandwidth | Debounced 1-seg low-bitrate only; disable during main playback |

> **Hover preview warning:** প্রতি hover-এ HLS load = preload pool-এর বিপরীতে। শুধু desktop, max 1 concurrent preview, main player চলাকালীন off।

---

## Phase 5 — Platform Features 💡 (2–4 months)

Product differentiation:

| Item | Notes |
|------|-------|
| User accounts (Cloudflare Access / Auth) | Favorites sync across devices |
| Multi-audio / subtitle track picker | HLS alternate tracks |
| Picture-in-picture (PiP) | Mobile multitask |
| Chromecast / AirPlay | TV casting |
| Mini player while browsing channels | Split UX upgrade |
| Channel report ("stream broken") | Crowd-sourced health |
| Admin dashboard (web) | Channel CRUD without modal |
| Telegram / Discord live notify bot | Event alerts |
| **Anonymous live reactions** (🔥🎉👏) | Durable Objects WebSocket | Event-scoped rooms; ~KB/msg; no video through Worker |
| Mini player while browsing | Split UX upgrade | PiP API first, custom mini frame later |

---

## Architecture Fit Matrix (UX Ideas)

| Feature | Phase | Worker RAM | D1 | DO/KV | Edge cache | Verdict |
|---------|-------|------------|-----|-------|------------|---------|
| Keyboard + swipe | 2b | — | — | — | — | ✅ Ship early |
| Quality + audio-only | 2b–3 | — | — | — | — | ✅ Extends HLS.js |
| Ambient mode | 2 | — | — | — | — | ✅ Visual polish |
| Surprise Me | 3 | Minimal | Read | Optional KV | Cached list | ✅ Low risk |
| Hover preview | 4–5 | — | — | — | — | ⚠️ Throttle hard |
| Live reactions | 5 | Low | — | **DO** | — | ✅ Perfect CF fit |
| PiP / Cast | 5–6 | — | — | — | — | ✅ Browser APIs |

**Key principle:** Video segments **never** pass through Worker — only API, static assets, and lightweight realtime (DO). Global scale safe.

---

## Phase 6 — Mobile & Apps 💡 (Future)

| Item | Notes |
|------|-------|
| React Native / Capacitor wrapper | App store presence |
| Android TV / Fire TV layout | 10-foot UI |
| Tizen / webOS Samsung/LG | Smart TV browsers |
| Push notifications (match start) | Requires backend + auth |
| Native swipe + brightness (Capacitor) | Full MX Player-like gestures in wrapped app |

---

## Recommended Build Order (UX additions)

```
Now (Phase 2)     → Keyboard shortcuts, Ambient mode, OG/favicon/domain
Next (Phase 2b)   → Quality picker UI, Audio-only toggle
Then (Phase 3)    → Health checker + Surprise Me + event banner
Later (Phase 5)   → Live reactions (Durable Objects) during World Cup
Careful (Phase 4) → Hover preview — only after preload rules hardened
```

---

## Technical Debt & Maintenance

| Item | Priority |
|------|----------|
| Unify `server.js` + `src/worker.js` route logic | 🟡 Medium |
| TypeScript migration (worker + frontend) | 🟢 Low |
| Vitest unit tests (sort, bucket, dedupe) | 🟡 Medium |
| E2E test (Playwright: play + switch tab) | 🟢 Low |
| Dependabot / npm audit automation | 🟡 Medium |
| Staging environment (`env.staging` in wrangler) | 🟡 Medium |

---

## Milestone Timeline (Suggested)

```
2025 Q2  ✅ Phase 0 + 1 — MVP live on Cloudflare
2025 Q3  📋 Phase 2 — castflux.live public launch
2025 Q3  📋 Phase 3 — Health checker + EPG
2025 Q4  📋 Phase 4 — Scale hardening
2026 Q1  💡 Phase 5 — Accounts + casting
2026+    💡 Phase 6 — TV apps
```

---

## Success Metrics (KPIs)

| Metric | Target |
|--------|--------|
| Time to first frame | < 3 seconds |
| Buffer events per hour | < 1 per viewer |
| Channel switch time | < 1 second (⚡ preloaded) |
| Uptime (Worker) | 99.9% |
| Active channels (healthy) | 400+ |
| Daily sync success rate | 99% |

---

## How to Contribute

1. Pick an item from **Phase 2** or **Phase 3**
2. Open a GitHub issue with the roadmap item title
3. Branch → implement → PR to `main`
4. Auto-deploy via Cloudflare Workers Builds

---

## Changelog (Roadmap updates)

| Date | Change |
|------|--------|
| 2025-06-27 | Initial roadmap — Phase 0–1 marked complete |
| 2025-06-27 | Phase 2b UX shipped: favorites, keyboard, ambient, surprise, audio-only |

---

*Last updated: June 2025*

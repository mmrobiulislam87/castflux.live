# CastFlux Live

Localhost + Cloudflare Workers Live TV viewer with legitimate free HLS streams.

## Features

- HLS.js turbo player with instant preload pool
- Football / Cricket / Sports / Kids / Bangla channel buckets
- GitHub iptv-org + Free-TV sync
- Smart HLS proxy for CORS
- Responsive split UI (player + channel guide)

---

## Local development (Windows / Mac)

```bash
npm install
npm start
```

Open http://localhost:3000

---

## Cloudflare Workers deploy (castflux.live)

### Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
2. GitHub repo: [mmrobiulislam87/castflux.live](https://github.com/mmrobiulislam87/castflux.live)
3. Node.js 18+ on your PC (one-time setup)

### Step 1 — Wrangler login (one time)

```bash
npm install
npx wrangler login
```

Browser opens → Cloudflare account authorize করুন।

### Step 2 — D1 Database তৈরি

```bash
npm run cf:d1:create
```

Output-এ `database_id` পাবেন, যেমন:

```
Created your database castflux-db with UUID xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

`wrangler.jsonc` ফাইলে `REPLACE_WITH_YOUR_D1_DATABASE_ID` এর জায়গায় এই ID বসান:

```jsonc
"database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### Step 3 — Database migration (remote)

```bash
npm run cf:migrate:remote
```

### Step 4 — Cloudflare Dashboard (GitHub connect)

Cloudflare Dashboard → **Workers & Pages** → **Create** → **Connect to Git**

| Field | Value |
|-------|-------|
| Repository | `mmrobiulislam87/castflux.live` |
| Project name | `castflux-live` |
| **Build command** | *(খালি রাখুন — build লাগে না)* |
| **Deploy command** | `npm run deploy` |
| Path | `/` |

**Advanced settings:**
- Non-production branch deploy command: `npx wrangler deploy`
- API token: আপনার Cloudflare build token

**Deploy** বাটন চাপুন।

### Step 5 — D1 binding (Dashboard)

Deploy fail হলে Dashboard → Worker → **Settings** → **Bindings** → **D1 database** → `castflux-db` যোগ করুন, binding name: `DB`

### Step 6 — Custom domain (optional)

Workers → your worker → **Settings** → **Domains & Routes** → `castflux.live` যোগ করুন।

---

## Manual deploy (CLI)

```bash
npm run cf:migrate:remote
npm run deploy
```

Live URL: `https://castflux-live.<your-subdomain>.workers.dev`

---

## After first deploy

1. সাইট খুলুন
2. **Sync** বাটন চাপুন — GitHub থেকে চ্যানেল লোড হবে
3. Football / Cricket ট্যাবে ⚡ instant চ্যানেল দেখুন

Cron: প্রতিদিন সকাল ৬টায় auto-sync (`0 6 * * *`)

---

## Project structure

| Path | Purpose |
|------|---------|
| `src/worker.js` | Cloudflare Worker (API + proxy) |
| `src/db.js` | D1 database helpers |
| `migrations/` | D1 SQL schema |
| `public/` | Frontend (HTML, CSS, JS) |
| `server.js` | Local Express server |
| `wrangler.jsonc` | Cloudflare config |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `database_id` error | Step 2–3 follow করুন |
| No channels | Sync বাটন চাপুন |
| Stream won't play | Stream geo-blocked হতে পারে — অন্য চ্যানেল চেষ্টা করুন |
| Deploy fails on GitHub | `wrangler.jsonc`-এ সঠিক `database_id` আছে কিনা দেখুন |

---

## License

Free streams from public IPTV sources. Use responsibly.

# CastFlux Live

Localhost Live TV viewer with legitimate free HLS streams.

## Features

- Express + SQLite backend with iptv-org sync
- HLS.js turbo player with instant preload pool
- Smart channel buckets: Football, Cricket, Sports, Kids, Bangla, and more
- Duplicate-free channel grid with auto-sort for ready streams
- Responsive split UI (player + channel guide)

## Run locally

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## Sync channels

Click **Sync** in the app or `POST /api/sync/all` to refresh from GitHub sources.

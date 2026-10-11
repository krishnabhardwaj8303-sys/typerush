# TypeRush - Type Fast. Drive Faster. Win the Race.

A free, open-source multiplayer typing racing game. React + Vite + TypeScript frontend (Canvas 2D rendering, Web Audio sound),
Node.js + Express + Socket.IO multiplayer server. No paid services, no database, no accounts.

## Quick start (Windows PowerShell)

```powershell
npm install
npm run dev          # starts the server (3001) and the game (5173) together
```

Open http://localhost:5173. Or run them in two terminals: `npm run dev:server` and `npm run dev:client`.
Other devices on your Wi-Fi can open `http://<your-PC-IP>:5173` (allow Node through the Windows firewall prompt).

Other commands: `npm run typecheck`, `npm test`, `npm run build` (frontend to `client/dist`), `npm run start:server`.

## Architecture

```
shared/   types, typing metrics, scoring, text generation, AI typist simulation, level definitions (used by BOTH sides)
server/   Socket.IO server: rooms, matchmaking, server-authoritative timing, anti-cheat, rate limits, results
client/   React UI, Canvas race renderer, typing engine, audio, localStorage profile, socket client
```

* Gameplay: only the next expected character advances your car; wrong keys count as errors and never move you. No backspace.
* Metrics: WPM = correct characters / 5 / minutes. Accuracy = correct keystrokes / all keystrokes.
* AI: keystroke-level simulation (speed, accuracy, rhythm drift). 100 levels (25 per difficulty, each with its own track) raise speed, text length and difficulty.
* Multiplayer: the server creates the text, sets the start time (all clients sync to the server clock), validates every
  progress update against a human speed limit (22 chars/s) and computes finishing order, WPM, accuracy and points.
  Clients can never declare a winner. Impossible updates 3 times in a race = disqualification.
* Reconnection: a returning browser tab resumes its seat with a private session token (20 s grace in lobbies, 30 s in races).
* Anti-abuse: payload validation, name sanitising, per-socket token-bucket rate limits, per-IP connection cap, 10 KB message
  cap, origin allow-list, idle room cleanup.

## Scoring

Finished: `50 + placement (100/60/35/15, none when alone) + 2 x WPM (max 200 WPM) + accuracy bonus ((acc% - 80) x 5, 0..100)`,
then multiplied by difficulty (Easy 1, Medium 1.25, Hard 1.5, Expert 2). Did not finish: up to 20 points for progress.
Disqualified: 0. Always whole numbers, never negative.

## Deploy (free, verified October 2026 - check the providers' pages again before relying on limits)

Two separate deployments: the **server** (needs WebSockets) and the **frontend** (static files).

### 1. Server on Render (free web service)

Render's free web services support WebSockets, need no credit card to create, and spin down after 15 minutes without
inbound traffic (HTTP requests or WebSocket messages); waking takes about a minute. Free services get 750 instance hours
per month. See https://render.com/docs/free.

1. Push this project to a GitHub repository.
2. Render dashboard > New > Web Service > connect the repo. (Or New > Blueprint to use `render.yaml`.)
3. Settings: Runtime `Node`, Build command `npm install`, Start command `npm run start:server`, Health check path `/health`, plan Free.
4. Environment variables: `NODE_ENV=production`, `NODE_VERSION=22`, `CLIENT_ORIGINS=https://<your-frontend-domain>` (exact, no trailing slash).
5. After deploy you get `https://<name>.onrender.com`. Visit `/health` to confirm it answers. The WebSocket URL is the same host (`wss://` is automatic).

Limits: cold start of about a minute after idle (the game shows "connecting..."), rooms live in memory and vanish on restart,
the online hall of fame is stored on a disk that free hosting wipes on redeploy. Nothing is persistent. That is by design.

### 2. Frontend on Cloudflare Pages (free)

Cloudflare Pages free plan: 500 builds per month, 20,000 files per site, 25 MiB per file (this game is under 1 MB).
See https://developers.cloudflare.com/pages/platform/limits/.

1. Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git > pick the repo.
2. Framework preset: None. Build command: `npm install && npm run build`. Build output directory: `client/dist`. Root directory: leave empty.
3. Environment variable (Production): `VITE_SERVER_URL=https://<name>.onrender.com`.
4. Deploy, then put the resulting `https://<project>.pages.dev` into the server's `CLIENT_ORIGINS` and redeploy the server.

Netlify or GitHub Pages work the same way: build with `npm install && npm run build`, publish `client/dist`, set `VITE_SERVER_URL`
at build time (it is baked into the build, so rebuild after changing it).

Other hosts: Fly.io no longer offers free plans to new accounts and Railway only gives a small trial credit, so Render is the
recommended free option. Without a deployed server, Practice / Levels still work 100% offline; only Friends Race and Find Match need it.

## Accounts, cloud save and permanent leaderboards (optional)

Without any setup everything works, but accounts and boards live in the server's memory and reset when the free
host restarts. To make them permanent, give the server a free PostgreSQL database:

1. Create a free project at supabase.com (or any free Postgres, e.g. Neon).
2. Copy the **Session pooler** connection string (Project > Connect). The direct connection is IPv6-only and does not
   work from most free hosts. Replace `[YOUR-PASSWORD]` with your database password.
3. In Render, add the environment variable `DATABASE_URL` with that string and redeploy. The server creates its own
   tables on start (`/health` then shows `"storage":"postgres"`).

How it works: an account has no password. It is protected by a secret recovery code (`TR-XXXX-XXXX-XXXX-XXXX`, shown
once; only its hash is stored). Each device has its own random token (also stored only as a hash). The cloud save never
contains the device token. Daily Challenge results are sent as a typing log and re-checked by the server (the text is
re-created from the day's seed, speeds must be humanly possible). Supabase free projects pause after about a week
without activity.

## Honest limitations

* Public matchmaking only works when other people are searching at the same time; the UI says so and offers Practice.
* In-memory state: server restart = rooms gone. Online hall of fame is unverified, not an account system.
* Typing text is English-only, US-keyboard characters.
* Anti-cheat is plausibility checking (speed ceiling, bounds, monotonic progress); the server never sees keystrokes, so a determined
  cheater typing a script just below the limit could still win. Rankings are for fun, not for competitions with prizes.
* Not implemented (ideas): accounts, persistent global leaderboard (e.g. a free Postgres), custom texts, spectators, more languages.

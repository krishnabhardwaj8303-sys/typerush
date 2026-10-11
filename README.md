# TypeRush - Type Fast. Drive Faster. Win the Race.

A free, open-source multiplayer typing racing game. React + Vite + TypeScript frontend (Canvas 2D rendering, Web Audio sound),
Node.js + Express + Socket.IO multiplayer server. No paid services. Accounts and a database are optional.

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
the online hall of fame is stored on a disk that free hosting wipes on redeploy. Add a free database (next sections) to make accounts and boards permanent.

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
* Daily Challenge, Weekly Cup, Levels and online rooms use English text. Practice and classrooms can also use Hinglish (Hindi in English letters, any keyboard) or Hindi in Devanagari.
* Anti-cheat is plausibility checking (speed ceiling, bounds, monotonic progress); the server never sees keystrokes, so a determined
  cheater typing a script just below the limit could still win. Rankings are for fun, not for competitions with prizes.
* Not implemented (ideas): custom texts, spectators, live tournament brackets.

## Friends, Weekly Cup, Classrooms and optional support/ads (Phase 5)

All of these need a signed-in account (see the accounts section) and, to be permanent, `DATABASE_URL`.

- **Friends**: every account gets a friend code (`FR-XXXXXX`). Typing a friend's code makes you friends both ways (max 50). The Friends tab shows a weekly ranking of you and your friends.
- **Weekly Cup**: one hard/expert text for everybody from Monday to Sunday (UTC), best of 3 attempts, ranking checked by the server like the Daily Challenge.
- **Classrooms**: a teacher creates a class (`CL-XXXXXX`), students join with the code and everyone races the same text. The teacher can start a new round (new text, empty ranking) and sees who has not finished. Max 5 classes per teacher, 80 students per class.
- **Support link and ads (off by default)**: set `VITE_SUPPORT_URL` (an https link, for example a Ko-fi or UPI page) to show a "support the game" link. Set `VITE_ADSENSE_CLIENT` (`ca-pub-...`) and `VITE_ADSENSE_SLOT` to show one AdSense banner on the Community page (never during a race). These are build variables for the client (Cloudflare: Settings > Variables and Secrets > Build). AdSense needs Google's approval of your site first.

Limits: results are checked for believable speed only, there is no payment system, and tournaments are weekly rankings, not live brackets.

## Keep-alive, legal pages and licence (Phase 6)

**Keep the free services awake (UptimeRobot, free).** Render's free web service sleeps after 15 idle minutes and a Supabase
free project pauses after about a week without activity. `GET /health` answers `{"ok":true,...,"storage":"postgres","db":"ok"}`
and, when a database is configured, runs a tiny `SELECT 1` on it (3 second limit; `db` is `"error"` if it does not answer),
so a regular ping keeps both awake.

1. Create a free account at uptimerobot.com > Add New Monitor > type **HTTP(s)**.
2. URL: `https://<your-server>.onrender.com/health`. Interval: the shortest the free plan allows (currently 5 minutes - check their page).
3. Optional: in the monitor settings choose the keyword check `"ok":true` so a broken answer also raises an alert.

One always-awake service uses about 720-744 hours a month, which fits Render's 750 free instance hours **only for one service**.
Do not run two free services around the clock in the same workspace. Pings keep the server awake, they do not make it faster
or more powerful; the free tier can still restart it at any time.

**Legal pages.** The footer links to Privacy and Terms (in the app: `Legal` screen). They describe what is really stored. Read
them, adjust the contact line, and have a lawyer check them before you run paid contests or collect data from children.
Optional build variables for the client: `VITE_FEEDBACK_URL` (an https link such as a Google Form, shown as "Feedback") and
`VITE_CONTACT` (an email or handle shown on the Privacy page, letters/digits and `@ . _ : / + -` only).

**Licence.** MIT (see `LICENSE`). Anyone may copy and sell the code; if you plan to sell a branded version later, you can
still keep your own text packs, brand and hosting private.

## Hindi / Hinglish, teacher tools, multiplayer looks (Phase 6)

- **Hinglish** is plain English-alphabet text, so it works on every keyboard and phone. **Hindi (Devanagari)** needs a Hindi keyboard.
  On Windows add *Hindi Traditional (Inscript)* (Settings > Time & language > Language & region > Add a language > Hindi > Options > Add a keyboard)
  and switch with Windows+Space. The Hindi texts use only letters, vowel signs, anusvara, virama and `. , ? "` - no nukta letters (the dotted ones such as the Hindi letters for ra-dot, dha-dot, za), no digits - so every character is one key.
  Each Hindi letter and vowel sign is a separate keypress, and the text is shown one letter-cluster at a time. Phone keyboards that compose words (phonetic Hindi) are not supported; use Hinglish on a phone.
  WPM uses the same "5 characters = 1 word" rule for every language, so it is not the same as the word counting of government typing exams. The Hindi sentence lists are short (about 10-20 lines per level); add more in `shared/src/textsIndic.ts` (the tests check every character).
- **Classrooms** can pick a text language when created (stored in the `classes.lang` column; the server adds it automatically to an existing database). The server re-creates the text in that language to check each run.
- **Teacher tools**: in a class you own, *Download results (CSV)* (opens in Excel/Sheets, names that start with `=` `+` `-` `@` are neutralised) and *Certificate (PNG)*. Students can download their own certificate. It says plainly that it is a TypeRush class result, not an exam certificate.
- **Daily Challenge link**: *Copy today's challenge link* on the home screen gives `https://<site>/?challenge=daily`, which opens today's race directly.
- **AI cars are labelled "(AI)"** in practice races, and public matches never contain bots.
- **Skins and trails are visible to other players** in friends rooms and public matches. The server only checks that the ids exist and relays them; it does not know what you own, so they are cosmetic only and never affect speed or scores.

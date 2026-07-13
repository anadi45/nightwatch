# Nightwatch

A dark, atmospheric first-person Three.js game that runs directly inside Reddit feeds as an interactive post. Built on [Devvit Web](https://developers.reddit.com) — Reddit's developer platform.

## Play It

| | |
|---|---|
| **Live game** | [r/nightwatchgame](https://www.reddit.com/r/nightwatchgame/) — find the pinned Nightwatch post |
| **App listing** | [developers.reddit.com/apps/nightwatchgame](https://developers.reddit.com/apps/nightwatchgame) |

## Hackathon

This project is an entry for Reddit's [**Games with a Hook**](https://redditgameswithahook.devpost.com/) hackathon (June 17 – July 15, 2026), organized by Reddit.

## The Game

You are the night watchman — and tonight, something not of this world has taken the fields. A mothership hangs over the path, and alien entities drop from its glowing underbelly and glide out of the dark on unpredictable paths — weaving, zigzagging, flanking from the sides — their violet bioluminescence the only warning you get.

Your weapon is an alien energy pistol. **Tap anywhere to fire** a bolt toward that point. Hit an alien and it dissolves in a burst of light — your streak climbs. Miss, and your streak shatters. Let one reach you and things get worse — they speed up.

As the 60-second run progresses, spawn rates increase and alien movement gets trickier. Every shot counts: spraying bolts into the dark is the fastest way to lose your streak.

The streak is the real game: it **survives between runs** — end tonight on a streak of 14 and tomorrow starts at 14 — and only a miss ever resets it. You get **two runs a night**, so both have to count.

One pistol. Two runs a night. How long can you keep the streak alive?

## Tech Stack

| Layer | Technology |
|-------|------------|
| Game Engine | [Three.js](https://threejs.org) |
| Language | TypeScript |
| Bundler | Vite |
| Server | Hono |
| Platform | Devvit Web (Reddit) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v22.2.0 or higher
- A Reddit account with access to [Devvit](https://developers.reddit.com)

### Setup

```bash
git clone https://github.com/anadi45/nightwatch.git
cd nightwatch
npm install
npm run login    # Authenticate with Reddit
```

### Development

```bash
npm run dev
```

This launches a Devvit playtest session — your game runs live on Reddit and hot-reloads as you edit.

### Build & Deploy

```bash
npm run build        # Build client + server to dist/
npm run type-check   # TypeScript checks
npm run lint         # ESLint
npm run deploy       # Type-check + lint + upload to Devvit
npm run launch       # Deploy + publish to production
```

## Project Structure

```
nightwatch/
├── src/
│   ├── client/                 # Frontend — runs in the Reddit post
│   │   ├── splash.*            # Title screen (inline in feed)
│   │   ├── game.*              # Three.js game scene + HUD + loader
│   │   ├── api.ts              # Typed fetch helpers for /api routes
│   │   └── engine/
│   │       ├── GameManager.ts  # Game loop, bolt firing/collision, scoring
│   │       ├── Creature.ts     # Alien entity (procedural), movement patterns, dissolve
│   │       ├── Fireball.ts     # Plasma bolt projectile with ion-helix trail
│   │       ├── Hands.ts        # First-person two-handed energy pistol
│   │       ├── World.ts        # Scene, camera, lighting, environment
│   │       ├── PostFX.ts       # Bloom post-processing (selective via HDR colors)
│   │       ├── effects/        # Pooled particle system
│   │       └── environment/    # Night sky, moon, stars, mothership, trees, boulders, mist
│   ├── server/                 # Backend — runs on Devvit servers
│   │   ├── index.ts            # Hono app, mounts all routes
│   │   ├── core/
│   │   │   ├── post.ts         # Creates the interactive post
│   │   │   └── leaderboard.ts  # Redis data layer (scores, stats)
│   │   └── routes/             # API, menu actions, forms, triggers
│   └── shared/
│       └── api.ts              # TypeScript types shared across client & server
├── devvit.json                 # Devvit app configuration
├── vite.config.ts              # Vite + Devvit build plugin
└── tsconfig.json               # TypeScript configuration
```

## How It Works

Nightwatch runs as a Devvit Web interactive post with two entrypoints:

1. **Splash screen** — Rendered inline in the Reddit feed. Shows the title, the tagline, the viewer's standing (carried streak, best score, rank, runs left tonight — fetched from `/api/init`), and the Play button.
2. **Game scene** — Full Three.js 3D scene in first person. Opens when the user clicks Play.

The player grips a two-handed alien energy pistol in first-person view. A mothership hovers over the spawn zone and aliens drop from its glowing bay — floating octopus-like things with a breathing bell and seven writhing tentacles — then approach along a dark, foggy path flanked by half-sunken boulders, as near-black silhouettes rimmed in violet bioluminescence with a pulsing inner heart, using unpredictable movement patterns — weaving, zigzagging, or flanking from the sides.

Tap to fire an energy bolt toward that point. It flies straight, so a weaving alien can drift out of its path — lead your shots. A hit dissolves the alien in a burst of teal light and builds your streak; a miss (or an alien reaching you) breaks it. The challenge escalates: aliens that reach you make the rest faster, spawn intervals tighten, and movement patterns become trickier.

The client communicates with the Devvit server via API routes (`/api/*`). The server handles score persistence and leaderboards, menu actions for moderators, and app lifecycle events.

## Full-Stack Architecture

Nightwatch follows the architecture Reddit recommends for Devvit Web apps: a static webview client, a stateless serverless backend, Redis as the only persistence, and identity taken from the platform — never from the client.

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  Game client (webview)  │        │  Reddit platform         │
│  Three.js in the post   │        │  menus · triggers · forms│
└───────────┬─────────────┘        └────────────┬─────────────┘
            │ fetch /api/*                      │ /internal/*
            ▼                                   ▼
┌──────────────────────────────────────────────────────────────┐
│         Hono server — Devvit serverless runtime              │
│         dist/server/index.cjs · stateless per request        │
│   /api/init · /api/score · /api/leaderboard · /internal/*    │
└───────────┬──────────────────────────────────┬───────────────┘
            │ zAdd / zRange / hIncrBy          │ submitCustomPost
            ▼                                  ▼
┌─────────────────────────┐        ┌──────────────────────────┐
│  Redis (built in)       │        │  Reddit API              │
│  leaderboard + stats    │        │  posts · user identity   │
└─────────────────────────┘        └──────────────────────────┘
```

### API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/init` | GET | Viewer identity + ready-screen stats (best score/streak, rank, carried streak, plays left) |
| `/api/run/start` | POST | Reserve one of today's two plays; returns the streak the run starts from |
| `/api/score` | POST | Submit a finished run `{score, bestStreak, misses, endStreak}` |
| `/api/leaderboard` | GET | Top 10 all-time + the requesting player's own rank |
| `/internal/menu/post-create` | POST | Moderator menu action — creates a game post |
| `/internal/triggers/on-app-install` | POST | App lifecycle hook |

Request/response contracts live in `src/shared/api.ts`, compiled into both bundles so client and server can never drift apart.

### Identity and anti-cheat

The client never sends a username. Every `/api` request runs with Devvit's request context, and the server resolves the player via `reddit.getCurrentUsername()` — so a score can only ever be written to the account that actually played. Submissions are validated against the physics of a 60-second watch (score and streak caps, `streak ≤ score`, integer-only) and rejected with a 400 otherwise. Logged-out players get a 401 from `/api/score` and simply spectate the leaderboard.

### Redis data model

Redis is Devvit's built-in store — per-installation, durable across sessions and app updates, no setup.

| Key | Type | Contents |
|-----|------|----------|
| `lb:alltime` | sorted set | member = username, score = best run (kept via `zScore` guard, read with reverse `zRange`) |
| `player:{username}` | hash | `runs`, `aliensDown`, `misses`, `bestScore`, `bestStreak`, `currentStreak` (the carry) |
| `plays:{username}:{date}` | counter | Watches started today (UTC); expires after 48 h — enforces the two-per-day cap |

### The lifecycle of a watch

1. **Feed card & ready screen** — the splash card in the feed shows the viewer's standing (carried streak, best score, rank, runs left) from `/api/init`. The in-game ready screen fetches the same endpoint only to gate the Start button, which disables itself when tonight's runs are spent.
2. **Begin Watch** — the client POSTs `/api/run/start`. The server increments today's play counter (the increment *is* the reservation — quitting mid-run still spends the play) and returns the carried streak. The game seeds its streak counter from it.
3. **The watch** — hits extend the streak on top of the carry; any miss resets it to 0, exactly as within a single run.
4. **Watch ends** — the client POSTs the run to `/api/score`. The server validates it against the carry it handed out in step 2 (zero misses means `endStreak` must equal `carry + score` exactly; any other combination is a forged request), updates lifetime stats, stores `endStreak` as the new carry, and updates the leaderboard if the score beat the player's best.
5. **End screen** — the client GETs `/api/leaderboard` and renders the top 5, the player's own rank, and where their streak now stands going into the next watch.

**Closing the game never loses a run.** `/run/start` issues a `runId`; if the player closes the webview mid-watch or before the end-screen submit lands, a `pagehide` handler fires a keepalive copy of the run's current standing. The server deduplicates by `runId` (atomic counter), so no matter how many copies arrive, exactly one write counts. The splash card also re-fetches stats whenever it becomes visible again, so the numbers are fresh the moment the player returns to the feed.

Every call fails soft: a network error or logged-out session never blocks play — logged-out players get uncapped casual runs with no carry and no leaderboard writes.

## GitHub Actions CI/CD

Two workflows run automatically:

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `deploy-prod.yml` | Push to `main` | Type-check → build → `devvit upload` (live update for all installed subreddits) |
| `pr-preview.yml` | Any PR commit | Type-check → build → upload to dev slot → bot comments the playtest URL |

### Setting up GitHub Secrets

The workflows authenticate with Reddit using two repository secrets. Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

#### `DEVVIT_TOKEN`

The full JSON blob that the Devvit CLI stores after `devvit login`.

**macOS / Linux:**
```bash
cat ~/.devvit/token
```

**Windows (PowerShell):**
```powershell
Get-Content "$env:USERPROFILE\.devvit\token"
```

Copy the entire output (starts with `{"token":...`) as the secret value.

#### `DEVVIT_SESSION_ID`

A UUID the CLI generates for your local session.

**macOS / Linux:**
```bash
cat ~/.devvit/session-id
```

**Windows (PowerShell):**
```powershell
Get-Content "$env:USERPROFILE\.devvit\session-id"
```

#### Token expiry

`DEVVIT_TOKEN` contains a refresh token that lasts weeks to months. It will break if you run `devvit logout` or change your Reddit password. To refresh it: run `devvit login` locally, fetch the new token with the commands above, and update the secret. `DEVVIT_SESSION_ID` never expires.

> **Note:** `deploy-prod.yml` runs `devvit upload` but not `devvit publish` — publishing requires an interactive prompt that can't run in CI. Run `npx devvit publish` manually when submitting a release.

## Contributing

Contributions are welcome! This is an open-source project — feel free to open issues, suggest features, or submit pull requests.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature
npm run type-check && npm run lint   # Make sure everything passes
git commit -m "Add your feature"
git push origin feature/your-feature
# Open a pull request
```

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Devvit playtest (live dev on Reddit) |
| `npm run build` | Build client and server to `dist/` |
| `npm run type-check` | Run TypeScript compiler checks |
| `npm run lint` | Lint source files with ESLint |
| `npm run prettier` | Format source files with Prettier |
| `npm run deploy` | Type-check, lint, and upload to Devvit |
| `npm run launch` | Deploy and publish to production |
| `npm run login` | Authenticate CLI with Reddit |

## Credits

- All visuals — the alien entity, energy pistol, and environment — are fully procedural. No external model assets are used.

## License

[BSD-3-Clause](LICENSE)

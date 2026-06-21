# Nightwatch

A dark, atmospheric first-person Three.js game that runs directly inside Reddit feeds as an interactive post. Built on [Devvit Web](https://developers.reddit.com) — Reddit's developer platform.

## Hackathon

This project is an entry for Reddit's [**Games with a Hook**](https://redditgameswithahook.devpost.com/) hackathon (June 17 – July 15, 2026), organized by Reddit.

## The Game

You are the night watchman. Survivors flee toward your lantern light from the darkness — but zombies stalk behind them. Humans run straight toward you for safety. Zombies shamble from the shadows using unpredictable paths.

- **Humans** — Upright, running, blue eyes. Let them reach you safely.
- **Zombies** — Hunched, arms outstretched, red eyes. Tap them to flash your torch and disintegrate them.

Torch a survivor by mistake and your streak resets. Let a zombie reach you and things get worse — they speed up. As the 60-second watch progresses, spawn rates increase and zombie movement gets trickier.

One lantern. One torch. How many can you save?

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
│   │   └── engine/
│   │       ├── GameManager.ts  # Game loop, raycasting input, scoring
│   │       ├── Creature.ts     # Unified creature model, movement, effects
│   │       ├── Hands.ts        # First-person lantern + torch
│   │       └── World.ts        # Scene, camera, lighting, environment
│   ├── server/                 # Backend — runs on Devvit servers
│   │   ├── index.ts            # Hono app, mounts all routes
│   │   ├── core/               # Server utilities
│   │   └── routes/             # API, menu actions, forms, triggers
│   └── shared/
│       └── api.ts              # TypeScript types shared across client & server
├── devvit.json                 # Devvit app configuration
├── vite.config.ts              # Vite + Devvit build plugin
└── tsconfig.json               # TypeScript configuration
```

## How It Works

Nightwatch runs as a Devvit Web interactive post with two entrypoints:

1. **Splash screen** — Rendered inline in the Reddit feed. Shows the game title and a Play button.
2. **Game scene** — Full Three.js 3D scene in first person. Opens when the user clicks Play.

The player holds a glowing lantern (left hand) and a torch (right hand) in first-person view. Survivors and zombies approach along a dark, foggy path.

**Humans** run straight toward the player at high speed, fleeing the zombie horde. They vanish peacefully on arrival. **Zombies** shamble toward the player with arms outstretched, using unpredictable movement patterns — weaving, zigzagging, or flanking from the sides.

Tap on a zombie to flash your torch and watch it disintegrate into scattered pieces. But flash a survivor by mistake and your streak resets. The challenge escalates: consecutive misses make zombies faster, spawn intervals tighten, and movement patterns become trickier.

The client communicates with the Devvit server via API routes (`/api/*`). The server handles game state persistence, menu actions for moderators, and app lifecycle events.

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

## License

[BSD-3-Clause](LICENSE)

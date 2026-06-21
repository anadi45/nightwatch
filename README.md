# Nightwatch

A dark, atmospheric Three.js game that runs directly inside Reddit feeds as an interactive post. Built on [Devvit Web](https://developers.reddit.com) — Reddit's developer platform.

## Hackathon

This project is an entry for Reddit's [**Games with a Hook**](https://redditgameswithahook.devpost.com/) hackathon (June 17 – July 15, 2026), organized by Reddit.

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
├── public/assets/          # Static assets (textures, models, sounds)
├── src/
│   ├── client/             # Frontend — runs in the Reddit post
│   │   ├── splash.*        # Title screen (inline in feed)
│   │   └── game.*          # Three.js game scene
│   ├── server/             # Backend — runs on Devvit servers
│   │   ├── index.ts        # Hono app, mounts all routes
│   │   ├── core/           # Server utilities (Redis helpers, etc.)
│   │   └── routes/         # API, menu actions, forms, triggers
│   └── shared/
│       └── api.ts          # TypeScript types shared across client & server
├── devvit.json             # Devvit app configuration
├── vite.config.ts          # Vite + Devvit build plugin
└── tsconfig.json           # TypeScript configuration
```

## How It Works

Nightwatch runs as a Devvit Web interactive post with two entrypoints:

1. **Splash screen** — Rendered inline in the Reddit feed. Shows the game title and a Play button.
2. **Game scene** — Full Three.js 3D scene. Opens when the user clicks Play.

Players act as a night watchman in a dark, foggy scene. Creatures approach from the darkness along a lantern-lit path:

- **Lantern Spirits** (friendly) — Crystalline golden orbs with orbiting crystal shards, ethereal wings, and trailing light motes. Tap **Lantern** to let them in.
- **Shadow Wraiths** (threats) — Tall hooded figures with skeletal arms, flickering red eyes, tattered cloaks, and swirling dark particles. Ring the **Bell** to ward them off.

The 60-second timed session escalates in speed — consecutive misses make creatures approach faster, while correct actions maintain base speed. A streak system rewards consecutive correct calls.

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
